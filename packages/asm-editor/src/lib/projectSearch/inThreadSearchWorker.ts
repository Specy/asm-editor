import type { SearchWorkerRequest, SearchWorkerResponse } from './protocol.ts'
import type { SearchWorkerLike } from './searchClient.ts'
import { createSearchService, type SearchServiceOptions } from './searchWorker.ts'

/**
 * The search worker's service on the calling thread, behind the messages a worker takes and
 * sends, for where there is no `Worker`: the tests, in Node and jsdom, give it to the
 * `ProjectSearchClient` as its worker. Messages are copied both ways, as a worker's are, and
 * delivered later, never during the call that sends them. A search blocks the thread it runs on,
 * so the client's time limit cannot end one here; ending it stops it at its next pause. The app
 * never imports it.
 */
export class InThreadSearchWorker extends EventTarget implements SearchWorkerLike {
    /** Every stand-in made, the latest last, for a test to find the one a client started. */
    static readonly made: InThreadSearchWorker[] = []
    /** Every request it was sent, as sent. */
    readonly received: SearchWorkerRequest[] = []
    terminated = false
    private readonly service: ReturnType<typeof createSearchService>

    constructor(options?: SearchServiceOptions) {
        super()
        InThreadSearchWorker.made.push(this)
        this.service = createSearchService((response) => this.deliver(response), options)
        this.deliver({ type: 'ready' })
    }

    postMessage(request: SearchWorkerRequest): void {
        if (this.terminated) return
        const copy = structuredClone(request)
        this.received.push(copy)
        queueMicrotask(() => {
            if (!this.terminated) this.service.handle(copy)
        })
    }

    terminate(): void {
        this.terminated = true
        this.service.dispose()
    }

    private deliver(response: SearchWorkerResponse) {
        const copy = structuredClone(response)
        queueMicrotask(() => {
            if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: copy }))
        })
    }
}
