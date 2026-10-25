import type monaco from 'monaco-editor'
import { lineOfPlace, placeOfLine, type Listing } from '#lib/listing/listing.ts'

/**
 * Keeping an editor on the same addresses when its Listing is made again
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 22): a rename or a comment, an overwrite, or a Debug session's own load base gives a File's
 * Listing a new document, whose lines may sit elsewhere (a comment written above a line adds lines
 * before it). An editor's cursor and first visible line are then moved to the lines standing for
 * the addresses they stood for, rather than kept at their line numbers.
 */

/** How far from a line standing for no address (a blank, a section) the one it moves with is looked for. */
const NEAREST_PLACE = 64

/**
 * A 0-based line of one Listing, found in another of the same File: the line standing for the same
 * address, of the same kind (`placeOfLine`, `lineOfPlace`). A line standing for no address moves
 * with the nearest one after it that does, else before it; a Listing with neither keeps the
 * number, within the other's lines.
 */
export function movedListingLine(from: Listing, to: Listing, line: number): number {
    const last = Math.max(0, to.lines.kinds.length - 1)
    if (from === to || from.lines === to.lines) return Math.min(line, last)
    const count = from.lines.kinds.length
    for (let distance = 0; distance < NEAREST_PLACE && line + distance < count; distance++) {
        const place = placeOfLine(from, line + distance)
        if (!place) continue
        const found = lineOfPlace(to, place)
        if (found >= 0) return Math.max(0, found - distance)
        break
    }
    for (let distance = 1; distance < NEAREST_PLACE && line - distance >= 0; distance++) {
        const place = placeOfLine(from, line - distance)
        if (!place) continue
        const found = lineOfPlace(to, place)
        if (found >= 0) return Math.min(last, found + distance)
        break
    }
    return Math.min(line, last)
}

/**
 * An editor's saved view state over one Listing, moved onto another of the same File: its cursors
 * and selections, and its first visible line, which Monaco scrolls back to (its `firstPosition`).
 */
export function moveListingViewState(
    state: monaco.editor.ICodeEditorViewState,
    from: Listing,
    to: Listing
): monaco.editor.ICodeEditorViewState {
    const move = (position: monaco.IPosition): monaco.IPosition => ({
        lineNumber: movedListingLine(from, to, position.lineNumber - 1) + 1,
        column: position.column
    })
    return {
        ...state,
        cursorState: state.cursorState.map((cursor) => ({
            ...cursor,
            selectionStart: move(cursor.selectionStart),
            position: move(cursor.position)
        })),
        viewState: state.viewState.firstPosition
            ? { ...state.viewState, firstPosition: move(state.viewState.firstPosition) }
            : state.viewState
    }
}

/** The Listing each saved view state was taken over, which `moveListingViewState` starts from. */
const viewStateListings = new WeakMap<monaco.editor.ICodeEditorViewState, Listing>()

/** Notes the Listing a view state was saved over. */
export function noteViewStateListing(
    state: monaco.editor.ICodeEditorViewState | null,
    listing: Listing | undefined
): void {
    if (state && listing) viewStateListings.set(state, listing)
}

/**
 * A saved view state as an editor showing `listing` restores it: moved onto it from the Listing it
 * was saved over, when that is another one.
 */
export function viewStateFor(
    state: monaco.editor.ICodeEditorViewState,
    listing: Listing | undefined
): monaco.editor.ICodeEditorViewState {
    const from = viewStateListings.get(state)
    return from && listing && from !== listing ? moveListingViewState(state, from, listing) : state
}
