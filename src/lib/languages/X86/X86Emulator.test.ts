import { describe, expect, it } from 'vitest'
import { X86_SSE_REGISTERS, X86_X87_REGISTERS } from '@specy/x86'
import {
    type Register,
    type RegisterFile,
    RegisterSize
} from '$lib/languages/commonLanguageFeatures.svelte'
import { X86Emulator } from './X86Emulator.svelte'

describe('x86 source set', () => {
    it('builds a %include and reports the included execution location', async () => {
        const sources = {
            entry: 'main.asm',
            files: {
                'main.asm': {
                    encoding: 'plain' as const,
                    content: 'bits 64\n%include "lib.asm"'
                },
                'lib.asm': {
                    encoding: 'plain' as const,
                    content: [
                        'global _start',
                        'section .text',
                        '_start:',
                        '    mov rax, 60',
                        '    xor rdi, rdi',
                        '    syscall'
                    ].join('\n')
                }
            }
        }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            expect(emulator.currentFile).toBe('lib.asm')
            expect(emulator.line).toBe(3)
            if (emulator.buildArtifacts.length > 0) {
                expect(emulator.buildArtifacts).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            file: 'lib.asm',
                            line: 3,
                            opcode: 'b8 3c 00 00 00'
                        })
                    ])
                )
            }
        } finally {
            emulator.dispose()
        }
    })

    it('builds incbin from the exact bytes of a Project binary File', async () => {
        const sources = {
            entry: 'main.asm',
            files: {
                'main.asm': {
                    encoding: 'plain' as const,
                    content: [
                        'bits 64',
                        'global _start',
                        'section .data',
                        'blob: incbin "assets/blob.bin", 1, 2',
                        'section .text',
                        '_start:',
                        '    movzx rdi, byte [rel blob]',
                        '    mov rax, 60',
                        '    syscall'
                    ].join('\n')
                },
                'assets/blob.bin': { encoding: 'base64' as const, content: 'AQIDBA==' }
            }
        }
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
        } finally {
            emulator.dispose()
        }
    })
})

const SSE_PROGRAM = [
    'bits 64',
    'global _start',
    'section .text',
    '_start:',
    '    mov rax, 0x3FF8000000000000',
    '    movq xmm0, rax',
    '    addsd xmm0, xmm0',
    '    mov rax, 60',
    '    xor rdi, rdi',
    '    syscall'
].join('\n')

const X87_PROGRAM = [
    'bits 64',
    'global _start',
    'section .text',
    '_start:',
    '    fld1',
    '    fld1',
    '    faddp st1',
    '    mov rax, 60',
    '    xor rdi, rdi',
    '    syscall'
].join('\n')

function programSources(code: string) {
    return {
        entry: 'main.asm',
        files: { 'main.asm': { encoding: 'plain' as const, content: code } }
    }
}

function fileOf(emulator: { registerFiles: RegisterFile[] }, id: string): RegisterFile {
    const file = emulator.registerFiles.find((candidate) => candidate.id === id)
    if (!file) throw new Error(`no ${id} register file`)
    return file
}

function registerOf(file: RegisterFile, name: string): Register {
    const register = file.registers.find((candidate) => candidate.name === name)
    if (!register) throw new Error(`no ${name} in the ${file.id} file`)
    return register
}

