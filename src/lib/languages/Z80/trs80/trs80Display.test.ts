import { describe, expect, it } from 'vitest'
import { KEY_CODES } from '$lib/languages/peripherals/keyCodes'
import { Z80_PORTS } from '$lib/languages/Z80/Z80-model'
import {
    buildGlyphSheet,
    isKeyboardAddress,
    isVideoAddress,
    TRS80_CELL,
    TRS80_COLUMNS,
    TRS80_GRAPHICS_HEIGHT,
    TRS80_GRAPHICS_WIDTH,
    TRS80_JOYSTICK_PORT,
    TRS80_KEY_MATRIX,
    TRS80_NO_JOYSTICK,
    TRS80_ROWS,
    TRS80_SCREEN_HEIGHT,
    TRS80_SCREEN_WIDTH,
    TRS80_VIDEO_SIZE
} from '$lib/languages/Z80/trs80/trs80Display'

/**
 * The character generator and the key matrix as data: what a cell looks like is the whole
 * compatibility claim of [ADR 0020](../../../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md),
 * so the glyphs are checked as pictures rather than as byte counts.
 */

const { width: CELL_WIDTH, height: CELL_HEIGHT } = TRS80_CELL

/** One cell of the sheet drawn as text, `#` for ink, which is how a glyph is read by eye. */
function draw(sheet: Uint8Array, code: number): string[] {
    const base = code * CELL_WIDTH * CELL_HEIGHT
    const rows: string[] = []
    for (let y = 0; y < CELL_HEIGHT; y++) {
        let row = ''
        for (let x = 0; x < CELL_WIDTH; x++) {
            row += sheet[base + y * CELL_WIDTH + x] === 0 ? '.' : '#'
        }
        rows.push(row)
    }
    return rows
}

describe('TRS-80 geometry', () => {
    it('is the machine’s own: 64 by 16 cells of 8 by 24, and 128 by 48 chunky pixels', () => {
        expect(TRS80_VIDEO_SIZE).toBe(1024)
        expect(TRS80_SCREEN_WIDTH).toBe(TRS80_COLUMNS * 8)
        expect(TRS80_SCREEN_HEIGHT).toBe(TRS80_ROWS * 24)
        expect({ width: TRS80_SCREEN_WIDTH, height: TRS80_SCREEN_HEIGHT }).toEqual({
            width: 512,
            height: 384
        })
        expect([TRS80_GRAPHICS_WIDTH, TRS80_GRAPHICS_HEIGHT]).toEqual([128, 48])
    })

    it('leaves the joystick port unmapped, which is why the editor ports start at 0x10', () => {
        //port 0 is the machine's joystick. While the character port lived there a program polling
        //it was suspended for a line of input nobody was typing, which is how two of the three
        //games in the fork's own IDE hung; an unmapped port floats high instead, which is exactly
        //what the machine answers with no joystick attached
        const ports: number[] = Object.values(Z80_PORTS)
        expect(ports).not.toContain(TRS80_JOYSTICK_PORT)
        expect(Math.min(...ports)).toBeGreaterThanOrEqual(0x10)
        expect(TRS80_NO_JOYSTICK).toBe(0xff)
    })

    it('decodes the two mapped ranges and nothing else', () => {
        expect(isVideoAddress(0x3bff)).toBe(false)
        expect(isVideoAddress(0x3c00)).toBe(true)
        expect(isVideoAddress(0x3fff)).toBe(true)
        expect(isVideoAddress(0x4000)).toBe(false)
        expect(isKeyboardAddress(0x37ff)).toBe(false)
        expect(isKeyboardAddress(0x3800)).toBe(true)
        expect(isKeyboardAddress(0x3bff)).toBe(true)
        //video RAM starts where the keyboard's four mirrored banks end
        expect(isKeyboardAddress(0x3c00)).toBe(false)
    })
})

