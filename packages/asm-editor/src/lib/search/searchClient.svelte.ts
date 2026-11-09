import { browser } from '$app/env'
import { resolve } from '$app/paths'
import modelUrls from 'virtual:search-model'
import { SvelteMap } from 'svelte/reactivity'
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
 * Words first, meaning second. A scope's word index (a few hundred kilobytes to a few megabytes
 * compressed, enough to match words at once) loads when the reader points at or focuses a search
 * box or opens a palette (`warm`, [paletteState](../../components/search/paletteState.svelte.ts));
 * the Workbench, whose Documentation panel is one click away, loads its scope on arrival, once the
 * page has settled (`preload`). The model (tens of megabytes with its runtime) is asked for on the
 * same signs, but only once the index shards being loaded are in, so that the two never share the
 * connection; the worker fetches the model at low priority too, for a scope asked for while it
 * downloads. It is asked for once, unless the browser asks to save data; there is no switch for
 * it, and a failed download is not retried.
 *
 * A search box shows the state of both (`indexStatus`, `model`), and a search from one answers
 * from the shards already in (`partial`), asking again as more arrive (`answerKey`,
 * [LiveSearch](./liveSearch.svelte.ts)). The agents' tool waits for the whole scope.
 *
 * A worker that fails to load or dies fails the requests waiting on it, and the next request starts
 * a fresh worker, which loads the shards it is asked for again. A model the dead one had, or was
 * loading, is not asked for again, any more than one whose download failed: search goes on with
 * words.
 */
export type ModelStatus =
    /** Not asked for yet, or waiting for the index to come first. */
    | 'idle'
    | 'loading'
    | 'ready'
    /** The browser asks to save data, or this build has no model: words only. */
    | 'skipped'
    | 'failed'

/** How much of a scope's index is in the worker. */
export type IndexStatus =
    /** Some of its shards were never asked for. */
    | 'idle'
    /** Asked for, none in yet. */
    | 'loading'
    /** Some in, more coming: a search answers from those already in. */
    | 'partial'
    /** Every shard in, or every one not in failed: nothing more is coming. */
    | 'ready'
    /** None in, and every one failed. */
    | 'failed'

type ShardState = 'loading' | 'ready' | 'failed'

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

    /** Each shard's load, while it is loading or in: asked for once, whichever scope asked first. */
    private readonly shards = new Map<ShardId, Promise<void>>()
    /** What a search box shows: each shard asked for, loading, in or failed. */
    private readonly shardStates = new SvelteMap<ShardId, ShardState>()
    /** Shard loads not yet settled, which the model waits for. */
    private inFlight = 0
    /** Something asked for the model; it starts once the index in flight is in. */
    private modelWanted = false
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
        this.shardStates.clear()
        // the shards failing with it would start the model on a fresh worker: wait for a search
        this.modelWanted = false
        if (this.model === 'ready') this.model = 'failed'
        const waiting = [...this.pending.values()]
        this.pending.clear()
        for (const pending of waiting) pending.reject(new Error(message))
    }

    /** One shard, once; a failed one is asked for again by the next scope that needs it. */
    private loadShard(shard: ShardId): Promise<void> {
        const known = this.shards.get(shard)
        if (known) return known
        const loading = this.request<void>({ type: 'load-shard', shard, url: shardUrl(shard) })
        this.shards.set(shard, loading)
        this.shardStates.set(shard, 'loading')
        this.inFlight++
        loading
            .then(
                () => {
                    if (this.shards.get(shard) === loading) this.shardStates.set(shard, 'ready')
                },
                () => {
                    if (this.shards.get(shard) !== loading) return
                    this.shards.delete(shard)
                    this.shardStates.set(shard, 'failed')
                }
            )
            .finally(() => {
                this.inFlight--
                this.startModelIfDue()
            })
        return loading
    }

    /** Loads the shards a scope reads, each once, whichever scope asked first. */
    loadScope(scope: SearchScope): Promise<void> {
        return Promise.all(shardsOf(scope).map((shard) => this.loadShard(shard))).then(() => {})
    }

    /** Resolves once any shard of the scope is in; rejects once every one has failed. */
    private anyShard(scope: SearchScope): Promise<void> {
        return Promise.any(shardsOf(scope).map((shard) => this.loadShard(shard))).catch(
            (error: AggregateError) => {
                throw error.errors[0] instanceof Error ? error.errors[0] : error
            }
        )
    }

    /** How much of a scope's index is in, for a search box to show. */
    indexStatus(scope: SearchScope): IndexStatus {
        const states = shardsOf(scope).map((shard) => this.shardStates.get(shard))
        const some = (state: ShardState | undefined) => states.includes(state)
        if (some('loading')) return some('ready') ? 'partial' : 'loading'
        if (states.every((state) => state === 'ready')) return 'ready'
        if (some(undefined)) return 'idle'
        return some('ready') ? 'ready' : 'failed'
    }

    /**
     * Changes whenever a search of the scope could answer differently: another of its shards came
     * in, or the model became ready. A box showing results asks again when it changes.
     */
    answerKey(scope: SearchScope): string {
        const ready = shardsOf(scope).filter((shard) => this.shardStates.get(shard) === 'ready')
        return `${ready.length}:${this.model === 'ready'}`
    }

    /** Starts the model download, once, unless the browser asks to save data. */
    private loadModel(): Promise<void> {
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

    /** The model, once asked for and once no shard is still on its way. */
    private startModelIfDue() {
        if (this.modelWanted && !this.modelLoad && this.inFlight === 0) void this.loadModel()
    }

    /**
     * What a search box calls on a sign of intent (pointer over, focus, a palette opening, a query
     * typed): its scope's index starts loading, and the model after it if nothing has asked for it
     * yet. Cheap to call again; a skipped or failed model stays so.
     */
    warm(scope?: SearchScope): void {
        if (!browser) return
        if (scope) {
            this.loadScope(scope).catch((error: Error) =>
                console.warn(`search: could not load the index (${error.message})`)
            )
        }
        this.modelWanted = true
        this.startModelIfDue()
    }

    /**
     * The scope's shards, once the page has settled, so they do not compete with what the page
     * itself is loading: what the Workbench calls on arrival. Not the model, which waits for
     * `warm`.
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

    /**
     * The ranked results for a query in a scope, by words, and by meaning once the model is ready.
     * It waits for the whole scope's index, unless `partial`: then it answers as soon as any of it
     * is in, from what is in.
     */
    async search(
        scope: SearchScope,
        query: string,
        limit = 20,
        options: { partial?: boolean } = {}
    ): Promise<SearchAnswer> {
        if (!browser || !query.trim()) return { results: [], mode: 'text' }
        const whole = this.loadScope(scope)
        this.warm()
        if (options.partial) {
            whole.catch(() => undefined)
            await this.anyShard(scope)
        } else {
            await whole
        }
        return this.request<SearchAnswer>({ type: 'search', scope, query, limit })
    }
}

export const searchClient = new SearchClient()

export type { SearchResult, SearchAnswer }
