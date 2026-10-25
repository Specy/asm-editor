/**
 * The pixels of a BMP read and written in the layout the File already has, for the **Pixel
 * editor** ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decision 3): 1, 4 and 8
 * bits a pixel through the File's palette, 16, 24 and 32 bits with or without colour masks and an
 * alpha channel, rows bottom-up or top-down, under any DIB header from `BITMAPCOREHEADER` to
 * `BITMAPV5HEADER`. Writing a pixel changes only its own bits, so a drawing is overwrites of the
 * File's bytes and never changes its length.
 *
 * A colour is a number `0xRRGGBBAA`, alpha 255 for opaque.
 */

/**
 * The most pixels the Pixel editor takes, 2048 × 2048: a 16 MiB File at 1 bit a pixel would hold
 * 128 million, half a gigabyte once decoded ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md),
 * decision 2).
 */
export const PIXEL_LIMIT = 2048 * 2048

/** The bits of each channel in a 16 or 32-bit pixel, read little-endian; alpha 0 when none. */
export type BmpMasks = Readonly<{ red: number; green: number; blue: number; alpha: number }>

/** Where a picture's palette lies in the File: 3-byte entries under `BITMAPCOREHEADER`, else 4. */
export type BmpPalette = Readonly<{ offset: number; entrySize: 3 | 4; count: number }>

export type BmpLayout = Readonly<{
    width: number
    height: number
    /** Rows stored from the top, as a negative height says; else from the bottom. */
    topDown: boolean
    bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32
    /** The DIB header's size, 12 to 124. */
    headerSize: number
    /** For 16 and 32 bits a pixel; 24 bits are blue, green and red bytes. */
    masks?: BmpMasks
    /** For 1, 4 and 8 bits a pixel. */
    palette?: BmpPalette
    pixelOffset: number
    /** The bytes of one stored row, rounded up to whole 4-byte words. */
    rowStride: number
}>

/** A picture's layout, or why the Pixel editor does not take it. */
export type BmpReading =
    | { layout: BmpLayout; unsupported?: undefined }
    | { layout?: undefined; unsupported: string }

/** The layouts a new picture can have ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decisions 5 to 7). */
export type PictureFormat = 'rgb32' | 'rgba32' | 'rgb24' | 'indexed8' | 'indexed4' | 'indexed1'

/**
 * The sizes of the DIB headers a BMP can carry, from `BITMAPCOREHEADER`'s 12 to
 * `BITMAPV5HEADER`'s 124.
 */
const BMP_HEADER_SIZES = [12, 40, 52, 56, 64, 108, 124]
const FILE_HEADER = 14
const BI_RGB = 0
const BI_BITFIELDS = 3
const BI_ALPHABITFIELDS = 6
/**
 * `LCS_sRGB`, and `PROFILE_EMBEDDED` and `PROFILE_LINKED`, the colour spaces of a `BITMAPV4HEADER`
 * or V5 one: the last two name a profile, or its file's name, kept after the pixels.
 */
const LCS_SRGB = 0x73524742
const PROFILE_EMBEDDED = 0x4d424544
const PROFILE_LINKED = 0x4c494e4b
/** The longest side the Pixel editor takes, which every browser's canvas can hold. */
export const SIDE_LIMIT = 16384
/** 72 dots an inch in pixels a metre, as Windows writes it. */
const PIXELS_PER_METRE = 2835

const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8)
const u32 = (bytes: Uint8Array, offset: number) =>
    (u16(bytes, offset) | (u16(bytes, offset + 2) << 16)) >>> 0
const i32 = (bytes: Uint8Array, offset: number) => u32(bytes, offset) | 0

function setU16(bytes: Uint8Array, offset: number, value: number) {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >>> 8) & 0xff
}
function setU32(bytes: Uint8Array, offset: number, value: number) {
    setU16(bytes, offset, value & 0xffff)
    setU16(bytes, offset + 2, (value >>> 16) & 0xffff)
}

