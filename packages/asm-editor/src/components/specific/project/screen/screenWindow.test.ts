import { describe, expect, it } from 'vite-plus/test'
import { bodyZoom, screenWindowGeometry } from './screenWindow'

const viewport = {
    viewportWidth: 1600,
    viewportHeight: 900,
    rootFontSize: 16,
    devicePixelRatio: 1,
    snap: 'exact' as const
}
const square = { ...viewport, screenWidth: 256, screenHeight: 256 }
/** The window's own bar, which sits above the body the geometry sizes. */
const HEADER = 1.5 * 16
/** The gap kept between the window and every edge of the viewport. */
const MARGIN = 0.5 * 16
/** Just past the Stop button, where the room the window opens in starts. */
const LEFT = 9 * 16
/**
 * The body's frame around the canvas, both sides together: its paddings, and its 1px border as
 * a browser draws it at 100%, one whole pixel.
 */
const FRAME = 2 * (1 + 0.3 * 16)
/** The narrowest body, which leaves the bar room for its controls. */
const MIN_WIDTH = 22 * 16

/** The canvas's size in the body, which the Screen's proportions decide. */
const canvas = (box: { width: number; height: number }) => ({
    width: box.width - FRAME,
    height: box.height - FRAME
})

describe('screenWindowGeometry', () => {
    it('hugs a square Screen at the top right, as tall as the viewport allows', () => {
        const box = screenWindowGeometry(square)
        expect(box.top).toBe(MARGIN)
        expect(box.left + box.width).toBe(1600 - MARGIN)
        expect(box.top + HEADER + box.height).toBe(900 - MARGIN)
        expect(box.width).toBe(box.height)
        expect(box.zoom).toBeCloseTo((900 - 2 * MARGIN - HEADER - FRAME) / 256)
    })

    it('hugs a wide Screen across the room right of the Stop button, leaving the bottom free', () => {
        const box = screenWindowGeometry({ ...viewport, screenWidth: 512, screenHeight: 256 })
        expect(box.left).toBe(LEFT)
        expect(box.left + box.width).toBe(1600 - MARGIN)
        expect(box.top + HEADER + box.height).toBeLessThan(900 - MARGIN - 100)
        const { width, height } = canvas(box)
        expect(Math.abs(width / height - 2)).toBeLessThan(0.01)
    })

    it('hugs a tall Screen at the full height, leaving the left free', () => {
        const box = screenWindowGeometry({ ...viewport, screenWidth: 224, screenHeight: 288 })
        expect(box.left).toBeGreaterThan(LEFT + 600)
        const { width, height } = canvas(box)
        expect(Math.abs(width / height - 224 / 288)).toBeLessThan(0.01)
    })

    it('hugs the zoom its scaling allows: whole device pixels, or the window’s finer steps', () => {
        const integer = screenWindowGeometry({ ...square, snap: 'integer' })
        expect(integer.zoom).toBe(3)
        expect(integer.width).toBe(Math.ceil(256 * 3 + FRAME))
        const fine = screenWindowGeometry({ ...square, snap: 'fine' })
        expect(fine.zoom).toBeCloseTo(3.3)
        expect(fine.height).toBe(Math.ceil(256 * 3.3 + FRAME))
        //at 150%, 4 device pixels a Screen pixel is what fits 860 CSS pixels
        const zoomed = screenWindowGeometry({ ...square, snap: 'integer', devicePixelRatio: 1.5 })
        expect(zoomed.zoom * 1.5).toBeCloseTo(4)
    })

    it('leaves the canvas all the room its zoom needs', () => {
        for (const snap of ['exact', 'integer', 'fine'] as const)
            for (const [screenWidth, screenHeight] of [
                [256, 256],
                [320, 200],
                [224, 288]
            ]) {
                const box = screenWindowGeometry({ ...viewport, snap, screenWidth, screenHeight })
                expect(canvas(box).width).toBeGreaterThanOrEqual(screenWidth * box.zoom - 1e-6)
                expect(canvas(box).height).toBeGreaterThanOrEqual(screenHeight * box.zoom - 1e-6)
            }
    })

    it('never reaches past the viewport, whatever the Screen and the viewport', () => {
        for (const [viewportWidth, viewportHeight] of [
            [360, 640],
            [641, 400],
            [1000, 200],
            [1280, 800],
            [1600, 900],
            [2560, 1440]
        ])
            for (const [screenWidth, screenHeight] of [
                [1, 1],
                [64, 1024],
                [256, 256],
                [512, 256],
                [1024, 32]
            ])
                for (const snap of ['exact', 'integer', 'fine'] as const) {
                    const box = screenWindowGeometry({
                        ...viewport,
                        viewportWidth,
                        viewportHeight,
                        snap,
                        screenWidth,
                        screenHeight
                    })
                    const margin = viewportWidth <= 640 ? 0 : MARGIN
                    expect(box.left).toBeGreaterThanOrEqual(margin)
                    expect(box.left + box.width).toBeLessThanOrEqual(viewportWidth - margin)
                    expect(box.top + HEADER + box.height).toBeLessThanOrEqual(
                        Math.max(margin + HEADER, viewportHeight - margin)
                    )
                }
    })

    it('keeps the bar its room above a Screen narrower than that, centring the Screen in it', () => {
        const box = screenWindowGeometry({ ...viewport, screenWidth: 16, screenHeight: 512 })
        expect(box.width).toBe(MIN_WIDTH)
        expect(box.height).toBe(900 - 2 * MARGIN - HEADER)
    })

    it('hugs the Screen across a phone, at the top', () => {
        const box = screenWindowGeometry({
            ...viewport,
            viewportWidth: 390,
            viewportHeight: 844,
            screenWidth: 512,
            screenHeight: 256
        })
        expect(box).toMatchObject({ left: 0, top: 0, width: 390 })
        expect(box.height).toBeLessThan(220)
    })

    it('shows the Screen at the zoom wanted, keeping the edge it is given', () => {
        const right = screenWindowGeometry({ ...square, zoom: 2, right: 1000, top: 40 })
        const size = Math.ceil(512 + FRAME)
        expect(right).toMatchObject({
            width: size,
            height: size,
            left: 1000 - size,
            top: 40,
            zoom: 2
        })
        const left = screenWindowGeometry({ ...square, zoom: 2, left: 300, top: 40 })
        expect(left).toMatchObject({ left: 300, width: size })
    })

    it('fits a zoom too large for the viewport', () => {
        const box = screenWindowGeometry({ ...square, zoom: 10 })
        expect(box.zoom).toBeLessThan(4)
        expect(box.width).toBe(box.height)
    })

    it('pulls a window dragged out of a viewport that has shrunk back inside it', () => {
        const box = screenWindowGeometry({ ...square, zoom: 2, right: 5000, top: 2000 })
        expect(box.left + box.width).toBe(1600 - MARGIN)
        expect(box.top + HEADER + box.height).toBe(900 - MARGIN)
    })

    it('measures in rem, so a page with a larger root font leaves more room for the Stop button', () => {
        const box = screenWindowGeometry({
            ...viewport,
            rootFontSize: 20,
            screenWidth: 1024,
            screenHeight: 32
        })
        expect(box.left).toBe(9 * 20)
        expect(box.top).toBe(0.5 * 20)
    })

    it('answers in whole pixels', () => {
        const box = screenWindowGeometry({
            ...viewport,
            viewportWidth: 1333,
            viewportHeight: 777,
            rootFontSize: 15.5,
            screenWidth: 320,
            screenHeight: 200
        })
        for (const value of [box.left, box.top, box.width, box.height])
            expect(Number.isInteger(value)).toBe(true)
    })

    it('falls back to 16 pixels when the root font size cannot be read', () => {
        expect(screenWindowGeometry({ ...square, rootFontSize: NaN })).toEqual(
            screenWindowGeometry(square)
        )
    })
})

