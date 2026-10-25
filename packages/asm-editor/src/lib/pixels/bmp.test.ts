/**
 * A BMP's pixels read and written in the layout the File has
 * ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decisions 3, 5, 7 and 9), checked
 * against Pillow's decoding of the fixtures `scripts/pixel-fixtures/make.py` writes.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import {
    decodePixels,
    describeLayout,
    hasAlpha,
    makeBmp,
    paletteEntry,
    rowStart,
    quantise,
    rawOfColour,
    readBmpLayout,
    readPalette,
    readRaw,
    resizeBmp,
    rgba,
    writeMask,
    writeRaw,
    PIXEL_LIMIT,
    type BmpLayout,
    type PictureFormat
} from './bmp'
import { newPictureFormat, PALETTE_16, PALETTE_2, PALETTE_332, startingPalette } from './palettes'
import { expandColor } from '../languages/Z80/Z80Device'

const FIXTURES = 'src/lib/pixels/fixtures/'
const fixture = (name: string) => new Uint8Array(readFileSync(`${FIXTURES}${name}.bmp`))
const pillow = (name: string) => new Uint8Array(readFileSync(`${FIXTURES}${name}.rgba`))

/** The bytes a pixel's bits lie in, which a write of it may change and no other may. */
function pixelSpan(layout: BmpLayout, x: number, y: number): [number, number] {
    const start = rowStart(layout, y)
    const depth = layout.bitsPerPixel
    if (depth < 8) {
        const at = start + ((x * depth) >> 3)
        return [at, at + 1]
    }
    const at = start + x * (depth >> 3)
    return [at, at + (depth >> 3)]
}

function layoutOf(bytes: Uint8Array): BmpLayout {
    const reading = readBmpLayout(bytes, bytes.length)
    if (!reading.layout) throw new Error(reading.unsupported)
    return reading.layout
}

const FIXTURE_LAYOUTS: Record<string, Partial<BmpLayout> & { description: string }> = {
    'pillow-1bit': { bitsPerPixel: 1, topDown: false, description: '1-bit, 2 colours, bottom-up' },
    'pillow-8bit': { bitsPerPixel: 8, description: '8-bit, 256 colours, bottom-up' },
    'pillow-24bit': { bitsPerPixel: 24, description: '24-bit, bottom-up' },
    'rgb-32bit': { bitsPerPixel: 32, description: '32-bit, bottom-up' },
    'indexed-4bit': { bitsPerPixel: 4, description: '4-bit, 16 colours, bottom-up' },
    'indexed-8bit-top-down-5-colours': {
        bitsPerPixel: 8,
        topDown: true,
        description: '8-bit, 5 colours, top-down'
    },
    'rgb-24bit-top-down': { bitsPerPixel: 24, topDown: true, description: '24-bit, top-down' },
    'rgb-16bit-555': { bitsPerPixel: 16, description: '16-bit 5-5-5, bottom-up' },
    'rgb-16bit-565': { bitsPerPixel: 16, description: '16-bit 5-6-5, bottom-up' },
    'core-8bit': { bitsPerPixel: 8, headerSize: 12, description: '8-bit, 256 colours, bottom-up' },
    'rgba-32bit-v4': {
        bitsPerPixel: 32,
        headerSize: 108,
        topDown: true,
        description: '32-bit with transparency, top-down'
    }
}

