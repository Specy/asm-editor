/**
 * Where a card with an arrow goes, and the outline it is drawn with: one shape for the card and its
 * arrow, so a translucent card has no darker patch where an arrow would overlap it and its border
 * does not run across the arrow's base. Used by the Tooltip and the context menu (the Tooltips
 * design, decisions 5, 12 and 13).
 */

/** The side of its target a card sits on; its arrow is on its opposite edge, facing the target. */
export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface Box {
    left: number
    top: number
    width: number
    height: number
}

export interface PlaceOptions {
    /** The side wanted; the card flips to the opposite one when that has more room. */
    side: Side
    /** Space between the target and the arrow's tip. */
    gap: number
    /** How far the arrow stands out of the card, and half its base; 0 for no arrow. */
    arrow: number
    /** The card's corner radius, which the arrow keeps clear of. */
    radius: number
    /**
     * `center` centres the card on the target; `start` puts the arrow as near the card's start
     * (left or top) as the corner allows, as a menu opened at a point has it.
     */
    align: 'center' | 'start'
    /** The least room kept between the card and the viewport's edges. */
    margin: number
    viewport: { width: number; height: number }
}

export interface Placement {
    left: number
    top: number
    /** The side it ended on, after any flip. */
    side: Side
    /** Where the arrow's tip is along the card's facing edge, from that edge's left or top end. */
    arrow: number
}

/** How far along each of the arrow's sides its tip starts to round. */
const TIP_ROUNDING = 2.5

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

function clamp(value: number, min: number, max: number) {
    return max < min ? min : Math.min(Math.max(value, min), max)
}

/** The nearest the arrow's tip may come to either end of an edge `length` long. */
function arrowClearance(length: number, radius: number, arrow: number) {
    return Math.min(radius + arrow, length / 2)
}

/**
 * Places a card of `size` against `target` (a point is a box with no size): on the side asked for
 * unless the opposite side has more room than a side too small for it, then slid along that edge to
 * stay inside the viewport, its arrow still on the target's middle, or on the point, wherever the
 * slide left the card.
 */
export function placeCard(
    target: Box,
    size: { width: number; height: number },
    options: PlaceOptions
): Placement {
    const { gap, arrow, radius, align, margin, viewport } = options
    const distance = gap + arrow
    const vertical = options.side === 'top' || options.side === 'bottom'
    const room: Record<Side, number> = {
        top: target.top - margin,
        bottom: viewport.height - (target.top + target.height) - margin,
        left: target.left - margin,
        right: viewport.width - (target.left + target.width) - margin
    }
    const need = (vertical ? size.height : size.width) + distance
    let side = options.side
    if (room[side] < need && room[OPPOSITE[side]] > room[side]) side = OPPOSITE[side]

    //across: against the target, or kept on screen where neither side has the room
    const across = (
        start: number,
        extent: number,
        length: number,
        screen: number,
        before: boolean
    ) =>
        clamp(
            before ? start - distance - length : start + extent + distance,
            margin,
            screen - length - margin
        )
    //along: centred on the target, or with the arrow near the start, then slid inside the viewport
    const along = (start: number, extent: number, length: number, screen: number) => {
        const middle = start + extent / 2
        const inset =
            align === 'center' ? length / 2 : arrow > 0 ? arrowClearance(length, radius, arrow) : 0
        const position = clamp(middle - inset, margin, screen - length - margin)
        const clear = arrowClearance(length, radius, arrow)
        return { position, arrow: clamp(middle - position, clear, length - clear) }
    }

    if (vertical) {
        const top = across(target.top, target.height, size.height, viewport.height, side === 'top')
        const { position, arrow: at } = along(target.left, target.width, size.width, viewport.width)
        return { left: position, top, side, arrow: at }
    }
    const left = across(target.left, target.width, size.width, viewport.width, side === 'left')
    const { position, arrow: at } = along(target.top, target.height, size.height, viewport.height)
    return { left, top: position, side, arrow: at }
}

/**
 * The SVG path of a `width` by `height` card with rounded corners and, when `arrow` is more than 0,
 * an arrow on the edge facing a target on `side`'s opposite, its tip `at` along that edge. Drawn
 * `inset` inside the card's box (half a border's width, for a stroke inside the box as a CSS border
 * is) and shifted by `offset`, the room an outline element leaves around the card for the arrow.
 */
export function outlinePath(
    width: number,
    height: number,
    options: {
        radius: number
        side: Side
        at: number
        arrow: number
        inset?: number
        offset?: number
    }
): string {
    const { side, arrow } = options
    const inset = options.inset ?? 0
    const offset = options.offset ?? 0
    const x0 = offset + inset
    const y0 = offset + inset
    const x1 = offset + width - inset
    const y1 = offset + height - inset
    const r = Math.max(0, Math.min(options.radius - inset, (x1 - x0) / 2, (y1 - y0) / 2))
    const length = side === 'top' || side === 'bottom' ? width : height
    const clear = arrowClearance(length, options.radius, arrow)
    const at = offset + clamp(options.at, clear, length - clear)
    //the arrow's base is twice as wide as it stands out, so its sides meet at a right angle
    const tip = arrow - inset
    const n = (value: number) => Number(value.toFixed(2))
    const points: string[] = [`M${n(x0 + r)},${n(y0)}`]
    const line = (x: number, y: number) => points.push(`L${n(x)},${n(y)}`)
    const corner = (x: number, y: number) => points.push(`A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(y)}`)
    //from one end of the arrow's base to its tip and on to the other end, the tip slightly rounded:
    //a curve pulled towards the tip from a little way down each side
    const head = (bx: number, by: number, tx: number, ty: number, ex: number, ey: number) => {
        line(bx, by)
        const along =
            Math.min(TIP_ROUNDING, Math.hypot(bx - tx, by - ty) / 2) / Math.hypot(bx - tx, by - ty)
        line(tx + (bx - tx) * along, ty + (by - ty) * along)
        points.push(`Q${n(tx)},${n(ty)} ${n(tx + (ex - tx) * along)},${n(ty + (ey - ty) * along)}`)
        line(ex, ey)
    }

    //clockwise from the top left corner; an arrow faces the target, so a card below one has it on top
    if (arrow > 0 && side === 'bottom') {
        head(at - arrow, y0, at, y0 - tip, at + arrow, y0)
    }
    line(x1 - r, y0)
    corner(x1, y0 + r)
    if (arrow > 0 && side === 'left') {
        head(x1, at - arrow, x1 + tip, at, x1, at + arrow)
    }
    line(x1, y1 - r)
    corner(x1 - r, y1)
    if (arrow > 0 && side === 'top') {
        head(at + arrow, y1, at, y1 + tip, at - arrow, y1)
    }
    line(x0 + r, y1)
    corner(x0, y1 - r)
    if (arrow > 0 && side === 'right') {
        head(x0, at + arrow, x0 - tip, at, x0, at - arrow)
    }
    line(x0, y0 + r)
    corner(x0 + r, y0)
    return `${points.join(' ')} Z`
}
