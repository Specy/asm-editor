import type { SearchWorkerRequest, SearchWorkerResponse, WorkerDocumentResult } from './protocol.ts'
import { compileMatcher, type Matcher } from './query.ts'
import { SearchText, searchText } from './searchText.ts'

/**
 * The search worker's side ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 27): the documents' texts by id, and the searches over them. A search sends what it
 * finds as it goes, pausing between documents every {@link SEARCH_SLICE_MS} to send it and to read
 * its messages, so a newer search or a cancel ends it there. One regular expression over one text
 * cannot be paused, which is why the client ends the whole worker past its time limit.
 */

/** How long a search works before it sends what it has found and reads its messages. */
export const SEARCH_SLICE_MS = 20

export type SearchServiceOptions = {
    sliceMs?: number
    now?: () => number
    /** Lets the worker's messages in; a task of its own by default. */
    pause?: () => Promise<void>
}

type Stored = { version: number; text: SearchText }

/** A search under way, which its own `stopped` or a newer search ends at the next pause. */
type Run = { search: number; stopped: boolean }

/**
 * Answers the client's requests (`SearchWorkerRequest`): documents are kept as they come, and
 * searches run one after another, a newer one ending the one before at its next pause.
 */
export function createSearchService(
    post: (response: SearchWorkerResponse) => void,
    options: SearchServiceOptions = {}
) {
    const sliceMs = options.sliceMs ?? SEARCH_SLICE_MS
    const now = options.now ?? (() => performance.now())
    const pause = options.pause ?? nextTask
    const documents = new Map<string, Stored>()
    /** Searches asked for and not yet begun, and the one under way. */
    const waiting = new Map<number, Run>()
    let running: Run | undefined
    let queue = Promise.resolve()
    let disposed = false

    async function run(request: Extract<SearchWorkerRequest, { type: 'search' }>, job: Run) {
        waiting.delete(request.search)
        if (disposed) return
        running = job
        post({ type: 'started', search: request.search })
        try {
            const matcher = job.stopped ? undefined : compileMatcher(request.query)
            if (matcher) await searchAll(request, job, matcher)
        } catch (error) {
            if (!disposed)
                post({
                    type: 'failure',
                    search: request.search,
                    message: error instanceof Error ? error.message : String(error)
                })
        }
        if (running === job) running = undefined
        if (!disposed) post({ type: 'done', search: request.search, cancelled: job.stopped })
    }

    async function searchAll(
        request: Extract<SearchWorkerRequest, { type: 'search' }>,
        job: Run,
        matcher: Matcher
    ) {
        let rowsLeft = request.maxRows
        let batch: WorkerDocumentResult[] = []
        let sliceStart = now()
        for (const id of request.ids) {
            if (job.stopped || disposed) return
            const stored = documents.get(id)
            if (!stored) continue
            const found = searchText(stored.text, matcher, rowsLeft)
            if (found.matches) {
                rowsLeft -= found.rows.length
                batch.push({ id, version: stored.version, ...found })
            }
            if (now() - sliceStart < sliceMs) continue
            if (batch.length) post({ type: 'results', search: request.search, documents: batch })
            batch = []
            await pause()
            sliceStart = now()
        }
        if (batch.length && !job.stopped && !disposed)
            post({ type: 'results', search: request.search, documents: batch })
    }

    return {
        handle(request: SearchWorkerRequest): void {
            if (disposed) return
            switch (request.type) {
                case 'put':
                    for (const document of request.documents)
                        documents.set(document.id, {
                            version: document.version,
                            text: new SearchText(document.text)
                        })
                    return
                case 'remove':
                    for (const id of request.ids) documents.delete(id)
                    return
                case 'cancel': {
                    const job = running?.search === request.search ? running : undefined
                    const stopped = job ?? waiting.get(request.search)
                    if (stopped) stopped.stopped = true
                    return
                }
                case 'search': {
                    //a newer search makes every earlier one pointless
                    if (running) running.stopped = true
                    for (const job of waiting.values()) job.stopped = true
                    const job: Run = { search: request.search, stopped: false }
                    waiting.set(request.search, job)
                    queue = queue.then(() => run(request, job))
                    return
                }
            }
        },
        /** Drops every document and ends the search under way, as the worker ends. */
        dispose(): void {
            disposed = true
            documents.clear()
        }
    }
}

/** A task of its own, after the messages already waiting: a channel's message, unclamped by timers. */
function nextTask(): Promise<void> {
    if (typeof MessageChannel === 'undefined')
        return new Promise((resolve) => setTimeout(resolve, 0))
    return new Promise((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => {
            channel.port1.close()
            resolve()
        }
        channel.port2.postMessage(undefined)
    })
}

/** What the service uses of a dedicated worker's global scope. */
export type SearchWorkerScope = {
    postMessage(response: SearchWorkerResponse): void
    addEventListener(
        type: 'message',
        listener: (event: MessageEvent<SearchWorkerRequest>) => void
    ): void
}

/** Runs the service in a dedicated worker's global scope. */
export function startSearchWorker(scope: SearchWorkerScope) {
    const service = createSearchService((response) => scope.postMessage(response))
    scope.addEventListener('message', (event) => {
        if (event.data && typeof event.data === 'object') service.handle(event.data)
    })
    scope.postMessage({ type: 'ready' })
}
