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
                value: { register: 'xmm0', old: 0x3ff8000000000000n, size: RegisterSize.Quad }
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
