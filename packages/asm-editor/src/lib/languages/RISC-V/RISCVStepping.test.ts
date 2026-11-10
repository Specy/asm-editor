import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { CALL_STACK_FRAMES_SHOWN } from '#lib/languages/GenericEmulator.svelte.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import type { ProjectDisplay } from '#lib/languages/mars/marsDisplay.ts'
import { projectBuildSources } from '#lib/buildSources.ts'
import type { ProjectFiles } from '#lib/projectFiles.ts'
import { fileFingerprint, type CompilationRecord } from '#lib/sourceCompilation/records.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'

/**
 * Step over and Step out on RISC-V against the real Core
 * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)): RARS keeps its Call stack
 * as the program runs, frames for calls through `ra` and `t0` and for the trap handler included,
 * and stops a run at a call depth, and the shared MARS adapter hands both to the Emulator, with the
 * ledger hooks that make a completed step one Undo.
 */

type Emulator = ReturnType<typeof RISCVEmulator>

const SMALL: ProjectDisplay = {
    unitWidth: 8,
    unitHeight: 8,
    width: 64,
    height: 64,
    baseAddress: 0x10010000
}

/** Builds a program, failing the test if it does not assemble, and finds its lines by their text. */
async function build(lines: string[], language: 'RISC-V' | 'RISC-V-64' = 'RISC-V') {
    const code = lines.join('\n')
    const emulator = RISCVEmulator(code, {
        language,
        display: SMALL,
        peripherals: { clock: new ProgramClock({ mode: 'virtual' }) }
    })
    await emulator.check()
    await emulator.compile(10_000, code)
    expect(emulator.errors).toEqual([])
    const lineOf = (text: string): number => {
        const index = lines.findIndex((line) => line.trim() === text)
        if (index === -1) throw new Error(`No line ${text}`)
        return index
    }
    return { emulator, lineOf }
}

function register(emulator: Emulator, name: string): bigint {
    const found = emulator.registers.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`No register ${name}`)
    return found.value
}

/** The routine names the Call stack panel shows, outermost first. */
function routines(emulator: Emulator): string[] {
    return emulator.callStack.map((frame) => frame.name)
}

const EXIT = ['        li a7, 10', '        ecall']

/** `main` calls a routine of two instructions that doubles `a0`. */
const CALLING = [
    '        .text',
    'main:   li a0, 1',
    '        jal twice',
    '        mv a1, a0',
    ...EXIT,
    'twice:  add a0, a0, a0',
    '        ret'
]

beforeEach(() => Prompt.cancel())