describe('x86 register files', () => {
    it('names its registers as the Core orders them', async () => {
        const sources = programSources(SSE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            expect(emulator.registerFiles.map((file) => file.id)).toEqual(['cpu', 'sse', 'x87'])
            //the values arrive as flat arrays, so a descriptor that names them in another order
            //would label every row wrongly and nothing else would notice
            expect(fileOf(emulator, 'sse').layout.map((register) => register.name)).toEqual([
                ...X86_SSE_REGISTERS
            ])
            expect(fileOf(emulator, 'x87').layout.map((register) => register.name)).toEqual([
                ...X86_X87_REGISTERS
            ])
            //the CPU file is the general registers themselves, not a copy of them
            expect(emulator.registerFiles[0].registers).toBe(emulator.registers)
        } finally {
            emulator.dispose()
        }
    })

    it('reads the SSE file, names its writes and gives them back on undo', async () => {
        const sources = programSources(SSE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            const xmm0 = registerOf(fileOf(emulator, 'sse'), 'xmm0')
            //mov, movq, addsd: 1.5 into the low lane and then doubled
            await emulator.step()
            await emulator.step()
            expect(xmm0.value).toBe(0x3ff8000000000000n)
            await emulator.step()
            expect(xmm0.value).toBe(0x4008000000000000n)
            expect(xmm0.prev).toBe(0x3ff8000000000000n)
            expect(Number(xmm0.size)).toBe(RegisterSize.Quad)
            const writes = emulator.latestSteps.flatMap((step) =>
                step.mutations.filter(
                    (mutation) =>
                        mutation.type === 'WriteRegister' && mutation.value.register === 'xmm0'
                )
            )
            expect(writes).toContainEqual({
                type: 'WriteRegister',
                value: {
                    register: 'xmm0',
                    old: 0x3ff8000000000000n,
                    new: 0x4008000000000000n,
                    size: RegisterSize.Quad
                }
            })
            expect(emulator.undo()).toBe(1)
            expect(xmm0.value).toBe(0x3ff8000000000000n)
        } finally {
            emulator.dispose()
        }
    })

    it('reads the x87 stack in logical order', async () => {
        const sources = programSources(X87_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            const x87 = fileOf(emulator, 'x87')
            const st0 = registerOf(x87, 'st0')
            await emulator.step()
            await emulator.step()
            //two pushes of 1.0, then the add that pops one of them back off
            expect(st0.value).toBe(0x3ff0000000000000n)
            await emulator.step()
            expect(st0.value).toBe(0x4000000000000000n)
            expect(st0.prev).toBe(0x3ff0000000000000n)
            expect(Number(registerOf(x87, 'fstat').size)).toBe(RegisterSize.Word)
        } finally {
            emulator.dispose()
        }
    })

    it('sizes and names the control registers of a float file as integers', async () => {
        const sources = programSources(SSE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            //`mxcsr` and the x87 words live inside files whose other rows are floats, so each one
            //carries its own width and kind or the panel would render a control word as a number
            expect(fileOf(emulator, 'sse').layout[16]).toEqual({
                name: 'mxcsr',
                size: RegisterSize.Long,
                kind: 'integer'
            })
            expect(fileOf(emulator, 'x87').layout[8]).toEqual({
                name: 'fctrl',
                size: RegisterSize.Word,
                kind: 'integer'
            })
        } finally {
            emulator.dispose()
        }
    })

    it('reads mxcsr as an unsigned 32 bit value', async () => {
        const sources = programSources(SSE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            await emulator.step()
            //the Core reports mxcsr as a signed int, so the reset value with no bit above 31 set
            //only proves the width; the `>>> 0` is what keeps a masking bit pattern positive
            expect(registerOf(fileOf(emulator, 'sse'), 'mxcsr').value).toBe(0x1f80n)
        } finally {
            emulator.dispose()
        }
    })

    it('blanks every x87 stack slot the tag word marks empty', async () => {
        const sources = programSources(X87_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            const x87 = fileOf(emulator, 'x87')
            //a built program has no machine until it steps, and a reset x87 has ftag 0xffff: every
            //slot empty, so the panel shows eight blank rows rather than eight zeros
            expect(x87.blanks).toEqual([
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                false,
                false,
                false
            ])
            //fld1, fld1, faddp: two pushes and then an add that pops one back off
            await emulator.step()
            await emulator.step()
            await emulator.step()
            expect(x87.blanks.slice(0, 8)).toEqual([
                false,
                true,
                true,
                true,
                true,
                true,
                true,
                true
            ])
            //the control words are never blank, whatever the stack holds
            expect(x87.blanks.slice(8)).toEqual([false, false, false])
            //the SSE file has nothing to blank
            expect(fileOf(emulator, 'sse').blanks.some((blank) => blank)).toBe(false)
        } finally {
            emulator.dispose()
        }
    })

    it('writes a register back through the whole block', async () => {
        const sources = programSources(SSE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            //a preset before the first step does not survive it, as for the general registers
            await emulator.step()
            emulator._setRegisterFileValue?.('sse', 'xmm1', 0x4008000000000000n)
            emulator._setRegisterFileValue?.('x87', 'st0', 0x3ff0000000000000n)
            const sse = emulator._getRegisterFileValues!('sse')
            expect(sse[1]).toBe(0x4008000000000000n)
            //the write names one register, so the rest of the block comes back as it was
            expect(sse[0]).toBe(0n)
            expect(emulator._getRegisterFileValues!('x87')[0]).toBe(0x3ff0000000000000n)
        } finally {
            emulator.dispose()
        }
    })
})

