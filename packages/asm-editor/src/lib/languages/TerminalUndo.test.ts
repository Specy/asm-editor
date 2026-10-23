import { describe, expect, it } from 'vite-plus/test'
import { M68KEmulator } from './M68K/M68KEmulator.svelte'
import { Z80Emulator } from './Z80/Z80Emulator.svelte'
import { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'
import { X86Emulator } from './X86/X86Emulator.svelte'

/**
 * Undo puts the Terminal back with the Core, in every Target
 * ([ADR 0057](../../../../../docs/adr/0057-restore-the-terminal-on-undo.md)): each program prints
 * `A` and `B`, reads a number and prints it, and every Undo must leave the Terminal as it was before
 * the step it takes back. A read taken back asks again.
 */
const programs = [
    {
        name: 'M68K',
        create: (code: string) => M68KEmulator(code),
        code: [
            '    ORG $1000',
            '    move.b #6,d0',
            '    move.b #65,d1',
            '    trap #15',
            '    move.b #66,d1',
            '    trap #15',
            '    move.b #4,d0',
            '    trap #15',
            '    move.b #3,d0',
            '    trap #15',
            '    move.b #9,d0',
            '    trap #15'
        ]
    },
    {
        name: 'Z80',
        create: (code: string) => Z80Emulator(code),
        code: [
            '    org $8000',
            '    ld a, 65',
            '    out ($10), a',
            '    ld a, 66',
            '    out ($10), a',
            '    in a, ($11)',
            '    out ($11), a',
            '    halt'
        ]
    },
    {
        name: 'MIPS',
        create: (code: string) => MIPSEmulator(code),
        code: [
            '    .text',
            'main:',
            '    li $v0, 11',
            '    li $a0, 65',
            '    syscall',
            '    li $a0, 66',
            '    syscall',
            '    li $v0, 5',
            '    syscall',
            '    move $a0, $v0',
            '    li $v0, 1',
            '    syscall',
            '    li $v0, 10',
            '    syscall'
        ]
    },
    {
        name: 'RISC-V',
        create: (code: string) => RISCVEmulator(code),
        code: [
            '    .text',
            'main:',
            '    li a7, 11',
            '    li a0, 65',
            '    ecall',
            '    li a0, 66',
            '    ecall',
            '    li a7, 5',
            '    ecall',
            '    li a7, 1',
            '    ecall',
            '    li a7, 10',
            '    ecall'
        ]
    }
]

type Emulator = ReturnType<(typeof programs)[number]['create']>

/**
 * One Step, answering a read it stops on with `answer`. Says whether it asked: a read whose answer
 * was typed ahead does not.
 */
async function stepAnswering(emulator: Emulator, answer: string): Promise<boolean> {
    const terminal = emulator.peripherals.terminal
    let done = false
    const step = emulator.step().then(() => (done = true))
    for (let i = 0; i < 500 && !done && terminal.pendingRead === null; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1))
    }
    const asked = !done
    if (asked) terminal.insertText(answer)
    await step
    return asked
}

describe.each(programs)('$name Terminal Undo', (program) => {
    it('leaves the Terminal as each Step found it, and asks again for a read it took back', async () => {
        const code = program.code.join('\n')
        const emulator = program.create(code)
        try {
            await emulator.check()
            await emulator.compile(100, code)
            const terminal = emulator.peripherals.terminal
            //typed ahead, so the read takes it without stopping
            terminal.insertText('12\n')
            const before: string[] = []
            for (let i = 0; i < 40 && !emulator.terminated; i++) {
                before.push(terminal.output)
                expect(await stepAnswering(emulator, '')).toBe(false)
            }
            expect(emulator.errors).toEqual([])
            expect(emulator.terminated).toBe(true)
            expect(terminal.output).toMatch(/^AB12\n12/)

            for (let i = before.length - 1; i >= 0; i--) {
                expect(emulator.undo(1)).toBe(1)
                expect(terminal.output).toBe(before[i])
            }
            //back where the Build left it, with nothing older to undo
            expect(emulator.canUndo).toBe(false)
            expect(emulator.undo(1)).toBe(0)
            expect(terminal.output).toBe('')
            expect(terminal.hasPendingInput()).toBe(false)

            let asked = 0
            for (let i = 0; i < 40 && !emulator.terminated; i++) {
                if (await stepAnswering(emulator, '7\n')) asked++
            }
            expect(asked).toBe(1)
            expect(emulator.errors).toEqual([])
            expect(terminal.output).toMatch(/^AB7\n7/)
        } finally {
            emulator.dispose()
        }
    })
})

