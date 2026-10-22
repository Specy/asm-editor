import ListingWorker from './listing.worker?worker'
import {
    ListingError,
    type Listing,
    type ListingAnnotations,
    type ListingNameVersion
} from './listing'
import type { ListingRequest, ListingResponse } from './protocol'

/**
 * How long a worker with requests in hand may say nothing (no progress, no answer) before it is
 * taken for dead: a worker killed for memory may never send its error. libc's Listing, the
 * longest, reports progress every few hundred milliseconds.
 */
export const LISTING_WORKER_SILENCE_MS = 30_000
/** How long a worker with nothing to do is kept before it is ended, freeing its memory. */
export const LISTING_WORKER_IDLE_MS = 30_000

export type ListingOrder = {
    bytes: Uint8Array
    /** For the header: the Executable's File name, or a library's soname. */
    name: string
    /** See `ListingInput.base`. */
    base: number | bigint
    version?: ListingNameVersion
    /**
     * An Executable File's renames and comments, by link-time address
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
     * decisions 6 to 12); a library's Listing takes none.
     */
    annotations?: ListingAnnotations
    /** From 0 to 1, only for a Listing that takes long enough to show progress for. */
    onProgress?: (fraction: number) => void
}

type Pending = {
    resolve(listing: Listing): void
    reject(error: Error): void
    onProgress?: (fraction: number) => void
}

type WorkerConstructor = new () => Worker

/**
 * The editor's side of the Listing worker: one worker, started on the first request and ended
 * once it has had nothing to do for a while, since the editor keeps the Listings it shows
 * (`ListingDocuments`) and the worker keeps none. A worker that errors, or that falls silent with
 * requests in hand, fails them and is replaced at the next request. Where there is no `Worker`
 * (tests, prerendering) the Listing is generated on the calling thread instead.
 */
type WorkerState = {
    worker: Worker
    /** Whether it has announced its listener; until then requests are held, in order. */
    ready: boolean
    held: [ListingRequest, Transferable[]][]
}

type ClientOptions = { silenceMs?: number; idleMs?: number }

export class ListingClient {
    private state?: WorkerState
    private pending = new Map<number, Pending>()
    private nextId = 1
    private watchdog: ReturnType<typeof setTimeout> | undefined
    private idle: ReturnType<typeof setTimeout> | undefined
    private readonly silenceMs: number
    private readonly idleMs: number

    constructor(
        private readonly WorkerClass: WorkerConstructor | undefined = ListingWorker,
        options: ClientOptions = {}
    ) {
        this.silenceMs = options.silenceMs ?? LISTING_WORKER_SILENCE_MS
        this.idleMs = options.idleMs ?? LISTING_WORKER_IDLE_MS
    }

    generate(order: ListingOrder): Promise<Listing> {
        const version = order.version ?? 'v1'
        if (typeof Worker === 'undefined' || !this.WorkerClass)
            return this.generateHere(order, version)
        const bytes = order.bytes.slice()
        const request: ListingRequest = {
            type: 'generate',
            id: this.nextId++,
            bytes,
            name: order.name,
            base: Number(order.base),
            version,
            ...(order.annotations ? { annotations: order.annotations } : {})
        }
        return new Promise<Listing>((resolve, reject) => {
            this.pending.set(request.id, { resolve, reject, onProgress: order.onProgress })
            this.post(request, [bytes.buffer])
            this.heard()
        })
    }

    /**
     * The worker said something, or was given something to do: it has until the watchdog fires
     * to say more while requests wait, and is ended once none do for a while.
     */
    private heard() {
        clearTimeout(this.watchdog)
        clearTimeout(this.idle)
        const state = this.state
        if (!state) return
        if (this.pending.size)
            this.watchdog = setTimeout(
                () =>
                    this.fail(
                        state,
                        'The Listing could not be generated: its worker stopped answering'
                    ),
                this.silenceMs
            )
        else this.idle = setTimeout(() => this.end(state), this.idleMs)
    }

    private answer(
        id: number,
        pending: Pending,
        response: Exclude<ListingResponse, { type: 'ready' }>
    ) {
        if (response.type === 'progress') return pending.onProgress?.(response.fraction)
        this.pending.delete(id)
        if (response.type === 'listing') pending.resolve(response.listing)
        //bytes that cannot be listed fail for good; anything else may not happen again
        else
            pending.reject(
                response.listing ? new ListingError(response.message) : new Error(response.message)
            )
    }

    /** Ends a worker, so the next request starts a fresh one. */
    private end(state: WorkerState) {
        if (this.state !== state) return
        clearTimeout(this.watchdog)
        clearTimeout(this.idle)
        state.worker.terminate()
        this.state = undefined
    }

    /** Fails every request waiting on a worker that died or fell silent, and ends it. */
    private fail(state: WorkerState, message: string) {
        if (this.state !== state) return
        this.end(state)
        const waiting = [...this.pending.values()]
        this.pending.clear()
        for (const pending of waiting) pending.reject(new Error(message))
    }

    private async generateHere(order: ListingOrder, version: ListingNameVersion) {
        const [{ loadDecoder }, { generateListing }, { demanglerFor }] = await Promise.all([
            import('./decoder'),
            import('./generateListing'),
            import('./listingService')
        ])
        const decoder = await loadDecoder()
        const analysis = decoder.analyze(order.bytes)
        const demangler = await demanglerFor(analysis)
        return generateListing(decoder, { ...order, version, analysis, demangler })
    }

    private post(request: ListingRequest, transfer: Transferable[]) {
        const state = this.state ?? this.start()
        if (state.ready) state.worker.postMessage(request, transfer)
        else state.held.push([request, transfer])
    }

    private start(): WorkerState {
        const worker = new this.WorkerClass!()
        const state: WorkerState = { worker, ready: false, held: [] }
        this.state = state
        worker.addEventListener('message', (event: MessageEvent<ListingResponse>) => {
            if (this.state !== state) return
            const response = event.data
            if (response.type === 'ready') {
                state.ready = true
                for (const [request, transfer] of state.held.splice(0))
                    worker.postMessage(request, transfer)
                this.heard()
                return
            }
            const pending = this.pending.get(response.id)
            if (pending) this.answer(response.id, pending, response)
            this.heard()
        })
        // A worker that fails to load or dies answers nothing: fail what waits on it, and let the
        // next request start a fresh one.
        worker.addEventListener('error', (event) =>
            this.fail(
                state,
                `The Listing could not be generated: ${event.message || 'its worker failed to start'}`
            )
        )
        worker.addEventListener('messageerror', () =>
            this.fail(
                state,
                'The Listing could not be generated: its worker sent an unreadable message'
            )
        )
        return state
    }
}

export const listingClient = new ListingClient()
