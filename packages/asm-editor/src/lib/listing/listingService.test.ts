import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { loadDecoder } from './decoder'
import { ListingError } from './listing'
import { ListingClient } from './listingClient'
import { createListingService, PROGRESS_DELAY_MS, startListingWorker } from './listingService'
import type { ListingRequest, ListingResponse } from './protocol'

const crackme = () =>
    new Uint8Array(
        readFileSync(
            new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url)
        )
    )

function request(id: number, bytes = crackme()): ListingRequest {
    return { type: 'generate', id, bytes, name: 'crackme', base: 0x555555554000, version: 'v1' }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('the Listing service', () => {
    it('answers each request in order, keeping none of them', async () => {
        const responses: ListingResponse[] = []
        const decoder = vi.fn(loadDecoder)
        const service = createListingService((response) => responses.push(response), { decoder })
        await Promise.all([service.handle(request(1)), service.handle(request(2))])
        expect(
            responses.map((response) => [response.type, 'id' in response && response.id])
        ).toEqual([
            ['listing', 1],
            ['listing', 2]
        ])
        const [first, second] = responses as Extract<ListingResponse, { type: 'listing' }>[]
        expect(first.listing.text).toContain('\nmain:\n')
        //made again: the editor keeps the Listings it shows, a second copy here would double them
        expect(second.listing).not.toBe(first.listing)
        expect(second.listing.text).toBe(first.listing.text)
        expect(decoder).toHaveBeenCalledTimes(2)
    })

    it('reports progress only once a Listing has taken long enough to wait on', async () => {
        let time = 0
        const responses: ListingResponse[] = []
        const service = createListingService((response) => responses.push(response), {
            // Every reading of the clock moves it on, as a slow generation would.
            now: () => (time += PROGRESS_DELAY_MS / 4)
        })
        await service.handle(request(1))
        const progress = responses.filter((response) => response.type === 'progress')
        expect(progress.length).toBeGreaterThan(0)
        expect(responses.at(-1)?.type).toBe('listing')

        const quick: ListingResponse[] = []
        await createListingService((response) => quick.push(response), { now: () => 0 }).handle(
            request(1)
        )
        expect(quick.map((response) => response.type)).toEqual(['listing'])
    })

    it('fails a request for a file it cannot list, with the reason', async () => {
        const responses: ListingResponse[] = []
        const service = createListingService((response) => responses.push(response))
        const bytes = crackme()
        bytes[4] = 1
        await service.handle(request(7, bytes))
        expect(responses).toEqual([
            { type: 'failure', id: 7, message: expect.stringMatching(/32-bit/), listing: true }
        ])
    })

    it('says when a failure is not the bytes', async () => {
        const responses: ListingResponse[] = []
        const service = createListingService((response) => responses.push(response), {
            decoder: () => Promise.reject(new Error('Zydis failed to load'))
        })
        await service.handle(request(8))
        expect(responses).toEqual([
            { type: 'failure', id: 8, message: 'Zydis failed to load', listing: false }
        ])
    })
})

/** A worker in the same thread, for the client to talk to through messages as it would a real one. */
class FakeWorker extends EventTarget {
    static instances: FakeWorker[] = []
    private scopeListener?: (event: MessageEvent<ListingRequest>) => void
    terminated = false

    constructor() {
        super()
        FakeWorker.instances.push(this)
        // The worker announces itself only after its module has loaded.
        queueMicrotask(() =>
            startListingWorker({
                postMessage: (response) =>
                    this.dispatchEvent(
                        new MessageEvent('message', { data: structuredClone(response) })
                    ),
                addEventListener: (_type, listener) => {
                    this.scopeListener = listener
                }
            })
        )
    }

    postMessage(request: ListingRequest) {
        this.scopeListener?.(new MessageEvent('message', { data: request }))
    }

    terminate() {
        this.terminated = true
    }
}

/** A worker that loads and then never answers, as one the browser killed for memory. */
class SilentWorker extends EventTarget {
    static instances: SilentWorker[] = []
    terminated = false
    constructor() {
        super()
        SilentWorker.instances.push(this)
    }
    postMessage() {}
    terminate() {
        this.terminated = true
    }
}

describe('the Listing client', () => {
    it('holds requests until its worker is ready, then routes each answer to its request', async () => {
        vi.stubGlobal('Worker', FakeWorker)
        FakeWorker.instances = []
        const client = new ListingClient(FakeWorker as unknown as new () => Worker)
        const bytes = crackme()
        const [first, second] = await Promise.all([
            client.generate({ bytes, name: 'crackme', base: 0x555555554000 }),
            client.generate({ bytes, name: 'crackme', base: 0 })
        ])
        expect(FakeWorker.instances).toHaveLength(1)
        expect(first.base).toBe(0x555555554000)
        expect(second.base).toBe(0)
        // The caller's bytes are copied, not handed over.
        expect(bytes.byteLength).toBeGreaterThan(0)
    })

    it('fails what waits on a worker that dies, and starts a new one for the next request', async () => {
        vi.stubGlobal('Worker', FakeWorker)
        FakeWorker.instances = []
        const client = new ListingClient(FakeWorker as unknown as new () => Worker)
        const waiting = client.generate({ bytes: crackme(), name: 'crackme', base: 0 })
        FakeWorker.instances[0].dispatchEvent(
            Object.assign(new Event('error'), { message: 'out of memory' })
        )
        await expect(waiting).rejects.toThrow(/out of memory/)
        expect(FakeWorker.instances[0].terminated).toBe(true)
        const listing = await client.generate({ bytes: crackme(), name: 'crackme', base: 0 })
        expect(FakeWorker.instances).toHaveLength(2)
        expect(listing.main).toBe(0x11e9)
    })

    it('fails what waits on a worker that falls silent, and starts a new one', async () => {
        vi.stubGlobal('Worker', SilentWorker)
        SilentWorker.instances = []
        const client = new ListingClient(SilentWorker as unknown as new () => Worker, {
            silenceMs: 20
        })
        const waiting = client.generate({ bytes: crackme(), name: 'crackme', base: 0 })
        await expect(waiting).rejects.toThrow(/stopped answering/)
        expect(SilentWorker.instances[0].terminated).toBe(true)
        void client.generate({ bytes: crackme(), name: 'crackme', base: 0 }).catch(() => undefined)
        expect(SilentWorker.instances).toHaveLength(2)
    })

    it('ends its worker once it has had nothing to do, and starts one again when asked', async () => {
        vi.stubGlobal('Worker', FakeWorker)
        FakeWorker.instances = []
        const client = new ListingClient(FakeWorker as unknown as new () => Worker, {
            idleMs: 20
        })
        await client.generate({ bytes: crackme(), name: 'crackme', base: 0 })
        expect(FakeWorker.instances[0].terminated).toBe(false)
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(FakeWorker.instances[0].terminated).toBe(true)
        const listing = await client.generate({ bytes: crackme(), name: 'crackme', base: 0 })
        expect(FakeWorker.instances).toHaveLength(2)
        expect(listing.main).toBe(0x11e9)
    })

    it('fails bytes that cannot be listed with a ListingError, and nothing else', async () => {
        vi.stubGlobal('Worker', FakeWorker)
        FakeWorker.instances = []
        const client = new ListingClient(FakeWorker as unknown as new () => Worker)
        const bytes = crackme()
        bytes[4] = 1
        const failure = await client
            .generate({ bytes, name: 'crackme', base: 0 })
            .catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(ListingError)
        const died = client.generate({ bytes: crackme(), name: 'crackme', base: 0 })
        FakeWorker.instances.at(-1)!.dispatchEvent(new Event('error'))
        const other = await died.catch((error: unknown) => error)
        expect(other).toBeInstanceOf(Error)
        expect(other).not.toBeInstanceOf(ListingError)
    })

    it('generates on the calling thread where there are no workers', async () => {
        const listing = await new ListingClient().generate({
            bytes: crackme(),
            name: 'crackme',
            base: 0x555555554000n
        })
        expect(listing.text).toContain('\nmain:\n')
    })
})