describe('TRS-80 glyphs', () => {
    const sheet = buildGlyphSheet()

    it('rasterizes every character once', () => {
        expect(sheet.length).toBe(256 * CELL_WIDTH * CELL_HEIGHT)
    })

    it('draws a letter from the character generator, each row twice', () => {
        //'A' from the Model III CG, which is 7 rows of glyph data in a 12 row cell
        expect(draw(sheet, 0x41)).toEqual([
            '...##...',
            '...##...',
            '..#..#..',
            '..#..#..',
            '.#....#.',
            '.#....#.',
            '.######.',
            '.######.',
            '.#....#.',
            '.#....#.',
            '.#....#.',
            '.#....#.',
            '.#....#.',
            '.#....#.',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........'
        ])
    })

    it('leaves a descender below the baseline', () => {
        //lowercase 'g', which the uppercase-only Model I could not show at all
        expect(draw(sheet, 0x67).slice(12, 16)).toEqual([
            '......#.',
            '......#.',
            '..####..',
            '..####..'
        ])
    })

    it('builds a block character out of the low six bits, top-left first', () => {
        //bit 0 alone: the top-left quarter-ish of the cell, 4 by 8
        const topLeft = draw(sheet, 128 + 0b000001)
        expect(topLeft[0]).toBe('####....')
        expect(topLeft[7]).toBe('####....')
        expect(topLeft[8]).toBe('........')
        //bit 5 alone: the bottom-right
        const bottomRight = draw(sheet, 128 + 0b100000)
        expect(bottomRight[16]).toBe('....####')
        expect(bottomRight[23]).toBe('....####')
        expect(bottomRight[15]).toBe('........')
        //the middle band is rows 8 to 15, so bits 2 and 3 are the middle row of the 2 by 3 block
        expect(draw(sheet, 128 + 0b001000)[8]).toBe('....####')
    })

    it('has a blank block at 128 and a full one at 191', () => {
        expect(new Set(draw(sheet, 128))).toEqual(new Set(['........']))
        expect(new Set(draw(sheet, 191))).toEqual(new Set(['########']))
    })
})

describe('TRS-80 key matrix', () => {
    it('is eight rows of eight keys', () => {
        expect(TRS80_KEY_MATRIX.length).toBe(8)
        for (const row of TRS80_KEY_MATRIX) expect(row.length).toBe(8)
    })

    it('places the keys where the machine had them', () => {
        //A is row 0 bit 1, the letters running on from there
        expect(TRS80_KEY_MATRIX[0][1]).toBe(0x41)
        expect(TRS80_KEY_MATRIX[1][0]).toBe(0x48)
        expect(TRS80_KEY_MATRIX[3][2]).toBe(0x5a)
        //digits from row 4 bit 0
        expect(TRS80_KEY_MATRIX[4][0]).toBe(0x30)
        expect(TRS80_KEY_MATRIX[5][1]).toBe(0x39)
        //row 6 is Enter, Clear, Break, the arrows and space
        expect(TRS80_KEY_MATRIX[6][0]).toBe(KEY_CODES.ENTER)
        expect(TRS80_KEY_MATRIX[6][3]).toBe(KEY_CODES.UP_ARROW)
        expect(TRS80_KEY_MATRIX[6][6]).toBe(KEY_CODES.RIGHT_ARROW)
        expect(TRS80_KEY_MATRIX[6][7]).toBe(KEY_CODES.SPACE)
        expect(TRS80_KEY_MATRIX[7][0]).toBe(KEY_CODES.SHIFT)
    })

    it('leaves a key this keyboard cannot hold down unmapped', () => {
        //the machine's own ':' key; on a modern layout it is Shift-';' and nothing can hold it
        expect(TRS80_KEY_MATRIX[5][2]).toBe(null)
        //three positions row 3 never had
        expect(TRS80_KEY_MATRIX[3].slice(3)).toEqual([null, null, null, null, null])
    })
})
