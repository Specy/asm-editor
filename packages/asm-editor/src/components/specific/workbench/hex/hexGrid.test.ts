import { describe, expect, it } from 'vite-plus/test'
import {
    HEX_SCROLL_LIMIT,
    byteText,
    bytesAsHex,
    bytesAsText,
    moveCaret,
    offsetDigits,
    revealRow,
    rowWindow,
    scrollGeometry,
    scrollTopOf,
    typeKey,
    virtualTopOf,
    type HexCaret
} from './hexGrid'

const at = (offset: number, column: 'hex' | 'text' = 'hex', nibble: 0 | 1 = 0): HexCaret => ({
    offset,
    nibble,
    column
})

describe('the grid', () => {
    it('pads offsets to the largest one, four digits at least', () => {
        expect(offsetDigits(0)).toBe(4)
        expect(offsetDigits(0x10000)).toBe(4)
        expect(offsetDigits(0x10001)).toBe(5)
        expect(offsetDigits(16 * 1024 * 1024)).toBe(6)
    })

    it('shows printable ASCII as text and every other byte as a dot', () => {
        expect([0x41, 0x20, 0x7e, 0x2e, 0x7f, 0x0a, 0xff].map(byteText).join('')).toBe('A ~....')
        const bytes = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x02])
        expect(bytesAsHex(bytes)).toBe('7f 45 4c 46 02')
        expect(bytesAsText(bytes)).toBe('.ELF.')
    })
})

describe('scrolling', () => {
    it('follows the scroll position while the rows fit under the limit', () => {
        const geometry = scrollGeometry(1000, 20, 400)
        expect(geometry.scrollHeight).toBe(20_000)
        expect(virtualTopOf(1234, geometry)).toBe(1234)
        expect(scrollTopOf(1234, geometry)).toBe(1234)
        //never past the last row
        expect(virtualTopOf(50_000, geometry)).toBe(20_000 - 400)
    })

    it('scales the scrollbar past the limit, its end showing the last row', () => {
        //a 16 MiB File at 8 bytes a row, as on a phone
        const rows = (16 * 1024 * 1024) / 8
        const geometry = scrollGeometry(rows, 24, 600)
        expect(geometry.scrollHeight).toBe(HEX_SCROLL_LIMIT)
        const end = geometry.scrollHeight - geometry.viewport
        const top = virtualTopOf(end, geometry)
        expect(top).toBe(rows * 24 - 600)
        expect(rowWindow(top, geometry, 0)).toEqual({ first: rows - 25, end: rows })
        expect(virtualTopOf(0, geometry)).toBe(0)
        //a position and the rows' top map onto each other both ways
        expect(scrollTopOf(virtualTopOf(1_000_000, geometry), geometry)).toBeCloseTo(1_000_000)
    })

    it('draws the visible rows and a margin', () => {
        const geometry = scrollGeometry(100, 20, 200)
        expect(rowWindow(0, geometry)).toEqual({ first: 0, end: 18 })
        expect(rowWindow(1000, geometry)).toEqual({ first: 42, end: 68 })
        expect(rowWindow(1800, geometry)).toEqual({ first: 82, end: 100 })
        expect(rowWindow(0, scrollGeometry(0, 20, 200))).toEqual({ first: 0, end: 0 })
    })

    it('brings a row into sight, moving as little as it can', () => {
        const geometry = scrollGeometry(100, 20, 200)
        expect(revealRow(5, 0, geometry)).toBe(0)
        expect(revealRow(15, 0, geometry)).toBe(15 * 20 + 20 - 200)
        expect(revealRow(2, 300, geometry)).toBe(40)
        expect(revealRow(50, 0, geometry, true)).toBe(1000 - 90)
    })
})

describe('the caret', () => {
    const context = { size: 40, bytesPerRow: 16, pageRows: 2 }

    it('moves a byte at a time, from the low digit to the high one first', () => {
        expect(moveCaret(at(5, 'hex', 1), 'ArrowLeft', context)).toEqual(at(5))
        expect(moveCaret(at(5), 'ArrowLeft', context)).toEqual(at(4))
        expect(moveCaret(at(5, 'text'), 'ArrowRight', context)).toEqual(at(6, 'text'))
        expect(moveCaret(at(0), 'ArrowLeft', context)).toEqual(at(0))
        expect(moveCaret(at(39), 'ArrowRight', context)).toEqual(at(39))
    })

    it('moves a row, staying put where the next row has no byte below it', () => {
        expect(moveCaret(at(5), 'ArrowDown', context)).toEqual(at(21))
        expect(moveCaret(at(21), 'ArrowUp', context)).toEqual(at(5))
        expect(moveCaret(at(5), 'ArrowUp', context)).toEqual(at(5))
        //the last row holds 8 bytes, 32 to 39
        expect(moveCaret(at(28), 'ArrowDown', context)).toEqual(at(28))
        expect(moveCaret(at(20), 'ArrowDown', context)).toEqual(at(36))
    })

    it("goes to a row's ends, and with Ctrl to the File's", () => {
        expect(moveCaret(at(20), 'Home', context)).toEqual(at(16))
        expect(moveCaret(at(20), 'End', context)).toEqual(at(31))
        expect(moveCaret(at(33), 'End', context)).toEqual(at(39))
        expect(moveCaret(at(20), 'Home', context, true)).toEqual(at(0))
        expect(moveCaret(at(20), 'End', context, true)).toEqual(at(39))
    })

    it('moves a page, keeping its column at either end', () => {
        expect(moveCaret(at(3), 'PageDown', context)).toEqual(at(35))
        expect(moveCaret(at(20), 'PageDown', context)).toEqual(at(36))
        expect(moveCaret(at(30), 'PageDown', context)).toEqual(at(39))
        expect(moveCaret(at(36), 'PageUp', context)).toEqual(at(4))
        expect(moveCaret(at(5), 'Tab', context)).toBeUndefined()
    })
})

describe('typing', () => {
    it('overwrites a digit at a time in the hex column', () => {
        const high = typeKey(at(2), 0x12, 'a', 4)
        expect(high).toEqual({ byte: 0xa2, caret: at(2, 'hex', 1) })
        expect(typeKey(at(2, 'hex', 1), 0xa2, 'F', 4)).toEqual({ byte: 0xaf, caret: at(3) })
        //the last byte keeps the caret after its low digit
        expect(typeKey(at(3, 'hex', 1), 0, '7', 4)).toEqual({ byte: 0x07, caret: at(3, 'hex', 1) })
        expect(typeKey(at(2), 0x12, 'g', 4)).toBeUndefined()
        expect(typeKey(at(2), 0x12, 'Enter', 4)).toBeUndefined()
    })

    it('overwrites a byte with a printable character in the text column', () => {
        expect(typeKey(at(1, 'text'), 0, 'Z', 4)).toEqual({ byte: 0x5a, caret: at(2, 'text') })
        expect(typeKey(at(3, 'text'), 0, ' ', 4)).toEqual({ byte: 0x20, caret: at(3, 'text') })
        expect(typeKey(at(1, 'text'), 0, 'é', 4)).toBeUndefined()
    })
})
