import { describe, expect, it } from 'vitest'
import { screenWindowGeometry } from './screenWindow'

const desktop = { viewportWidth: 1600, viewportHeight: 900, rootFontSize: 16 }
/** The window's own bar, which sits above the body the geometry sizes. */
const HEADER = 1.8 * 16

describe('screenWindowGeometry', () => {
    it('opens at the top right of the viewport', () => {
        const box = screenWindowGeometry(desktop)
        expect(box.top).toBe(8)
        expect(box.left + box.width).toBe(1600 - 8)
    })

    it('leaves the execution controls uncovered when it opens', () => {
        for (const viewportHeight of [700, 800, 900, 1080, 1440]) {
            const box = screenWindowGeometry({ ...desktop, viewportHeight })
            //4 rem of clearance under the whole window, bar included
            expect(box.top + HEADER + box.height).toBeLessThanOrEqual(viewportHeight - 4 * 16)
        }
    })

    it('is over half the page wide, capped so the editor underneath stays readable', () => {
        expect(screenWindowGeometry(desktop).width).toBe(Math.round(1600 * 0.58))
        expect(screenWindowGeometry({ ...desktop, viewportWidth: 2560 }).width).toBe(68 * 16)
    })

    it('never asks for more room than the viewport has', () => {
        for (const viewportWidth of [320, 480, 800, 1280, 1600, 1920, 2560]) {
            const box = screenWindowGeometry({ ...desktop, viewportWidth })
            expect(box.left).toBeGreaterThanOrEqual(8)
            expect(box.left + box.width).toBeLessThanOrEqual(viewportWidth - 8)
        }
    })

    it('keeps a usable size on a viewport too small for either rule', () => {
        //20 rem wide and 12 rem tall, unless even that does not fit sideways
        expect(screenWindowGeometry({ ...desktop, viewportWidth: 480 }).width).toBe(20 * 16)
        expect(screenWindowGeometry({ ...desktop, viewportHeight: 200 }).height).toBe(12 * 16)
        expect(screenWindowGeometry({ ...desktop, viewportWidth: 200 }).width).toBe(200 - 16)
    })

    it('leaves a window the user has dragged where it is', () => {
        const box = screenWindowGeometry({ ...desktop, left: 120, top: 340 })
        expect(box.left).toBe(120)
        expect(box.top).toBe(340)
    })

    it('pulls a dragged window back inside a viewport that has shrunk', () => {
        //the container clamps only while dragging, so a resized browser would otherwise leave the
        //Screen somewhere it cannot be reached
        const box = screenWindowGeometry({
            viewportWidth: 800,
            viewportHeight: 600,
            rootFontSize: 16,
            left: 1200,
            top: 2000
        })
        expect(box.left).toBe(800 - box.width - 8)
        expect(box.top).toBe(600 - 8)
    })

    it('measures in rem, so a page with a larger root font gets a larger window', () => {
        const bigger = screenWindowGeometry({ ...desktop, viewportWidth: 2560, rootFontSize: 20 })
        expect(bigger.width).toBe(68 * 20)
        expect(bigger.top).toBe(10)
    })

    it('answers in whole pixels', () => {
        const box = screenWindowGeometry({
            viewportWidth: 1333,
            viewportHeight: 777,
            rootFontSize: 15.5
        })
        for (const value of [box.left, box.top, box.width, box.height]) {
            expect(Number.isInteger(value)).toBe(true)
        }
    })

    it('falls back to 16 pixels when the root font size cannot be read', () => {
        expect(screenWindowGeometry({ ...desktop, rootFontSize: NaN })).toEqual(
            screenWindowGeometry(desktop)
        )
    })
})
