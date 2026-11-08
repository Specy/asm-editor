/**
 * Holds the page still under something floating over it, as the search palette and the
 * Interactive editor's Testcases window do: the document stops scrolling, and the room its
 * scrollbar took stays taken (`scrollbar-gutter: stable`, `html` always shows one), so nothing
 * under the overlay moves sideways as it opens or closes. A scroll inside the overlay does not
 * reach the page either: its scrollers say `overscroll-behavior: contain` themselves.
 *
 * Each overlay holds the lock while it is open and lets go when it closes or goes away (an
 * `$effect`'s cleanup); the page scrolls again once every holder has let go, so the palette opened
 * over the Testcases window leaves the page held until both are closed. A page that fills the
 * screen (`.fills-screen`: the Workbench, an exam) has nothing for the document to scroll and is
 * left as it is.
 */
let holders = 0
let restore: (() => void) | null = null

export function lockPageScroll(): () => void {
    if (typeof document === 'undefined') return () => {}
    if (holders++ === 0) restore = hold()
    let released = false
    return () => {
        if (released) return
        released = true
        if (--holders > 0) return
        restore?.()
        restore = null
    }
}

function hold(): (() => void) | null {
    const root = document.documentElement
    if (document.querySelector('.fills-screen')) return null
    // a classic scrollbar takes room beside the page; an overlay one (a phone's) takes none
    const gutter = window.innerWidth - root.clientWidth > 0
    const { overflow, scrollbarGutter } = root.style
    root.style.overflow = 'hidden'
    if (gutter) root.style.scrollbarGutter = 'stable'
    return () => {
        root.style.overflow = overflow
        root.style.scrollbarGutter = scrollbarGutter
    }
}
