import {
    loadDemangler,
    needsDemangler,
    type Demangler
} from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ElfAnalysis, type ListingDecoder } from './decoder'
import { generateListing } from './generateListing'
import { ListingError } from './listing'
import type { ListingRequest, ListingResponse } from './protocol'

/** A Listing that takes longer than this gets progress reports. */
export const PROGRESS_DELAY_MS = 500
const PROGRESS_INTERVAL_MS = 100

type ServiceOptions = {
    decoder?: () => Promise<ListingDecoder>
    demangler?: () => Promise<Demangler>
    now?: () => number
}

/**
 * The C++ demangler a program's Listing needs: loaded only when its symbol tables or relocations
 * hold a mangled name ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision
 * 1), so a C program never pays for it. Undefined otherwise, and when it fails to load: the
 * Listing is then made with raw names, as for a C program.
 */
export async function demanglerFor(
    analysis: ElfAnalysis,
    load: () => Promise<Demangler> = loadDemangler
): Promise<Demangler | undefined> {
    if (!analysis.isElf || !needsDemangler(analysis)) return undefined
    try {
        return await load()
    } catch {
        return undefined
    }
}

/**
 * Answers Listing requests one at a time. It keeps none: the editor keeps the Listings it shows
 * (`ListingDocuments`), and a second copy here would double what libc's alone takes, tens of
 * megabytes.
 */
export function createListingService(
    post: (response: ListingResponse) => void,
    options: ServiceOptions = {}
) {
    const decoder = options.decoder ?? loadDecoder
    const demangler = options.demangler ?? loadDemangler
    const now = options.now ?? (() => performance.now())
    let queue = Promise.resolve()

    async function generate(request: ListingRequest) {
        try {
            const loaded = await decoder()
            const analysis = loaded.analyze(request.bytes)
            const names = await demanglerFor(analysis, demangler)
            const started = now()
            let reported = -Infinity
            const listing = generateListing(loaded, {
                bytes: request.bytes,
                name: request.name,
                base: request.base,
                version: request.version,
                annotations: request.annotations,
                analysis,
                demangler: names,
                onProgress: (fraction) => {
                    const time = now()
                    if (time - started < PROGRESS_DELAY_MS) return
                    if (time - reported < PROGRESS_INTERVAL_MS) return
                    reported = time
                    post({ type: 'progress', id: request.id, fraction })
                }
            })
            post({ type: 'listing', id: request.id, listing })
        } catch (error) {
            post({
                type: 'failure',
                id: request.id,
                message: error instanceof Error ? error.message : String(error),
                listing: error instanceof ListingError
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
