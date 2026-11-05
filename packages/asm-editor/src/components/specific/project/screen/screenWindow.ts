import { clamp } from '#lib/utils.ts'
import { PHONE_MAX_WIDTH } from '#lib/workbench/deviceClass.ts'
import { snapZoom, type ZoomSnap } from './screenZoom'

/**
 * Where the Screen's floating window sits and how large it is.
 *
 * The window hugs the Screen: its body is the Screen at a zoom, inside the frame around the canvas,
 * so a square Screen gets a square window rather than a wide one with bands either side. The zoom
 * is the largest the room the window opens in allows, or the largest the size the user resized it
 * to allows, snapped to what the Screen's scaling permits (`screenZoom.ts`). The
 * window is a box the user drags around, so unlike the panel in the page it cannot be written as
 * CSS insets: everything is measured against the viewport here, and the draggable container is
 * given plain pixels. Kept out of the component because it is arithmetic, and the component is
 * DOM- and animation-frame-bound.
 */

/** The gap between the window and the edges of the viewport. */
const MARGIN_REM = 0.5
/**
 * The draggable's own header bar, which the window has instead of the panel's: the bar is 1.6 rem
 * and sits 0.1 rem over the body.
 */
const HEADER_REM = 1.5
/**
 * Where the room the window opens in starts, from the viewport's left edge: just past the Stop
 * button, which is the first of the execution controls at the bottom left of the editor while no
 * side panel is open, so the largest window leaves the rail and the one control that ends a
 * runaway program uncovered. A fixed estimate of the rail and that button rather than a
 * measurement of them.
 */
const LEFT_REM = 9
/**
 * The body's frame around the canvas, one side: the viewport's 0.15 rem padding and the focus
 * ring's 0.15 rem room, inside the container's 0.1 rem border (`border`).
 */
const PADDING_REM = 0.3
const BORDER_REM = 0.1
/**
 * The narrowest body, so that the bar above it has room for the title, the size and the controls.
 * A Screen narrower than that at its zoom is centred in it.
 */
const MIN_WIDTH_REM = 22
/** The smallest body a corner drag leaves, in height, when the viewport has room for it. */
const MIN_HEIGHT_REM = 6

export interface Size {
    width: number
    height: number
}

export interface ScreenWindowInput {
    viewportWidth: number
    viewportHeight: number
    /** The page's root font size in pixels, since every measurement above is written in rem. */
    rootFontSize: number
    /** The display's pixels in a CSS pixel, which Integer scaling counts in. */
    devicePixelRatio: number
    /** The Screen's size in its own pixels. */
    screenWidth: number
    screenHeight: number
    /** Which zooms the Screen may be shown at. */
    snap: ZoomSnap
    /**
     * The largest zoom wanted, from the size the user resized the window to (`bodyZoom`). Left
     * out, the largest the room the window opens in allows.
     */
    zoom?: number
    /**
     * The edge that stays where it is: the window's left or its right edge, the one a corner drag
     * left in place. Neither, it opens at the top right.
     */
    left?: number
    right?: number
    top?: number
}

export interface ScreenWindowBox extends Size {
    left: number
    top: number
    /** The zoom the body was sized for. */
    zoom: number
    /** The smallest body a corner drag may leave. */
    minWidth: number
    minHeight: number
}

function measures(input: {
    viewportWidth: number
    viewportHeight: number
    rootFontSize: number
    devicePixelRatio: number
}) {
    const rootFontSize = input.rootFontSize > 0 ? input.rootFontSize : 16
    const rem = (value: number) => value * rootFontSize
    //a browser draws a border in whole device pixels, down, and at least one: at 100% the 1.6
    //pixels of 0.1 rem are 1, so a frame measured in rem alone would leave each body a pixel short
    //of the zoom it was sized for
    const ratio = input.devicePixelRatio > 0 ? input.devicePixelRatio : 1
    const border = Math.max(1, Math.floor(rem(BORDER_REM) * ratio + 1e-6)) / ratio
    //a phone's Workbench has no room beside the window, so the window takes the whole viewport
    const phone = input.viewportWidth <= PHONE_MAX_WIDTH
    const margin = phone ? 0 : rem(MARGIN_REM)
    const header = rem(HEADER_REM)
    return {
        rem,
        phone,
        margin,
        header,
        //both sides together
        frame: 2 * (border + rem(PADDING_REM)),
        //the most the body can take anywhere in the viewport
        maxWidth: Math.floor(Math.max(0, input.viewportWidth - 2 * margin)),
        maxHeight: Math.floor(Math.max(0, input.viewportHeight - 2 * margin - header))
    }
}

/**
 * The window's box, in whole pixels. It opens at the top right of the viewport, as large as the
 * room right of the Stop button and the viewport's height allow, hugging the Screen at that zoom;
 * on a phone the room is the whole viewport. A window already on screen keeps the edge the user
 * left it at, pulled back inside the viewport when it no longer fits, so a Screen that changes
 * size or a browser that is resized never leaves it where it cannot be reached.
 */
export function screenWindowGeometry(input: ScreenWindowInput): ScreenWindowBox {
    const { viewportWidth, viewportHeight } = input
    const { rem, phone, margin, header, frame, maxWidth, maxHeight } = measures(input)
    const screenWidth = Math.max(1, input.screenWidth)
    const screenHeight = Math.max(1, input.screenHeight)
    const roomWidth = Math.max(0, viewportWidth - margin - (phone ? 0 : rem(LEFT_REM)))
    const fitted = (width: number, height: number) =>
        Math.max(0, Math.min((width - frame) / screenWidth, (height - frame) / screenHeight))
    const wanted = Math.min(input.zoom ?? fitted(roomWidth, maxHeight), fitted(maxWidth, maxHeight))
    const zoom = snapZoom(wanted, input.snap, input.devicePixelRatio)
    const minWidth = Math.min(maxWidth, Math.ceil(rem(MIN_WIDTH_REM)))
    //up, so that the canvas has all the room its zoom needs; the zoom fits the most the viewport
    //has, so rounding up never takes the window past it
    //less a float's error, which would otherwise round a size that is already whole a pixel up
    const up = (size: number) => Math.ceil(size - 1e-6)
    const width = Math.min(maxWidth, Math.max(minWidth, up(screenWidth * zoom + frame)))
    const height = Math.min(maxHeight, up(screenHeight * zoom + frame))
    const rightMost = Math.max(margin, viewportWidth - margin - width)
    const lowest = Math.max(margin, viewportHeight - margin - header - height)
    const left = input.left ?? (input.right ?? viewportWidth - margin) - width
    return {
        left: Math.round(clamp(left, margin, rightMost)),
        top: Math.round(clamp(input.top ?? margin, margin, lowest)),
        width,
        height,
        zoom,
        minWidth,
        minHeight: Math.min(maxHeight, Math.ceil(rem(MIN_HEIGHT_REM)))
    }
}

/**
 * The largest zoom at which the Screen fits a body of `size`, before any snapping: what a window
 * the user resized to that size wants.
 */
export function bodyZoom(input: {
    size: Size
    screenWidth: number
    screenHeight: number
    rootFontSize: number
    devicePixelRatio: number
    viewportWidth: number
    viewportHeight: number
}): number {
    const { frame } = measures(input)
    return Math.max(
        0,
        Math.min(
            (input.size.width - frame) / Math.max(1, input.screenWidth),
            (input.size.height - frame) / Math.max(1, input.screenHeight)
        )
    )
}