describe('RISC-V Step over', () => {
    it('is a Step on a line that calls nothing', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.line).toBe(lineOf('main:   li a0, 1'))

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('jal twice'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('main:   li a0, 1'))
    })

    it('runs the routine jal enters, stops on the line after it, and is one row and one Undo', async () => {
        const { emulator, lineOf } = await build(CALLING)
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
        expect(register(emulator, 'a0')).toBe(2n)
        expect(emulator.callStack).toEqual([])
        expect(emulator.callStackDepth).toBe(0)

        const [row, before] = emulator.latestSteps
        expect(row.line).toBe(lineOf('jal twice'))
        expect(row.stretch).toEqual({ kind: 'over', library: 'twice', instructions: 3 })
        expect(before.line).toBe(lineOf('main:   li a0, 1'))

        expect(emulator.canUndo).toBe(true)
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('jal twice'))
        expect(register(emulator, 'a0')).toBe(1n)
        expect(emulator.callStack).toEqual([])
        expect(emulator.latestSteps[0].line).toBe(lineOf('main:   li a0, 1'))
    })

    it('steps over a call and out of a routine on RV64 too', async () => {
        const { emulator, lineOf } = await build(CALLING, 'RISC-V-64')
        await emulator.stepOver()
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
        expect(register(emulator, 'a0')).toBe(2n)
        expect(emulator.undo()).toBe(1)
        await emulator.step()
        expect(routines(emulator)).toEqual(['twice'])
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
    })

    it('runs the two instructions of call as one line, and every instruction of la and li', async () => {
        const { emulator, lineOf } = await build([
            '        .data',
            'value:  .word 7',
            '        .text',
            'main:   la t0, value',
            '        li t1, 0x12345',
            '        call twice',
            '        mv a1, a0',
            ...EXIT,
            'twice:  add a0, a0, a0',
            '        ret'
        ])
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('li t1, 0x12345'))
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: '',
            instructions: 2
        })

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('call twice'))
        expect(register(emulator, 't1')).toBe(0x12345n)

        //auipc, the jalr that calls, the add and the ret
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: 'twice',
            instructions: 4
        })
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('call twice'))
    })

    it('ends at the depth it started at in a routine that calls itself', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   li a0, 5',
            '        jal fact',
            '        mv s1, a0',
            ...EXIT,
            'fact:   addi sp, sp, -16',
            '        sw ra, 8(sp)',
            '        sw a0, 0(sp)',
            '        li t0, 1',
            '        ble a0, t0, base',
            '        addi a0, a0, -1',
            '        jal fact',
            '        lw t1, 0(sp)',
            '        mul a0, a0, t1',
            '        j leave',
            'base:   li a0, 1',
            'leave:  lw ra, 8(sp)',
            '        addi sp, sp, 16',
            '        ret'
        ])
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv s1, a0'))
        expect(register(emulator, 'a0')).toBe(120n)
        expect(emulator.callStackDepth).toBe(0)
        expect(emulator.latestSteps[0].stretch?.library).toBe('fact')
    })

    it("stops at a Breakpoint on the routine's first instruction", async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('twice:  add a0, a0, a0'))
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('twice:  add a0, a0, a0'))
        expect(register(emulator, 'a0')).toBe(1n)
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.canStepOut).toBe(true)
    })

    it('stops at a Breakpoint inside the routine, and Step out goes on from there', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('ret'))
        await emulator.stepOver()

        expect((await emulator.stepOver()).completed).toBe(false)
        expect(emulator.line).toBe(lineOf('ret'))
        expect(register(emulator, 'a0')).toBe(2n)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
    })

    it('stops once, completed, with a Breakpoint on the line the call returns to', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('mv a1, a0'))
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
        expect(emulator.latestSteps[0].stretch?.kind).toBe('over')
        //and a Run from there goes past it to the end
        await emulator.run(1_000)
        expect(emulator.terminated).toBe(true)
    })

    it('waits for the input the routine reads, and still ends after the call', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal read',
            '        mv s1, a0',
            ...EXIT,
            'read:   li a7, 5',
            '        ecall',
            '        ret'
        ])
        const terminal = emulator.peripherals.terminal
        terminal.attachConsole()

        const step = emulator.stepOver()
        await vi.waitFor(() => expect(terminal.pendingRead?.kind).toBe('line'))
        terminal.insertText('7')
        terminal.pressEnter()

        expect(await step).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv s1, a0'))
        expect(register(emulator, 'a0')).toBe(7n)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: 'read',
            instructions: 4
        })
    })

    it('goes on after the routine sleeps, and still ends after the call', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal nap',
            '        mv s1, a0',
            ...EXIT,
            'nap:    li a7, 32',
            '        li a0, 50',
            '        ecall',
            '        li a0, 9',
            '        ret'
        ])
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv s1, a0'))
        expect(register(emulator, 'a0')).toBe(9n)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: 'nap',
            instructions: 6
        })
    })

    it('runs a call that links through t0 to the jr t0 that returns from it', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal t0, bump',
            '        mv s1, a0',
            ...EXIT,
            'bump:   addi a0, a0, 1',
            '        jr t0'
        ])
        await emulator.step()
        expect(routines(emulator)).toEqual(['bump'])
        expect(emulator.canStepOut).toBe(true)
        emulator.undo()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv s1, a0'))
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: 'bump',
            instructions: 3
        })
    })

    it('runs out the handler of an interrupt taken before the line, then the line', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   la t0, handler',
            '        csrw t0, utvec',
            '        csrsi uie, 1',
            '        csrsi ustatus, 1',
            '        csrsi uip, 1',
            'held:   addi s1, s1, 1',
            '        mv a1, s1',
            ...EXIT,
            'handler: csrci uip, 1',
            '        uret'
        ])
        while (emulator.line !== lineOf('held:   addi s1, s1, 1')) await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, s1'))
        expect(register(emulator, 's1')).toBe(1n)
        expect(emulator.callStackDepth).toBe(0)
        //the entry, the handler's two instructions, then the line itself
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: '',
            instructions: 4
        })

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('held:   addi s1, s1, 1'))
        expect(register(emulator, 's1')).toBe(0n)
    })

    it('ends after a call into a Runtime library member, where Steps would not stop', async () => {
        //a compiled unit, its Generated assembly written by hand, which the real library links to
        const c =
            'unsigned long strlen(const char *);\nint main(void) { return strlen("hello"); }\n'
        const lines = [
            '\t.text',
            '\t.globl\tmain',
            'main:',
            '\taddi\tsp, sp, -16 # @2',
            '\tsw\tra, 12(sp) # @2',
            '\tlui\ta0, %hi(.Lmsg) # @2',
            '\taddi\ta0, a0, %lo(.Lmsg) # @2',
            '\tcall\tstrlen # @2',
            '\tmv\ts1, a0 # @2',
            '\tlw\tra, 12(sp) # @2',
            '\taddi\tsp, sp, 16 # @2',
            '\tret # @2',
            '\t.section\t.rodata',
            '.Lmsg:',
            '\t.asciz\t"hello"',
            ''
        ]
        const files = {
            'main.c': { encoding: 'plain' as const, content: c },
            'main.c.riscv': { encoding: 'plain' as const, content: lines.join('\n') }
        }
        const compilation: CompilationRecord = {
            sourcePath: 'main.c',
            outputPath: 'main.c.riscv',
            target: 'RISC-V',
            language: 'c',
            compilerId: 'test',
            optimization: '1',
            inputs: { 'main.c': fileFingerprint(files['main.c'])! },
            outputFingerprint: fileFingerprint(files['main.c.riscv'])!,
            assemblerProfile: 'gnu-compiler-v1',
            runtimeAbi: 'v1'
        }
        const input = projectBuildSources({
            files: files as ProjectFiles,
            entry: 'main.c.riscv',
            language: 'RISC-V',
            compilations: [compilation]
        })
        const emulator = RISCVEmulator(input, { language: 'RISC-V' })
        try {
            await emulator.check()
            await emulator.compile(100_000, input)
            expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
            const lineOf = (text: string) => lines.indexOf(text)
            //the start code called `main`, a routine to step out of
            const depth = emulator.callStackDepth
            expect(depth).toBeGreaterThan(0)
            while (emulator.line !== lineOf('\tcall\tstrlen # @2')) await emulator.stepOver()

            expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
            expect(emulator.line).toBe(lineOf('\tmv\ts1, a0 # @2'))
            expect(emulator.currentFile).toBe('main.c.riscv')
            expect(register(emulator, 'a0')).toBe(5n)
            expect(emulator.callStackDepth).toBe(depth)
            expect(emulator.latestSteps[0].stretch?.library).toBe('strlen')
        } finally {
            emulator.dispose()
        }
    })

    it('ends the program when the call is its last instruction', async () => {
        const { emulator } = await build([
            '        .text',
            'main:   j start',
            'leaf:   addi a0, a0, 1',
            '        ret',
            'start:  jal leaf'
        ])
        await emulator.step()
        const outcome = await emulator.stepOver()
        expect(outcome).toEqual({ terminated: true, completed: false })
        expect(emulator.terminated).toBe(true)
        expect(emulator.errors).toEqual([])
    })
})