describe('reading a BMP', () => {
    for (const [name, expected] of Object.entries(FIXTURE_LAYOUTS)) {
        it(`decodes ${name} as Pillow does`, () => {
            const bytes = fixture(name)
            const layout = layoutOf(bytes)
            const { description, ...fields } = expected
            expect(layout).toMatchObject({ width: 7, height: 5, ...fields })
            expect(describeLayout(layout)).toBe(description)
            const decoded = decodePixels(bytes, layout)
            const reference = pillow(name)
            expect(decoded.length).toBe(reference.length)
            //Pillow widens 5 and 6-bit channels by repeating their bits, the editor by scaling:
            //the two agree to within one step of 255
            const tolerance = layout.bitsPerPixel === 16 ? 1 : 0
            const worst = decoded.reduce(
                (most, value, index) => Math.max(most, Math.abs(value - reference[index])),
                0
            )
            expect(worst).toBeLessThanOrEqual(tolerance)
        })
    }

    it('keeps the alpha it finds, partial alpha included (design decision 7)', () => {
        const bytes = fixture('rgba-32bit-v4')
        const layout = layoutOf(bytes)
        expect(hasAlpha(layout)).toBe(true)
        const alphas = new Set(
            Array.from(decodePixels(bytes, layout)).filter((_, i) => i % 4 === 3)
        )
        expect(alphas).toEqual(new Set([0, 128, 255]))
    })

    it('reads a 32-bit picture without masks as opaque, its fourth byte padding', () => {
        const bytes = fixture('rgb-32bit')
        const layout = layoutOf(bytes)
        expect(hasAlpha(layout)).toBe(false)
        expect(
            decodePixels(bytes, layout)
                .filter((_, i) => i % 4 === 3)
                .every((a) => a === 255)
        ).toBe(true)
    })

    it('reads a palette shorter than its bits allow, as biClrUsed gives it', () => {
        const bytes = fixture('indexed-8bit-top-down-5-colours')
        const layout = layoutOf(bytes)
        expect(layout.palette).toEqual({ offset: 54, entrySize: 4, count: 5 })
        expect(readPalette(bytes, layout)).toHaveLength(5)
    })

    const header = (size: number, bits: number, compression: number, width = 2, height = 2) => {
        const stride = Math.floor((width * bits + 31) / 32) * 4
        const bytes = new Uint8Array(14 + size + 1024 + stride * Math.abs(height))
        const view = new DataView(bytes.buffer)
        bytes.set([0x42, 0x4d])
        view.setUint32(2, bytes.length, true)
        view.setUint32(10, 14 + size + 1024, true)
        view.setUint32(14, size, true)
        view.setInt32(18, width, true)
        view.setInt32(22, height, true)
        view.setUint16(26, 1, true)
        view.setUint16(28, bits, true)
        view.setUint32(30, compression, true)
        return bytes
    }

    it.each([
        ['an RLE8 picture', header(40, 8, 1), 'it is compressed'],
        ['an RLE4 picture', header(40, 4, 2), 'it is compressed'],
        ['a PNG inside a BMP', header(40, 0, 5), 'it is compressed'],
        ["OS/2's 64-byte header with its own compression 3", header(64, 16, 3), 'it is compressed'],
        ['2 bits a pixel', header(40, 2, 0), 'it has 2 bits a pixel'],
        ['no pixels', header(40, 24, 0, 0, 2), 'it has no pixels'],
        [
            'more than 2048 × 2048 pixels',
            header(40, 1, 0, 2049, 2048),
            'it has more than 2048 × 2048 pixels'
        ],
        [
            'a File too short for its pixels',
            header(40, 24, 0, 2, 400).slice(0, 2000),
            'its pixels run past its end'
        ],
        ['masks that overlap', masked(0xf800, 0x0fe0, 0x001f), 'its colour masks overlap'],
        ['a mask in two pieces', masked(0xf001, 0x07e0, 0x001e), 'its colour masks are unusual']
    ])('does not take %s', (_, bytes, reason) => {
        expect(readBmpLayout(bytes, bytes.length)).toEqual({ unsupported: reason })
    })

    function masked(red: number, green: number, blue: number) {
        const bytes = header(40, 16, 3)
        const view = new DataView(bytes.buffer)
        view.setUint32(54, red, true)
        view.setUint32(58, green, true)
        view.setUint32(62, blue, true)
        return bytes
    }

    it('limits pixels, not bytes, and each side to what a canvas holds', () => {
        expect(PIXEL_LIMIT).toBe(4_194_304)
        const bytes = header(40, 1, 0, 2048, 2048)
        expect(readBmpLayout(bytes, bytes.length).layout).toBeDefined()
        const long = header(40, 1, 0, 16385, 1)
        expect(readBmpLayout(long, long.length)).toEqual({
            unsupported: 'a side is longer than 16384 pixels'
        })
    })
})

