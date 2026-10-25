/**
 * The Pixel editor's shapes, zoom and document
 * ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decisions 6 to 8;
 * [pixel-editor-plan.md](../../../../../docs/design/pixel-editor-plan.md), decisions 4, 5, 8 and 14).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import {
    brushLineRuns,
    brushRuns,
    circleCorner,
    ellipseRuns,
    floodFill,
    linePoints,
    mergeRuns,
    plotRectangle,
    plotRuns,
    snapLine,
    type Point,
    type Run
} from './tools'
import { clampZoom, fitZoom, wheelZoom, zoomPercent, MAX_ZOOM, MIN_ZOOM, ZOOM_FACTOR } from './zoom'
import { PixelDocument, TRANSPARENT } from './pixelDocument'
import { decodePixels, makeBmp, readBmpLayout, rgba } from './bmp'
import { PALETTE_16 } from './palettes'
import { applyByteEdits, encodeBase64 } from '../projectFiles'

const collect = (draw: (plot: (x: number, y: number) => void) => void) => {
    const points: Point[] = []
    draw((x, y) => points.push([x, y]))
    return points
}

describe('the shapes', () => {
    it('draws a line from end to end, both ends included, in any direction', () => {
        expect(linePoints([0, 0], [3, 0])).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0]
        ])
        expect(linePoints([2, 2], [2, 2])).toEqual([[2, 2]])
        expect(linePoints([3, 1], [0, 0])).toEqual([
            [3, 1],
            [2, 1],
            [1, 0],
            [0, 0]
        ])
        //every step moves to a neighbour, so a stroke has no gaps
        const steep = linePoints([0, 0], [2, 9])
        expect(steep).toHaveLength(10)
        for (let index = 1; index < steep.length; index++) {
            expect(Math.abs(steep[index][0] - steep[index - 1][0])).toBeLessThanOrEqual(1)
            expect(Math.abs(steep[index][1] - steep[index - 1][1])).toBeLessThanOrEqual(1)
        }
    })

    it('snaps a line to 0°, 45° or 90°', () => {
        expect(snapLine([0, 0], [10, 2])).toEqual([10, 0])
        expect(snapLine([0, 0], [1, -9])).toEqual([0, -9])
        expect(snapLine([5, 5], [1, 8])).toEqual([1, 9])
    })

    it('draws a rectangle as its outline or filled, its corners in any order', () => {
        const outline = collect((plot) => plotRectangle([3, 2], [0, 0], false, plot))
        expect(outline).toHaveLength(10)
        expect(outline).not.toContainEqual([1, 1])
        expect(collect((plot) => plotRectangle([0, 0], [3, 2], true, plot))).toHaveLength(12)
        //only what lies inside the picture, however far past it the corner is dragged
        const size = { width: 4, height: 3 }
        expect(
            collect((plot) => plotRectangle([-5, -5], [1e6, 1e6], true, plot, size))
        ).toHaveLength(12)
        expect(collect((plot) => plotRectangle([1, 1], [1e6, 1e6], false, plot, size))).toEqual([
            [1, 1],
            [2, 1],
            [3, 1],
            [1, 2]
        ])
        expect(collect((plot) => plotRectangle([4, 4], [4, 6], false, plot))).toEqual([
            [4, 4],
            [4, 5],
            [4, 6]
        ])
    })

    it('fills through four neighbours, never through a diagonal gap', () => {
        //a diagonal wall of 1s from the top left to the bottom right
        const grid = ['0111', '1011', '1101', '1110']
        const kindAt = (x: number, y: number) => Number(grid[y][x])
        const filled = collect((plot) => floodFill(4, 4, [0, 0], kindAt, plot))
        expect(filled).toEqual([[0, 0]])
        const walls = collect((plot) => floodFill(4, 4, [1, 0], kindAt, plot))
        expect(walls).toHaveLength(6)
        expect(collect((plot) => floodFill(4, 4, [9, 0], kindAt, plot))).toEqual([])
    })
})

/** Runs drawn as rows of `#` over the box they cover, `.` where they leave a pixel. */
function art(runs: readonly Run[]): string[] {
    const top = Math.min(...runs.map(([y]) => y))
    const bottom = Math.max(...runs.map(([y]) => y))
    const left = Math.min(...runs.map(([, x0]) => x0))
    const right = Math.max(...runs.map(([, , x1]) => x1))
    const rows = Array.from({ length: bottom - top + 1 }, () =>
        Array.from({ length: right - left + 1 }, () => '.')
    )
    for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) rows[y - top][x - left] = '#'
    return rows.map((row) => row.join(''))
}

