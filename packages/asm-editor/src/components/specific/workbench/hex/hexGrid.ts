/**
 * The Hex editor's grid as numbers: which rows a scroll position shows, where the caret goes on a
 * key, what typing a key writes, and how bytes read as hex and text
 * ([file-views.md](../../../../../../../docs/design/file-views.md), decisions 3, 7 and 9).
 */

/**
 * The tallest the scroller's content may be. Browsers cap an element's height (Firefox near 17.9
 * million pixels), below what a 16 MiB File's rows need, so above this the scrollbar is scaled: the
 * scroller keeps this height and its position maps onto the rows' whole height.
 */
export const HEX_SCROLL_LIMIT = 8_000_000
/** Rows drawn above and below the visible ones, so a short scroll shows no gap while it redraws. */
export const HEX_ROW_MARGIN = 8

const HEX = Array.from({ length: 256 }, (_, byte) =>
    byte.toString(16).padStart(2, '0').toUpperCase()
)
const TEXT = Array.from({ length: 256 }, (_, byte) =>
    isPrintable(byte) ? String.fromCharCode(byte) : '.'
)

/** Printable ASCII, the only characters the text column shows and the only ones typed into it. */
export function isPrintable(byte: number): boolean {
    return byte >= 0x20 && byte <= 0x7e
}
/** A byte in the hex column: two upper-case digits, as the memory view draws them. */
export function byteHex(byte: number): string {
    return HEX[byte]
}
/** A byte in the text column: its character when printable ASCII, else a dot. */
export function byteText(byte: number): string {
    return TEXT[byte]
}

/**
 * How many hex digits the offset column takes: as many as the File's largest offset, and at least
 * four, the memory view's narrowest address column, so a small File's offsets still read as such.
 */
export function offsetDigits(size: number): number {
    return Math.max(4, Math.max(0, size - 1).toString(16).length)
}
export function offsetHex(offset: number, digits: number): string {
    return offset.toString(16).toUpperCase().padStart(digits, '0')
}

export type ScrollGeometry = Readonly<{
    rows: number
    rowHeight: number
    /** The height the rows are seen through. */
    viewport: number
    /** The rows' whole height. */
    virtualHeight: number
    /** The scroller's content height: the rows' height, or the limit when they are taller. */
    scrollHeight: number
}>

export function scrollGeometry(rows: number, rowHeight: number, viewport: number): ScrollGeometry {
    const virtualHeight = rows * rowHeight
    return {
        rows,
        rowHeight,
        viewport: Math.max(0, viewport),
        virtualHeight,
        scrollHeight: Math.min(virtualHeight, HEX_SCROLL_LIMIT)
    }
}

