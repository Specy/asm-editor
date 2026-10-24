import type { SearchRange, SearchRow } from './searchText.ts'

/**
 * Where a Search panel row's match is in the text a pane shows
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 26), which need not be the text that was searched: a Pseudocode pane adds a header above the
 * decompiler's lines, the search's cached Pseudocode may break its lines where a fresh
 * decompilation does not ("The cached text with a new name"), a Listing may have been made again
 * with a comment above the line, and a File may have changed since. The match is found again by
 * its text, on the line it was on or the nearest line holding it.
 */

/** A match's place in a text: a 0-based line, and the UTF-16 offset in that line. */
export type MatchPlace = {
    line: number
    column: number
    /** Whether the match's text is there; otherwise only the line is, as near as could be told. */
    found: boolean
}

/**
 * The text of a row's match on the row's line: up to the line's end for a match that runs onto
 * the next line. Empty for a zero-length match, or one starting outside the row's cut text.
 */
export function matchedText(row: SearchRow, range: SearchRange): string {
    const start = range.start - row.textStart
    if (start < 0 || start > row.text.length) return ''
    return row.text.slice(
        start,
        range.endLine === undefined ? range.end - row.textStart : undefined
    )
}

const LINE_BREAK = /\r\n|\r|\n/

/**
 * Where `matched` is in `text`: at `line` and `column` when it is still there, else the occurrence
 * on the nearest line holding it, the line below winning a tie, and on that line the one nearest
 * `column`. With no line holding it, `line` within the text, not `found`. A zero-length match is
 * found where it was.
 */
export function findMatchAgain(
    text: string,
    line: number,
    column: number,
    matched: string
): MatchPlace {
    const lines = text.split(LINE_BREAK)
    const last = lines.length - 1
    const at = Math.max(0, Math.min(last, line))
    if (!matched) return { line: at, column: Math.min(column, lines[at].length), found: true }
    if (lines[at].startsWith(matched, column)) return { line: at, column, found: true }
    for (let distance = 0; distance <= last; distance++) {
        for (const candidate of distance ? [at + distance, at - distance] : [at]) {
            if (candidate < 0 || candidate > last) continue
            const nearest = nearestOccurrence(lines[candidate], matched, column)
            if (nearest >= 0) return { line: candidate, column: nearest, found: true }
        }
    }
    return { line: at, column: 0, found: false }
}

/** The start of the occurrence of `matched` in `line` nearest `column`, or -1. */
function nearestOccurrence(line: string, matched: string, column: number): number {
    let best = -1
    for (let start = line.indexOf(matched); start >= 0; start = line.indexOf(matched, start + 1)) {
        if (best < 0 || Math.abs(start - column) < Math.abs(best - column)) best = start
        if (start > column) break
    }
    return best
}
