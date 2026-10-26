import { describe, expect, it } from 'vite-plus/test'
import { outlinePath, placeCard, type PlaceOptions } from './floating'

const viewport = { width: 800, height: 600 }
const tooltip: PlaceOptions = {
    side: 'top',
    gap: 6,
    arrow: 6,
    radius: 6,
    align: 'center',
    margin: 4,
    viewport
}
const card = { width: 100, height: 30 }

describe('placeCard', () => {
    it('centres a card above its target, the arrow on the middle', () => {
        const target = { left: 350, top: 300, width: 40, height: 20 }
        expect(placeCard(target, card, tooltip)).toEqual({
            left: 320,
            top: 300 - 12 - 30,
            side: 'top',
            arrow: 50
        })
    })

    it('flips to the other side when its own lacks the room and the other has more', () => {
        const target = { left: 350, top: 20, width: 40, height: 20 }
        expect(placeCard(target, card, tooltip)).toMatchObject({ side: 'bottom', top: 52 })
    })

    it('stays where it is asked when neither side has more room', () => {
        const target = { left: 350, top: 10, width: 40, height: 580 }
        expect(placeCard(target, card, tooltip).side).toBe('top')
    })

    it('slides inside the viewport and keeps the arrow on the target', () => {
        const target = { left: 0, top: 300, width: 20, height: 20 }
        const placed = placeCard(target, card, tooltip)
        expect(placed.left).toBe(4)
        //the target's middle is at 10, 6 into the card, which the corner pushes out to 12
        expect(placed.arrow).toBe(12)
    })

    it('places beside the target on the left and right sides', () => {
        const target = { left: 400, top: 300, width: 20, height: 20 }
        expect(placeCard(target, card, { ...tooltip, side: 'right' })).toEqual({
            left: 432,
            top: 295,
            side: 'right',
            arrow: 15
        })
        expect(placeCard(target, card, { ...tooltip, side: 'left' })).toMatchObject({
            left: 400 - 12 - 100,
            side: 'left'
        })
    })

    it("puts a menu's arrow tip on the point, near its start", () => {
        const menu = { ...tooltip, side: 'bottom' as const, gap: 0, align: 'start' as const }
        const point = { left: 200, top: 100, width: 0, height: 0 }
        const placed = placeCard(point, { width: 180, height: 120 }, menu)
        expect(placed).toEqual({ left: 200 - 12, top: 106, side: 'bottom', arrow: 12 })
    })

    it('opens a menu above a point near the bottom, and slides it left near the right edge', () => {
        const menu = { ...tooltip, side: 'bottom' as const, gap: 0, align: 'start' as const }
        const point = { left: 760, top: 560, width: 0, height: 0 }
        const placed = placeCard(point, { width: 180, height: 120 }, menu)
        expect(placed).toMatchObject({ side: 'top', top: 560 - 6 - 120, left: 800 - 4 - 180 })
        expect(placed.arrow).toBe(760 - placed.left)
    })

    it('opens a menu with no arrow with its corner on the point', () => {
        const menu = {
            ...tooltip,
            side: 'bottom' as const,
            gap: 0,
            arrow: 0,
            align: 'start' as const
        }
        const placed = placeCard({ left: 200, top: 100, width: 0, height: 0 }, card, menu)
        expect(placed).toMatchObject({ left: 200, top: 100 })
    })
})

describe('outlinePath', () => {
    it('draws a rounded box when there is no arrow', () => {
        expect(outlinePath(100, 30, { radius: 6, side: 'top', at: 50, arrow: 0 })).toBe(
            'M6,0 L94,0 A6,6 0 0 1 100,6 L100,24 A6,6 0 0 1 94,30 L6,30 A6,6 0 0 1 0,24 L0,6 A6,6 0 0 1 6,0 Z'
        )
    })

    it("puts the arrow on the edge facing the target, its rounded tip outside the card's box", () => {
        //a card above its target points down from its bottom edge
        expect(
            outlinePath(100, 30, { radius: 6, side: 'top', at: 40, arrow: 6, offset: 6 })
        ).toContain('L52,36 L47.77,40.23 Q46,42 44.23,40.23 L40,36')
        //a card below its target points up from its top edge
        expect(outlinePath(100, 30, { radius: 6, side: 'bottom', at: 40, arrow: 6 })).toContain(
            'L34,0 L38.23,-4.23 Q40,-6 41.77,-4.23 L46,0'
        )
    })

    it('keeps the arrow clear of the corners', () => {
        expect(outlinePath(100, 30, { radius: 6, side: 'bottom', at: 0, arrow: 6 })).toContain(
            'L6,0 L10.23,-4.23 Q12,-6 13.77,-4.23 L18,0'
        )
    })

    it('draws a stroke path inside the box, as a CSS border is', () => {
        const path = outlinePath(100, 30, { radius: 6, side: 'top', at: 50, arrow: 0, inset: 0.5 })
        expect(path.startsWith('M6,0.5 L94,0.5 A5.5,5.5 0 0 1 99.5,6')).toBe(true)
    })
})
