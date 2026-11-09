import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { languageScope } from './scope'

type Posted = { id: number; type: string; shard?: string; query?: string; favour?: string[] }

/** What the client posted to its workers, in order. */
const posted: Posted[] = []
/** How each worker starts: announcing its listener at once, failing to load, or when told. */
let startup: 'ready' | 'error' | 'manual' = 'ready'
/** Request types answered only when the test says (`answer`); the rest are answered at once. */
const heldTypes = new Set<string>()
const unanswered: { message: Posted; worker: EventTarget }[] = []
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
        postMessage(message: Posted) {
            posted.push(message)
            if (heldTypes.has(message.type)) unanswered.push({ message, worker: this })
            else queueMicrotask(() => reply(this, message))
        }
        terminate() {}
    }
}))

/** How a request is answered: done, failed, or failed on a shard of another format. */
type Outcome = boolean | 'outdated'

/** The couple the worker finds in "add instruction", as the engine would. */
const ADD_INSTRUCTION = { start: 0, end: 15, label: 'The add instruction first' }

function reply(worker: EventTarget, message: Posted, ok: Outcome = true) {
    const couples = message.type === 'search' && message.query === 'add instruction'
    const value =
        message.type === 'search'
            ? { results: [], mode: 'text', couples: couples ? [ADD_INSTRUCTION] : [] }
            : undefined
    const data =
        ok === true
            ? { id: message.id, ok: true, value }
            : ok === 'outdated'
              ? { id: message.id, ok: false, error: 'outdated', outdated: true }
              : { id: message.id, ok: false, error: 'HTTP 404' }
    worker.dispatchEvent(new MessageEvent('message', { data }))
}

/** Answers the first held request that matches, as loaded or as failed. */
function answer(match: (message: Posted) => boolean, ok: Outcome = true) {
    const index = unanswered.findIndex(({ message }) => match(message))
    if (index < 0) throw new Error('no such request is waiting')
    const [{ message, worker }] = unanswered.splice(index, 1)
    reply(worker, message, ok)
}

const shard = (name: string) => (message: Posted) => message.shard === name