describe('x86 diagnostic spans', () => {
    //NASM reports a line and no column, so the Core finds the name the message quotes and hands
    //back its extent; both the semantic check and the Build have to carry it through to Monaco
    const sources = {
        entry: 'main.asm',
        files: {
            'main.asm': {
                encoding: 'plain' as const,
                content: [
                    'bits 64',
                    'global _start',
                    'section .text',
                    '_start',
                    '  mov rsi, missingSymbol',
                    '  syscall',
                    ''
                ].join('\n')
            }
        }
    }

    it('spans the whole name a diagnostic points at', async () => {
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            const diagnostics = await emulator.check()
            //`_start` is the whole of line 4, and `missingSymbol` runs from column 12 to 25
            const orphan = diagnostics.find((d) => d.message.includes('label alone'))
            expect(orphan?.lineIndex).toBe(3)
            expect(orphan?.column).toBe(1)
            expect(orphan?.endColumn).toBe(7)
            const symbol = diagnostics.find((d) => d.message.includes('missingSymbol'))
            expect(symbol?.lineIndex).toBe(4)
            expect(symbol?.column).toBe(12)
            expect(symbol?.endColumn).toBe(25)
        } finally {
            emulator.dispose()
        }
    })
})

const STORE_PROGRAM = [
    'bits 64',
    'global _start',
    'section .data',
    'buffer: dq 0x1122334455667788',
    'section .text',
    '_start:',
    '    lea rbx, [rel buffer]',
    '    mov rax, 0x99AABBCCDDEEFF00',
    '    mov [rbx], rax',
    '    mov rax, 60',
    '    xor rdi, rdi',
    '    syscall'
].join('\n')

describe('x86 history rows', () => {
    //the Core reports both sides of a write; the crossing has to carry the memory half over too,
    //or a History row could only ever say what a store found
    it('carries the bytes a store left, beside the ones it replaced', async () => {
        const sources = programSources(STORE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            for (let i = 0; i < 3; i++) await emulator.step()

            const write = emulator.latestSteps
                .flatMap((step) => step.mutations)
                .find((mutation) => mutation.type === 'WriteMemoryBytes')
            expect(write).toBeDefined()
            if (write?.type !== 'WriteMemoryBytes') throw new Error('not a memory write')
            expect(write.value.old).toEqual([0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11])
            expect(write.value.new).toEqual([0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99])
        } finally {
            emulator.dispose()
        }
    })
})

