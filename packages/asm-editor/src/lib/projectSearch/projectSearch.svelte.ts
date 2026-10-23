import { untrack } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import type { AvailableLanguages, Project } from '#lib/Project.svelte.ts'
import { executableKind } from '#lib/executables.ts'
import { fileKind } from '#lib/fileKinds.ts'
import type { Listing } from '#lib/listing/listing.ts'
import type { ListingDocument, ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import type {
    PseudocodeSearchCache,
    PseudocodeSearchChange,
    PseudocodeSearchEntry,
    PseudocodeSearchProgress
} from '#lib/pseudocode/pseudocodeSearchCache.ts'
import { workbenchLayout, type SearchLookIn } from '#stores/workbenchLayoutStore.svelte.ts'
import type { SearchQuery } from './query.ts'
import {
    ProjectSearchClient,
    SEARCH_ROW_LIMIT,
    SEARCH_TYPING_DELAY_MS,
    type ProjectSearch as Search,
    type SearchOutcome
} from './searchClient.ts'
import {
    searchDocumentId,
    searchTotals,
    type SearchDocument,
    type SearchDocumentKind,
    type SearchDocumentResult,
    type SearchTotals
} from './searchResults.ts'

/**
 * The Search panel's state and its searches, one per Workbench session
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 23
 * to 29): the query, its toggles and patterns, kept for the session whether or not the panel is
 * shown; the "Look in" ticks, kept with the Workbench layout; the documents the ticks name, sent
 * to the search worker while the panel is shown; and the last results.
 *
 * - **Files**: every text File of the Project, the Generated assembly among them; not the Runtime
 *   library's members or the Build output, which are no Files, nor an Executable stored as text.
 * - **Listings**: each Executable File's Listing, with its renames and comments, generated in the
 *   Listing worker when no pane has made it.
 * - **Pseudocode**: every function of each Executable but its PLT stubs, from the Pseudocode
 *   search cache, which decompiles them in the background while the panel is shown with
 *   Pseudocode ticked: at once for an Executable of up to {@link AUTO_DECOMPILE_LIMIT} functions,
 *   on the first query for a larger one, and stopped by Cancel, by unticking Pseudocode or by
 *   closing the panel, keeping what was done.
 *
 * A query is searched {@link SEARCH_TYPING_DELAY_MS} after typing stops; a change to the documents
 * (a File edited, a Listing made again after a rename, a function decompiled) searches the same
 * query again, at most every {@link REFRESH_DELAY_MS}, its results replacing the last ones when it
 * is done rather than streaming over them. A query past the time limit is not searched again on
 * its own.
 */

/**
 * An Executable of at most this many functions has its Pseudocode decompiled as soon as the panel
 * shows with Pseudocode ticked; a larger one, such as a static program's 1,089, once there is a
 * query (open question 4).
 */
export const AUTO_DECOMPILE_LIMIT = 1_000
/** How often a change to the documents searches the query again, at most. */
export const REFRESH_DELAY_MS = 200

/** How the last search went, as the panel says it. */
export type SearchStatus =
    /** No query. */
    | 'idle'
    /** A query being searched, its results streaming in. */
    | 'searching'
    | 'complete'
    /** Past the time limit: "Search stopped after 2 seconds", with the results found before. */
    | 'timedOut'
    /** A regular expression that does not compile: `problem` says why. */
    | 'invalid'
    /** The worker failed: `problem` says how. */
    | 'failed'

/** An Executable's Listing as the search reads it, while it is asked for. */
export type SearchedListing = {
    path: string
    file: ProjectFile
    document: ListingDocument
    status: ListingDocument['status']
    listing: Listing | undefined
}

/** What the session gives the search. */
export type ProjectSearchHost = {
    readonly project: Project
    /** The Listings of the session's Executables, which a Target without any has none of. */
    readonly listings: ListingDocuments | undefined
    /** Every function's Pseudocode, decompiled in the background. */
    readonly pseudocode: PseudocodeSearchCache
}

/** A function's Pseudocode as a document to search. */
function pseudocodeDocument(path: string, entry: PseudocodeSearchEntry): SearchDocument {
    return {
        kind: 'pseudocode',
        path,
        function: { address: entry.address, name: entry.name },
        text: entry.text
    }
}

export class ProjectSearch {
    /** The query box's text, searched as it is. */
    text = $state('')
    matchCase = $state(false)
    wholeWord = $state(false)
    regex = $state(false)
    /** "Files to include": comma-separated patterns. */
    include = $state('')
    /** "Files to exclude": comma-separated patterns. */
    exclude = $state('')
    /** Whether the include and exclude boxes are shown. */
    details = $state(false)
    status = $state<SearchStatus>('idle')
    /** Why a query cannot be searched, or how the search failed. */
    problem = $state<string | undefined>()
    /** The documents holding a match, in result order: the last search's, or the one streaming. */
    results = $state.raw<readonly SearchDocumentResult[]>([])
    /**
     * Whether `results` are the query's: a new query's search keeps the last results until its
     * first ones come, which the panel shows dimmed meanwhile.
     */
    resultsCurrent = $state(true)
    /** How many rows a search lists; Show more adds {@link SEARCH_ROW_LIMIT}. */
    maxRows = $state(SEARCH_ROW_LIMIT)
    /** Each Executable's Pseudocode batch, by path, as the cache last reported it. */
    progress = $state.raw<Readonly<Record<string, PseudocodeSearchProgress>>>({})
    /** The Executables whose batch was cancelled, until resumed or the panel closes. */
    readonly cancelled = new SvelteSet<string>()
    /** The Executables whose batch the person started, whatever their size. */
    readonly wanted = new SvelteSet<string>()
    /**
     * The last Ctrl+Shift+F request the panel answered (`WorkbenchUi.searchRequest`), so that a
     * panel drawn again, as the layout changes, does not fill the query with an old selection.
     */
    answeredRequest = 0

    /** Whether the panel is shown, and the documents are kept up to date. */
    private watching = $state(false)
    private client?: ProjectSearchClient
    private current?: Search
    /** Whether the documents changed during the search under way, which is then made again. */
    private stale = false
    private refreshTimer: ReturnType<typeof setTimeout> | undefined
    /** The query and row limit of a search that ran past the time limit, never searched again alone. */
    private timedOutKey: string | undefined
    /** The documents sent to the client, by kind, then id. */
    private readonly documents: Record<SearchDocumentKind, Map<string, SearchDocument>> = {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- What the search worker was sent; nothing renders from it.
        file: new Map(),
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- What the search worker was sent; nothing renders from it.
        listing: new Map(),
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- What the search worker was sent; nothing renders from it.
        pseudocode: new Map()
    }
    /**
     * The Listing each Executable's Listing is searched as, the last ready one while it is made
     * again; each result keeps the one it was found in (`SearchDocumentInfo.listing`).
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Read as the documents are sent; nothing renders from it.
    private readonly searchedListings = new Map<string, Listing>()
    /** The Executables given to the Pseudocode cache. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Bookkeeping for the cache's `forget`; nothing renders from it.
    private readonly known = new Set<string>()
    /** The version of each Executable the panel last started a batch for. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Bookkeeping for `drive`; nothing renders from it.
    private readonly started = new Map<string, { file: ProjectFile; listing: Listing }>()
    private unsubscribe?: () => void
    private disposed = false

    constructor(
        private readonly host: ProjectSearchHost,
        private readonly createClient: () => ProjectSearchClient = () => new ProjectSearchClient()
    ) {}

    /** The query as the client takes it. */
    get query(): SearchQuery {
        return {
            text: this.text,
            matchCase: this.matchCase,
            wholeWord: this.wholeWord,
            regex: this.regex,
            include: this.include,
            exclude: this.exclude
        }
    }

    /** What the results add up to: "12 matches in 3 Files". */
    readonly totals: SearchTotals = $derived(searchTotals(this.results))

    /**
     * The Project's Executables, by path, in an x86 Project, the one Target with Listings; the
     * Listings and Pseudocode ticks are offered only while there is one.
     */
    readonly executables: readonly string[] = $derived.by(() => {
        const { project } = this.host
        if (project.language !== 'X86' || !this.host.listings) return []
        return Object.keys(project.files)
            .filter((path) => executableKind(project.files[path]) === 'supported')
            .sort()
    })

    /** The "Look in" ticks, as the person left them. */
    get lookIn(): SearchLookIn {
        return workbenchLayout.values.searchLookIn
    }

    setLookIn(kind: keyof SearchLookIn, ticked: boolean) {
        workbenchLayout.setSearchLookIn(kind, ticked)
    }

    /** Whether a kind of document is searched: ticked, and offered in this Project. */
    looksIn(kind: keyof SearchLookIn): boolean {
        return this.lookIn[kind] && (kind === 'files' || this.executables.length > 0)
    }

    /**
     * Each Executable's Listing, while the panel is shown and Listings or Pseudocode is ticked,
     * which generates those no pane has made. Asked for apart from reading their state: a derived
     * does not depend on the state of a document it made.
     */
    private readonly requestedListings = $derived.by(() => {
        const listings = this.host.listings
        if (!this.watching || !listings) return []
        if (!this.looksIn('listings') && !this.looksIn('pseudocode')) return []
        const files = this.host.project.files
        return this.executables.flatMap((path) => {
            const file = files[path]
            const document = listings.openExecutable(path, file)
            return document ? [{ path, file, document }] : []
        })
    })

    /** The Listings asked for, with their state. */
    readonly listings: readonly SearchedListing[] = $derived(
        this.requestedListings.map(({ path, file, document }) => ({
            path,
            file,
            document,
            status: document.status,
            listing: document.listing
        }))
    )

    /** Whether there is a query, which starts the batches of the larger Executables. */
    private readonly querying = $derived(this.text !== '')

    /**
     * Keeps the documents up to date and searches while the panel is shown: from its effect, which
     * calls what this returns as it hides. Hiding stops the Pseudocode batches, keeping what they
     * decompiled, and the results stay for when it shows again.
     */
    watch(): () => void {
        if (this.disposed) return () => {}
        this.client ??= this.createClient()
        this.unsubscribe ??= this.host.pseudocode.subscribe((change) => this.cacheChanged(change))
        this.watching = true
        let first = true
        const stop = $effect.root(() => {
            $effect(() => {
                const docs: SearchDocument[] = []
                if (this.looksIn('files')) {
                    const { files, language } = this.host.project
                    for (const [path, file] of Object.entries(files))
                        if (isTextFile(file, language, path))
                            docs.push({ kind: 'file', path, text: file.content })
                }
                untrack(() => this.replace('file', docs))
            })
            $effect(() => {
                const on = this.looksIn('listings')
                const states = this.listings
                untrack(() => {
                    const docs: SearchDocument[] = []
                    for (const { path, status, listing } of states) {
                        //one made again (a rename, a comment, a Byte edit) is searched as it was
                        //until it is ready
                        const searched =
                            status === 'ready'
                                ? listing
                                : status === 'generating'
                                  ? this.searchedListings.get(path)
                                  : undefined
                        if (!searched) continue
                        this.searchedListings.set(path, searched)
                        if (on)
                            docs.push({
                                kind: 'listing',
                                path,
                                text: searched.text,
                                listing: searched
                            })
                    }
                    for (const path of [...this.searchedListings.keys()])
                        if (!states.some((state) => state.path === path))
                            this.searchedListings.delete(path)
                    this.replace('listing', docs)
                })
            })
            $effect(() => {
                const on = this.looksIn('pseudocode')
                const paths = this.executables
                untrack(() => {
                    const cache = this.host.pseudocode
                    const docs = on
                        ? paths.flatMap((path) =>
                              cache.entries(path).map((entry) => pseudocodeDocument(path, entry))
                          )
                        : []
                    this.replace('pseudocode', docs)
                })
            })
            $effect(() => {
                const on = this.looksIn('pseudocode')
                const querying = this.querying
                const states = this.listings
                const held = [...this.cancelled]
                const wanted = [...this.wanted]
                const paths = this.executables
                untrack(() => this.drive(on, querying, states, held, wanted, paths))
            })
            $effect(() => {
                //every part of the query, which a change to searches again
                const query = this.query
                untrack(() => {
                    if (!first) this.maxRows = SEARCH_ROW_LIMIT
                    this.run(first || !query.text ? 'now' : 'typing')
                    first = false
                })
            })
        })
        return () => {
            stop()
            this.watching = false
            clearTimeout(this.refreshTimer)
            this.refreshTimer = undefined
            this.host.pseudocode.stop()
            this.started.clear()
            this.cancelled.clear()
            this.wanted.clear()
        }
    }

    /** Searches the query again with {@link SEARCH_ROW_LIMIT} more rows. */
    showMore() {
        this.maxRows += SEARCH_ROW_LIMIT
        this.run('now')
    }

    /** Cancel: stops an Executable's batch, keeping what it decompiled. */
    cancel(path: string) {
        this.cancelled.add(path)
        this.wanted.delete(path)
        this.started.delete(path)
        this.host.pseudocode.stop(path)
    }

    /** Starts an Executable's batch again, or for the first time for a large one. */
    decompile(path: string) {
        this.cancelled.delete(path)
        this.started.delete(path)
        this.wanted.add(path)
    }

    /** Try again: decompiles a function not searched again, first. */
    retry(path: string, address: number) {
        this.cancelled.delete(path)
        this.host.pseudocode.retry(path, address)
    }

    /** Ends the worker and forgets the documents, as the Workbench session ends. */
    dispose() {
        this.disposed = true
        clearTimeout(this.refreshTimer)
        this.current?.cancel()
        this.current = undefined
        this.unsubscribe?.()
        this.client?.dispose()
        this.client = undefined
    }

    /**
     * Gives the Pseudocode cache each ready Listing, and starts the batches the panel wants: an
     * Executable's once per version of it, unless cancelled, and a large one's only with a query
     * or when asked for.
     */
    private drive(
        on: boolean,
        querying: boolean,
        states: readonly SearchedListing[],
        cancelled: readonly string[],
        wanted: readonly string[],
        paths: readonly string[]
    ) {
        const cache = this.host.pseudocode
        for (const path of [...this.known])
            if (!paths.includes(path)) {
                cache.forget(path)
                this.known.delete(path)
                this.started.delete(path)
            }
        if (!on) {
            cache.stop()
            this.started.clear()
            return
        }
        for (const { path, file, status, listing } of states) {
            if (status !== 'ready' || !listing) continue
            cache.update(path, file, listing)
            this.known.add(path)
            const total = cache.progress(path)?.total ?? 0
            if (cancelled.includes(path)) continue
            if (!querying && !wanted.includes(path) && total > AUTO_DECOMPILE_LIMIT) continue
            const begun = this.started.get(path)
            if (begun?.file === file && begun.listing === listing) continue
            this.started.set(path, { file, listing })
            cache.start(path, file, listing)
        }
    }

    /** Makes a kind's documents exactly these, sending the client what changed. */
    private replace(kind: SearchDocumentKind, docs: readonly SearchDocument[]) {
        const client = this.client
        if (!client) return
        const known = this.documents[kind]
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A local lookup, gone when this returns.
        const next = new Map(docs.map((doc) => [searchDocumentId(doc), doc]))
        const gone = [...known.keys()].filter((id) => !next.has(id))
        const changed = [...next].filter(([id, doc]) => !sameDocument(known.get(id), doc))
        if (!gone.length && !changed.length) return
        for (const id of gone) known.delete(id)
        for (const [id, doc] of changed) known.set(id, doc)
        if (gone.length) client.remove(gone)
        if (changed.length) client.put(changed.map(([, doc]) => doc))
        this.documentsChanged()
    }

    /** The cache's changes: functions decompiled or rewritten, gone, and each batch's progress. */
    private cacheChanged(change: PseudocodeSearchChange) {
        if (change.type === 'progress') {
            this.progress = { ...this.progress, [change.progress.path]: change.progress }
            return
        }
        const client = this.client
        if (!client || !untrack(() => this.looksIn('pseudocode'))) return
        const known = this.documents.pseudocode
        if (change.type === 'removed') {
            const ids = change.addresses
                .map((address) =>
                    searchDocumentId({
                        kind: 'pseudocode',
                        path: change.path,
                        function: { address, name: '' }
                    })
                )
                .filter((id) => known.delete(id))
            if (ids.length) {
                client.remove(ids)
                this.documentsChanged()
            }
            return
        }
        const docs = change.entries.map((entry) => pseudocodeDocument(change.path, entry))
        for (const doc of docs) known.set(searchDocumentId(doc), doc)
        client.put(docs)
        this.documentsChanged()
    }

    /** The documents changed: the query is searched again, once the search under way is done. */
    private documentsChanged() {
        if (!this.watching || !untrack(() => this.text)) return
        if (this.current) this.stale = true
        else this.scheduleRefresh()
    }

    private scheduleRefresh() {
        if (this.refreshTimer !== undefined) return
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined
            if (this.watching && !this.disposed) this.run('refresh')
        }, REFRESH_DELAY_MS)
    }

    /**
     * Searches the query: after the typing delay, at once, or again for changed documents, the
     * last results then staying until the new ones are complete.
     */
    private run(mode: 'typing' | 'now' | 'refresh') {
        const client = this.client
        if (!client || this.disposed) return
        clearTimeout(this.refreshTimer)
        this.refreshTimer = undefined
        this.stale = false
        const query = this.query
        if (!query.text) {
            this.current?.cancel()
            this.current = undefined
            this.results = []
            this.resultsCurrent = true
            this.status = 'idle'
            this.problem = undefined
            return
        }
        const key = JSON.stringify([query, this.maxRows])
        if (mode === 'refresh' && this.status === 'timedOut' && this.timedOutKey === key) return
        const fresh = mode !== 'refresh'
        let streamed = false
        const search: Search = client.search(query, {
            delayMs: mode === 'typing' ? SEARCH_TYPING_DELAY_MS : 0,
            maxRows: this.maxRows,
            ...(fresh
                ? {
                      onResults: (batch: readonly SearchDocumentResult[]) => {
                          if (this.current !== search) return
                          this.results = streamed ? [...this.results, ...batch] : [...batch]
                          this.resultsCurrent = true
                          streamed = true
                      }
                  }
                : {})
        })
        this.current = search
        if (fresh) {
            this.status = 'searching'
            this.problem = undefined
            this.resultsCurrent = false
        }
        void search.done.then((outcome) => this.finish(search, outcome, key))
    }

    private finish(search: Search, outcome: SearchOutcome, key: string) {
        if (this.current !== search) return
        this.current = undefined
        if (outcome.status !== 'cancelled') this.resultsCurrent = true
        switch (outcome.status) {
            case 'cancelled':
                return
            case 'complete':
                this.results = outcome.results
                this.status = 'complete'
                this.problem = undefined
                break
            case 'timedOut':
                this.results = outcome.results
                this.status = 'timedOut'
                this.timedOutKey = key
                this.problem = undefined
                break
            case 'invalid':
                this.results = []
                this.status = 'invalid'
                this.problem = outcome.problem
                break
            case 'failed':
                this.status = 'failed'
                this.problem = outcome.message
                break
        }
        if (this.stale) {
            this.stale = false
            this.scheduleRefresh()
        }
    }
}

/**
 * Whether a File is text the panel searches, as a pane shows it: stored as text, and neither a
 * PDF written in ASCII nor, in an x86 Project, an Executable stored as text.
 */
function isTextFile(file: ProjectFile, language: AvailableLanguages, path: string): boolean {
    if (file.encoding !== 'plain') return false
    const kind = fileKind(file, language, path)
    return kind === 'text' || kind === 'markdown'
}

function sameDocument(left: SearchDocument | undefined, right: SearchDocument): boolean {
    return (
        left !== undefined &&
        left.text === right.text &&
        left.function?.name === right.function?.name
    )
}
