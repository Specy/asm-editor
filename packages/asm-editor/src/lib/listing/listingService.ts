import { loadDecoder, type ListingDecoder } from './decoder'
import { generateListing } from './generateListing'
import type { Listing } from './listing'
import type { ListingRequest, ListingResponse } from './protocol'

/** A Listing that takes longer than this gets progress reports. */
export const PROGRESS_DELAY_MS = 500
const PROGRESS_INTERVAL_MS = 100
/** Listings kept: an Executable and the libraries a run stepped into, with room to spare. */
const CACHE_SIZE = 16

type ServiceOptions = {
    decoder?: () => Promise<ListingDecoder>
    now?: () => number
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Answers Listing requests one at a time, keeping recent Listings by the bytes' SHA-256, the base,
 * the names' version and the name, so opening the same Executable again, or stepping into the
 * same library, is immediate.
 */
export function createListingService(
    post: (response: ListingResponse) => void,
    options: ServiceOptions = {}
) {
    const decoder = options.decoder ?? loadDecoder
    const now = options.now ?? (() => performance.now())
    const cache = new Map<string, Listing>()
    let queue = Promise.resolve()

    async function generate(request: ListingRequest) {
        try {
            const key = [
                await sha256(request.bytes),
                request.base,
                request.version,
                request.name
            ].join(':')
            let listing = cache.get(key)
            if (listing) cache.delete(key)
            else {
                const loaded = await decoder()
                const started = now()
                let reported = -Infinity
                listing = generateListing(loaded, {
                    bytes: request.bytes,
                    name: request.name,
                    base: request.base,
                    version: request.version,
                    onProgress: (fraction) => {
                        const time = now()
                        if (time - started < PROGRESS_DELAY_MS) return
                        if (time - reported < PROGRESS_INTERVAL_MS) return
                        reported = time
                        post({ type: 'progress', id: request.id, fraction })
                    }
                })
            }
            cache.set(key, listing)
            if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
            post({ type: 'listing', id: request.id, listing })
        } catch (error) {
            post({
                type: 'failure',
                id: request.id,
                message: error instanceof Error ? error.message : String(error)
            })
        }
    }

    return {
        /** Queued, so a long Listing and a short one asked for after it answer in order. */
        handle(request: ListingRequest): Promise<void> {
            queue = queue.then(() => generate(request))
            return queue
        }
    }
}

/** The part of a dedicated worker's global scope the service uses. */
export type ListingWorkerScope = {
    postMessage(response: ListingResponse): void
    addEventListener(type: 'message', listener: (event: MessageEvent<ListingRequest>) => void): void
}

/** Runs the service in a dedicated worker's global scope. */
export function startListingWorker(scope: ListingWorkerScope) {
    const service = createListingService((response) => scope.postMessage(response))
    scope.addEventListener('message', (event: MessageEvent<ListingRequest>) => {
        if (event.data?.type === 'generate') void service.handle(event.data)
    })
    scope.postMessage({ type: 'ready' } satisfies ListingResponse)
}
