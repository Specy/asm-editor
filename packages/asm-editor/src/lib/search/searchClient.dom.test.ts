import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { languageScope } from './scope'

/** What the client posted to its workers, by request type. */
const posted: { type: string }[] = []
/** How each worker starts: announcing its listener at once, failing to load, or when told. */
let startup: 'ready' | 'error' | 'manual' = 'ready'
const workers: { announce(): void; crash(): void }[] = []

vi.mock('$app/env', () => ({ browser: true }))
vi.mock('$app/paths', () => ({ resolve: (path: string) => `/${path}` }))
vi.mock('virtual:search-model', () => ({
    default: {
        model: '/model.onnx',
        tokenizer: '/tokenizer.json',
        wasm: '/ort.wasm'
    }
}))
vi.mock('./searchWorker?worker', () => ({
    default: class extends EventTarget {
        constructor() {
            super()
            workers.push(this)
            if (startup === 'ready') queueMicrotask(() => this.announce())
            if (startup === 'error') queueMicrotask(() => this.crash())
        }
        announce() {
            this.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' } }))
        }
        /** What the browser fires when the worker's script fails to load or throws. */
        crash() {
            this.dispatchEvent(Object.assign(new Event('error'), { message: 'Failed to fetch' }))
        }
        postMessage(message: { id: number; type: string }) {
            posted.push(message)
            const value = message.type === 'search' ? { results: [], mode: 'text' } : undefined
            queueMicrotask(() =>
                this.dispatchEvent(
                    new MessageEvent('message', { data: { id: message.id, ok: true, value } })
                )
            )
        }
        terminate() {}
    }
}))

async function freshClient() {
    vi.resetModules()
    const { searchClient } = await import('./searchClient.svelte')
    return searchClient
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const types = () => posted.map((message) => message.type)

beforeEach(() => {
    posted.length = 0
    workers.length = 0
    startup = 'ready'
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => callback())
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('search client model loading', () => {
    it('preloads the scope’s words, not the model', async () => {
        const client = await freshClient()
        client.preload(languageScope('mips'))
        await settle()
        expect(types()).toEqual(['load-shards'])
        expect(client.model).toBe('idle')
    })

    it('loads the model once on intent, however often asked', async () => {
        const client = await freshClient()
        client.warmModel()
        expect(client.model).toBe('loading')
        client.warmModel()
        await settle()
        client.warmModel()
        expect(types().filter((type) => type === 'load-model')).toHaveLength(1)
        expect(client.model).toBe('ready')
    })

    it('loads the model when a query is typed', async () => {
        const client = await freshClient()
        await client.search(languageScope('mips'), 'add')
        expect(types()).toContain('load-model')
    })

    it('does not load the model when the browser asks to save data', async () => {
        vi.stubGlobal('navigator', {
            ...navigator,
            connection: { saveData: true }
        })
        const client = await freshClient()
        client.warmModel()
        await settle()
        expect(types()).not.toContain('load-model')
        expect(client.model).toBe('skipped')
    })
})

describe('search client worker', () => {
    it('holds what it asks of a worker until the worker says it listens', async () => {
        startup = 'manual'
        const client = await freshClient()
        const answer = client.search(languageScope('mips'), 'add')
        await vi.waitFor(() => expect(workers).toHaveLength(1))
        await settle()
        expect(posted).toEqual([])
        workers[0].announce()
        await expect(answer).resolves.toEqual({ results: [], mode: 'text' })
        expect(types()).toEqual(['load-model', 'load-shards', 'search'])
    })

    it('fails the search of a worker that did not start, and starts another for the next', async () => {
        startup = 'error'
        const client = await freshClient()
        await expect(client.search(languageScope('mips'), 'add')).rejects.toThrow(
            'Search stopped: Failed to fetch'
        )
        expect(client.model).toBe('failed')
        startup = 'ready'
        await expect(client.search(languageScope('mips'), 'add')).resolves.toEqual({
            results: [],
            mode: 'text'
        })
        expect(workers).toHaveLength(2)
        //the model whose download failed with the first is not asked of the second
        expect(types()).toEqual(['load-shards', 'search'])
    })

    it('loads the shards again on the worker that replaces one that died, without the model', async () => {
        const client = await freshClient()
        await client.search(languageScope('mips'), 'add')
        expect(client.model).toBe('ready')
        workers[0].crash()
        expect(client.model).toBe('failed')
        posted.length = 0
        await client.search(languageScope('mips'), 'add')
        expect(workers).toHaveLength(2)
        expect(types()).toEqual(['load-shards', 'search'])
    })
})