describe('x86 breakpoints', () => {
    /**
     * Run from a breakpoint has to move. The Core checks its breakpoints before executing the
     * instruction they name, so a Run resumed where the last one stopped saw the same breakpoint
     * again, executed nothing and reported the same stop for ever: the only way out was a Step
     * ([ADR 0023](../../../../docs/adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md)).
     */
    const THREE_MOVES = [
        'bits 64',
        'global _start',
        'section .text',
        '_start:',
        '    mov rax, 1',
        '    mov rbx, 2',
        '    mov rcx, 3',
        '    mov rax, 60',
        '    xor rdi, rdi',
        '    syscall'
    ].join('\n')

    function cpuRegister(emulator: { registerFiles: RegisterFile[] }, name: string): bigint {
        return registerOf(fileOf(emulator, 'cpu'), name).value
    }

    it('runs from one breakpoint to the next and then to the end', async () => {
        const sources = programSources(THREE_MOVES)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            emulator.toggleBreakpoint(5)
            emulator.toggleBreakpoint(6)

            await emulator.run(100_000)
            expect(emulator.line).toBe(5)
            expect(emulator.terminated).toBe(false)
            expect(cpuRegister(emulator, 'rax')).toBe(1n)
            expect(cpuRegister(emulator, 'rbx')).toBe(0n)

            //the Run that follows leaves the breakpoint it is parked on and stops at the next one
            await emulator.run(100_000)
            expect(emulator.line).toBe(6)
            expect(emulator.terminated).toBe(false)
            expect(cpuRegister(emulator, 'rbx')).toBe(2n)
            expect(cpuRegister(emulator, 'rcx')).toBe(0n)

            await emulator.run(100_000)
            expect(emulator.terminated).toBe(true)
        } finally {
            emulator.dispose()
        }
    })

    it('stops on a breakpoint on the instruction after a program input', async () => {
        //the Core finishes the read while the input is handed over, so the run that follows one
        //starts on an instruction that has not executed: a breakpoint on it has to stop
        const sources = programSources(
            [
                'bits 64',
                'global _start',
                'section .bss',
                'buffer: resb 16',
                'section .text',
                '_start:',
                '    mov rax, 0',
                '    mov rdi, 0',
                '    mov rsi, buffer',
                '    mov rdx, 16',
                '    syscall',
                '    mov rbx, 7',
                '    mov rax, 60',
                '    xor rdi, rdi',
                '    syscall'
            ].join('\n')
        )
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(20, sources)
            expect(emulator.errors).toEqual([])
            emulator.peripherals.terminal.useScriptedInput(['hello'])
            //`mov rbx, 7`, the line after the read syscall
            emulator.toggleBreakpoint(11)

            await emulator.run(100_000)
            expect(emulator.errors).toEqual([])
            expect(emulator.line).toBe(11)
            expect(emulator.terminated).toBe(false)
            expect(cpuRegister(emulator, 'rbx')).toBe(0n)
            //the read really did suspend the program and take the scripted answer
            expect(cpuRegister(emulator, 'rax')).toBe(6n)

            await emulator.run(100_000)
            expect(emulator.terminated).toBe(true)
        } finally {
            emulator.dispose()
        }
    })
})