export const rgba = (red: number, green: number, blue: number, alpha = 255) =>
    ((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0
export const redOf = (colour: number) => colour >>> 24
export const greenOf = (colour: number) => (colour >>> 16) & 0xff
export const blueOf = (colour: number) => (colour >>> 8) & 0xff
export const alphaOf = (colour: number) => colour & 0xff

/** The number of zero bits below a mask's lowest set bit. */
function shiftOf(mask: number) {
    if (!mask) return 0
    let shift = 0
    while (!((mask >>> shift) & 1)) shift++
    return shift
}

/** Whether a mask is one run of set bits, as a channel's must be. */
function contiguous(mask: number) {
    const bits = mask >>> shiftOf(mask)
    return (bits & (bits + 1)) === 0
}

/** The masks a 16 or 32-bit picture without bit fields has: 5-5-5, or 8-8-8 with no alpha. */
function defaultMasks(bitsPerPixel: 16 | 32): BmpMasks {
    return bitsPerPixel === 16
        ? { red: 0x7c00, green: 0x03e0, blue: 0x001f, alpha: 0 }
        : { red: 0x00ff0000, green: 0x0000ff00, blue: 0x000000ff, alpha: 0 }
}

function readMasks(head: Uint8Array, offset: number, alpha: boolean): BmpMasks {
    return {
        red: u32(head, offset),
        green: u32(head, offset + 4),
        blue: u32(head, offset + 8),
        alpha: alpha ? u32(head, offset + 12) : 0
    }
}

/** Why a 16 or 32-bit picture's masks cannot be drawn in, or undefined when they can. */
function maskProblem(masks: BmpMasks, bitsPerPixel: 16 | 32) {
    const channels = [masks.red, masks.green, masks.blue, masks.alpha]
    if (!masks.red || !masks.green || !masks.blue) return 'a colour channel has no bits'
    const limit = bitsPerPixel === 16 ? 0xffff : 0xffffffff
    if (channels.some((mask) => mask > limit || !contiguous(mask)))
        return 'its colour masks are unusual'
    let seen = 0
    for (const mask of channels) {
        if ((seen & mask) !== 0) return 'its colour masks overlap'
        seen = (seen | mask) >>> 0
    }
    return undefined
}

/**
 * The layout of the BMP whose first bytes are `head` and whose length is `length`, or why the
 * Pixel editor does not take it: compressed, 2 or 64 bits a pixel, past {@link PIXEL_LIMIT}, or
 * pixels or a palette that do not fit. `head` must hold the headers and the palette, at most
 * 14 + 124 + 256 × 4 bytes.
 */
export function readBmpLayout(head: Uint8Array, length: number): BmpReading {
    const no = (unsupported: string): BmpReading => ({ unsupported })
    if (!isBmp(head)) return no('it is not a BMP')
    const headerSize = u32(head, 14)
    if (head.length < FILE_HEADER + headerSize) return no('its header is cut short')
    const core = headerSize === 12
    const width = core ? u16(head, 18) : i32(head, 18)
    const storedHeight = core ? u16(head, 20) : i32(head, 22)
    const planes = core ? u16(head, 22) : u16(head, 26)
    const bitsPerPixel = core ? u16(head, 24) : u16(head, 28)
    const compression = core ? BI_RGB : u32(head, 30)
    const topDown = storedHeight < 0
    const height = Math.abs(storedHeight)
    if (planes !== 1) return no('it has more than one plane')
    //OS/2's 64-byte header numbers its compressions differently and has no bit fields
    const fields =
        headerSize !== 64 && (compression === BI_BITFIELDS || compression === BI_ALPHABITFIELDS)
    if (compression !== BI_RGB && !fields) return no('it is compressed')
    if (![1, 4, 8, 16, 24, 32].includes(bitsPerPixel))
        return no(`it has ${bitsPerPixel} bits a pixel`)
    if (width < 1 || height < 1) return no('it has no pixels')
    if (width * height > PIXEL_LIMIT) return no('it has more than 2048 × 2048 pixels')
    if (width > SIDE_LIMIT || height > SIDE_LIMIT)
        return no(`a side is longer than ${SIDE_LIMIT} pixels`)
    const depth = bitsPerPixel as BmpLayout['bitsPerPixel']

    let masks: BmpMasks | undefined
    let palette: BmpPalette | undefined
    //where the masks or the palette after a header end, for the pixels to come no sooner
    let tablesEnd = FILE_HEADER + headerSize
    if (depth === 16 || depth === 32) {
        if (compression === BI_RGB) masks = defaultMasks(depth)
        else if (headerSize >= 52 && headerSize !== 64) {
            //masks inside a V2 header or later; a V3 or later holds the alpha one too
            masks = readMasks(head, FILE_HEADER + 40, headerSize >= 56)
        } else {
            //a 40-byte header followed by three masks, or four for alpha bit fields
            const alpha = compression === BI_ALPHABITFIELDS
            tablesEnd += alpha ? 16 : 12
            if (head.length < tablesEnd) return no('its colour masks are cut short')
            masks = readMasks(head, FILE_HEADER + 40, alpha)
        }
        const problem = maskProblem(masks, depth)
        if (problem) return no(problem)
    } else if (compression !== BI_RGB) {
        return no('it has colour masks without 16 or 32 bits a pixel')
    } else if (depth !== 24) {
        const entrySize = core ? 3 : 4
        const used = core ? 0 : u32(head, 46)
        //a core header gives no count: Windows reads as many entries as fit before the pixels
        const fit = Math.floor((u32(head, 10) - tablesEnd) / entrySize)
        const count = Math.min(used === 0 ? 2 ** depth : used, 2 ** depth, core ? fit : Infinity)
        if (count < 1) return no('it has no palette')
        palette = { offset: tablesEnd, entrySize, count }
        tablesEnd += entrySize * count
        if (head.length < tablesEnd) return no('its palette is cut short')
    }

    const pixelOffset = u32(head, 10)
    const rowStride = Math.floor((width * depth + 31) / 32) * 4
    if (pixelOffset < tablesEnd) return no('its pixels overlap its headers')
    if (pixelOffset + rowStride * height > length) return no('its pixels run past its end')
    return {
        layout: {
            width,
            height,
            topDown,
            bitsPerPixel: depth,
            headerSize,
            ...(masks ? { masks } : {}),
            ...(palette ? { palette } : {}),
            pixelOffset,
            rowStride
        }
    }
}

/**
 * A BMP: `BM`, and after the 14-byte file header a DIB header of a size Windows defines, which
 * rules out most Files that merely start with those two letters.
 */
export function isBmp(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 26 &&
        bytes[0] === 0x42 &&
        bytes[1] === 0x4d &&
        BMP_HEADER_SIZES.includes(u32(bytes, 14))
    )
}

/** Whether a picture keeps an alpha channel, the one kind with transparent pixels (decision 7). */
export function hasAlpha(layout: BmpLayout): boolean {
    return !!layout.masks?.alpha
}

/** Where a row is stored: the first in the File is the top one only in a top-down picture. */
export function rowStart(layout: BmpLayout, y: number) {
    const stored = layout.topDown ? y : layout.height - 1 - y
    return layout.pixelOffset + stored * layout.rowStride
}

/** The bits of the pixel at (x, y): a palette index, or a 16, 24 or 32-bit value. */
export function readRaw(bytes: Uint8Array, layout: BmpLayout, x: number, y: number): number {
    const start = rowStart(layout, y)
    const depth = layout.bitsPerPixel
    if (depth < 8) {
        const bit = x * depth
        const shift = 8 - depth - (bit & 7)
        return (bytes[start + (bit >> 3)] >> shift) & ((1 << depth) - 1)
    }
    const at = start + x * (depth >> 3)
    if (depth === 8) return bytes[at]
    if (depth === 16) return u16(bytes, at)
    if (depth === 24) return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
    return u32(bytes, at)
}

/**
 * Writes `value` into the pixel at (x, y), only the bits of `writeMask`: a 32-bit picture without
 * an alpha channel keeps its fourth byte, which Chrome reads as alpha when it is not zero
 * everywhere, and a 16-bit one its unused bit
 * ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md), decision 6).
 */
export function writeRaw(
    bytes: Uint8Array,
    layout: BmpLayout,
    x: number,
    y: number,
    value: number
) {
    const start = rowStart(layout, y)
    const depth = layout.bitsPerPixel
    if (depth < 8) {
        const bit = x * depth
        const shift = 8 - depth - (bit & 7)
        const mask = ((1 << depth) - 1) << shift
        const at = start + (bit >> 3)
        bytes[at] = (bytes[at] & ~mask) | ((value << shift) & mask)
        return
    }
    const at = start + x * (depth >> 3)
    if (depth === 8) {
        bytes[at] = value
        return
    }
    if (depth === 24) {
        bytes[at] = value & 0xff
        bytes[at + 1] = (value >>> 8) & 0xff
        bytes[at + 2] = (value >>> 16) & 0xff
        return
    }
    const mask = writeMask(layout)
    const kept = depth === 16 ? u16(bytes, at) : u32(bytes, at)
    const next = ((kept & ~mask) | (value & mask)) >>> 0
    if (depth === 16) setU16(bytes, at, next)
    else setU32(bytes, at, next)
}

/** The bits of a pixel drawing writes: its channels, and every bit of a palette index. */
export function writeMask(layout: BmpLayout): number {
    const masks = layout.masks
    if (!masks) return layout.bitsPerPixel === 24 ? 0xffffff : (1 << layout.bitsPerPixel) - 1
    return (masks.red | masks.green | masks.blue | masks.alpha) >>> 0
}

/** The byte span a pixel's bits lie in, for collecting what a drawing changed. */
export function pixelSpan(layout: BmpLayout, x: number, y: number): [number, number] {
    const start = rowStart(layout, y)
    const depth = layout.bitsPerPixel
    if (depth < 8) {
        const at = start + ((x * depth) >> 3)
        return [at, at + 1]
    }
    const at = start + x * (depth >> 3)
    return [at, at + (depth >> 3)]
}

/** A channel's bits widened to 8, so the largest value of any mask is 255. */
function widen(value: number, mask: number) {
    const max = mask >>> shiftOf(mask)
    return max === 0xff ? value : Math.round((value * 255) / max)
}
/** An 8-bit channel narrowed to the mask's bits, to the nearest value it holds. */
function narrow(channel: number, mask: number) {
    const max = mask >>> shiftOf(mask)
    return (Math.round((channel * max) / 255) * 2 ** shiftOf(mask)) >>> 0
}

/** The colours of a picture's palette, opaque: a palette entry's fourth byte is reserved. */
export function readPalette(bytes: Uint8Array, layout: BmpLayout): number[] {
    const palette = layout.palette
    if (!palette) return []
    return Array.from({ length: palette.count }, (_, index) => {
        const at = palette.offset + index * palette.entrySize
        return rgba(bytes[at + 2], bytes[at + 1], bytes[at])
    })
}

/**
 * The colour of a pixel's bits: its palette's entry, black for an index past the palette's end
 * as Windows draws one; its channels widened to 8 bits, opaque without an alpha channel.
 */
export function colourOfRaw(layout: BmpLayout, raw: number, palette: readonly number[]): number {
    if (layout.palette) return palette[raw] ?? rgba(0, 0, 0)
    if (layout.bitsPerPixel === 24) return rgba((raw >>> 16) & 0xff, (raw >>> 8) & 0xff, raw & 0xff)
    const masks = layout.masks!
    const channel = (mask: number) => widen(((raw & mask) >>> 0) >>> shiftOf(mask), mask)
    return rgba(
        channel(masks.red),
        channel(masks.green),
        channel(masks.blue),
        masks.alpha ? channel(masks.alpha) : 255
    )
}

/**
 * The bits a colour is drawn with in a picture without a palette, each channel narrowed to the
 * File's own masks ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md),
 * decision 7); alpha is all or nothing, as the editor draws (decision 7 of the design).
 */
export function rawOfColour(layout: BmpLayout, colour: number): number {
    const [red, green, blue] = [redOf(colour), greenOf(colour), blueOf(colour)]
    if (layout.bitsPerPixel === 24) return (red << 16) | (green << 8) | blue
    const masks = layout.masks
    if (!masks) throw new Error('A picture with a palette is drawn by index')
    const opaque = alphaOf(colour) >= 128
    return (
        (narrow(red, masks.red) |
            narrow(green, masks.green) |
            narrow(blue, masks.blue) |
            (masks.alpha && opaque ? masks.alpha : 0)) >>>
        0
    )
}

/** The colour a picture without a palette stores for `colour`: what a program will read. */
export function quantise(layout: BmpLayout, colour: number): number {
    return colourOfRaw(layout, rawOfColour(layout, colour), [])
}

/** Every pixel as RGBA bytes, the top row first, for an `ImageData`. */
export function decodePixels(bytes: Uint8Array, layout: BmpLayout): Uint8ClampedArray<ArrayBuffer> {
    const { width, height } = layout
    const pixels = new Uint8ClampedArray(width * height * 4)
    const palette = readPalette(bytes, layout)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const colour = colourOfRaw(layout, readRaw(bytes, layout, x, y), palette)
            const at = (y * width + x) * 4
            pixels[at] = redOf(colour)
            pixels[at + 1] = greenOf(colour)
            pixels[at + 2] = blueOf(colour)
            pixels[at + 3] = alphaOf(colour)
        }
    }
    return pixels
}

