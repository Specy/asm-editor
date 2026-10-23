import SearchWorker from './search.worker?worker'
import type { SearchWorkerRequest, SearchWorkerResponse } from './protocol.ts'
import { compileMatcher, pathFilter, SearchQueryError, type SearchQuery } from './query.ts'
import {
    compareDocuments,
    searchDocumentId,
    searchTotals,
    type SearchDocument,
    type SearchDocumentInfo,
    type SearchDocumentResult,
    type SearchTotals
} from './searchResults.ts'

/**
 * How long a search may take before its worker is ended and started again (decision 27): plain
 * and whole-word queries take milliseconds over 16 MiB, a regular expression that backtracks can
 * take minutes on one line.
 */
export const SEARCH_TIME_LIMIT_MS = 2_000
/** How long after typing stops the panel searches (decision 27), as `delayMs`. */
export const SEARCH_TYPING_DELAY_MS = 150
/** The most rows a search lists (decision 26); Show more searches again with more. */
export const SEARCH_ROW_LIMIT = 2_000

export type SearchOptions = {
    /** Each batch of documents holding a match, as the worker sends it, in result order. */
    onResults?: (batch: readonly SearchDocumentResult[]) => void
    /**
     * Waits this long before searching, {@link SEARCH_TYPING_DELAY_MS} as one types; a newer
     * search in the meantime replaces this one, which ends `cancelled`.
     */
    delayMs?: number
    /** The most rows listed across the documents, {@link SEARCH_ROW_LIMIT} by default. */
    maxRows?: number
    /** Searches only these documents (by `searchDocumentId`), such as functions just decompiled. */
    only?: Iterable<string>
}

/** How a search ended. */
export type SearchOutcome =
    /** Every document searched; `results` in result order, as `onResults` gave them. */
    | { status: 'complete'; results: SearchDocumentResult[]; totals: SearchTotals }
    /** Ended by its `cancel`, by a newer search, or by `dispose`. */
    | { status: 'cancelled' }
    /**
     * It ran past the time limit, so the worker was ended; the next search starts another and
     * sends it every document again. `results` are those that came before. The panel says "The
     * search took too long".
     */
    | { status: 'timedOut'; results: SearchDocumentResult[] }
    /** A regular expression JavaScript cannot compile: `problem` is the sentence to show. */
    | { status: 'invalid'; problem: string }
    /** The worker could not start, or failed. */
    | { status: 'failed'; message: string }

/** One search, from `ProjectSearchClient.search`. */
export type ProjectSearch = {
    /** Settles once the search is over, however it ends; never rejects. */
    readonly done: Promise<SearchOutcome>
    /** Ends it: `done` settles `cancelled`, and nothing more reaches `onResults`. */
    cancel(): void
}

/** What the client uses of a Worker, which a stand-in on the calling thread has too. */
export type SearchWorkerLike = {
    postMessage(request: SearchWorkerRequest): void
    terminate(): void
    addEventListener(
        type: 'message' | 'error' | 'messageerror',
        listener: (event: Event) => void
    ): void
}

export type SearchWorkerConstructor = new () => SearchWorkerLike

type ClientOptions = {
    /** {@link SEARCH_TIME_LIMIT_MS} by default. */
    timeLimitMs?: number
}

type Stored = { info: SearchDocumentInfo; text: string; version: number }

type Search = {
    id: number
    query: SearchQuery
    options: SearchOptions
    only: Set<string> | undefined
    results: SearchDocumentResult[]
    /** Whether its request has gone to a worker, which owes it a `done`. */
    posted: boolean
    settled: boolean
    delay?: ReturnType<typeof setTimeout>
    resolve(outcome: SearchOutcome): void
}

type WorkerState = {
    worker: SearchWorkerLike
    /** Whether it has announced its listener; until then requests are held, in order. */
    ready: boolean
    held: SearchWorkerRequest[]
    /**
     * The searches posted to it whose `done` has not come, in order: it works on the first,
     * since it answers them one after another.
     */
    owed: number[]
}

