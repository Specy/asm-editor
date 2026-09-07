import { describe, expect, it } from 'vitest'
import { FONT_ROWS, SCREEN_CELL_8X16, SCREEN_CELL_8X8, glyphRows, hasGlyph } from './bitmapFont'

/** One glyph as a picture, so an expectation is readable and a wrong table entry is obvious. */
function draw(code: number, cellHeight = FONT_ROWS): string[] {
    return glyphRows(code, cellHeight).map((bits) => {
        let line = ''
        for (let column = 0; column < 8; column++) line += bits & (1 << column) ? '#' : '.'
        return line
    })
}

describe('bitmap font', () => {
    it('has a shape for the printable ASCII range and nothing else', () => {
        expect(hasGlyph(0x20)).toBe(true)
        expect(hasGlyph(0x7f)).toBe(true)
        expect(hasGlyph(0x1f)).toBe(false)
        expect(hasGlyph(0x80)).toBe(false)
    })

    it('reads a row from the left with bit 0', () => {
        expect(draw(0x41)).toEqual([
            '..##....',
            '.####...',
            '##..##..',
            '##..##..',
            '######..',
            '##..##..',
            '##..##..',
            '........'
        ])
    })

    it('leaves a space empty and fills the underscore row', () => {
        expect(draw(0x20)).toEqual(Array(8).fill('........'))
        expect(draw(0x5f)[7]).toBe('########')
    })

    it('doubles every row for the 8 by 16 cell, so both cells show the same shapes', () => {
        const small = draw(0x42)
        const large = draw(0x42, SCREEN_CELL_8X16.height)
        expect(large.length).toBe(16)
        expect(large).toEqual(small.flatMap((row) => [row, row]))
    })

    it('gives the 8 by 8 cell the table as it is', () => {
        expect(glyphRows(0x42, SCREEN_CELL_8X8.height).length).toBe(FONT_ROWS)
    })

    it('draws a blank cell for a code point the table does not cover', () => {
        expect(draw(0x00)).toEqual(Array(8).fill('........'))
        expect(draw(0xe9)).toEqual(Array(8).fill('........'))
    })
})
