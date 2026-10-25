import type { ByteRun } from '../languages/peripherals/FileSystem'
import type { BrushShape, PixelTool } from './tools'
import {
    alphaOf,
    colourOfRaw,
    decodePixels,
    hasAlpha,
    paletteEntry,
    quantise,
    rawOfColour,
    readBmpLayout,
    readPalette,
    readRaw,
    rgba,
    rowStart,
    writeRaw,
    type BmpLayout
} from './bmp'

/**
 * What the Pixel editor draws with: an entry of the picture's palette, or a colour, which a
 * picture without a palette stores narrowed to its own layout.
 */
export type Ink = Readonly<{ index: number }> | Readonly<{ colour: number }>

/** Erase's ink: transparent, in a picture with an alpha channel (design decision 7). */
export const TRANSPARENT: Ink = { colour: rgba(0, 0, 0, 0) }

/**
 * Where a pane was in a picture and what it drew with, kept while its tab is open, as the Hex
 * editor keeps its caret: the zoom, the picture's point at the middle of the pane, the tool, the
 * ink and whether a rectangle is filled.
 */
export type PixelViewState = {
    zoom?: number
    centre?: [number, number]
    tool: PixelTool
    ink?: Ink
    /** Colours added to the colour row of a picture without a palette, used in it or not. */
    addedColours?: number[]
    /** Whether Rectangle and Ellipse fill what they draw. */
    filled: boolean
    /** The Pencil's and the Eraser's brush: how many pixels across, and its shape. */
    brushSize?: number
    brushShape?: BrushShape
    /** How many pixels thick Line draws. */
    lineWidth?: number
    /** Whether Ellipse draws circles. */
    circle?: boolean
}

/** The pixels a stroke has changed so far, to redraw. */
export type Bounds = { left: number; top: number; right: number; bottom: number }

/**
 * A picture as the Pixel editor holds it while it is shown: the File's bytes, the RGBA its canvas
 * draws, and the stroke being drawn, whose changed bytes become one change when it ends
 * ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md), decision 4). The bytes
 * always say what the File will say: every pixel drawn is written into them and read back for the
 * canvas, so a 16-bit or masked picture shows the colour a program reads.
 */
export class PixelDocument {
    readonly bytes: Uint8Array
    readonly pixels: Uint8ClampedArray<ArrayBuffer>
    palette: number[]
    /**
     * Each row the stroke has drawn on, by its index, as the stroke found it: its stored bytes and
     * its RGBA, to cancel the stroke and to tell which bytes it changed, so a stroke costs the rows
     * it touches rather than a copy of the whole picture.
     */
    private rows = new Map<number, { bytes: Uint8Array; pixels: Uint8ClampedArray }>()
    changed?: Bounds

    private constructor(
        readonly layout: BmpLayout,
        bytes: Uint8Array
    ) {
        this.bytes = bytes
        this.palette = readPalette(bytes, layout)
        this.pixels = decodePixels(bytes, layout)
    }

    /** The picture in `bytes`, copied, or undefined when the Pixel editor does not take it. */
    static read(bytes: Uint8Array): PixelDocument | undefined {
        const { layout } = readBmpLayout(bytes, bytes.length)
        return layout && new PixelDocument(layout, bytes.slice())
    }

    get width() {
        return this.layout.width
    }
    get height() {
        return this.layout.height
    }
    get alpha() {
        return hasAlpha(this.layout)
    }