describe('x86 pokes', () => {
    //a preset made before the first step does not survive it: the machine is built when the program
    //starts, so every Poke here is made on a machine that has already run an instruction
    async function steppedEmulator(code: string, steps: number) {
        const sources = programSources(code)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        await emulator.compile(20, sources)
        expect(emulator.errors).toEqual([])
        for (let i = 0; i < steps; i++) await emulator.step()
        return emulator
    }

    it('pokes a CPU register as one step with no line of its own', async () => {
        const emulator = await steppedEmulator(SSE_PROGRAM, 1)
        try {
            const rax = registerOf(fileOf(emulator, 'cpu'), 'rax')
            expect(rax.value).toBe(0x3ff8000000000000n)
            expect(emulator.canPoke).toBe(true)
            expect(emulator.pokeRegisters('cpu', [{ register: 'rax', value: 0x1234n }])).toBe(true)
            expect(rax.value).toBe(0x1234n)
            const [poke] = emulator.latestSteps
            expect(poke.kind).toBe('poke')
            //no instruction ran, so the History row has no line and no file to jump to, while the
            //pc the entry carries is still the instruction the machine is parked on
            expect(poke.line).toBe(-1)
            expect(poke.file).toBe(undefined)
            expect(poke.pc).toBe(Number(emulator.pc))
            expect(poke.writes).toEqual([
                { type: 'register', name: 'rax', old: 0x3ff8000000000000n, new: 0x1234n }
            ])
            expect(poke.mutations).toContainEqual({
                type: 'WriteRegister',
                value: {
                    register: 'rax',
                    old: 0x3ff8000000000000n,
                    new: 0x1234n,
                    size: RegisterSize.Double
                }
            })
            //a Poke calls nothing and returns from nothing, so the frames stay as the program left
            //them, both while it stands and once it is undone
            const callStack = emulator.callStack.map((frame) => frame.address)
            expect(emulator.canUndo).toBe(true)
            expect(emulator.undo()).toBe(1)
            expect(rax.value).toBe(0x3ff8000000000000n)
            expect(emulator.callStack.map((frame) => frame.address)).toEqual(callStack)
            expect(emulator.latestSteps[0]?.kind).toBe('instruction')
        } finally {
            emulator.dispose()
        }
    })

    it('keeps the program counter and a terminated program out of reach', async () => {
        const emulator = await steppedEmulator(SSE_PROGRAM, 1)
        try {
            expect(emulator.canPokeRegister('cpu', 'rip')).toBe(false)
            expect(emulator.pokeRegisters('cpu', [{ register: 'rip', value: 0n }])).toBe(false)
            //a value wider than the register is refused rather than truncated
            expect(() =>
                emulator.pokeRegisters('cpu', [{ register: 'rax', value: 1n << 64n }])
            ).toThrow(/does not fit rax/)
            //undoing a poke made on a terminated program would resume the machine, so the
            //availability rule keeps Pokes off one
            while (!emulator.terminated) await emulator.step()
            expect(emulator.canPoke).toBe(false)
            expect(emulator.pokeRegisters('cpu', [{ register: 'rax', value: 7n }])).toBe(false)
        } finally {
            emulator.dispose()
        }
    })

    it('says nothing was recorded when the history Setting keeps no steps', async () => {
        const sources = programSources(SSE_PROGRAM)
        const emulator = await X86Emulator(sources, { automaticChecking: false })
        try {
            await emulator.compile(0, sources)
            expect(emulator.errors).toEqual([])
            await emulator.step()
            const rax = registerOf(fileOf(emulator, 'cpu'), 'rax')
            //blink applies the Poke and answers that it changed a value, but a history of zero
            //keeps no more of it than of an instruction: what the caller is told is whether there
            //is a step to undo, which is what the agent's "cannot be undone" note is built on
            expect(emulator.pokeRegisters('cpu', [{ register: 'rax', value: 0x1234n }])).toBe(false)
            expect(rax.value).toBe(0x1234n)
            expect(emulator.canUndo).toBe(false)
            expect(emulator.latestSteps).toEqual([])
        } finally {
            emulator.dispose()
        }
    })

    it('names only the register a float file Poke changed', async () => {
        const emulator = await steppedEmulator(X87_PROGRAM, 2)
        try {
            const sse = fileOf(emulator, 'sse')
            const x87 = fileOf(emulator, 'x87')
            //the whole block goes back through `setFpuState`, so only the Core's own diff can tell
            //the panel which row the Poke changed
            expect(emulator.pokeRegisters('sse', [{ register: 'xmm1', value: 0x4008n }])).toBe(true)
            expect(registerOf(sse, 'xmm1').value).toBe(0x4008n)
            expect(emulator.latestSteps[0].writes).toEqual([
                { type: 'register', name: 'xmm1', old: 0n, new: 0x4008n }
            ])
            const st0 = registerOf(x87, 'st0')
            expect(st0.value).toBe(0x3ff0000000000000n)
            expect(
                emulator.pokeRegisters('x87', [{ register: 'st0', value: 0x4000000000000000n }])
            ).toBe(true)
            expect(emulator.latestSteps[0].writes).toEqual([
                {
                    type: 'register',
                    name: 'st0',
                    old: 0x3ff0000000000000n,
                    new: 0x4000000000000000n
                }
            ])
            expect(st0.value).toBe(0x4000000000000000n)
            //each file's Poke is a step of its own, so two Undos put both back
            expect(emulator.undo()).toBe(1)
            expect(st0.value).toBe(0x3ff0000000000000n)
            expect(emulator.undo()).toBe(1)
            expect(registerOf(sse, 'xmm1').value).toBe(0n)
        } finally {
            emulator.dispose()
        }
    })

    it('leaves the current line on the instruction a Poke did not run', async () => {
        const emulator = await steppedEmulator(SSE_PROGRAM, 2)
        try {
            const line = emulator.line
            const flags = emulator.statusRegisters.map((flag) => ({ ...flag }))
            expect(emulator.pokeRegisters('cpu', [{ register: 'rbx', value: 0x20n }])).toBe(true)
            //nothing ran, so the editor stays parked where the last step left it
            expect(emulator.line).toBe(line)
            //and the flags a Poke did not touch show no change against the step before it
            expect(emulator.statusRegisters).toEqual(
                flags.map((flag) => ({ ...flag, prev: flag.value }))
            )
            //the last executed instruction is the newest instruction entry, not the Poke on top
            const last = emulator._getLastInstruction?.()
            expect(SSE_PROGRAM.split('\n')[last?.lineNumber ?? -1]).toContain('movq')
            //with an instruction on top there is nothing to skip and the caller's fallback stands
            expect(emulator.undo()).toBe(1)
            expect(emulator._getLastInstruction?.()).toBe(null)
        } finally {
            emulator.dispose()
        }
    })

    it('refuses a Poke into an empty x87 stack slot', async () => {
        const emulator = await steppedEmulator(X87_PROGRAM, 2)
        try {
            //two pushes, so the slots under them hold nothing to change
            expect(emulator.canPokeRegister('x87', 'st0')).toBe(true)
            expect(emulator.canPokeRegister('x87', 'st3')).toBe(false)
            expect(emulator.pokeRegisters('x87', [{ register: 'st3', value: 1n }])).toBe(false)
        } finally {
            emulator.dispose()
        }
    })

    it('pokes a run of memory bytes as one step and gives them back on undo', async () => {
        const emulator = await steppedEmulator(SSE_PROGRAM, 1)
        try {
            const address = emulator.sp - 64n
            const before = [...emulator.readMemoryBytes(address, 4)]
            const bytes = new Uint8Array([1, 2, 3, 4])
            expect(emulator.pokeMemory(address, bytes)).toBe(true)
            expect([...emulator.readMemoryBytes(address, 4)]).toEqual([1, 2, 3, 4])
            const [poke] = emulator.latestSteps
            expect(poke.kind).toBe('poke')
            expect(poke.writes).toEqual([
                { type: 'memory', address, old: before, new: [1, 2, 3, 4] }
            ])
            //writing back what is already there changes nothing and records nothing
            expect(emulator.pokeMemory(address, bytes)).toBe(false)
            expect(emulator.latestSteps.filter((step) => step.kind === 'poke')).toHaveLength(1)
            expect(emulator.undo()).toBe(1)
            expect([...emulator.readMemoryBytes(address, 4)]).toEqual(before)
        } finally {
            emulator.dispose()
        }
    })

    it('undoes a Poke and the instruction that followed it back to the pre-poke state', async () => {
        const emulator = await steppedEmulator(SSE_PROGRAM, 1)
        try {
            const rax = registerOf(fileOf(emulator, 'cpu'), 'rax')
            const address = emulator.sp - 64n
            const memoryBefore = [...emulator.readMemoryBytes(address, 2)]
            expect(emulator.pokeRegisters('cpu', [{ register: 'rax', value: 0x1234n }])).toBe(true)
            expect(emulator.pokeMemory(address, new Uint8Array([9, 9]))).toBe(true)
            //movq xmm0, rax reads the poked register, so the step after a Poke sees the new value
            await emulator.step()
            expect(registerOf(fileOf(emulator, 'sse'), 'xmm0').value).toBe(0x1234n)
            //the instruction, then the memory Poke, then the register Poke: three steps, and a Poke
            //counts as one of them
            expect(emulator.undo(3)).toBe(3)
            expect(rax.value).toBe(0x3ff8000000000000n)
            expect([...emulator.readMemoryBytes(address, 2)]).toEqual(memoryBefore)
            expect(emulator.latestSteps.every((step) => step.kind === 'instruction')).toBe(true)
        } finally {
            emulator.dispose()
        }
    })
})
