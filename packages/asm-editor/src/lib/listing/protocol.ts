import type { Listing, ListingAnnotations, ListingNameVersion } from './listing'

/** What the editor asks the Listing worker for: one Listing of one ELF. */
export type ListingRequest = {
    type: 'generate'
    /** Chosen by the client, so responses find their request. */
    id: number
    bytes: Uint8Array
    /** For the header: the Executable's File name, or a library's soname. */
    name: string
    /** The load base the text's addresses are shifted by; see `ListingInput.base`. */
    base: number
    version: ListingNameVersion
    /** An Executable File's Annotations, which its Listing is generated with. */
    annotations?: ListingAnnotations
}

export type ListingResponse =
    /**
     * The worker's first message, once its listener exists: a request posted before it has
     * nothing listening for it yet, so the client holds requests until it arrives.
     */
    | { type: 'ready' }
    /** Sent only for a Listing that takes long enough for a person to wait on it. */
    | { type: 'progress'; id: number; fraction: number }
    | { type: 'listing'; id: number; listing: Listing }
    /**
     * `listing` when the bytes cannot be listed (a `ListingError`), which the same bytes would
     * meet again; anything else may not happen next time.
     */
    | { type: 'failure'; id: number; message: string; listing: boolean }
