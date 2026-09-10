import { describe, expect, it } from 'vitest'
import { S68k } from '@specy/s68k'
import { normalizeBuildInput } from '$lib/projectFiles'
import { s68kColumnToUtf16, s68kDiagnosticToDiagnostic } from './m68kDiagnostics'
import { m68kAssemblyFiles } from './m68kAssemblyFiles'

describe('M68K diagnostics', () => {
    it('preserves the Core code, exact range, hint, and related location', () => {
        const sources = normalizeBuildInput({
            entry: 'main.m68k',
            files: {
                'main.m68k': {
                    encoding: 'plain',
                    content: 'start: move.w #1,d0\nstart: simhalt'
                }
            }
        })
        const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
        const diagnostic = s68kDiagnosticToDiagnostic(result.diagnostics[0], sources)

        expect(diagnostic).toEqual(
            expect.objectContaining({
                source: 's68k',
                code: 'symbol_already_defined',
                file: 'main.m68k',
                lineIndex: 1,
                column: 1,
                endColumn: 6,
                hint: expect.any(String),
                related: [
                    expect.objectContaining({
                        file: 'main.m68k',
                        lineIndex: 0,
                        column: 1,
                        endColumn: 6
                    })
                ]
            })
        )
    })

    it('converts Unicode scalar columns to Monaco UTF-16 columns', () => {
        expect(s68kColumnToUtf16('😀move', 1)).toBe(2)
        expect(s68kColumnToUtf16('😀move', 5)).toBe(6)
    })
})
