/**
 * The Screen panel's zoom. It lives outside the component because it is the one piece of the panel
 * that is pure arithmetic and therefore testable: everything else there is DOM- and
 * animation-frame-bound.
 */

/**
 * Which zooms the Screen may be shown at, below the largest its box allows.
 *
 * - `exact` fills the box, the in-page panel's fitting: it fills the constraining dimension
 *   exactly and is deliberately not rounded. Flooring it once left a 256 by 192 Z80 Screen at 1:1
 *   in a panel three times that size. `image-rendering: pixelated` keeps the fractional scale
 *   looking like square pixels instead of a blur, if not all the same size.
 * - `integer` is Integer scaling: every Screen pixel is the same whole number of the display's own
 *   pixels, so text and lines stay crisp. It counts device pixels, not CSS pixels, since a page
 *   zoomed to 125% or 150% would otherwise make a whole CSS zoom an uneven one. A Screen too large
 *   for one device pixel each cannot be crisp at all, and is fitted instead.
 * - `fine` is the floating window's fitting, which picks its own size, so its zoom comes in steps
 *   of 2%: fine enough to follow the corner closely, and a size a corner drag can come back to.
 */
export type ZoomSnap = 'exact' | 'integer' | 'fine'

/** Room for a float's error, so a zoom computed from the size it gave is not a step short. */
const EPSILON = 1e-6
/** The floating window's steps without Integer scaling. */
const FINE_STEP = 0.02

/** The largest zoom `snap` allows that is not larger than `zoom`. */
export function snapZoom(zoom: number, snap: ZoomSnap, devicePixelRatio: number): number {
    if (snap === 'exact') return zoom
    if (snap === 'fine') {
        const stepped = Math.floor(zoom / FINE_STEP + EPSILON) * FINE_STEP
        //a Screen too large for even the first step keeps the zoom that fits it
        return stepped > 0 ? stepped : zoom
    }
    const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1
    const device = zoom * ratio
    if (device < 1) return zoom
    return Math.floor(device + EPSILON) / ratio
}

export type ScreenZoomRequest = {
    snap: ZoomSnap
    /** The box the canvas has to live in, in CSS pixels, without padding. */
    viewportWidth: number
    viewportHeight: number
    logicalWidth: number
    logicalHeight: number
    /** The display's pixels in a CSS pixel, `window.devicePixelRatio`. */
    devicePixelRatio: number
}

/** The largest zoom `snap` allows at which the whole Screen fits its box. */
export function screenZoom(request: ScreenZoomRequest): number {
    const { viewportWidth, viewportHeight, logicalWidth, logicalHeight } = request
    //before the first measurement, and for a Screen with no area, 1:1 is the only honest answer
    if (viewportWidth <= 0 || viewportHeight <= 0) return 1
    if (logicalWidth <= 0 || logicalHeight <= 0) return 1
    const fitted = Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight)
    return snapZoom(fitted, request.snap, request.devicePixelRatio)
}

/**
 * A zoom reads as a percentage, and under Integer scaling as the whole number of the display's
 * pixels each Screen pixel takes: on a page zoomed to 125%, ×2 is 160% of a CSS pixel, which would
 * read as anything but crisp.
 */
export function screenZoomLabel(
    integerScaling: boolean,
    zoom: number,
    devicePixelRatio: number
): string {
    const device = zoom * (devicePixelRatio > 0 ? devicePixelRatio : 1)
    const whole = Math.round(device)
    return integerScaling && whole >= 1 && Math.abs(device - whole) < EPSILON
        ? `×${whole}`
        : `${Math.round(zoom * 100)}%`
}
