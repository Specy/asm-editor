import { describe, expect, it } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
import { analyzeX86Project, x86DiagnosticToLanguageDiagnostic } from './x86Adapter'

describe('x86 Project analysis adapter', () => {
    it('maps Entry diagnostics into neutral zero-based ranges', () => {
        expect(
            x86DiagnosticToLanguageDiagnostic(
                {
                    lineIndex: 3,
                    column: 5,
                    line: { line: 'bad', line_index: 3 },
                    message: 'bad instruction',
                    formatted: 'bad instruction'
                },
                'main.asm'
            )
        ).toEqual(
            expect.objectContaining({
                source: 'nasm',
                location: {
                    path: 'main.asm',
                    range: {
                        start: { line: 3, column: 4 },
                        end: { line: 3, column: 5 }
                    }
                }
            })
        )
    })

    it('counts a File linked by `extern` as part of the build, not as unreachable', async () => {
        const sources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': {
                    encoding: 'plain',
                    content: [
                        'global _start',
                        'extern fibonacci',
                        '%include "macros.inc"',
                        'section .text',
                        '_start:',
                        '  call fibonacci',
                        '  mov rax, 60',
                        '  syscall'
                    ].join('\n')
                },
                // Its own translation unit: nothing includes it, and it is linked by symbol.
                'fibonacci.asm': {
                    encoding: 'plain',
                    content: ['global fibonacci', 'section .text', 'fibonacci:', '  ret'].join('\n')
                },
                'macros.inc': { encoding: 'plain', content: '%define ANSWER 42' },
                'unused.inc': { encoding: 'plain', content: '%define UNUSED 1' }
            }
        })

        const snapshot = await analyzeX86Project(sources, 'test-session', 1)

        expect(snapshot.fileStatus).toEqual({
            'main.asm': 'assembled',
            'fibonacci.asm': 'assembled',
            'macros.inc': 'assembled',
            'unused.inc': 'not-reachable'
        })
        expect(snapshot.diagnostics).toEqual([])
    })
    //the Project page squiggles from this snapshot whenever it has Files, so the extent the Core
    //found for the name NASM quoted has to reach Monaco through here too
    it('spans the whole name a diagnostic points at', async () => {
        const sources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': {
                    encoding: 'plain',
                    content: [
                        'bits 64',
                        'global _start',
                        'section .text',
                        '_start',
                        '  mov rsi, missingSymbol',
                        '  syscall'
                    ].join('\n')
                }
            }
        })

        const snapshot = await analyzeX86Project(sources, 'span-test', 1)

        //ranges are zero based and end exclusive: `_start` is columns 0 to 6, `missingSymbol` 11 to 24
        const range = (needle: string) =>
            snapshot.diagnostics.find((diagnostic) => diagnostic.message.includes(needle))?.location
                .range
        expect(range('label alone')).toEqual({
            start: { line: 3, column: 0 },
            end: { line: 3, column: 6 }
        })
        expect(range('missingSymbol')).toEqual({
            start: { line: 4, column: 11 },
            end: { line: 4, column: 24 }
        })
    })
})
