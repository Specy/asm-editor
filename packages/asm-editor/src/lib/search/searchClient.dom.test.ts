import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { languageScope } from './scope'

/** What the client posted to its worker, by request type. */
const posted: { type: string }[] = []

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
    default: class {
        onmessage: ((event: MessageEvent) => void) | null = null
        postMessage(message: { id: number; type: string }) {
            posted.push(message)
            const value = message.type === 'search' ? { results: [], mode: 'text' } : undefined
            queueMicrotask(() =>
                this.onmessage?.({
                    data: { id: message.id, ok: true, value }
                } as MessageEvent)
            )
        }
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
