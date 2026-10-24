import type { Decompiler } from '@specy/decompiler'
import type { PseudocodeWorkerConstructor, PseudocodeWorkerLike } from './pseudocodeClient'
import { createPseudocodeService } from './pseudocodeService'
import type { PseudocodeRequest, PseudocodeResponse } from './protocol'

/**
 * The Pseudocode worker's service on the calling thread, behind the messages a worker takes and
 * sends, for where there is no `Worker`: the tests, in Node and jsdom, give it to the
 * `PseudocodeClient` as its worker. A decompilation then blocks the thread it runs on. The app
 * never imports it: its bundle would then hold the decompiler package, its wasm and its processor
 * description a second time beside the worker's.
 */
export class InThreadWorker extends EventTarget implements PseudocodeWorkerLike {
    private readonly service: ReturnType<typeof createPseudocodeService>

    /** `load` loads the decompiler, the package's for x86-64 by default. */
    constructor(load?: () => Promise<Decompiler>) {
        super()
        const deliver = (response: PseudocodeResponse) =>
            queueMicrotask(() =>
                this.dispatchEvent(new MessageEvent('message', { data: response }))
            )
        this.service = createPseudocodeService(deliver, { load })
        deliver({ type: 'ready' })
    }

    postMessage(request: PseudocodeRequest) {
        void this.service.handle(request)
    }

    terminate() {
        this.service.dispose()
    }
}

/** The client's worker on the calling thread, loading the decompiler with `load`. */
export function inThreadWorker(load?: () => Promise<Decompiler>): PseudocodeWorkerConstructor {
    return class extends InThreadWorker {
        constructor() {
            super(load)
        }
    }
}
