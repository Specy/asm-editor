import table from './synonyms.json'
import { textTerms } from './queryTerms'

/*
 * The synonym table ([the design record](../../../../../docs/design/documentation-search.md),
 * Searching in plain English, Matching): a reader's words and phrases, and the Documentation's
 * words for the same thing, added to the words half only; the meaning half reads the query as it
 * was typed. The Entry questions put most of a reader's words on the entries already, so the table
 * holds only rows a golden query still needed once they were in (a search without the model, as
 * while it loads, finds "print a number" by the M68K's "Displays"). Of the 27 synonyms this table
 * replaced, most no longer helped and several hurt: "exit" also searched for "end" and found the
 * `end` directive before the exit syscall.
 */

/** A row of `synonyms.json`: what a reader types, and the words the Documentation uses for it. */
export type SynonymRow = { reader: string; documentation: string[] }

/** A word as a row compares it: lowercase, without the punctuation of the sentence around it. */
function plainWord(word: string): string {
    return word
        .toLowerCase()
        .replace(/^[("'“‘[{]+/, '')
        .replace(/[)"'”’\]},;:!?.]+$/, '')
}

/** The rows by their first word, each list longest phrase first. */
function indexRows(rows: SynonymRow[]): Map<string, { words: string[]; adds: string[] }[]> {
    const index = new Map<string, { words: string[]; adds: string[] }[]>()
    for (const row of rows) {
        const words = row.reader.split(/\s+/).map(plainWord).filter(Boolean)
        if (words.length === 0) continue
        const list = index.get(words[0]) ?? []
        list.push({ words, adds: row.documentation })
        index.set(words[0], list)
    }
    for (const list of index.values()) list.sort((a, b) => b.words.length - a.words.length)
    return index
}

const ROWS = indexRows(table as SynonymRow[])

/**
 * The Documentation's words for a query's phrases and words, in the order they were found. Rows
 * are matched on the words as typed, before stop words are dropped, so a phrase may hold one
 * ("end of the program"); the longest phrase starting at a word wins, and its words are not
 * matched again on their own, so "for loop" is not also read as "loop".
 */
export function synonymsOf(query: string, rows = ROWS): string[] {
    const words = query.trim().split(/\s+/).map(plainWord)
    const out: string[] = []
    for (let i = 0; i < words.length;) {
        const match = (rows.get(words[i]) ?? []).find((row) =>
            row.words.every((word, k) => words[i + k] === word)
        )
        if (!match) {
            i++
            continue
        }
        out.push(...match.adds)
        i += match.words.length
    }
    return out
}

/**
 * The words the words half searches for: the query's words without its stop words, and the
 * Documentation's words for its phrases and words. A single word is left as it is, since it is
 * usually a name (`stop` is an instruction, not a reader's "halt").
 */
export function expandedTerms(query: string, rows = ROWS): string {
    const terms = textTerms(query)
    const words = terms.split(/\s+/)
    if (query.trim().split(/\s+/).length < 2) return terms
    return [...new Set([...words, ...synonymsOf(query, rows)])].join(' ')
}

/** The table's rows ready for `synonymsOf`, for a test to try rows of its own. */
export function synonymIndex(rows: SynonymRow[]) {
    return indexRows(rows)
}
