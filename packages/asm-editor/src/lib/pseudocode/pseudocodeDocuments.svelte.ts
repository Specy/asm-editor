import type { DecompiledLine, DecompiledVariable } from '@specy/decompiler'
import type { FunctionAnnotations } from '#lib/annotations/annotations.ts'
import type { Listing, ListingFunction } from '#lib/listing/listing.ts'
import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { functionAnnotations, functionAnnotationsKey } from './pseudocodeAnnotations'
import {
    PseudocodeClient,
    type PseudocodeOptions,
    type PseudocodeResult,
    type PseudocodeStage
} from './pseudocodeClient'
import { pseudocodeMap, type PseudocodeMap } from './pseudocodeMap'
import { PseudocodeSearchCache } from './pseudocodeSearchCache'

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
    /**
     * The function's local variables and parameters, as the decompiler reports them, each with
     * its id, which its names' tokens carry (`DecompiledToken.variable`), and the name printed:
     * the person's where they named it ({@link annotations}).
     */
    variables = $state.raw<readonly DecompiledVariable[]>([])
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
        /**
         * What it is decompiled with of the File's Annotations, at link-time addresses: the
         * person's names for its variables, its line comments and its function comment
         * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
         * decisions 13 to 16).
         */
        readonly annotations: FunctionAnnotations,
        decompile: Decompile,
        /**
         * The names the decompiler gives the function's variables, by id, as far as any of its
         * decompilations from the same bytes printed them: each settled document adds those it
         * printed of the variables the person did not name. Shared by those documents, so a
         * renamed variable's hover and prompt can say what it was called.
         */
        readonly defaultNames: Map<string, string>
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
        //a C++ function by its short name, as lists show it (cpp-demangling.md, decision 11)
        const header = `// ${fn.list ?? fn.name}, 0x${first.toString(16)} to 0x${last.toString(16)}`
        this.lines = result.lines
        this.variables = result.variables
        const { locals } = this.annotations
        for (const variable of result.variables)
            if (!locals.some((local) => local.id === variable.id))
                this.defaultNames.set(variable.id, variable.name)
        this.map = pseudocodeMap(listing, fn, result.lines, this.firstLine)
        this.text = `${header}\n\n${result.text}\n`
        this.status = 'ready'
    }
}

/** How many documents are kept beside those shown: a function read again is shown at once. */
const KEPT_DOCUMENTS = 24
/** How many functions' default variable names are kept. */
const KEPT_DEFAULT_NAMES = 256

/**
 * The Pseudocode documents of one Workbench session and the one client of its Pseudocode
 * worker (plan decision 8), made with the first document, so that the decompiler package is
 * loaded only once something is decompiled; and the Search panel's cache of every function's
 * Pseudocode, decompiled through the same client in the background
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 28).
 */
export class PseudocodeDocuments {
    private client?: PseudocodeClient
    /**
     * Every function's Pseudocode of the session's Executables, as text, for the Search panel:
     * decompiled at background priority while it runs, so a pane's requests come first.
     */
    readonly search: PseudocodeSearchCache
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A cache read by `open`; what is shown is tracked through each document's own state.
    private readonly documents = new Map<string, PseudocodeDocument>()
    /**
     * The decompiler's names for each function's variables, by path and function, for the bytes
     * they were printed from (see `PseudocodeDocument.defaultNames`); the oldest forgotten past
     * {@link KEPT_DEFAULT_NAMES}.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Read by hovers and prompts when asked; nothing renders from it.
    private readonly defaultNames = new Map<
        string,
        { content: string; names: Map<string, string> }
    >()
    /** A short number for each Listing document, which the documents' keys name. */
    private readonly listingIds = new WeakMap<ListingDocument, number>()
    private nextListingId = 0
    /** The paths whose program the worker may hold open, until no pane shows their Pseudocode. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Bookkeeping for `retain`; nothing renders from it.
    private readonly paths = new Set<string>()
    /** Bumped by `retry`, so that what shows a failed document opens it again. */
    private revision = $state(0)
    /** Set by `dispose`: a pane's derived state read after the session ended starts no worker. */
    private disposed = false

    constructor(
        private readonly createClient: () => PseudocodeClient = () => new PseudocodeClient()
    ) {
        this.search = new PseudocodeSearchCache(() =>
            this.disposed ? undefined : this.decompiler()
        )
    }

    /**
     * The Pseudocode of a function of a Listing made from `file`, the File shown at `path`: the
     * one made before when there is one, else a new one, decompiled from here on. It takes the
     * function's part of the Annotations of `annotated`, the File itself by default (a Debug
     * session's may be the live File's while the bytes are its Build's), so a rename of one of its
     * locals or a comment in it makes another document, decompiled again (decision 22).
     */
    open(
        path: string,
        file: ProjectFile,
        listingDocument: ListingDocument,
        fn: ListingFunction,
        annotated: Pick<ProjectFile, 'annotations'> = file
    ): PseudocodeDocument | undefined {
        void this.revision
        const listing = listingDocument.listing
        if (!listing || this.disposed) return undefined
        const own = functionAnnotations(annotated.annotations, fn.address, fn.end)
        const key = `${this.listingId(listingDocument)}\0${path}\0${fn.address}\0${functionAnnotationsKey(own)}`
        let document = this.documents.get(key)
        if (document) this.documents.delete(key)
        if (!document || document.aborted) {
            document = new PseudocodeDocument(
                path,
                listingDocument,
                listing,
                fn,
                own,
                (options) =>
                    this.decompiler().decompile(path, file, listing, fn.address, {
                        ...options,
                        annotations: own
                    }),
                this.defaultNamesOf(path, file, fn.address)
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

    /** Ends the worker and forgets every document and the search's cache, as the Workbench session ends. */
    dispose(): void {
        this.disposed = true
        this.search.dispose()
        for (const document of this.documents.values()) document.abort()
        this.documents.clear()
        this.paths.clear()
        this.client?.dispose()
        this.client = undefined
    }

    private decompiler(): PseudocodeClient {
        return (this.client ??= this.createClient())
    }

    /** The names the decompiler gives the variables of the function at `address` of these bytes. */
    private defaultNamesOf(path: string, file: ProjectFile, address: number): Map<string, string> {
        const key = `${path}\0${address}`
        let kept = this.defaultNames.get(key)
        if (kept?.content !== file.content) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Filled as documents settle; read when a hover or prompt asks.
            kept = { content: file.content, names: new Map() }
            this.defaultNames.set(key, kept)
            if (this.defaultNames.size > KEPT_DEFAULT_NAMES)
                this.defaultNames.delete(this.defaultNames.keys().next().value!)
        }
        return kept.names
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