    /** The pixel's colour as drawn, `0xRRGGBBAA`. */
    colourAt(x: number, y: number): number {
        const at = (y * this.width + x) * 4
        const pixels = this.pixels
        return rgba(pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3])
    }

    /** What a pixel is for Fill: its palette index, or its colour. */
    kindAt(x: number, y: number): number {
        return this.layout.palette ? readRaw(this.bytes, this.layout, x, y) : this.colourAt(x, y)
    }

    /**
     * The ink the eyedropper takes from a pixel: its palette entry, or its colour, opaque unless it
     * is fully transparent (design decision 7).
     */
    inkAt(x: number, y: number): Ink {
        if (this.layout.palette) return { index: readRaw(this.bytes, this.layout, x, y) }
        const colour = this.colourAt(x, y)
        return alphaOf(colour) === 0 && this.alpha
            ? TRANSPARENT
            : { colour: ((colour & 0xffffff00) | 0xff) >>> 0 }
    }

    /** The colour an ink draws as in this picture. */
    inkColour(ink: Ink): number {
        if ('index' in ink) return this.palette[ink.index] ?? rgba(0, 0, 0)
        return quantise(this.layout, ink.colour)
    }

    /** Whether the ink can be drawn here: an entry of the palette, or a colour without one. */
    fits(ink: Ink): boolean {
        if (this.layout.palette) return 'index' in ink && ink.index < this.palette.length
        return 'colour' in ink && (alphaOf(ink.colour) === 255 || this.alpha)
    }

    beginStroke() {
        this.rows.clear()
    }

    /** Draws one pixel of the stroke; pixels outside the picture are ignored. */
    plot(x: number, y: number, ink: Ink) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
        const layout = this.layout
        if (!this.rows.has(y)) {
            const start = rowStart(layout, y)
            const at = y * this.width * 4
            this.rows.set(y, {
                bytes: this.bytes.slice(start, start + layout.rowStride),
                pixels: this.pixels.slice(at, at + this.width * 4)
            })
        }
        const raw = 'index' in ink ? ink.index : rawOfColour(layout, ink.colour)
        writeRaw(this.bytes, layout, x, y, raw)
        const colour = colourOfRaw(layout, readRaw(this.bytes, layout, x, y), this.palette)
        const at = (y * this.width + x) * 4
        this.pixels[at] = colour >>> 24
        this.pixels[at + 1] = (colour >>> 16) & 0xff
        this.pixels[at + 2] = (colour >>> 8) & 0xff
        this.pixels[at + 3] = colour & 0xff
        const bounds = this.changed
        this.changed = bounds
            ? {
                  left: Math.min(bounds.left, x),
                  top: Math.min(bounds.top, y),
                  right: Math.max(bounds.right, x),
                  bottom: Math.max(bounds.bottom, y)
              }
            : { left: x, top: y, right: x, bottom: y }
    }

    /** Puts back what the stroke drew, which then saves nothing. */
    cancelStroke() {
        for (const [y, row] of this.rows) {
            this.bytes.set(row.bytes, rowStart(this.layout, y))
            this.pixels.set(row.pixels, y * this.width * 4)
        }
        this.rows.clear()
    }

    /**
     * Ends the stroke: the bytes of each row it changed, as one run a row from its first changed
     * byte to its last, which the FileSystem joins further where rows lie close together. A row
     * drawn over in the colours it had changes no byte and gives no run, so a stroke that changed
     * nothing saves nothing.
     */
    endStroke(): ByteRun[] {
        const runs: ByteRun[] = []
        for (const [y, row] of this.rows) {
            const start = rowStart(this.layout, y)
            let first = -1
            let last = -1
            for (let index = 0; index < row.bytes.length; index++) {
                if (row.bytes[index] === this.bytes[start + index]) continue
                if (first < 0) first = index
                last = index
            }
            if (first >= 0)
                runs.push({
                    offset: start + first,
                    bytes: this.bytes.slice(start + first, start + last + 1)
                })
        }
        this.rows.clear()
        return runs.sort((left, right) => left.offset - right.offset)
    }

    /**
     * Recolours a palette entry, every pixel that uses it with it (design decision 6): the bytes it
     * writes, as the one run of a change.
     */
    recolour(index: number, colour: number): ByteRun {
        const { offset, bytes } = paletteEntry(this.layout, index, colour)
        this.bytes.set(bytes, offset)
        this.palette = readPalette(this.bytes, this.layout)
        this.pixels.set(decodePixels(this.bytes, this.layout))
        return { offset, bytes }
    }

    /**
     * The colours the picture uses most, most first, at most `limit`: the colour row of a picture
     * without a palette ([pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md),
     * decision 14).
     */
    usedColours(limit: number): number[] {
        const counts = new Map<number, number>()
        const pixels = this.pixels
        for (let at = 0; at < pixels.length; at += 4) {
            const colour = rgba(pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3])
            counts.set(colour, (counts.get(colour) ?? 0) + 1)
        }
        return [...counts.entries()]
            .sort(([, left], [, right]) => right - left)
            .slice(0, limit)
            .map(([colour]) => colour)
    }
}
