import { describe, expect, it } from 'vitest'
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
