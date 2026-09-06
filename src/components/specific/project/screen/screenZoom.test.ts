import { describe, expect, it } from 'vitest'
import { screenZoom, screenZoomLabel } from './screenZoom'

//the two Screens the design record gives a default size to, plus the panel boxes they are hosted in
const M68K = { logicalWidth: 640, logicalHeight: 480 }
const Z80 = { logicalWidth: 256, logicalHeight: 192 }

function fit(box: { viewportWidth: number; viewportHeight: number }, screen: typeof M68K) {
    return screenZoom({ fit: true, actualSizeZoom: 1, ...box, ...screen })
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
            fit: true,
            viewportWidth: 720,
            viewportHeight: 400,
            logicalWidth: 0,
            logicalHeight: 0,
            actualSizeZoom: 1
        })
        expect(zoom).toBe(1)
    })
})

describe('screenZoom at actual size', () => {
    function actual(actualSizeZoom: number) {
        return screenZoom({
            fit: false,
            viewportWidth: 720,
            viewportHeight: 400,
            ...M68K,
            actualSizeZoom
        })
    }

    it('keeps the environment geometry whole, so a MARS unit stays a block', () => {
        expect(actual(1)).toBe(1)
        expect(actual(8)).toBe(8)
        expect(actual(2.7)).toBe(2)
    })

    it('never shrinks below 1:1, whatever the box or the unit says', () => {
        expect(actual(0)).toBe(1)
        expect(actual(0.5)).toBe(1)
    })
})

describe('screenZoomLabel', () => {
    it('reads a fitted zoom as a percentage and an actual size as a multiplier', () => {
        expect(screenZoomLabel(true, 400 / 192)).toBe('208%')
        expect(screenZoomLabel(true, 0.5)).toBe('50%')
        expect(screenZoomLabel(false, 8)).toBe('×8')
    })
})