/** The bytes a palette entry is recoloured with, and where: blue, green, red (decision 6). */
export function paletteEntry(layout: BmpLayout, index: number, colour: number) {
    const palette = layout.palette
    if (!palette || index < 0 || index >= palette.count)
        throw new Error(`No palette entry ${index}`)
    return {
        offset: palette.offset + index * palette.entrySize,
        bytes: Uint8Array.of(blueOf(colour), greenOf(colour), redOf(colour))
    }
}

/** The bits a pixel of a new picture of `format` has. */
export const FORMAT_BITS: Readonly<Record<PictureFormat, BmpLayout['bitsPerPixel']>> = {
    rgb32: 32,
    rgba32: 32,
    rgb24: 24,
    indexed8: 8,
    indexed4: 4,
    indexed1: 1
}

/**
 * A new picture, stored top-down, every pixel's bits zero: black, palette entry 0, or in a
 * picture with transparency, transparent ([pixel-editor.md](../../../../../docs/design/pixel-editor.md),
 * decisions 5 and 7). A 40-byte `BITMAPINFOHEADER`, or for transparency a 108-byte
 * `BITMAPV4HEADER` with its four masks; a palette picture's palette follows its header.
 */
export function makeBmp(options: {
    width: number
    height: number
    format: PictureFormat
    palette?: readonly number[]
}): Uint8Array<ArrayBuffer> {
    const { width, height, format } = options
    const bitsPerPixel = FORMAT_BITS[format]
    const indexed = bitsPerPixel <= 8
    const palette = indexed ? (options.palette ?? []) : []
    if (indexed && (palette.length < 1 || palette.length > 2 ** bitsPerPixel))
        throw new Error(`A ${bitsPerPixel}-bit picture needs 1 to ${2 ** bitsPerPixel} colours`)
    const headerSize = format === 'rgba32' ? 108 : 40
    const rowStride = Math.floor((width * bitsPerPixel + 31) / 32) * 4
    const pixelOffset = FILE_HEADER + headerSize + palette.length * 4
    const length = pixelOffset + rowStride * height
    const bytes = new Uint8Array(length)
    bytes[0] = 0x42
    bytes[1] = 0x4d
    setU32(bytes, 2, length)
    setU32(bytes, 10, pixelOffset)
    setU32(bytes, 14, headerSize)
    setU32(bytes, 18, width)
    setU32(bytes, 22, -height >>> 0)
    setU16(bytes, 26, 1)
    setU16(bytes, 28, bitsPerPixel)
    setU32(bytes, 30, format === 'rgba32' ? BI_BITFIELDS : BI_RGB)
    setU32(bytes, 34, rowStride * height)
    setU32(bytes, 38, PIXELS_PER_METRE)
    setU32(bytes, 42, PIXELS_PER_METRE)
    setU32(bytes, 46, palette.length)
    if (format === 'rgba32') {
        setU32(bytes, 54, 0x00ff0000)
        setU32(bytes, 58, 0x0000ff00)
        setU32(bytes, 62, 0x000000ff)
        setU32(bytes, 66, 0xff000000)
        setU32(bytes, 70, LCS_SRGB)
    }
    palette.forEach((colour, index) => {
        const at = FILE_HEADER + headerSize + index * 4
        bytes[at] = blueOf(colour)
        bytes[at + 1] = greenOf(colour)
        bytes[at + 2] = redOf(colour)
    })
    return bytes
}

