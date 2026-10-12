import ListingWorker from './listing.worker?worker'
import type { Listing, ListingNameVersion } from './listing'
import type { ListingRequest, ListingResponse } from './protocol'

export type ListingOrder = {
    bytes: Uint8Array
    /** For the header: the Executable's File name, or a library's soname. */
    name: string
    /** See `ListingInput.base`. */
    base: number | bigint
    version?: ListingNameVersion
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
 * The editor's side of the Listing worker: one worker for the session, started on the first
 * request and kept, since it holds the Listings it has made. Where there is no `Worker` (tests,
 * prerendering) the Listing is generated on the calling thread instead.
 */
type WorkerState = {
    worker: Worker
    /** Whether it has announced its listener; until then requests are held, in order. */
    ready: boolean
    held: [ListingRequest, Transferable[]][]
}

export class ListingClient {
    private state?: WorkerState
    private pending = new Map<number, Pending>()
    private nextId = 1

    constructor(private readonly WorkerClass: WorkerConstructor | undefined = ListingWorker) {}

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
            version
        }
        return new Promise<Listing>((resolve, reject) => {
            this.pending.set(request.id, { resolve, reject, onProgress: order.onProgress })
            this.post(request, [bytes.buffer])
        })
    }

    private async generateHere(order: ListingOrder, version: ListingNameVersion) {
        const [{ loadDecoder }, { generateListing }] = await Promise.all([
            import('./decoder'),
            import('./generateListing')
        ])
        return generateListing(await loadDecoder(), { ...order, version })
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
                return
            }
            const pending = this.pending.get(response.id)
            if (!pending) return
            if (response.type === 'progress') return pending.onProgress?.(response.fraction)
            this.pending.delete(response.id)
            if (response.type === 'listing') pending.resolve(response.listing)
            else pending.reject(new Error(response.message))
        })
        // A worker that fails to load or dies answers nothing: fail what waits on it, and let the
        // next request start a fresh one.
        const fail = (message: string) => {
            if (this.state !== state) return
            worker.terminate()
            this.state = undefined
            const waiting = [...this.pending.values()]
            this.pending.clear()
            for (const pending of waiting) pending.reject(new Error(message))
        }
        worker.addEventListener('error', (event) =>
            fail(
                `The Listing could not be generated: ${event.message || 'its worker failed to start'}`
            )
        )
        worker.addEventListener('messageerror', () =>
            fail('The Listing could not be generated: its worker sent an unreadable message')
        )
        return state
    }
}

export const listingClient = new ListingClient()
