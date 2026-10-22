import type { SearchQuery } from './query.ts'
import type { TextMatches } from './searchText.ts'

/**
 * What the editor tells the search worker. The worker keeps a copy of each document's text, by
 * the client's id, which the client sends again only when it changes; it answers one search at a
 * time, in order, and a newer search ends the one under way.
 */
export type SearchWorkerRequest =
    /** Adds documents or replaces their texts. */
    | { type: 'put'; documents: { id: string; version: number; text: string }[] }
    | { type: 'remove'; ids: string[] }
    /**
     * Searches the documents `ids` names, in that order (the client's result order, filtered by
     * the query's patterns), listing at most `maxRows` rows across them. Nothing answers it but
     * its `started`, `results`, `failure` and `done`.
     */
    | { type: 'search'; search: number; query: SearchQuery; ids: string[]; maxRows: number }
    /** Ends a search early, at the worker's next pause between documents. */
    | { type: 'cancel'; search: number }

/** A document holding a match: its counts, and its rows within the search's limit. */
export type WorkerDocumentResult = TextMatches & {
    id: string
    /** The version of the document's text that was searched. */
    version: number
}

export type SearchWorkerResponse =
    /**
     * The worker's first message, once its listener exists: a request posted before it has
     * nothing listening for it yet, so the client holds requests until it arrives.
     */
    | { type: 'ready' }
    /** The worker has begun a search; until its `done`, it works on nothing else. */
    | { type: 'started'; search: number }
    /** The documents holding a match since the last `results`, in the search's order. */
    | { type: 'results'; search: number; documents: WorkerDocumentResult[] }
    /** The search could not run, such as a query that does not compile; its `done` follows. */
    | { type: 'failure'; search: number; message: string }
    /** The search is over: every document searched, or `cancelled` early. */
    | { type: 'done'; search: number; cancelled: boolean }