describe('RISC-V Step out', () => {
    it('leaves the routine the program is in, as one row of the History', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.canStepOut).toBe(false)
        expect(await emulator.stepOut()).toEqual({
            terminated: false,
            completed: false,
            refused: true
        })
        expect(emulator.latestSteps).toEqual([])

        await emulator.step()
        await emulator.step()
        expect(emulator.line).toBe(lineOf('twice:  add a0, a0, a0'))
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.canStepOut).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, a0'))
        expect(emulator.callStack).toEqual([])
        expect(emulator.canStepOut).toBe(false)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'out',
            library: 'twice',
            instructions: 2
        })

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('twice:  add a0, a0, a0'))
        expect(routines(emulator)).toEqual(['twice'])
    })

    it('leaves a trap handler no label names, which the Call stack calls what it is', async () => {
        //the interrupt's handler sits at 0x00400004 and the exception's at 0x0040000c, where
        //`utvec` is set by number
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   j start',
            '        csrci uip, 1',
            '        uret',
            '        csrr t3, uepc',
            '        addi t3, t3, 4',
            '        csrw t3, uepc',
            '        uret',
            'start:  li t0, 0x00400004',
            '        csrw t0, utvec',
            '        csrsi uie, 1',
            '        csrsi ustatus, 1',
            '        csrsi uip, 1',
            'held:   addi s1, s1, 1',
            '        li t0, 0x0040000c',
            '        csrw t0, utvec',
            '        li t1, 0x10010001',
            'bad:    lw t2, 0(t1)',
            '        mv a1, s1',
            ...EXIT
        ])
        while (emulator.line !== lineOf('held:   addi s1, s1, 1')) await emulator.step()
        await emulator.step()
        expect(emulator.line).toBe(lineOf('csrci uip, 1'))
        expect(routines(emulator)).toEqual(['Interrupt handler'])
        //it returns to the instruction it came before, which has not run
        expect(emulator.callStack[0].destination).toBe(emulator._resolveMemoryLabel('held'))
        expect(emulator.canStepOut).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('held:   addi s1, s1, 1'))
        expect(register(emulator, 's1')).toBe(0n)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'out',
            library: 'Interrupt handler',
            instructions: 2
        })

        //an exception's handler, entered by the faulting load, which it steps past
        while (emulator.line !== lineOf('bad:    lw t2, 0(t1)')) await emulator.step()
        await emulator.step()
        expect(routines(emulator)).toEqual(['Exception handler'])
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('mv a1, s1'))
        expect(emulator.canStepOut).toBe(false)
    })
})

