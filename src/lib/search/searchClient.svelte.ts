import { browser } from '$app/environment'
import { base } from '$app/paths'
import modelUrls from 'virtual:search-model'
import type { SearchResult } from './engine'
import type { SearchModelUrls } from './model'
import { shardsOf, type SearchScope, type ShardId } from './scope'
import type { SearchAnswer, WorkerRequest, WorkerResponse } from './searchWorker'

/**
 * Search for the page ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)):
 * one worker for every search box, so a shard or the model loaded for one is there for the next.
 * The panel, the palette and the agents' tool all ask through `search`, the plain function the
 * plan promised, with nothing in it about the UI.
 *
 * The model starts downloading when a page with a search box is entered (`preload`), unless the
 * browser asks to save data; there is no switch for it. Until it is ready, search matches words
 * only, and a query typed after it is ready uses both.
 */

export type ModelStatus =
    /** Not asked for yet. */
    | 'idle'
    | 'loading'
    | 'ready'
    /** The browser asks to save data, or this build has no model: words only. */
    | 'skipped'
    | 'failed'

type NetworkInformation = { saveData?: boolean }

/** A request before it is given its id: `Omit` over each member of the union, not the union. */
type Unnumbered<T> = T extends unknown ? Omit<T, 'id'> : never

function savesData(): boolean {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
    return connection?.saveData === true
}

function shardUrl(shard: ShardId): string {
    return new URL(`${base}/search/${shard}.json`, location.href).href
}

class SearchClient {
    model = $state<ModelStatus>('idle')

    private worker: Promise<Worker> | null = null
    private next = 0
    private readonly pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >()
    private readonly shards = new Map<ShardId, Promise<void>>()
    private modelLoad: Promise<void> | null = null

    /** Imported on first use, so that a server render never meets the worker's wrapper. */
    private ensureWorker(): Promise<Worker> {
        this.worker ??= import('./searchWorker?worker').then(({ default: SearchWorker }) => {
            const worker = new SearchWorker()
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const response = event.data
                const waiting = this.pending.get(response.id)
                if (!waiting) return
                this.pending.delete(response.id)
                if (response.ok) waiting.resolve(response.value)
                else waiting.reject(new Error(response.error))
            }
            return worker
        })
        return this.worker
    }

    private async request<T>(message: Unnumbered<WorkerRequest>): Promise<T> {
        const worker = await this.ensureWorker()
        const id = this.next++
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
            worker.postMessage({ ...message, id } as WorkerRequest)
        })
    }

    /** Loads the shards a scope reads; each shard once, whichever scope asked first. */
    loadScope(scope: SearchScope): Promise<void> {
        const missing = shardsOf(scope).filter((shard) => !this.shards.has(shard))
        if (missing.length > 0) {
            const loading = this.request<void>({
                type: 'load-shards',
                shards: missing.map((shard) => ({ shard, url: shardUrl(shard) }))
            })
            for (const shard of missing) {
                this.shards.set(shard, loading)
                loading.catch(() => this.shards.delete(shard))
            }
        }
        return Promise.all(shardsOf(scope).map((shard) => this.shards.get(shard))).then(() => {})
    }

    /** Starts the model download, once, unless the browser asks to save data. */
    loadModel(): Promise<void> {
        if (this.modelLoad) return this.modelLoad
        if (!modelUrls || savesData()) {
            this.model = 'skipped'
            this.modelLoad = Promise.resolve()
            return this.modelLoad
        }
        this.model = 'loading'
        this.modelLoad = this.request<void>({
            type: 'load-model',
            urls: modelUrls as SearchModelUrls
        }).then(
            () => {
                this.model = 'ready'
            },
            (error: Error) => {
                console.warn(`search: the model did not load (${error.message}); words only`)
                this.model = 'failed'
            }
        )
        return this.modelLoad
    }

    /**
     * What a page with a search box calls on arrival: the scope's shards and the model, once the
     * page has settled, so neither competes with what the page itself is loading.
     */
    preload(scope: SearchScope): void {
        if (!browser) return
        const start = () => {
            this.loadScope(scope).catch((error: Error) =>
                console.warn(`search: could not load the index (${error.message})`)
            )
            void this.loadModel()
        }
        if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 })
        else setTimeout(start, 1500)
    }

    /** The ranked results for a query in a scope, by words, and by meaning once the model is ready. */
    async search(scope: SearchScope, query: string, limit = 20): Promise<SearchAnswer> {
        if (!browser || !query.trim()) return { results: [], mode: 'text' }
        await this.loadScope(scope)
        return this.request<SearchAnswer>({ type: 'search', scope, query, limit })
    }
}

export const searchClient = new SearchClient()

export type { SearchResult, SearchAnswer }