describe.each([
    { name: 'MIPS', create: (code: string) => MIPSEmulator(code), register: '$' },
    { name: 'RISC-V', create: (code: string) => RISCVEmulator(code), register: '' }
])('$name keyboard and display MMIO Undo', ({ create, register: r }) => {
    it("puts back the display's cleared text and the receiver's keystroke", async () => {
        const code = [
            '    .text',
            'main:',
            `    li ${r}t0, 0xffff0000`,
            `    li ${r}t1, 72`,
            `    sw ${r}t1, 12(${r}t0)`,
            //a form feed clears MARS's display window
            `    li ${r}t1, 12`,
            `    sw ${r}t1, 12(${r}t0)`,
            `    li ${r}t1, 73`,
            `    sw ${r}t1, 12(${r}t0)`,
            'wait:',
            `    lw ${r}t1, 0(${r}t0)`,
            `    andi ${r}t1, ${r}t1, 1`,
            `    beqz ${r}t1, wait`,
            `    lw ${r}t2, 4(${r}t0)`,
            'finish:',
            '    nop'
        ].join('\n')
        const emulator = create(code)
        try {
            await emulator.check()
            await emulator.compile(100, code)
            const terminal = emulator.peripherals.terminal
            terminal.insertText('k')
            const finish = code.split('\n').findIndex((line) => line.startsWith('finish:'))
            const before: string[] = []
            const keystrokes: (number | undefined)[] = []
            for (let i = 0; i < 40 && emulator.line !== finish + 1; i++) {
                before.push(terminal.output)
                keystrokes.push(terminal.peekKeystroke())
                await emulator.step()
            }
            expect(emulator.errors).toEqual([])
            expect(terminal.output).toBe('I')
            //the receiver data register took it
            expect(terminal.peekKeystroke()).toBeUndefined()

            for (let i = before.length - 1; i >= 0; i--) {
                expect(emulator.undo(1)).toBe(1)
                expect(terminal.output).toBe(before[i])
                expect(terminal.peekKeystroke()).toBe(keystrokes[i])
            }
            expect(keystrokes[0]).toBe(0x6b)
            expect(before).toContain('H')
        } finally {
            emulator.dispose()
        }
    })
})

describe('x86 Terminal Undo', () => {
    it('takes back what each write printed, a character split across two writes included', async () => {
        const write = (label: string) => [
            'mov eax, 1',
            'mov edi, 1',
            `lea rsi, [rel ${label}]`,
            'mov edx, 1',
            'syscall'
        ]
        const code = [
            'bits 64',
            'global _start',
            'section .data',
            'a: db "A"',
            //é in UTF-8, written a byte at a time
            'lead: db 0xc3',
            'trail: db 0xa9',
            'section .text',
            '_start:',
            ...write('a'),
            ...write('lead'),
            ...write('trail'),
            'mov eax, 60',
            'xor edi, edi',
            'syscall'
        ].join('\n')
        const input = {
            entry: 'main.asm',
            files: { 'main.asm': { encoding: 'plain' as const, content: code } }
        }
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            await emulator.compile(100, input)
            const terminal = emulator.peripherals.terminal
            const before: string[] = []
            for (let i = 0; i < 40 && !emulator.terminated; i++) {
                before.push(terminal.output)
                await emulator.step()
            }
            expect(emulator.errors).toEqual([])
            expect(terminal.output).toBe('Aé')
            for (let i = before.length - 1; i >= 0; i--) {
                expect(emulator.undo(1)).toBe(1)
                expect(terminal.output).toBe(before[i])
            }
            expect(terminal.output).toBe('')
            await emulator.run(100)
            expect(terminal.output).toBe('Aé')
        } finally {
            emulator.dispose()
        }
    })
})
