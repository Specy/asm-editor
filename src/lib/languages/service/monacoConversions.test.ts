import { describe, expect, it } from 'vitest'
import {
    sourcePositionToMonaco,
    sourceRangeToMonaco,
    zeroBasedLineToMonaco
} from './monacoConversions'

describe('Monaco coordinate conversion', () => {
    it('maps source line zero to Monaco line one', () => {
        expect(zeroBasedLineToMonaco(0)).toBe(1)
        expect(sourcePositionToMonaco({ line: 0, column: 0 })).toEqual({ lineNumber: 1, column: 1 })
    })

    it('keeps half-open range ends while moving to one-based coordinates', () => {
        expect(
            sourceRangeToMonaco({
                start: { line: 2, column: 3 },
                end: { line: 2, column: 7 }
            })
        ).toEqual({ startLineNumber: 3, startColumn: 4, endLineNumber: 3, endColumn: 8 })
    })
})
