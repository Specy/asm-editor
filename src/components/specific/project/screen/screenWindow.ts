import { clamp } from '$lib/utils'

/**
 * Where the Screen's floating window sits and how large it is.
 *
 * The window is a box the user drags around, so unlike the panel in the page it cannot be written
 * as CSS insets: its size and its opening place are measured against the viewport here, and the
 * draggable container is given plain pixels. Kept out of the component because it is arithmetic,
 * and the component is DOM- and animation-frame-bound.
 */

/** The gap between the window and the edges of the viewport. */
const MARGIN_REM = 0.5
/** Extra room above the Screen for the floating project tabs. */
const TOP_MARGIN_REM = 2.7
/**
 * The room left below the window for the execution controls. The control bar of every surface that
 * hosts the Screen is a row at the bottom of the editor column, and it is as wide as that column,
 * so a window wide enough to be worth opening always reaches over its right end: this clearance,
 * not a left edge, is what keeps Build, Run, Step and Testcases visible when the window opens.
 */
const CONTROLS_CLEARANCE_REM = 4
/** The draggable's own header bar, which the window has instead of the panel's. */
const HEADER_REM = 1.8
/** Wide enough to more than double a 4 by 3 Screen, narrow enough to leave the editor readable. */
const WIDTH_FRACTION = 0.58
const MAX_WIDTH_REM = 68
const MIN_WIDTH_REM = 20
const MIN_HEIGHT_REM = 12

export interface ScreenWindowInput {
    viewportWidth: number
    viewportHeight: number
    /** The page's root font size in pixels, since every measurement above is written in rem. */
    rootFontSize: number
    /** Where the window is now. Left out, it opens at the top right of the viewport. */
    left?: number
    top?: number
}

export interface ScreenWindowBox {
    left: number
    top: number
    /** The body's size: the draggable adds its own header bar above it. */
    width: number
    height: number
}

/**
 * The window's box, in whole pixels. A window already on screen keeps the place the user dragged it
 * to, pulled back inside the viewport when that place no longer exists — a resized browser must not
 * leave the Screen somewhere it cannot be reached, and the container only clamps while dragging.
 */
export function screenWindowGeometry(input: ScreenWindowInput): ScreenWindowBox {
    const { viewportWidth, viewportHeight, left, top } = input
    const rootFontSize = input.rootFontSize > 0 ? input.rootFontSize : 16
    const rem = (value: number) => value * rootFontSize
    const margin = rem(MARGIN_REM)
    const topMargin = margin + rem(TOP_MARGIN_REM)
    const availableWidth = Math.max(0, viewportWidth - 2 * margin)
    const availableHeight = Math.max(
        0,
        viewportHeight - topMargin - rem(CONTROLS_CLEARANCE_REM) - rem(HEADER_REM)
    )
    const width = Math.min(
        availableWidth,
        Math.max(Math.min(viewportWidth * WIDTH_FRACTION, rem(MAX_WIDTH_REM)), rem(MIN_WIDTH_REM))
    )
    const height = Math.max(availableHeight, rem(MIN_HEIGHT_REM))
    const rightMost = Math.max(margin, viewportWidth - width - margin)
    return {
        left: Math.round(left === undefined ? rightMost : clamp(left, margin, rightMost)),
        top: Math.round(
            top === undefined
                ? topMargin
                : clamp(top, topMargin, Math.max(topMargin, viewportHeight - margin))
        ),
        width: Math.round(width),
        height: Math.round(height)
    }
}