/**
 * The editor's side of the search worker ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 27), one per Workbench session. It keeps the documents it is given (`sync`, `put`,
 * `remove`), sends the worker each one's text once and again only when it changes, and runs one
 * search at a time: a newer one, or `cancel`, ends the one before. A search's results stream to
 * `onResults` in result order (`compareDocuments`), each document's rows within the row limit;
 * the documents the query's patterns leave out are not searched.
 *
 * A search that runs past {@link SEARCH_TIME_LIMIT_MS} ends `timedOut` and its worker is ended,
 * since one regular expression over one text cannot be stopped any other way; the next search
 * starts a new worker and sends it every document again (about a millisecond a MiB). A worker
 * stuck on a search that a newer one replaced is ended too, and the newer one sent to a new worker.
 *
 * The worker starts with the first search, and stays, with its copy of the texts, until
 * `dispose`. The tests, in Node and jsdom, pass a stand-in that answers on the calling thread
 * (`InThreadSearchWorker`), which the app never imports.
 */
export class ProjectSearchClient {
    private readonly documents = new Map<string, Stored>()
    /** Every id in result order, made again when documents come or go. */
    private order: string[] | undefined
    /** Documents the worker lacks, or has an older text of; ids it may have that are gone. */
    private readonly unsent = new Set<string>()
    private readonly gone = new Set<string>()
    private flushQueued = false
    private nextVersion = 1
    private nextSearch = 1
    private state?: WorkerState
    private current?: Search
    private watchdog: ReturnType<typeof setTimeout> | undefined
    private readonly WorkerClass: SearchWorkerConstructor
    private readonly timeLimitMs: number

    constructor(WorkerClass: SearchWorkerConstructor = SearchWorker, options: ClientOptions = {}) {
        this.WorkerClass = WorkerClass
        this.timeLimitMs = options.timeLimitMs ?? SEARCH_TIME_LIMIT_MS
    }

    /** The documents now kept, by id. */
    get size(): number {
        return this.documents.size
    }

    /**
     * Makes the documents exactly these: new ones are added, changed ones sent again, and those
     * not given removed. A text the worker has is compared, not copied, so calling it with every
     * document after any change costs little.
     */
    sync(documents: Iterable<SearchDocument>): void {
        const kept = new Set<string>()
        for (const document of documents) kept.add(this.store(document))
        for (const id of [...this.documents.keys()]) if (!kept.has(id)) this.drop(id)
        this.queueFlush()
    }

    /** Adds documents, or replaces those with the same id. */
    put(documents: Iterable<SearchDocument>): void {
        for (const document of documents) this.store(document)
        this.queueFlush()
    }

    /** Removes documents by id (`searchDocumentId`). */
    remove(ids: Iterable<string>): void {
        for (const id of ids) this.drop(id)
        this.queueFlush()
    }

    /**
     * Searches the documents for `query`, ending the search before. An empty query ends
     * `complete` with nothing; one that does not compile ends `invalid`, as `queryProblem` says.
     * A document changed during the search does not report rows of its old text, so a search
     * should be made again after documents change.
     */
    search(query: SearchQuery, options: SearchOptions = {}): ProjectSearch {
        if (this.current) this.finish(this.current, { status: 'cancelled' })
        let resolve!: (outcome: SearchOutcome) => void
        const done = new Promise<SearchOutcome>((settle) => (resolve = settle))
        const search: Search = {
            id: this.nextSearch++,
            query: {
                text: query.text,
                matchCase: query.matchCase === true,
                wholeWord: query.wholeWord === true,
                regex: query.regex === true,
                include: query.include ?? '',
                exclude: query.exclude ?? ''
            },
            options,
            only: options.only ? new Set(options.only) : undefined,
            results: [],
            posted: false,
            settled: false,
            resolve
        }
        const handle: ProjectSearch = {
            done,
            cancel: () => this.finish(search, { status: 'cancelled' })
        }
        try {
            if (!compileMatcher(search.query)) {
                this.finish(search, complete([]))
                return handle
            }
        } catch (error) {
            const problem = error instanceof SearchQueryError ? error.message : String(error)
            this.finish(search, { status: 'invalid', problem })
            return handle
        }
        this.current = search
        const delay = options.delayMs ?? 0
        if (delay > 0) search.delay = setTimeout(() => this.begin(search), delay)
        else this.begin(search)
        return handle
    }

