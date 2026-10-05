import { describe, expect, it } from 'vitest'
import { selectedLines } from './selectedLines'

const selection = (startLineNumber: number, endLineNumber: number, endColumn = 2) => ({
    startLineNumber,
    endLineNumber,
    endColumn
})

describe('selectedLines', () => {
    it('covers a collapsed cursor line', () => {
        expect(selectedLines([selection(3, 3, 1)])).toEqual([2])
    })
    it('covers every line of a range', () => {
        expect(selectedLines([selection(2, 4)])).toEqual([1, 2, 3])
    })
    it('excludes the line a whole-line selection ends at the start of', () => {
        expect(selectedLines([selection(2, 4, 1)])).toEqual([1, 2])
    })
    it('merges several selections into sorted unique lines', () => {
        expect(selectedLines([selection(6, 7), selection(1, 1), selection(2, 6)])).toEqual([
            0, 1, 2, 3, 4, 5, 6
        ])
    })
})
