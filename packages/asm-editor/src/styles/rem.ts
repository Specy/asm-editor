/**
 * Lengths in rem worked out in pixels, for what a script measures, places or draws (an SVG
 * outline, a canvas, a card placed by hand). A rem is the root's font size, which the browser's
 * own text size setting can change while the page is open, so a value read once, as the page
 * loads, would go stale.
 *
 * Reading it is a computed style, which makes the browser recalculate the styles of a document
 * that changed since: one read per card while a panel mounts dozens of them recalculated the
 * styles once per card. So it is read once and kept until it changes, which a hidden element one
 * rem wide reports through a ResizeObserver. Where there is no ResizeObserver it is read each time.
 */

/** The size read last, kept while the probe says it has not changed since. */
let cached: number | undefined
/** The hidden element one rem wide whose resizing says the root's font size changed. */
let probe: HTMLElement | undefined

/** The root's font size in pixels, which a rem is; 16 where there is no document to ask. */
export function rootFontSize(): number {
    if (typeof document === 'undefined') return 16
    if (cached !== undefined) return cached
    const size = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    if (watchRootFontSize()) cached = size
    return size
}

/** A length of `rem` rem in pixels, at the root's font size now. */
export function remToPx(rem: number): number {
    return rem * rootFontSize()
}

/** Starts watching the root's font size, once; false where it cannot be watched. */
function watchRootFontSize(): boolean {
    if (probe?.isConnected) return true
    if (typeof ResizeObserver === 'undefined' || !document.body) return false
    if (!probe) {
        probe = document.createElement('div')
        probe.setAttribute('aria-hidden', 'true')
        probe.style.cssText =
            'position: absolute; top: 0; left: 0; width: 1rem; height: 1rem; visibility: hidden; pointer-events: none; contain: strict;'
        //its first report, the size it starts at, only has the next read read again
        new ResizeObserver(() => {
            cached = undefined
        }).observe(probe)
    }
    //put back if something took it out of the page, which its observer reports as a change too
    document.body.appendChild(probe)
    return true
}
