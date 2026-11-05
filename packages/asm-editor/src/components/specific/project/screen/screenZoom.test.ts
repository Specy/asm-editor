import { describe, expect, it } from 'vite-plus/test'
import { screenZoom, screenZoomLabel, snapZoom } from './screenZoom'

//the two Screens the design record gives a default size to, plus the panel boxes they are hosted in
const M68K = { logicalWidth: 640, logicalHeight: 480 }
const Z80 = { logicalWidth: 256, logicalHeight: 192 }

function fit(box: { viewportWidth: number; viewportHeight: number }, screen: typeof M68K) {
    return screenZoom({ snap: 'exact', devicePixelRatio: 1, ...box, ...screen })
}

describe('screenZoom while fitting the panel', () => {
    it('fills the height exactly when the box is wider than the Screen is', () => {
        const zoom = fit({ viewportWidth: 720, viewportHeight: 400 }, M68K)
        expect(zoom * M68K.logicalHeight).toBeCloseTo(400, 9)
        expect(zoom * M68K.logicalWidth).toBeLessThan(720)
    })

    it('fills the width exactly when the box is taller than the Screen is', () => {
        const zoom = fit({ viewportWidth: 300, viewportHeight: 900 }, M68K)
        expect(zoom * M68K.logicalWidth).toBeCloseTo(300, 9)
        expect(zoom * M68K.logicalHeight).toBeLessThan(900)
    })

    it('does not round down to a whole number of screen pixels per logical pixel', () => {
        //the old panel floored this to 1 and drew a 256 by 192 Screen in a box three times its size
        expect(fit({ viewportWidth: 720, viewportHeight: 400 }, Z80)).toBeCloseTo(400 / 192, 10)
    })

    it('scales down when the Screen is larger than the box', () => {
        const zoom = fit({ viewportWidth: 320, viewportHeight: 240 }, M68K)
        expect(zoom).toBe(0.5)
    })

    it('never asks for more room than the box has, on either axis', () => {
        const boxes = [
            { viewportWidth: 1, viewportHeight: 1 },
            { viewportWidth: 1000, viewportHeight: 37 },
            { viewportWidth: 37, viewportHeight: 1000 },
            { viewportWidth: 733, viewportHeight: 409 }
        ]
        for (const box of boxes) {
            for (const screen of [M68K, Z80, { logicalWidth: 512, logicalHeight: 256 }]) {
                const zoom = fit(box, screen)
                //a float division and multiplication can land an ulp over, which no layout notices
                expect(zoom * screen.logicalWidth).toBeLessThanOrEqual(box.viewportWidth + 1e-9)
                expect(zoom * screen.logicalHeight).toBeLessThanOrEqual(box.viewportHeight + 1e-9)
            }
        }
    })

    it('answers 1 before the panel has been measured', () => {
        expect(fit({ viewportWidth: 0, viewportHeight: 0 }, M68K)).toBe(1)
        expect(fit({ viewportWidth: 720, viewportHeight: 0 }, M68K)).toBe(1)
    })

    it('answers 1 for a Screen with no area', () => {
        const zoom = screenZoom({
            snap: 'exact',
            devicePixelRatio: 1,
            viewportWidth: 720,
            viewportHeight: 400,
            logicalWidth: 0,
            logicalHeight: 0
        })
        expect(zoom).toBe(1)
    })
})

describe('screenZoom with Integer scaling', () => {
    const integer = (devicePixelRatio: number, box = { viewportWidth: 720, viewportHeight: 400 }) =>
        screenZoom({ snap: 'integer', devicePixelRatio, ...box, ...Z80 })

    it('takes the largest whole zoom that fits', () => {
        //400 / 192 is 2.08 of the box's height
        expect(integer(1)).toBe(2)
        expect(integer(1, { viewportWidth: 2000, viewportHeight: 1000 })).toBe(5)
    })

    it('counts the display’s own pixels, so a zoomed page stays crisp', () => {
        //at 150%, 2 CSS pixels are 3 device pixels, and 3 of them are 4.5: 3 whole ones fit
        expect(integer(1.5) * 1.5).toBe(3)
        expect(integer(2) * 2).toBe(4)
        for (const ratio of [1, 1.25, 1.5, 1.75, 2, 3])
            expect(Number.isInteger(Math.round(integer(ratio) * ratio * 1e6) / 1e6)).toBe(true)
    })

    it('fits a Screen too large for one device pixel each, which nothing could show crisp', () => {
        const zoom = integer(1, { viewportWidth: 128, viewportHeight: 96 })
        expect(zoom).toBe(0.5)
    })
})

describe('snapZoom for the floating window', () => {
    it('steps 2% at a time, whatever the device pixel ratio', () => {
        expect(snapZoom(3.309, 'fine', 1)).toBeCloseTo(3.3)
        expect(snapZoom(1.759, 'fine', 1)).toBeCloseTo(1.74)
        expect(snapZoom(1.759, 'fine', 1.5)).toBeCloseTo(1.74)
        expect(snapZoom(0.73, 'fine', 1)).toBeCloseTo(0.72)
    })

    it('keeps a zoom it allows as it is, whatever a float made of it', () => {
        expect(snapZoom(3.3 - 1e-9, 'fine', 1)).toBeCloseTo(3.3)
        expect(snapZoom(3 - 1e-9, 'integer', 1)).toBe(3)
    })

    it('leaves a zoom below its first step, and any zoom when fitting exactly, alone', () => {
        expect(snapZoom(0.01, 'fine', 1)).toBe(0.01)
        expect(snapZoom(3.309, 'exact', 1)).toBe(3.309)
    })
})

describe('screenZoomLabel', () => {
    it('reads a zoom as a percentage, and under Integer scaling as device pixels a pixel', () => {
        expect(screenZoomLabel(false, 400 / 192, 1)).toBe('208%')
        expect(screenZoomLabel(false, 0.5, 1)).toBe('50%')
        expect(screenZoomLabel(false, 3, 1)).toBe('300%')
        expect(screenZoomLabel(true, 8, 1)).toBe('×8')
        //2 device pixels on a page at 125%, which are 1.6 CSS pixels
        expect(screenZoomLabel(true, 1.6, 1.25)).toBe('×2')
        //a Screen too large to be crisp, fitted instead
        expect(screenZoomLabel(true, 0.5, 1)).toBe('50%')
    })
})
