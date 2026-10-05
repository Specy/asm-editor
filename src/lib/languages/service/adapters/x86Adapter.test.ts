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

    //compiled code defines main and no _start: the start unit linked with it does, so live
    //checking has to see it as the Build does or it reports a missing entry point
    it('checks compiled code with the start code the Build links', async () => {
        const files = {
            'main.c.asm': {
                encoding: 'plain' as const,
                content: ['global main', 'section .text', 'main:', '  mov eax, 20', '  ret'].join(
                    '\n'
                )
            }
        }
        const compiled = await analyzeX86Project(
            normalizeBuildInput({ entry: 'main.c.asm', files, entrySymbol: '_start' }),
            'start-unit',
            1
        )
        expect(compiled.diagnostics).toEqual([])
        //the start unit is checked, but it is not one of the Project's Files
        expect(Object.keys(compiled.fileStatus)).toEqual(['main.c.asm'])

        const bare = await analyzeX86Project(
            normalizeBuildInput({ entry: 'main.c.asm', files }),
            'start-unit',
            2
        )
        expect(bare.diagnostics).toEqual([
            expect.objectContaining({ message: expect.stringContaining('no `_start`') })
        ])
    })

    it('has nothing to say of a hand-written _start beside compiled code', async () => {
        // The archive linker leaves main.asm out of a Build of compiled code;
        // checking only assembles the units and does not link them.
        const snapshot = await analyzeX86Project(
            normalizeBuildInput({
                entry: 'main.c.asm',
                entrySymbol: '_start',
                files: {
                    'main.asm': {
                        encoding: 'plain',
                        content: ['global _start', 'section .text', '_start:', '  ret'].join('\n')
                    },
                    'main.c.asm': {
                        encoding: 'plain',
                        content: ['global main', 'section .text', 'main:', '  ret'].join('\n')
                    }
                }
            }),
            'start-beside-compiled',
            1
        )
        expect(snapshot.diagnostics).toEqual([])
    })

    it('reports sources that cannot be resolved as the one error, as Build does', async () => {
        const problem = '@runtime/start.asm is inside @runtime/, which the start code reserves.'
        const snapshot = await analyzeX86Project(
            normalizeBuildInput({
                entry: 'main.asm',
                files: { 'main.asm': { encoding: 'plain', content: 'mov rax, nope nonsense' } },
                assemblyError: problem
            }),
            'unresolved',
            1
        )
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                severity: 'error',
                message: problem,
                location: expect.objectContaining({ path: 'main.asm' })
            })
        ])
        expect(snapshot.fileStatus).toEqual({ 'main.asm': 'unknown' })
    })
})