/**
 * The picture at another size, anchored at its top-left corner: rows and columns past the new
 * size are cropped, new ones added with every colour bit zero, black or transparent or palette
 * entry 0 ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decision 9), and the bits
 * no channel uses as the top-left pixel has them, so a 32-bit picture whose fourth bytes are 0xFF,
 * which Chrome then reads as alpha, does not grow transparent. The headers, the palette and
 * anything between them and the pixels are kept, their sizes rewritten; a colour profile after
 * the pixels moves with them, and nothing else after them is kept.
 */
export function resizeBmp(
    bytes: Uint8Array,
    layout: BmpLayout,
    width: number,
    height: number
): Uint8Array<ArrayBuffer> {
    const next: BmpLayout = {
        ...layout,
        width,
        height,
        rowStride: Math.floor((width * layout.bitsPerPixel + 31) / 32) * 4
    }
    const pixelsLength = next.rowStride * height
    const profile = embeddedProfile(bytes, layout)
    const profileAt = layout.pixelOffset + pixelsLength
    const length = profileAt + (profile?.length ?? 0)
    const result = new Uint8Array(length)
    result.set(bytes.subarray(0, layout.pixelOffset))
    const unused = layout.masks ? (readRaw(bytes, layout, 0, 0) & ~writeMask(layout)) >>> 0 : 0
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            if (x < layout.width && y < layout.height)
                writeRawAll(result, next, x, y, readRaw(bytes, layout, x, y))
            else if (unused) writeRawAll(result, next, x, y, unused)
        }
    if (profile) {
        result.set(profile, profileAt)
        setU32(result, FILE_HEADER + 112, profileAt - FILE_HEADER)
    } else if (layout.headerSize === 124 && namesProfile(bytes)) {
        //a profile that could not be kept is named no more: the picture is sRGB
        setU32(result, FILE_HEADER + 56, LCS_SRGB)
        setU32(result, FILE_HEADER + 112, 0)
        setU32(result, FILE_HEADER + 116, 0)
    }
    setU32(result, 2, length)
    if (layout.headerSize === 12) {
        setU16(result, 18, width)
        setU16(result, 20, height)
    } else {
        setU32(result, 18, width)
        setU32(result, 22, (layout.topDown ? -height : height) >>> 0)
        setU32(result, 34, pixelsLength)
    }
    return result
}

