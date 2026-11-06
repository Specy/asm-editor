import { searchClient } from '#lib/search/searchClient.svelte.ts'

/**
 * Whether the page's search palette is open, and what to start it with. A page has one palette,
 * mounted by its layout, and several ways in: the full-width box of a landing page, the box at the
 * top of the sidebar and Ctrl+K ([the design record](../../../../../docs/design/documentation-search.md),
 * Search on the documentation pages and in the Courses). They all open this one.
 */
export const searchPalette = $state({
    open: false,
    /** What the palette's box starts with: the characters typed into a launcher before it opened. */
    query: '',
    /**
     * Which palette opens: the page's own, searching its scope, or the site's, which the navbar's
     * box opens and which searches everything.
     */
    owner: 'page' as PaletteOwner,
    /** The page palettes mounted: while there is one, Ctrl+K opens it rather than the site's. */
    pagePalettes: 0,
    /** The navbars mounted: the site's palette is there only on a page with the navbar. */
    navbars: 0
})

export type PaletteOwner = 'page' | 'site'

/** Opening the palette is a sign the reader means to search, so the model starts loading. */
export function openSearchPalette(query = '', owner: PaletteOwner = 'page') {
    searchClient.warmModel()
    searchPalette.query = query
    searchPalette.owner = owner
    searchPalette.open = true
}

export function closeSearchPalette() {
    searchPalette.open = false
}