    /** Ends the worker and forgets every document; a search under way ends `cancelled`. */
    dispose(): void {
        if (this.current) this.finish(this.current, { status: 'cancelled' })
        if (this.state) this.end(this.state)
        this.documents.clear()
        this.unsent.clear()
        this.gone.clear()
        this.order = undefined
    }

    private store(document: SearchDocument): string {
        const id = searchDocumentId(document)
        const info: SearchDocumentInfo = { kind: document.kind, path: document.path }
        if (document.function)
            info.function = { address: document.function.address, name: document.function.name }
        if (document.listing) info.listing = document.listing
        const stored = this.documents.get(id)
        if (stored?.text === document.text) {
            stored.info = info
            return id
        }
        if (!stored) this.order = undefined
        this.documents.set(id, { info, text: document.text, version: this.nextVersion++ })
        this.unsent.add(id)
        this.gone.delete(id)
        return id
    }

    private drop(id: string) {
        if (!this.documents.delete(id)) return
        this.order = undefined
        this.unsent.delete(id)
        this.gone.add(id)
    }

    private ordered(): string[] {
        return (this.order ??= [...this.documents.entries()]
            .sort(([, a], [, b]) => compareDocuments(a.info, b.info))
            .map(([id]) => id))
    }

    /** Sends the worker what changed, once the current burst of changes is over. */
    private queueFlush() {
        if (!this.state || this.flushQueued) return
        this.flushQueued = true
        queueMicrotask(() => {
            this.flushQueued = false
            if (this.state) this.flush(this.state)
        })
    }

    private flush(state: WorkerState) {
        if (this.gone.size) {
            this.send(state, { type: 'remove', ids: [...this.gone] })
            this.gone.clear()
        }
        if (!this.unsent.size) return
        const documents: { id: string; version: number; text: string }[] = []
        for (const id of this.unsent) {
            const stored = this.documents.get(id)
            if (stored) documents.push({ id, version: stored.version, text: stored.text })
        }
        this.unsent.clear()
        this.send(state, { type: 'put', documents })
    }

    private begin(search: Search) {
        search.delay = undefined
        if (search.settled) return
        const { include, exclude } = search.query
        const searched = pathFilter(include, exclude)
        const { only } = search
        const ids = this.ordered().filter(
            (id) => (!only || only.has(id)) && searched(this.documents.get(id)!.info.path)
        )
        if (!ids.length) return this.finish(search, complete([]))
        let state: WorkerState
        try {
            state = this.state ?? this.start()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return this.finish(search, {
                status: 'failed',
                message: `The search could not start: ${message}`
            })
        }
        this.flush(state)
        search.posted = true
        const { text, matchCase, wholeWord, regex } = search.query
        this.send(state, {
            type: 'search',
            search: search.id,
            query: { text, matchCase, wholeWord, regex },
            ids,
            maxRows: search.options.maxRows ?? SEARCH_ROW_LIMIT
        })
    }

    /** Settles a search once; a cancelled one the worker has is cancelled there too. */
    private finish(search: Search, outcome: SearchOutcome) {
        if (search.settled) return
        search.settled = true
        clearTimeout(search.delay)
        if (this.current === search) this.current = undefined
        const state = this.state
        if (outcome.status === 'cancelled' && search.posted && state) {
            const held = state.held.findIndex(
                (request) => request.type === 'search' && request.search === search.id
            )
            if (held >= 0) state.held.splice(held, 1)
            else if (state.owed.includes(search.id))
                this.send(state, { type: 'cancel', search: search.id })
        }
        search.resolve(outcome)
    }

