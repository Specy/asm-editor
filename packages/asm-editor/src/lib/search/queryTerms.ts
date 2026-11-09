/*
 * The words of a query, apart from the search engine (engine.ts) so that a search box can mark
 * them in its results without loading Orama, which runs in the search worker.
 */

/**
 * Words that carry no meaning of their own in a question. Left in, a forgiving full-text search
 * matched "the" to `tne` and "an" to `$a0`, and those entries topped every question asked in words.
 * Only a question's words are dropped: a single word is kept, so `and` and `or` still find their
 * instructions.
 */
const STOP_WORDS = new Set(
    'a an the and or how do does did i me my to of in on for with is are was be what which who when where why can could should would will it its this that these those from by at as into about there you your we our'.split(
        ' '
    )
)

/** The words of a query the full-text half searches for. */
export function textTerms(query: string): string {
    const words = query.trim().split(/\s+/)
    if (words.length < 2) return query.trim()
    const kept = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()))
    return (kept.length > 0 ? kept : words).join(' ')
}

/**
 * The words of a query worth highlighting, longest first so a longer match wins: the words the
 * full-text half searched for, so a question's "and" or "the" is not marked everywhere.
 */
export function queryTerms(query: string): string[] {
    const words = textTerms(query)
        .toLowerCase()
        .split(/[^\p{L}\p{N}_.$#%]+/u)
        .map((word) => word.replace(/^[.]+|[.]+$/g, ''))
        .filter((word) => word.length >= 2)
    return [...new Set(words)].sort((a, b) => b.length - a.length)
}
