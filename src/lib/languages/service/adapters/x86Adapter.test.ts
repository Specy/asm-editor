import { describe, expect, it } from 'vitest'
import { x86DiagnosticToLanguageDiagnostic } from './x86Adapter'

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
})