    private send(state: WorkerState, request: SearchWorkerRequest) {
        if (!state.ready) return void state.held.push(request)
        state.worker.postMessage(request)
        if (request.type !== 'search') return
        state.owed.push(request.search)
        if (state.owed.length === 1) this.arm(state)
    }

    /** Gives the search the worker is on the time limit, from now. */
    private arm(state: WorkerState) {
        clearTimeout(this.watchdog)
        this.watchdog = setTimeout(() => this.overrun(state), this.timeLimitMs)
    }

    /**
     * The worker has been on one search past the time limit: it is ended. If that search is the
     * current one, it timed out; if it is one a newer search replaced, the newer one never ran,
     * and goes to a new worker.
     */
    private overrun(state: WorkerState) {
        if (this.state !== state || !state.owed.length) return
        const stuck = state.owed[0]
        this.end(state)
        const search = this.current
        if (!search?.posted || search.settled) return
        if (search.id === stuck)
            return this.finish(search, { status: 'timedOut', results: search.results })
        search.posted = false
        this.begin(search)
    }

    private receive(state: WorkerState, response: SearchWorkerResponse) {
        if (this.state !== state) return
        const search = this.current
        const mine =
            search !== undefined &&
            !search.settled &&
            search.id === (response as { search?: number }).search
        switch (response.type) {
            case 'ready':
                state.ready = true
                for (const request of state.held.splice(0)) this.send(state, request)
                return
            case 'started':
                if (state.owed[0] === response.search) this.arm(state)
                return
            case 'results':
                if (mine) this.deliver(search, response.documents)
                return
            case 'failure':
                if (mine) this.finish(search, { status: 'failed', message: response.message })
                return
            case 'done': {
                const index = state.owed.indexOf(response.search)
                if (index >= 0) state.owed.splice(index, 1)
                //the next search it owes begins now
                if (state.owed.length) this.arm(state)
                else clearTimeout(this.watchdog)
                if (mine) this.finish(search, complete(search.results))
                return
            }
        }
    }

    private deliver(
        search: Search,
        documents: Extract<SearchWorkerResponse, { type: 'results' }>['documents']
    ) {
        const batch: SearchDocumentResult[] = []
        for (const found of documents) {
            const stored = this.documents.get(found.id)
            //changed or gone since it was searched: its rows are of another text
            if (stored?.version !== found.version) continue
            batch.push({
                id: found.id,
                document: stored.info,
                matches: found.matches,
                lines: found.lines,
                rows: found.rows
            })
        }
        if (!batch.length) return
        for (const result of batch) search.results.push(result)
        search.options.onResults?.(batch)
    }

    /** Ends a worker; the next search starts a new one with every document. */
    private end(state: WorkerState) {
        if (this.state !== state) return
        clearTimeout(this.watchdog)
        state.worker.terminate()
        this.state = undefined
    }

    /** Fails the search waiting on a worker that died, and ends the worker. */
    private fail(state: WorkerState, message: string) {
        if (this.state !== state) return
        this.end(state)
        const search = this.current
        if (search?.posted) this.finish(search, { status: 'failed', message })
    }

    /** Starts a worker, which is sent every document; throws where none can start. */
    private start(): WorkerState {
        const worker = new this.WorkerClass()
        const state: WorkerState = { worker, ready: false, held: [], owed: [] }
        this.state = state
        this.gone.clear()
        for (const id of this.documents.keys()) this.unsent.add(id)
        worker.addEventListener('message', (event) =>
            this.receive(state, (event as MessageEvent<SearchWorkerResponse>).data)
        )
        // A worker that fails to load or dies answers nothing: fail what waits on it, and let the
        // next search start a fresh one.
        worker.addEventListener('error', (event) =>
            this.fail(
                state,
                `The search failed: ${(event as ErrorEvent).message || 'its worker failed to start'}`
            )
        )
        worker.addEventListener('messageerror', () =>
            this.fail(state, 'The search failed: its worker sent an unreadable message')
        )
        return state
    }
}

function complete(results: SearchDocumentResult[]): SearchOutcome {
    return { status: 'complete', results, totals: searchTotals(results) }
}