export function isScaled(geometry: ScrollGeometry): boolean {
    return geometry.virtualHeight > geometry.scrollHeight
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** How far the rows can be scrolled, and how far the scroller can be. */
function ranges(geometry: ScrollGeometry) {
    return {
        virtual: Math.max(0, geometry.virtualHeight - geometry.viewport),
        scroll: Math.max(0, geometry.scrollHeight - geometry.viewport)
    }
}

/**
 * Where in the rows the view starts, in pixels, at a scroll position: the position itself while the
 * rows fit the limit; past it, the scroller's range mapped onto the rows', so that its top shows the
 * first row and its end the last.
 */
export function virtualTopOf(scrollTop: number, geometry: ScrollGeometry): number {
    const range = ranges(geometry)
    if (!isScaled(geometry) || range.scroll === 0) return clamp(scrollTop, 0, range.virtual)
    return (clamp(scrollTop, 0, range.scroll) / range.scroll) * range.virtual
}

/** The scroll position that shows the rows from `virtualTop`, the inverse of `virtualTopOf`. */
export function scrollTopOf(virtualTop: number, geometry: ScrollGeometry): number {
    const range = ranges(geometry)
    const top = clamp(virtualTop, 0, range.virtual)
    if (!isScaled(geometry) || range.virtual === 0) return top
    return (top / range.virtual) * range.scroll
}

/** The rows to draw from a view starting at `virtualTop`: the visible ones and a margin, end exclusive. */
export function rowWindow(
    virtualTop: number,
    geometry: ScrollGeometry,
    margin = HEX_ROW_MARGIN
): { first: number; end: number } {
    if (geometry.rows === 0 || geometry.rowHeight <= 0) return { first: 0, end: 0 }
    const first = Math.floor(virtualTop / geometry.rowHeight)
    const last = Math.ceil((virtualTop + geometry.viewport) / geometry.rowHeight)
    return {
        first: clamp(first - margin, 0, geometry.rows),
        end: clamp(last + margin, 0, geometry.rows)
    }
}

/**
 * The view's top that brings a row into sight from `virtualTop`, moving as little as possible, or
 * centring it when `center` is asked for, as going to an offset does.
 */
export function revealRow(
    row: number,
    virtualTop: number,
    geometry: ScrollGeometry,
    center = false
): number {
    const { rowHeight, viewport } = geometry
    const top = row * rowHeight
    if (center) return top - Math.max(0, (viewport - rowHeight) / 2)
    if (top < virtualTop) return top
    if (top + rowHeight > virtualTop + viewport) return top + rowHeight - viewport
    return virtualTop
}

export type HexColumn = 'hex' | 'text'
/**
 * Where typing goes: a byte, and in the hex column the digit of it, 0 for the high one. There is
 * always one while the File has a byte; an overwrite never moves past the last one.
 */
export type HexCaret = Readonly<{ offset: number; nibble: 0 | 1; column: HexColumn }>

/** Where a pane was in a File: kept while its tab is open, so going back to it lands there. */
export type HexViewState = { caret: HexCaret; anchor: number | undefined; topRow: number }

export type CaretContext = Readonly<{
    size: number
    bytesPerRow: number
    /** How many rows Page Up and Page Down move by. */
    pageRows: number
}>

/**
 * Where a navigation key moves the caret, or undefined for any other key. The arrows move a byte
 * (Left from the low digit goes to the high one first), Home and End to the row's ends, Page Up and
 * Down a page, and with Ctrl, Home and End to the File's ends. A move that would leave the File stays
 * put rather than stopping short, as Up on the first row does in a text editor's last column.
 */
export function moveCaret(
    caret: HexCaret,
    key: string,
    context: CaretContext,
    ctrl = false
): HexCaret | undefined {
    const { size, bytesPerRow, pageRows } = context
    const last = Math.max(0, size - 1)
    const at = (offset: number): HexCaret => ({
        offset: clamp(offset, 0, last),
        nibble: 0,
        column: caret.column
    })
    const column = caret.offset % bytesPerRow
    const rowStart = caret.offset - column
    switch (key) {
        case 'ArrowLeft':
            if (caret.column === 'hex' && caret.nibble === 1) return { ...caret, nibble: 0 }
            return at(caret.offset - 1)
        case 'ArrowRight':
            return caret.offset < last ? at(caret.offset + 1) : caret
        case 'ArrowUp':
            return caret.offset - bytesPerRow >= 0 ? at(caret.offset - bytesPerRow) : caret
        case 'ArrowDown':
            return caret.offset + bytesPerRow <= last ? at(caret.offset + bytesPerRow) : caret
        case 'PageUp': {
            const target = caret.offset - Math.max(1, pageRows) * bytesPerRow
            //past the start, the first row in the caret's column
            return at(target >= 0 ? target : column)
        }
        case 'PageDown': {
            const target = caret.offset + Math.max(1, pageRows) * bytesPerRow
            //past the end, the last row in the caret's column where that row is long enough
            return at(target <= last ? target : last - (last % bytesPerRow) + column)
        }
        case 'Home':
            return at(ctrl ? 0 : rowStart)
        case 'End':
            return at(ctrl ? last : rowStart + bytesPerRow - 1)
        default:
            return undefined
    }
}

/**
 * What typing a key at the caret writes: the byte with the digit or character replaced, and where
 * the caret goes next. Undefined for a key that types nothing there: a hex digit types into the
 * hex column, printable ASCII into the text column. After the last byte the caret stays on it.
 */
export function typeKey(
    caret: HexCaret,
    byte: number,
    key: string,
    size: number
): { byte: number; caret: HexCaret } | undefined {
    if (key.length !== 1) return undefined
    const next = (offset: number): HexCaret =>
        offset < size ? { offset, nibble: 0, column: caret.column } : caret
    if (caret.column === 'hex') {
        if (!/^[0-9a-f]$/i.test(key)) return undefined
        const digit = parseInt(key, 16)
        if (caret.nibble === 0)
            return { byte: (digit << 4) | (byte & 0x0f), caret: { ...caret, nibble: 1 } }
        const written = (byte & 0xf0) | digit
        const moved = next(caret.offset + 1)
        //on the last byte, the caret stays after the digit it typed
        return { byte: written, caret: moved === caret ? { ...caret, nibble: 1 } : moved }
    }
    const code = key.charCodeAt(0)
    if (!isPrintable(code)) return undefined
    return { byte: code, caret: next(caret.offset + 1) }
}

/** The bytes a selection covers, both ends included, whichever way it was made. */
export function selectionRange(anchor: number, caret: number): { start: number; end: number } {
    return { start: Math.min(anchor, caret), end: Math.max(anchor, caret) + 1 }
}

/** Bytes copied from the hex column: `7f 45 4c 46`. */
export function bytesAsHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
}
/** Bytes copied from the text column, as it shows them. */
export function bytesAsText(bytes: Uint8Array): string {
    let text = ''
    for (const byte of bytes) text += TEXT[byte]
    return text
}
