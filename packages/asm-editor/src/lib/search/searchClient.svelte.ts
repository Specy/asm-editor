import { browser } from '$app/env'
import { resolve } from '$app/paths'
import modelUrls from 'virtual:search-model'
import { lazyLoad } from '#lib/lazyLoad.ts'
import type { SearchResult } from './engine'
import type { SearchModelUrls } from './model'
import { shardsOf, type SearchScope, type ShardId } from './scope'
import type { SearchAnswer, WorkerRequest, WorkerResponse } from './searchWorker'

/**
 * Search for the page ([ADR 0026](../../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)):
 * one worker for every search box, so a shard or the model loaded for one is there for the next.
 * The panel, the palette and the agents' tool all ask through `search`, the plain function the
 * plan promised, with nothing in it about the UI.
 *
 * Entering a page with a search box loads only its scope's word index (`preload`), once the page
 * has settled: around a megabyte compressed, enough to match words at once. The model (tens of
 * megabytes with its runtime) waits for a sign that the reader means to search: pointing at or
 * focusing a search box or launcher, opening the palette (Ctrl+K included), or typing a query
 * (`warmModel`, which `search` itself calls). It is then asked for once, unless the browser asks
 * to save data; there is no switch for it, and a failed download is not retried. While it loads
 * (`model === 'loading'`), the search box says so and search matches words only; a query typed
 * after it is ready uses both.
 *
 * A worker that fails to load or dies fails the requests waiting on it, and the next request starts
 * a fresh worker, which loads the shards it is asked for again. A model the dead one had, or was
 * loading, is not asked for again, any more than one whose download failed: search goes on with
 * words.
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
    return new URL(resolve(`search/${shard}.json`), location.href).href
}

/** Imported on first use, so that a server render never meets the worker's wrapper. */
const loadSearchWorker = lazyLoad(() =>
    import('./searchWorker?worker').then((module) => module.default)
)

type WorkerState = {
    worker: Worker
    /** Whether it has announced its listener; until then requests are held, in order. */
    ready: boolean
    held: WorkerRequest[]
}

class SearchClient {
    model = $state<ModelStatus>('idle')
    private state: WorkerState | undefined
    private next = 0

    private readonly pending = new Map<
        number,
        {
            resolve: (value: unknown) => void
            reject: (error: Error) => void
        }
    >()

    private readonly shards = new Map<ShardId, Promise<void>>()
    private modelLoad: Promise<void> | null = null

    private async request<T>(message: Unnumbered<WorkerRequest>): Promise<T> {
        const SearchWorker = await loadSearchWorker()
        const state = (this.state ??= this.start(SearchWorker))
        const request = { ...message, id: this.next++ } as WorkerRequest
        return new Promise<T>((resolve, reject) => {
            this.pending.set(request.id, {
                resolve: resolve as (value: unknown) => void,
                reject
            })
            if (state.ready) state.worker.postMessage(request)
            else state.held.push(request)
        })
    }

    private start(SearchWorker: new () => Worker): WorkerState {
        const worker = new SearchWorker()
        const state: WorkerState = { worker, ready: false, held: [] }
        worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
            if (this.state !== state) return
            const response = event.data
            if ('type' in response) {
                state.ready = true
                for (const request of state.held.splice(0)) worker.postMessage(request)
                return
            }
            const waiting = this.pending.get(response.id)
            if (!waiting) return
            this.pending.delete(response.id)
            if (response.ok) waiting.resolve(response.value)
            else waiting.reject(new Error(response.error))
        })
        // A worker that fails to load or dies answers nothing: fail what waits on it, and let the
        // next request start a fresh one.
        worker.addEventListener('error', (event) =>
            this.fail(
                state,
                `Search stopped: ${event.message || 'its worker failed to start'}. Search again to retry.`
            )
        )
        worker.addEventListener('messageerror', () =>
            this.fail(
                state,
                'Search stopped: its worker sent an unreadable message. Search again to retry.'
            )
        )
        return state
    }

    /** Fails every request waiting on a worker that died and ends it, and what it had loaded. */
    private fail(state: WorkerState, message: string) {
        if (this.state !== state) return
        state.worker.terminate()
        this.state = undefined
        this.shards.clear()
        if (this.model === 'ready') this.model = 'failed'
        const waiting = [...this.pending.values()]
        this.pending.clear()
        for (const pending of waiting) pending.reject(new Error(message))
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
                loading.catch(() => {
                    if (this.shards.get(shard) === loading) this.shards.delete(shard)
                })
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
     * What the search boxes call on a sign of intent (pointer over, focus, the palette opening, a
     * query typed): starts the model download if nothing has asked for it yet. Cheap to call again;
     * a skipped or failed model stays so.
     */
    warmModel(): void {
        if (!browser || this.modelLoad) return
        void this.loadModel()
    }

    /**
     * What a page with a search box calls on arrival: the scope's shards, once the page has
     * settled, so they do not compete with what the page itself is loading. Not the model, which
     * waits for `warmModel`.
     */
    preload(scope: SearchScope): void {
        if (!browser) return
        const start = () => {
            this.loadScope(scope).catch((error: Error) =>
                console.warn(`search: could not load the index (${error.message})`)
            )
        }
        if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 })
        else setTimeout(start, 1500)
    }

    /** The ranked results for a query in a scope, by words, and by meaning once the model is ready. */
    async search(scope: SearchScope, query: string, limit = 20): Promise<SearchAnswer> {
        if (!browser || !query.trim()) return { results: [], mode: 'text' }
        this.warmModel()
        await this.loadScope(scope)
        return this.request<SearchAnswer>({ type: 'search', scope, query, limit })
    }
}

export const searchClient = new SearchClient()

export type { SearchResult, SearchAnswer }