describe('RISC-V Call stack', () => {
    it('gives the panel the newest frames of a deep recursion and counts all of them', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   li a0, 600',
            '        jal count',
            ...EXIT,
            'count:  addi sp, sp, -16',
            '        sw ra, 8(sp)',
            '        addi a0, a0, -1',
            '        beqz a0, bottom',
            '        jal count',
            'back:   j done',
            'bottom: nop',
            'done:   lw ra, 8(sp)',
            '        addi sp, sp, 16',
            '        ret'
        ])
        emulator.toggleBreakpoint(lineOf('bottom: nop'))
        await emulator.run(100_000)
        expect(emulator.line).toBe(lineOf('bottom: nop'))

        //the panel is given the newest CALL_STACK_FRAMES_SHOWN of the 600, outermost first, each
        //with the colour of its depth, as the whole stack would give it
        const all = emulator._getCallStack()
        expect(all).toHaveLength(600)
        expect(emulator.callStackDepth).toBe(600)
        expect(emulator.callStack).toHaveLength(CALL_STACK_FRAMES_SHOWN)
        expect(emulator.callStack).toEqual(all.slice(-CALL_STACK_FRAMES_SHOWN))
        expect(emulator._getCallStack(2)).toEqual(all.slice(-2))
        //each frame of the recursion returns to the instruction after its call
        const back = emulator._resolveMemoryLabel('back')
        expect(all.slice(1).every((frame) => frame.destination === back)).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('back:   j done'))
        expect(emulator.callStackDepth).toBe(599)

        //and over the rest of the recursion, from the outermost call
        await emulator.run(100_000)
        expect(emulator.terminated).toBe(true)
    })

    it('shows the frames each instruction pushed and popped in its History row', async () => {
        const { emulator } = await build([
            '        .text',
            'main:   la t0, handler',
            '        csrw t0, utvec',
            '        csrsi uie, 1',
            '        csrsi ustatus, 1',
            'call1:  jal outer',
            'after:  csrsi uip, 1',
            'held:   nop',
            ...EXIT,
            'outer:  jal inner',
            '        nop',
            'inner:  la ra, after',
            'unwind: ret',
            'handler: csrci uip, 1',
            'leave:  uret'
        ])
        const at = (name: string) => BigInt(emulator._resolveMemoryLabel(name)!)
        const kinds = () =>
            emulator.latestSteps[0].mutations.filter(
                (mutation) =>
                    mutation.type === 'PushCallStack' ||
                    mutation.type === 'PopCallStack' ||
                    mutation.type === 'TakeException'
            )
        while (emulator.pc !== at('call1')) await emulator.step()
        await emulator.step()
        expect(kinds()).toEqual([
            { type: 'PushCallStack', value: { from: at('call1'), to: at('outer') } }
        ])
        await emulator.step()
        await emulator.step()
        await emulator.step()
        //`ret` to `after`, the outer frame's return address: both frames go at once
        await emulator.step()
        expect(emulator.callStackDepth).toBe(0)
        expect(kinds()).toEqual([
            { type: 'PopCallStack', value: { from: at('unwind'), to: at('after') } },
            { type: 'PopCallStack', value: { from: at('unwind'), to: at('after') } }
        ])
        //the interrupt's entry is its own row, which names the interrupt rather than a call
        await emulator.step()
        await emulator.step()
        expect(emulator.callStackDepth).toBe(1)
        expect(kinds().map((mutation) => mutation.type)).toEqual(['TakeException'])
        await emulator.step()
        await emulator.step()
        expect(emulator.callStackDepth).toBe(0)
        expect(kinds()).toEqual([
            { type: 'PopCallStack', value: { from: at('leave'), to: at('held') } }
        ])
        //and Undo puts both frames of the unwind back
        emulator.undo(4)
        emulator.undo()
        expect(routines(emulator)).toEqual(['outer', 'inner'])
    })
})
