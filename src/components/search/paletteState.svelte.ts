/**
 * Whether the page's search palette is open, and what to start it with. A page has one palette,
 * mounted by its layout, and several ways in: the full-width box of a landing page, the box at the
 * top of the sidebar and Ctrl+K ([the design record](../../../docs/design/documentation-search.md),
 * Search on the documentation pages and in the Courses). They all open this one.
 */
export const searchPalette = $state({
    open: false,
    /** What the palette's box starts with: the characters typed into a launcher before it opened. */
    query: ''
})

export function openSearchPalette(query = '') {
    searchPalette.query = query
    searchPalette.open = true
}

export function closeSearchPalette() {
    searchPalette.open = false
}
