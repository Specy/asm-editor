/**
 * The Screen panel's zoom. It lives outside the component because it is the one piece of the panel
 * that is pure arithmetic and therefore testable: everything else there is DOM- and
 * animation-frame-bound.
 */

export type ScreenZoomRequest = {
    /** Whether the panel is fitting the Screen to its box rather than showing it at actual size. */
    fit: boolean
    /** The box the canvas has to live in, in CSS pixels, without padding or a scrollbar. */
    viewportWidth: number
    viewportHeight: number
    logicalWidth: number
    logicalHeight: number
    /**
     * What "actual size" means for this environment: MARS's unit width for MIPS and RISC-V, whose
     * whole point is how many screen pixels one memory word covered there, and 1 everywhere else.
     */
    actualSizeZoom: number
}

/**
 * Fitting fills the constraining dimension exactly and is deliberately not rounded to a whole
 * number of screen pixels per logical pixel. Flooring it left a 256 by 192 Z80 Screen at 1:1 in a
 * panel three times that size, and the fraction it threw away was also what pushed the image past
 * the box into a scrollbar. `image-rendering: pixelated` is what keeps the fractional scale looking
 * like square pixels instead of a blur.
 */
export function screenZoom(request: ScreenZoomRequest): number {
    const { viewportWidth, viewportHeight, logicalWidth, logicalHeight } = request
    //actual size is the environment's own geometry, so it stays a whole multiplier
    if (!request.fit) return Math.max(1, Math.floor(request.actualSizeZoom))
    //before the first measurement, and for a Screen with no area, 1:1 is the only honest answer
    if (viewportWidth <= 0 || viewportHeight <= 0) return 1
    if (logicalWidth <= 0 || logicalHeight <= 0) return 1
    return Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight)
}

/**
 * A fitted zoom is fractional, so it reads as a percentage; actual size is a whole multiplier and
 * reads as one.
 */
export function screenZoomLabel(fit: boolean, zoom: number): string {
    return fit ? `${Math.round(zoom * 100)}%` : `×${zoom}`
}
