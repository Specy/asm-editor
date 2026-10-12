import { SvelteMap } from 'svelte/reactivity'
import { executableAnalysis, executableKind } from '#lib/executables.ts'
import { fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
import type { Listing } from './listing'
import type { ListingOrder } from './listingClient'
import { plannedLoadBase } from './listingPaths'

/**
 * The Listings the editor shows, as documents: one per ELF's bytes and load base, generated in the
 * Listing worker when first asked for and never saved
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decisions 5 and 18). Where
 * each is shown is in `listingPaths.ts`.
 */

export type ListingDocumentStatus = 'generating' | 'ready' | 'failed'

type Generate = (order: ListingOrder) => Promise<Listing>

/** One Listing being generated or shown, with the bytes it was made from for the hover. */
export class ListingDocument {
    status = $state<ListingDocumentStatus>('generating')
    /** From 0 to 1, once the worker reports progress, which it does for a long Listing only. */
    progress = $state<number | undefined>()
    listing = $state.raw<Listing | undefined>()
    error = $state<string | undefined>()
    /** Settles when the Listing is ready; rejects when it cannot be generated. */
    readonly ready: Promise<Listing>

    constructor(
        /** The header's name: the Executable's File name, or the library's soname. */
        readonly name: string,
        /** What its link-time addresses are shifted by when the program runs. */
        readonly base: number,
        readonly bytes: Uint8Array,
        generate: Generate
    ) {
        this.ready = generate({
            bytes,
            name,
            base,
            onProgress: (fraction) => {
                this.progress = fraction
            }
        }).then(
            (listing) => {
                this.listing = listing
                this.status = 'ready'
                return listing
            },
            (error: unknown) => {
                this.error = error instanceof Error ? error.message : String(error)
                this.status = 'failed'
                throw error
            }
        )
        //a failure is shown through `status`; nobody has to wait on it for it to be handled
        this.ready.catch(() => undefined)
    }
}

export type ListingDocumentOrder = {
    name: string
    base: number
    /** Identifies the bytes: a File's content, or a bundled library's path in the Core. */
    content: string
    /** Reads the bytes, called only when the Listing has not been made yet. */
    bytes: () => Uint8Array
}

/** How many Listings are kept: libc's alone takes tens of megabytes. */
const KEPT_DOCUMENTS = 8

/**
 * The Listing documents of one Workbench session: those of Executables, generated whenever one is
 * shown, and, in `session`, those of what the running program loaded, which a Debug session's
 * current line, Breakpoints and navigation use and which go with the session.
 */
export class ListingDocuments {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A cache read by `open`; what is shown is tracked through each document's own state.
    private readonly documents = new Map<string, ListingDocument>()
    /**
     * A number for each content string, so a document's key is short: a File's content can be
     * megabytes, and a key made by concatenating it would be copied out whole on every lookup.
     * The same string object is hashed once, and a Project's File keeps its content string.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Key material for `documents`; it has no tracked consumer.
    private readonly contentIds = new Map<string, number>()
    private nextContentId = 0
    /**
     * The Listings of the running program, by the path they are shown at: its Executable's and
     * each library's it has executed code of. Cleared when the Debug session ends.
     */
    readonly session = new SvelteMap<string, ListingDocument>()

    constructor(private readonly generate: Generate) {}

    /**
     * The document of these bytes at this base, the one made before when there is one. A failed
     * Listing stays failed: the same bytes would fail again.
     */
    open(order: ListingDocumentOrder): ListingDocument {
        const key = `${order.base}\0${order.name}\0${this.contentId(order.content)}`
        let document = this.documents.get(key)
        if (document) this.documents.delete(key)
        else document = new ListingDocument(order.name, order.base, order.bytes(), this.generate)
        this.documents.set(key, document)
        if (this.documents.size > KEPT_DOCUMENTS)
            this.documents.delete(this.documents.keys().next().value!)
        return document
    }

    /**
     * The Listing an Executable File is shown as outside its run: at the address it will be loaded
     * at, named after the File. Undefined for a File that is no Executable.
     */
    openExecutable(path: string, file: ProjectFile | undefined): ListingDocument | undefined {
        if (!file || executableKind(file) !== 'supported') return undefined
        return this.open({
            name: path.slice(path.lastIndexOf('/') + 1),
            base: plannedLoadBase(executableAnalysis(file).pie),
            content: file.content,
            bytes: () => fileBytes(file)
        })
    }

    private contentId(content: string): number {
        let id = this.contentIds.get(content)
        if (id === undefined) {
            //ids are never reused, so forgetting them only costs a document found again
            if (this.contentIds.size >= 4 * KEPT_DOCUMENTS) this.contentIds.clear()
            id = ++this.nextContentId
            this.contentIds.set(content, id)
        }
        return id
    }
}