/** Writes every bit of a pixel, as copying one into a picture whose bits are all zero does. */
function writeRawAll(bytes: Uint8Array, layout: BmpLayout, x: number, y: number, value: number) {
    const depth = layout.bitsPerPixel
    if (depth === 16 || depth === 32) {
        const at = rowStart(layout, y) + x * (depth >> 3)
        if (depth === 16) setU16(bytes, at, value)
        else setU32(bytes, at, value)
    } else writeRaw(bytes, layout, x, y, value)
}

const namesProfile = (bytes: Uint8Array) =>
    [PROFILE_EMBEDDED, PROFILE_LINKED].includes(u32(bytes, FILE_HEADER + 56))

/**
 * A `BITMAPV5HEADER`'s colour profile, or a linked one's file name, which lies after the pixels
 * when it has one.
 */
function embeddedProfile(bytes: Uint8Array, layout: BmpLayout): Uint8Array | undefined {
    if (layout.headerSize !== 124 || !namesProfile(bytes)) return undefined
    const start = FILE_HEADER + u32(bytes, FILE_HEADER + 112)
    const end = start + u32(bytes, FILE_HEADER + 116)
    if (start < layout.pixelOffset + layout.rowStride * layout.height || end > bytes.length)
        return undefined
    return bytes.slice(start, end)
}

/** How the status line names a layout: its bits a pixel, its palette or masks, its row order. */
export function describeLayout(layout: BmpLayout): string {
    const depth = layout.bitsPerPixel
    const order = layout.topDown ? 'top-down' : 'bottom-up'
    if (layout.palette) {
        const colours = layout.palette.count
        return `${depth}-bit, ${colours} colour${colours === 1 ? '' : 's'}, ${order}`
    }
    if (depth === 16) {
        const masks = layout.masks!
        const bits = (mask: number) => (mask >>> shiftOf(mask)).toString(2).length
        const channels = [masks.alpha, masks.red, masks.green, masks.blue].filter(Boolean)
        return `16-bit ${channels.map(bits).join('-')}, ${order}`
    }
    return `${depth}-bit${hasAlpha(layout) ? ' with transparency' : ''}, ${order}`
}
