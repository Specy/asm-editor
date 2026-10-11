/** Text cut where it contains one of the query's words, so those parts can be marked. */
export type Highlighted = { text: string; match: boolean }[]

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `terms` longest first (as `queryTerms` gives them), so that a longer word wins where two overlap.
 * Splitting on a capturing pattern puts every match at an odd index.
 */
export function highlight(text: string, terms: string[]): Highlighted {
    if (terms.length === 0 || !text) return [{ text, match: false }]
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
    return text
        .split(pattern)
        .map((part, index) => ({ text: part, match: index % 2 === 1 }))
        .filter((part) => part.text.length > 0)
}