async function freshClient() {
    vi.resetModules()
    const { searchClient } = await import('./searchClient.svelte')
    return searchClient
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const types = () => posted.map((message) => message.type)
const mips = languageScope('mips')

beforeEach(() => {
    posted.length = 0
    workers.length = 0
    unanswered.length = 0
    heldTypes.clear()
    startup = 'ready'
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => callback())
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('search client loading', () => {
    it('preloads the scope’s words, one request a shard, not the model', async () => {
        const client = await freshClient()
        client.preload(mips)
        await settle()
        expect(posted.map((message) => message.shard)).toEqual([
            'docs-mips',
            'lectures-mips',
            'lectures-assembly-basics'
        ])
        expect(types()).toEqual(['load-shard', 'load-shard', 'load-shard'])
        expect(client.model).toBe('idle')
    })

    it('loads the model once on intent, however often asked', async () => {
        const client = await freshClient()
        client.warm()
        expect(client.model).toBe('loading')
        client.warm()
        await settle()
        client.warm()
        expect(types().filter((type) => type === 'load-model')).toHaveLength(1)
        expect(client.model).toBe('ready')
    })

    it('asks for the model only once the index on its way is in', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        client.warm(mips)
        await settle()
        expect(types()).toEqual(['load-shard', 'load-shard', 'load-shard'])
        expect(client.model).toBe('idle')
        answer(shard('docs-mips'))
        answer(shard('lectures-mips'))
        await settle()
        expect(types()).not.toContain('load-model')
        //a failed shard is settled too: nothing more is coming for the model to wait for
        answer(shard('lectures-assembly-basics'), false)
        await settle()
        expect(types()).toContain('load-model')
        expect(client.model).toBe('ready')
    })

    it('loads the model, after the index, when a query is typed', async () => {
        const client = await freshClient()
        await client.search(mips, 'add')
        await settle()
        const lastShard = types().lastIndexOf('load-shard')
        expect(types().indexOf('load-model')).toBeGreaterThan(lastShard)
    })

    it('does not load the model when the browser asks to save data', async () => {
        vi.stubGlobal('navigator', {
            ...navigator,
            connection: { saveData: true }
        })
        const client = await freshClient()
        client.warm()
        await settle()
        expect(types()).not.toContain('load-model')
        expect(client.model).toBe('skipped')
    })
})

describe('search client index', () => {
    it('says how much of a scope’s index is in', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        expect(client.indexStatus(mips)).toBe('idle')
        client.warm(mips)
        expect(client.indexStatus(mips)).toBe('loading')
        await settle()
        answer(shard('docs-mips'))
        await settle()
        expect(client.indexStatus(mips)).toBe('partial')
        answer(shard('lectures-mips'))
        answer(shard('lectures-assembly-basics'), false)
        await settle()
        //what failed is not coming: what is in is all there is
        expect(client.indexStatus(mips)).toBe('ready')
    })

    it('fails a scope none of whose shards loaded', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        client.warm(mips)
        await settle()
        for (const name of ['docs-mips', 'lectures-mips', 'lectures-assembly-basics']) {
            answer(shard(name), false)
        }
        await settle()
        expect(client.indexStatus(mips)).toBe('failed')
    })

    it('says a shard of another format needs the page reloaded, not the connection checked', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        const { OutdatedIndexError } = await import('./outdatedIndex')
        const failed = client.search(mips, 'add', 20, { partial: true }).catch((error) => error)
        await settle()
        for (const name of ['docs-mips', 'lectures-mips', 'lectures-assembly-basics']) {
            answer(shard(name), 'outdated')
        }
        const error = await failed
        expect(error).toBeInstanceOf(OutdatedIndexError)
        expect(error.message).toMatch(/Reload the page/)
    })

    it('remembers an outdated index: later searches fail at once, fetching nothing', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        const { OutdatedIndexError } = await import('./outdatedIndex')
        const first = client.search(mips, 'add', 20, { partial: true }).catch((error) => error)
        await settle()
        for (const name of ['docs-mips', 'lectures-mips', 'lectures-assembly-basics']) {
            answer(shard(name), 'outdated')
        }
        expect(await first).toBeInstanceOf(OutdatedIndexError)
        posted.length = 0
        const again = client.search(mips, 'add', 20, { partial: true }).catch((error) => error)
        //no "Loading search…" in between
        expect(client.indexStatus(mips)).toBe('failed')
        expect(await again).toBeInstanceOf(OutdatedIndexError)
        //nor for another scope's shards: the whole site was updated
        const x86 = languageScope('x86')
        const elsewhere = client.search(x86, 'add', 20, { partial: true }).catch((error) => error)
        expect(client.indexStatus(x86)).toBe('failed')
        expect(await elsewhere).toBeInstanceOf(OutdatedIndexError)
        expect(types()).not.toContain('load-shard')
    })

    it('answers a partial search from the first shard in, without waiting for the rest', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        const whole = vi.fn()
        const partial = vi.fn()
        void client.search(mips, 'add').then(whole)
        void client.search(mips, 'add', 20, { partial: true }).then(partial)
        await settle()
        answer(shard('lectures-mips'))
        await vi.waitFor(() => expect(partial).toHaveBeenCalled())
        expect(whole).not.toHaveBeenCalled()
    })

    it('passes the names a search favours to the worker, and none when it has none', async () => {
        const client = await freshClient()
        const favour = ['lw', 'sw']
        await client.search(mips, 'load', 20, { favour })
        await client.search(mips, 'load', 20, { favour: [] })
        await client.search(mips, 'load')
        const searches = posted.filter((message) => message.type === 'search')
        expect(searches.map((message) => message.favour)).toEqual([
            ['lw', 'sw'],
            undefined,
            undefined
        ])
        expect(searches[0].favour).not.toBe(favour)
        expect(searches.map((message) => 'favour' in message)).toEqual([true, false, false])
    })

    it('passes on the couples the worker found, and none for an empty query', async () => {
        const client = await freshClient()
        expect((await client.search(mips, 'add instruction')).couples).toEqual([ADD_INSTRUCTION])
        expect((await client.search(mips, 'add')).couples).toEqual([])
        expect(await client.search(mips, '  ')).toEqual({ results: [], mode: 'text', couples: [] })
    })

    it('changes the answer key as shards and the model arrive', async () => {
        heldTypes.add('load-shard')
        heldTypes.add('load-model')
        const client = await freshClient()
        const keys = [client.answerKey(mips)]
        client.warm(mips)
        await settle()
        answer(shard('docs-mips'))
        await settle()
        keys.push(client.answerKey(mips))
        answer(shard('lectures-mips'))
        answer(shard('lectures-assembly-basics'))
        await settle()
        keys.push(client.answerKey(mips))
        answer((message) => message.type === 'load-model')
        await settle()
        keys.push(client.answerKey(mips))
        expect(new Set(keys).size).toBe(4)
    })

    it('asks again for a shard that failed, the next time a scope needs it', async () => {
        heldTypes.add('load-shard')
        const client = await freshClient()
        client.warm(mips)
        await settle()
        answer(shard('docs-mips'), false)
        await settle()
        posted.length = 0
        client.warm(mips)
        await settle()
        expect(posted.map((message) => message.shard)).toEqual(['docs-mips'])
    })
})

describe('search client worker', () => {
    it('holds what it asks of a worker until the worker says it listens', async () => {
        startup = 'manual'
        const client = await freshClient()
        const result = client.search(mips, 'add')
        await vi.waitFor(() => expect(workers).toHaveLength(1))
        await settle()
        expect(posted).toEqual([])
        workers[0].announce()
        await expect(result).resolves.toEqual({ results: [], mode: 'text', couples: [] })
        expect(types().slice(0, 3)).toEqual(['load-shard', 'load-shard', 'load-shard'])
        expect(types()).toContain('search')
    })

    it('fails the search of a worker that did not start, and starts another for the next', async () => {
        startup = 'error'
        const client = await freshClient()
        await expect(client.search(mips, 'add')).rejects.toThrow('Search stopped: Failed to fetch')
        await settle()
        //the shards failing with the worker do not start the model on a fresh one
        expect(workers).toHaveLength(1)
        expect(client.model).toBe('idle')
        startup = 'ready'
        await expect(client.search(mips, 'add')).resolves.toEqual({
            results: [],
            mode: 'text',
            couples: []
        })
        expect(workers).toHaveLength(2)
    })

    it('loads the shards again on the worker that replaces one that died, without the model', async () => {
        const client = await freshClient()
        await client.search(mips, 'add')
        await settle()
        expect(client.model).toBe('ready')
        workers[0].crash()
        expect(client.model).toBe('failed')
        expect(client.indexStatus(mips)).toBe('idle')
        posted.length = 0
        await client.search(mips, 'add')
        await settle()
        expect(workers).toHaveLength(2)
        expect(types()).toEqual(['load-shard', 'load-shard', 'load-shard', 'search'])
    })
})