describe('brushes, thick lines and ellipses', () => {
    it('make a round brush a plus at 3 and a circle at 5, about the point it is put on', () => {
        expect(brushRuns(1, 'round')).toEqual([[0, 0, 0]])
        expect(art(brushRuns(2, 'round'))).toEqual(['##', '##'])
        expect(art(brushRuns(3, 'round'))).toEqual(['.#.', '###', '.#.'])
        expect(art(brushRuns(4, 'round'))).toEqual(['.##.', '####', '####', '.##.'])
        expect(art(brushRuns(5, 'round'))).toEqual(['.###.', '#####', '#####', '#####', '.###.'])
        expect(art(brushRuns(3, 'square'))).toEqual(['###', '###', '###'])
        //centred on the point, an even one a pixel up and left of the middle
        expect(brushRuns(3, 'square')[0]).toEqual([-1, -1, 1])
        expect(brushRuns(2, 'square')[0]).toEqual([0, 0, 1])
    })

    it('join runs that overlap or touch, a row at a time', () => {
        expect(
            mergeRuns([
                [1, 0, 0],
                [0, 3, 4],
                [0, 0, 2],
                [0, 6, 6]
            ])
        ).toEqual([
            [0, 0, 4],
            [0, 6, 6],
            [1, 0, 0]
        ])
    })

    it('draw a thick line as the brush put on each of its pixels, each pixel once', () => {
        expect(brushLineRuns([0, 0], [4, 0], brushRuns(3, 'round'))).toEqual([
            [-1, 0, 4],
            [0, -1, 5],
            [1, 0, 4]
        ])
        expect(brushLineRuns([0, 0], [3, 3], brushRuns(1, 'round'))).toHaveLength(4)
    })

    it('draw an ellipse filled or as a line a pixel thick, reaching its box', () => {
        expect(art(ellipseRuns([0, 0], [4, 4], true))).toEqual([
            '.###.',
            '#####',
            '#####',
            '#####',
            '.###.'
        ])
        expect(art(ellipseRuns([4, 4], [0, 0], false))).toEqual([
            '.###.',
            '#...#',
            '#...#',
            '#...#',
            '.###.'
        ])
        expect(art(ellipseRuns([0, 0], [0, 3], false))).toEqual(['#', '#', '#', '#'])
        expect(art(ellipseRuns([0, 0], [1, 1], false))).toEqual(['##', '##'])
        //a thin tall one keeps its ends
        const thin = ellipseRuns([0, 0], [1, 9], false)
        expect(thin[0][0]).toBe(0)
        expect(thin.at(-1)![0]).toBe(9)
        //an outline is one pixel thick and joined: no pixel of a row is inside on all four sides
        const big = ellipseRuns([0, 0], [30, 18], false)
        const filled = ellipseRuns([0, 0], [30, 18], true)
        expect(big.reduce((sum, [, x0, x1]) => sum + x1 - x0 + 1, 0)).toBeLessThan(
            filled.reduce((sum, [, x0, x1]) => sum + x1 - x0 + 1, 0) / 4
        )
    })

    it('make a circle of a drag the way it goes, as wide as its larger side', () => {
        expect(circleCorner([0, 0], [3, -7])).toEqual([7, -7])
        expect(circleCorner([5, 5], [5, 2])).toEqual([8, 2])
        expect(circleCorner([5, 5], [1, 6])).toEqual([1, 9])
    })

    it('plot only what lies inside the picture', () => {
        const plotted: Point[] = []
        plotRuns(
            [
                [-1, 0, 3],
                [0, -2, 1],
                [1, 2, 9]
            ],
            (x, y) => plotted.push([x, y]),
            { width: 4, height: 2 }
        )
        expect(plotted).toEqual([
            [0, 0],
            [1, 0],
            [2, 1],
            [3, 1]
        ])
    })
})

describe('zoom', () => {
    it('fits as large as the pane takes, within the limits', () => {
        expect(fitZoom(16, 16, { width: 500, height: 300 })).toBe(300 / 16)
        expect(fitZoom(224, 288, { width: 500, height: 600 })).toBe(600 / 288)
        expect(fitZoom(2048, 2048, { width: 500, height: 600 })).toBe(500 / 2048)
        expect(fitZoom(1, 1, { width: 5000, height: 5000 })).toBe(MAX_ZOOM)
        expect(fitZoom(2048, 2048, { width: 10, height: 10 })).toBe(MIN_ZOOM)
    })

    it('zooms smoothly with the wheel, and by a factor with the buttons, within the limits', () => {
        expect(wheelZoom(4, 0)).toBe(4)
        //a turn and the same turn back come back to where they were
        expect(wheelZoom(wheelZoom(4, 100), -100)).toBeCloseTo(4)
        expect(wheelZoom(4, 100)).toBeLessThan(4)
        expect(wheelZoom(4, -10)).toBeGreaterThan(4)
        expect(wheelZoom(MAX_ZOOM, -1000)).toBe(MAX_ZOOM)
        expect(wheelZoom(MIN_ZOOM, 1000)).toBe(MIN_ZOOM)
        expect(clampZoom(2 * ZOOM_FACTOR * ZOOM_FACTOR)).toBeCloseTo(4)
        expect(zoomPercent(1 / 8)).toBe('13%')
    })
})