describe('a window resized by a corner', () => {
    const released = (size: { width: number; height: number }, snap: 'integer' | 'fine') =>
        screenWindowGeometry({
            ...square,
            snap,
            zoom: bodyZoom({ ...square, size }),
            left: 300,
            top: 40
        })

    it('snaps back to hug the largest zoom its scaling allows in the size it was let go at', () => {
        //a 700 by 500 body holds the Screen at 1.903: 1 whole, or 1.9 in the window's 2% steps
        expect(released({ width: 700, height: 500 }, 'integer')).toMatchObject({
            zoom: 1,
            height: Math.ceil(256 + FRAME)
        })
        const fine = released({ width: 700, height: 500 }, 'fine')
        expect(fine.zoom).toBeCloseTo(1.9)
        expect(fine.width).toBe(Math.ceil(256 * 1.9 + FRAME))
    })

    it('counts the border in the device pixels a browser draws it in', () => {
        //1px is one device pixel at 100%, 125% and 150%, two at 200%
        for (const [devicePixelRatio, border] of [
            [1, 1],
            [1.25, 1 / 1.25],
            [1.5, 1 / 1.5],
            [2, 1]
        ]) {
            const frame = 2 * (border + 0.3 * 16)
            const zoom = bodyZoom({
                ...square,
                devicePixelRatio,
                size: { width: 512 + frame, height: 512 + frame }
            })
            expect(zoom).toBeCloseTo(2, 9)
        }
    })

    it('keeps a size that was already a zoom its scaling allows', () => {
        const hugging = { width: Math.ceil(512 + FRAME), height: Math.ceil(512 + FRAME) }
        expect(released(hugging, 'integer')).toMatchObject({ zoom: 2, ...hugging })
    })
})
