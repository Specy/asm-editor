import type { DecompiledLine } from '@specy/decompiler'
import type { Listing, ListingFunction } from '#lib/listing/listing.ts'
import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import {
    PseudocodeClient,
    type PseudocodeOptions,
    type PseudocodeResult,
    type PseudocodeStage
} from './pseudocodeClient'
import { pseudocodeMap, type PseudocodeMap } from './pseudocodeMap'

/**
 * The Pseudocode the editor shows, as documents: one per function of a Listing, decompiled in
 * the Pseudocode worker when first shown and never saved
 * ([ADR 0048](../../../../../docs/adr/0048-decompiled-code-is-a-view-not-a-file.md)). A pane
 * shows one function's at a time, the one the Listing beside it is in
 * ([file-views.md](../../../../../docs/design/file-views.md), decision 6).
 */

export type PseudocodeDocumentStatus = 'decompiling' | 'ready' | 'failed'

/** How many lines the header takes, with the blank line after it, before the decompiler's. */
export const PSEUDOCODE_HEADER_LINES = 2

type Decompile = (options: PseudocodeOptions) => Promise<PseudocodeResult>

/** One function's Pseudocode, being decompiled or shown, with its map to the Listing. */
export class PseudocodeDocument {
    status = $state<PseudocodeDocumentStatus>('decompiling')
    /** What the request waits on: the decompiler loading, then the decompilation. */
    stage = $state<PseudocodeStage | undefined>()
    /** The document's text: the header naming the function, then the decompiler's. */
    text = $state('')
    lines = $state.raw<readonly DecompiledLine[]>([])
    map = $state.raw<PseudocodeMap | undefined>()
    /** Why there is none: the decompiler's own message, or why it did not answer. */
    error = $state<string | undefined>()
    /** The document line of the decompiler's first line. */
    readonly firstLine = PSEUDOCODE_HEADER_LINES
    private readonly controller = new AbortController()

    constructor(
        /** The Executable's path, whose program the worker keeps open while it is shown. */
        readonly path: string,
        /** The Listing it pairs with, made from the same bytes. */
        readonly listingDocument: ListingDocument,
        readonly listing: Listing,
        readonly fn: ListingFunction,
        decompile: Decompile
    ) {
        //once whatever made it has settled: a stage may be reported at once, and a document is
        //made while a pane works out what it shows
        queueMicrotask(() => {
            const { signal } = this.controller
            if (signal.aborted) return
            decompile({ signal, onStage: (stage) => (this.stage = stage) }).then(
                (result) => this.settle(result),
                () => undefined
            )
        })
    }

    /** Whether it no longer waits on the decompiler. */
    get aborted() {
        return this.controller.signal.aborted
    }

    /** Stops waiting for the decompiler, which then never starts on it unless it has already. */
    abort() {
        this.controller.abort()
    }

    private settle(result: PseudocodeResult) {
        if ('error' in result) {
            this.error = result.error
            this.status = 'failed'
            return
        }
        const { fn, listing } = this
        const first = fn.address + listing.base
        const last = Math.max(fn.address, fn.end - 1) + listing.base
        const header = `// ${fn.name}, 0x${first.toString(16)} to 0x${last.toString(16)}`
        this.lines = result.lines
        this.map = pseudocodeMap(listing, fn, result.lines, this.firstLine)
        this.text = `${header}\n\n${result.text}\n`
        this.status = 'ready'
    }
}

/** How many documents are kept beside those shown: a function read again is shown at once. */
const KEPT_DOCUMENTS = 24

/**
 * The Pseudocode documents of one Workbench session and the one client of its Pseudocode
 * worker (plan decision 8), made with the first document, so that the decompiler package is
 * loaded only once something is decompiled.
 */
export class PseudocodeDocuments {
    private client?: PseudocodeClient
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A cache read by `open`; what is shown is tracked through each document's own state.
    private readonly documents = new Map<string, PseudocodeDocument>()
    /** A short number for each Listing document, which the documents' keys name. */
    private readonly listingIds = new WeakMap<ListingDocument, number>()
    private nextListingId = 0
    /** The paths whose program the worker may hold open, until no pane shows their Pseudocode. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Bookkeeping for `retain`; nothing renders from it.
    private readonly paths = new Set<string>()
    /** Bumped by `retry`, so that what shows a failed document opens it again. */
    private revision = $state(0)

    constructor(
        private readonly createClient: () => PseudocodeClient = () => new PseudocodeClient()
    ) {}

    /**
     * The Pseudocode of a function of a Listing made from `file`, the File shown at `path`: the
     * one made before when there is one, else a new one, decompiled from here on.
     */
    open(
        path: string,
        file: ProjectFile,
        listingDocument: ListingDocument,
        fn: ListingFunction
    ): PseudocodeDocument | undefined {
        void this.revision
        const listing = listingDocument.listing
        if (!listing) return undefined
        const key = `${this.listingId(listingDocument)}\0${path}\0${fn.address}`
        let document = this.documents.get(key)
        if (document) this.documents.delete(key)
        if (!document || document.aborted) {
            document = new PseudocodeDocument(path, listingDocument, listing, fn, (options) =>
                this.decompiler().decompile(path, file, listing, fn.address, options)
            )
        }
        this.documents.set(key, document)
        this.paths.add(path)
        return document
    }

    /**
     * Keeps what panes show: a document still decompiling that none shows is dropped, so the
     * worker never starts on the functions a cursor passed over, and the program of a path whose
     * Pseudocode no pane shows is closed, giving back its memory in the worker.
     */
    retain(shown: readonly PseudocodeDocument[], paths: readonly string[]): void {
        for (const [key, document] of this.documents)
            if (!shown.includes(document) && document.status === 'decompiling') {
                document.abort()
                this.documents.delete(key)
            }
        let excess = this.documents.size - shown.length - KEPT_DOCUMENTS
        for (const [key, document] of this.documents) {
            if (excess <= 0) break
            if (shown.includes(document)) continue
            this.documents.delete(key)
            excess--
        }
        for (const path of this.paths)
            if (!paths.includes(path)) {
                this.paths.delete(path)
                this.client?.release(path)
            }
    }

    /** Decompiles a failed document again, as "Try again" asks: the next `open` makes it anew. */
    retry(document: PseudocodeDocument): void {
        for (const [key, candidate] of this.documents)
            if (candidate === document) this.documents.delete(key)
        this.revision++
    }

    /** Ends the worker and forgets every document, as the Workbench session ends. */
    dispose(): void {
        for (const document of this.documents.values()) document.abort()
        this.documents.clear()
        this.paths.clear()
        this.client?.dispose()
        this.client = undefined
    }

    private decompiler(): PseudocodeClient {
        return (this.client ??= this.createClient())
    }

    private listingId(document: ListingDocument): number {
        let id = this.listingIds.get(document)
        if (id === undefined) {
            id = ++this.nextListingId
            this.listingIds.set(document, id)
        }
        return id
    }
}