describe('a picture being drawn', () => {
    const fixture = (name: string) =>
        new Uint8Array(readFileSync(`src/lib/pixels/fixtures/${name}.bmp`))

    it('saves a stroke as one run a row, which give back the drawn File', () => {
        const original = makeBmp({ width: 20, height: 4, format: 'rgb32' })
        const doc = PixelDocument.read(original)!
        doc.beginStroke()
        for (const [x, y] of linePoints([0, 0], [19, 3]))
            doc.plot(x, y, { colour: rgba(255, 0, 0) })
        doc.plot(-1, 0, { colour: 0 })
        const runs = doc.endStroke()
        expect(runs).toHaveLength(4)
        const edits = runs.map(({ offset, bytes }) => ({
            offset,
            remove: bytes.length,
            insert: encodeBase64(bytes)
        }))
        const edited = applyByteEdits(original, edits)
        expect(edited).toEqual(doc.bytes)
        expect(doc.colourAt(19, 3)).toBe(rgba(255, 0, 0))
        expect(doc.changed).toEqual({ left: 0, top: 0, right: 19, bottom: 3 })
    })

    it('saves only the bytes a stroke changed, and nothing for one that changed none', () => {
        const doc = PixelDocument.read(makeBmp({ width: 8, height: 2, format: 'rgb24' }))!
        doc.beginStroke()
        for (let x = 0; x < 8; x++) doc.plot(x, 0, { colour: rgba(0, 0, 0) })
        expect(doc.endStroke()).toEqual([])
        doc.beginStroke()
        doc.plot(2, 1, { colour: rgba(0, 0, 0) })
        doc.plot(5, 1, { colour: rgba(1, 2, 3) })
        doc.plot(6, 1, { colour: rgba(0, 0, 0) })
        const runs = doc.endStroke()
        expect(runs.map(({ offset, bytes }) => [offset, bytes.length])).toEqual([[54 + 24 + 15, 3]])
    })

    it('puts back a cancelled stroke, which saves nothing', () => {
        const doc = PixelDocument.read(makeBmp({ width: 4, height: 4, format: 'rgb24' }))!
        const before = doc.bytes.slice()
        doc.beginStroke()
        doc.plot(1, 1, { colour: rgba(1, 2, 3) })
        doc.cancelStroke()
        expect(doc.bytes).toEqual(before)
        expect(doc.colourAt(1, 1)).toBe(rgba(0, 0, 0))
        expect(doc.endStroke()).toEqual([])
    })

    it('shows the colour a program reads, narrowed to a 16-bit layout', () => {
        const doc = PixelDocument.read(fixture('rgb-16bit-565'))!
        doc.beginStroke()
        doc.plot(0, 0, { colour: rgba(100, 100, 100) })
        expect(doc.colourAt(0, 0)).toBe(rgba(99, 101, 99))
        expect(doc.inkColour({ colour: rgba(100, 100, 100) })).toBe(rgba(99, 101, 99))
    })

    it('draws a palette picture by index and recolours an entry everywhere', () => {
        const doc = PixelDocument.read(
            makeBmp({ width: 3, height: 1, format: 'indexed4', palette: PALETTE_16 })
        )!
        doc.beginStroke()
        doc.plot(1, 0, { index: 9 })
        doc.endStroke()
        expect(doc.inkAt(1, 0)).toEqual({ index: 9 })
        expect(doc.kindAt(0, 0)).toBe(0)
        const run = doc.recolour(0, rgba(1, 2, 3))
        expect(run.offset).toBe(54)
        expect(Array.from(run.bytes)).toEqual([3, 2, 1])
        expect(doc.colourAt(0, 0)).toBe(rgba(1, 2, 3))
        expect(doc.colourAt(2, 0)).toBe(rgba(1, 2, 3))
        expect(doc.fits({ index: 15 })).toBe(true)
        expect(doc.fits({ colour: rgba(1, 2, 3) })).toBe(false)
    })

    it('erases to transparent and takes a partly transparent colour as opaque', () => {
        const doc = PixelDocument.read(fixture('rgba-32bit-v4'))!
        expect(doc.alpha).toBe(true)
        const pixels = decodePixels(doc.bytes, readBmpLayout(doc.bytes, doc.bytes.length).layout!)
        const half = Array.from({ length: 35 }, (_, index) => index).find(
            (index) => pixels[index * 4 + 3] === 128
        )!
        expect(doc.inkAt(half % 7, Math.floor(half / 7))).toEqual({
            colour: rgba(pixels[half * 4], pixels[half * 4 + 1], pixels[half * 4 + 2], 255)
        })
        doc.beginStroke()
        doc.plot(0, 0, TRANSPARENT)
        expect(doc.colourAt(0, 0) & 0xff).toBe(0)
        expect(doc.inkAt(0, 0)).toEqual(TRANSPARENT)
        //a picture without alpha cannot be erased
        expect(PixelDocument.read(fixture('rgb-32bit'))!.fits(TRANSPARENT)).toBe(false)
    })

    it('lists the colours a picture uses most, most first', () => {
        const doc = PixelDocument.read(makeBmp({ width: 4, height: 1, format: 'rgb24' }))!
        doc.beginStroke()
        doc.plot(0, 0, { colour: rgba(9, 9, 9) })
        doc.endStroke()
        expect(doc.usedColours(5)).toEqual([rgba(0, 0, 0), rgba(9, 9, 9)])
        expect(doc.usedColours(1)).toEqual([rgba(0, 0, 0)])
    })
})
