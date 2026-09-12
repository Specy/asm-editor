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
})
