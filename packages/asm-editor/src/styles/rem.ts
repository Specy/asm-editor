/**
 * Lengths in rem worked out in pixels, for what a script measures, places or draws (an SVG
 * outline, a canvas, a card placed by hand). A rem is the root's font size, which the browser's
 * own text size or a page zoom can change, so it is read each time it is asked for: a value read
 * once, as the page loads, goes stale when that setting changes.
 */

/** The root's font size in pixels, which a rem is; 16 where there is no document to ask. */
export function rootFontSize(): number {
    if (typeof document === 'undefined') return 16
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

/** A length of `rem` rem in pixels, at the root's font size now. */
export function remToPx(rem: number): number {
    return rem * rootFontSize()
}
