import type { Listing } from '#lib/listing/listing.ts'
import type { SearchRow } from './searchText.ts'

/**
 * What the Search panel searches and finds
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 25
 * and 26): documents, each a text File, an Executable's Listing or one function's Pseudocode, and
 * the results grouped by File, the Pseudocode's by Executable then function.
 */

/** What a document is the text of, which "Look in" ticks. */
export type SearchDocumentKind = 'file' | 'listing' | 'pseudocode'

/** One function whose Pseudocode is a document. */
export type SearchFunction = {
    /** Link-time, as the Pseudocode client keys functions. */
    address: number
    /** The name lists give it (`ListingFunction.list ?? name`), for its row. */
    name: string
}

/** A document without its text: what results name it by. */
export type SearchDocumentInfo = {
    kind: SearchDocumentKind
    /**
     * The File's Project path; for a Listing or Pseudocode, its Executable's. The query's include
     * and exclude patterns match it.
     */
    path: string
    /** Only for Pseudocode: the function it is the text of. */
    function?: SearchFunction
    /**
     * Only for a Listing: the Listing it is the text of, whose lines a row's line numbers count,
     * kept with each result, since a Listing made again (a rename, a comment) has its lines
     * elsewhere. Never sent to the search worker.
     */
    listing?: Listing
}

/** A text to search: a File's whole text, a Listing's, or one function's Pseudocode. */
export type SearchDocument = SearchDocumentInfo & { text: string }

/**
 * A document's id, unique in a Project: `file:src/main.c`, `listing:crackme`,
 * `pseudocode:crackme@0x11e9`.
 */
export function searchDocumentId(document: SearchDocumentInfo): string {
    if (document.kind !== 'pseudocode') return `${document.kind}:${document.path}`
    const address = document.function?.address ?? 0
    return `pseudocode:${document.path}@0x${address.toString(16)}`
}

const KIND_ORDER: Record<SearchDocumentKind, number> = { file: 0, listing: 1, pseudocode: 2 }

/**
 * The order results come in: by path, in any case; an Executable's Listing before its
 * Pseudocode; functions by address. The row limit keeps the first rows in this order.
 */
export function compareDocuments(a: SearchDocumentInfo, b: SearchDocumentInfo): number {
    if (a.path !== b.path) {
        const left = a.path.toLowerCase()
        const right = b.path.toLowerCase()
        if (left !== right) return left < right ? -1 : 1
        return a.path < b.path ? -1 : 1
    }
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    return (a.function?.address ?? 0) - (b.function?.address ?? 0)
}

/** One document holding a match. */
export type SearchDocumentResult = {
    id: string
    document: SearchDocumentInfo
    /** Every match in it. */
    matches: number
    /** Every line holding one. */
    lines: number
    /**
     * Its first lines holding one, within the search's row limit; `lines - rows.length` more are
     * not listed (Show more).
     */
    rows: SearchRow[]
}

/** The panel's top level: a File, an Executable's Listing, or an Executable's Pseudocode. */
export type SearchResultGroup = {
    kind: SearchDocumentKind
    path: string
    matches: number
    lines: number
    /** The rows listed under it. */
    rows: number
    /**
     * A File's or a Listing's one document; for Pseudocode, one per function holding a match,
     * by address, each a level of the tree under its Executable.
     */
    documents: SearchDocumentResult[]
}

/** Results grouped as the panel shows them, in the order they came (`compareDocuments`). */
export function groupResults(results: readonly SearchDocumentResult[]): SearchResultGroup[] {
    const groups: SearchResultGroup[] = []
    let group: SearchResultGroup | undefined
    for (const result of results) {
        const { kind, path } = result.document
        if (!group || kind !== 'pseudocode' || group.kind !== kind || group.path !== path) {
            group = { kind, path, matches: 0, lines: 0, rows: 0, documents: [] }
            groups.push(group)
        }
        group.matches += result.matches
        group.lines += result.lines
        group.rows += result.rows.length
        group.documents.push(result)
    }
    return groups
}

/** What the panel's summary says: "12 matches in 3 Files", and how many rows Show more adds. */
export type SearchTotals = {
    matches: number
    /** Lines holding a match: the rows there would be with no limit. */
    lines: number
    /** The rows listed. */
    rows: number
    /** Documents holding a match. */
    documents: number
    /** Files holding a match: an Executable's Listing and Pseudocode are one File. */
    files: number
}

export function searchTotals(results: readonly SearchDocumentResult[]): SearchTotals {
    const files = new Set<string>()
    let matches = 0
    let lines = 0
    let rows = 0
    for (const result of results) {
        files.add(result.document.path)
        matches += result.matches
        lines += result.lines
        rows += result.rows.length
    }
    return { matches, lines, rows, documents: results.length, files: files.size }
}