describe('writing pixels', () => {
    for (const name of Object.keys(FIXTURE_LAYOUTS)) {
        it(`changes one pixel of ${name} and nothing else`, () => {
            const original = fixture(name)
            const layout = layoutOf(original)
            const palette = readPalette(original, layout)
            const before = decodePixels(original, layout)
            for (const [x, y] of [
                [0, 0],
                [6, 4],
                [3, 2],
                [5, 0]
            ]) {
                const bytes = original.slice()
                const colour = layout.palette
                    ? palette.length - 1
                    : rawOfColour(layout, rgba(10, 200, 30, 255))
                writeRaw(bytes, layout, x, y, colour)
                const mask = writeMask(layout)
                expect((readRaw(bytes, layout, x, y) & mask) >>> 0).toBe((colour & mask) >>> 0)
                const [start, end] = pixelSpan(layout, x, y)
                original.forEach((byte, index) => {
                    if (index < start || index >= end) expect(bytes[index]).toBe(byte)
                })
                const after = decodePixels(bytes, layout)
                for (let pixel = 0; pixel < 35; pixel++) {
                    if (pixel === y * 7 + x) continue
                    expect(after.slice(pixel * 4, pixel * 4 + 4)).toEqual(
                        before.slice(pixel * 4, pixel * 4 + 4)
                    )
                }
            }
        })
    }

    it("leaves a 32-bit picture's fourth byte as it was (plan decision 6)", () => {
        const bytes = fixture('rgb-32bit')
        const layout = layoutOf(bytes)
        const [start] = pixelSpan(layout, 2, 1)
        expect(bytes[start + 3]).toBe(0xff)
        writeRaw(bytes, layout, 2, 1, rawOfColour(layout, rgba(1, 2, 3)))
        expect(Array.from(bytes.subarray(start, start + 4))).toEqual([3, 2, 1, 0xff])
    })

    it('draws alpha all or nothing (design decision 7)', () => {
        const layout = layoutOf(fixture('rgba-32bit-v4'))
        expect(rawOfColour(layout, rgba(1, 2, 3, 255)) >>> 24).toBe(0xff)
        expect(rawOfColour(layout, rgba(1, 2, 3, 0)) >>> 24).toBe(0)
        expect(rawOfColour(layout, rgba(1, 2, 3, 200)) >>> 24).toBe(0xff)
    })

    it('narrows a colour to the masks a program reads (plan decision 7)', () => {
        const layout = layoutOf(fixture('rgb-16bit-565'))
        expect(rawOfColour(layout, rgba(255, 255, 255))).toBe(0xffff)
        expect(rawOfColour(layout, rgba(255, 0, 0))).toBe(0xf800)
        expect(quantise(layout, rgba(255, 255, 255))).toBe(rgba(255, 255, 255))
        expect(quantise(layout, rgba(100, 100, 100))).toBe(rgba(99, 101, 99))
    })

    it('recolours a palette entry in place (design decision 6)', () => {
        const bytes = fixture('core-8bit')
        const layout = layoutOf(bytes)
        const { offset, bytes: entry } = paletteEntry(layout, 3, rgba(0x11, 0x22, 0x33))
        expect(offset).toBe(26 + 3 * 3)
        bytes.set(entry, offset)
        expect(readPalette(bytes, layout)[3]).toBe(rgba(0x11, 0x22, 0x33))
        expect(() => paletteEntry(layout, 256, 0)).toThrow()
    })
})

describe('a new picture', () => {
    const FORMATS: [PictureFormat, string][] = [
        ['rgb32', '32-bit, top-down'],
        ['rgba32', '32-bit with transparency, top-down'],
        ['rgb24', '24-bit, top-down'],
        ['indexed8', '8-bit, 256 colours, top-down'],
        ['indexed4', '4-bit, 16 colours, top-down'],
        ['indexed1', '1-bit, 2 colours, top-down']
    ]
    it.each(FORMATS)('is a %s BMP its own reader takes', (format, description) => {
        const bytes = makeBmp({ width: 13, height: 3, format, palette: startingPalette(format) })
        const layout = layoutOf(bytes)
        expect(layout).toMatchObject({ width: 13, height: 3, topDown: true })
        expect(describeLayout(layout)).toBe(description)
        expect(bytes.length).toBe(layout.pixelOffset + layout.rowStride * 3)
        const pixels = decodePixels(bytes, layout)
        const alpha = format === 'rgba32' ? 0 : 255
        for (let index = 0; index < pixels.length; index += 4)
            expect(Array.from(pixels.slice(index, index + 4))).toEqual([0, 0, 0, alpha])
    })

    it('writes what the Pac-Man example reads: 40-byte header, 32 bits, no compression', () => {
        const bytes = makeBmp({ width: 16, height: 16, format: 'rgb32' })
        const view = new DataView(bytes.buffer)
        expect(view.getUint32(10, true)).toBe(54)
        expect(view.getUint32(14, true)).toBe(40)
        expect(view.getInt32(22, true)).toBe(-16)
        expect(view.getUint16(28, true)).toBe(32)
        expect(view.getUint32(30, true)).toBe(0)
    })

    it('starts each Target on its Screen format (design decision 5)', () => {
        expect(newPictureFormat('Z80')).toBe('indexed8')
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64', 'M68K', 'X86'] as const)
            expect(newPictureFormat(language)).toBe('rgb32')
    })

    it("stretches 3-3-2 as the Z80's Screen does", () => {
        PALETTE_332.forEach((colour, byte) => expect(colour >>> 8).toBe(expandColor(byte)))
        expect(PALETTE_16).toHaveLength(16)
        expect(PALETTE_2).toEqual([rgba(0, 0, 0), rgba(255, 255, 255)])
    })
})

describe('Canvas size', () => {
    it('grows a 32-bit picture with the fourth byte its top-left pixel has, which Chrome reads as alpha', () => {
        const bytes = fixture('rgb-32bit')
        const layout = layoutOf(bytes)
        const grown = resizeBmp(bytes, layout, 9, 6)
        const next = layoutOf(grown)
        expect(readRaw(grown, next, 8, 5) >>> 24).toBe(0xff)
        expect(readRaw(grown, next, 8, 5) & 0xffffff).toBe(0)
        //a new picture's fourth bytes are zero, and stay so
        const blank = makeBmp({ width: 2, height: 2, format: 'rgb32' })
        const wider = resizeBmp(blank, layoutOf(blank), 4, 2)
        expect(readRaw(wider, layoutOf(wider), 3, 1)).toBe(0)
    })

    it('names no colour profile it could not keep', () => {
        const blank = makeBmp({ width: 2, height: 2, format: 'rgba32' })
        //a V5 header naming a linked profile whose name lies past the File's end
        const v5 = new Uint8Array(blank.length + 16)
        v5.set(blank.subarray(0, 14 + 108))
        const view = new DataView(v5.buffer)
        view.setUint32(14, 124, true)
        view.setUint32(10, 14 + 124, true)
        view.setUint32(14 + 56, 0x4c494e4b, true)
        view.setUint32(14 + 112, 4000, true)
        view.setUint32(14 + 116, 20, true)
        const resized = resizeBmp(v5, layoutOf(v5), 3, 2)
        const out = new DataView(resized.buffer)
        expect(out.getUint32(14 + 56, true)).toBe(0x73524742)
        expect(out.getUint32(14 + 112, true)).toBe(0)
    })

    for (const name of [
        'pillow-24bit',
        'indexed-4bit',
        'core-8bit',
        'rgba-32bit-v4',
        'pillow-1bit'
    ])
        it(`grows and crops ${name}, anchored top-left`, () => {
            const bytes = fixture(name)
            const layout = layoutOf(bytes)
            const before = decodePixels(bytes, layout)
            for (const [width, height] of [
                [9, 8],
                [3, 2],
                [7, 5],
                [1, 9]
            ]) {
                const resized = resizeBmp(bytes, layout, width, height)
                const next = layoutOf(resized)
                expect(next).toMatchObject({
                    width,
                    height,
                    topDown: layout.topDown,
                    bitsPerPixel: layout.bitsPerPixel
                })
                expect(resized.length).toBe(next.pixelOffset + next.rowStride * height)
                const after = decodePixels(resized, next)
                const palette = readPalette(resized, next)
                for (let y = 0; y < height; y++)
                    for (let x = 0; x < width; x++) {
                        const pixel = Array.from(
                            after.slice((y * width + x) * 4, (y * width + x) * 4 + 4)
                        )
                        if (x < 7 && y < 5)
                            expect(pixel).toEqual(
                                Array.from(before.slice((y * 7 + x) * 4, (y * 7 + x) * 4 + 4))
                            )
                        else {
                            //every bit zero: black, transparent, or palette entry 0
                            const zero = next.palette
                                ? palette[0]
                                : hasAlpha(next)
                                  ? 0
                                  : rgba(0, 0, 0)
                            expect(pixel).toEqual([
                                zero >>> 24,
                                (zero >>> 16) & 0xff,
                                (zero >>> 8) & 0xff,
                                zero & 0xff
                            ])
                        }
                    }
            }
        })
})
