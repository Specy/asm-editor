/**
 * The Pseudocode client in Node, where there is no Worker, so its requests are answered on the
 * calling thread through the worker's messages, by the real decompiler package unless a test
 * passes a stand-in.
 */
import { readFileSync } from 'node:fs'
import {
    loadDecompiler,
    type DecompiledFunction,
    type DecompiledProgram,
    type Decompiler,
    type ProgramImage
} from '@specy/decompiler'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { loadDecoder, type ListingDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import type { Listing } from '../listing/listing'
import { plannedLoadBase } from '../listing/listingPaths'
import { encodeBase64, fileBytes, type ProjectFile } from '../projectFiles'
import { KEPT_PSEUDOCODE, PseudocodeClient, type PseudocodeStage } from './pseudocodeClient'

const crackme = () =>
    new Uint8Array(
        readFileSync(
            new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url)
        )
    )

/** crackme's main, link-time (readelf -s), and its puts PLT stub. */
const MAIN = 0x11e9
const PUTS_PLT = 0x10a0

let decoder: ListingDecoder

beforeAll(async () => {
    decoder = await loadDecoder()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

/** A File's Listing as the editor makes it: at its load base, from its edited bytes. */
function listingOf(file: ProjectFile): Listing {
    const bytes = fileBytes(file)
    return generateListing(decoder, {
        bytes,
        name: 'crackme',
        base: plannedLoadBase(decoder.analyze(bytes).pie),
        version: 'v1'
    })
}

const crackmeFile = (): ProjectFile => ({ encoding: 'base64', content: encodeBase64(crackme()) })

/** Overwrites "Correct!"'s `e` (at 0x2023, in a segment whose offset is its address). */
const editedCrackme = (): ProjectFile => ({
    ...crackmeFile(),
    edits: [{ offset: 0x2023, remove: 1, insert: btoa('x') }]
})

type Counts = {
    loads: number
    opens: number
    decompiles: number
    programsDisposed: number
    disposed: number
}

/**
 * The package's decompiler, counting what is asked of it, with an optional stand-in for each
 * decompilation.
 */
function counting(decompile?: (program: DecompiledProgram, address: number) => DecompiledFunction) {
    const counts: Counts = { loads: 0, opens: 0, decompiles: 0, programsDisposed: 0, disposed: 0 }
    const load = async (): Promise<Decompiler> => {
        counts.loads++
        const real = await loadDecompiler({ architecture: 'x86-64' })
        return {
            version: real.version,
            architecture: real.architecture,
            memory: () => real.memory(),
            dispose() {
                counts.disposed++
                real.dispose()
            },
            openProgram(image: ProgramImage) {
                counts.opens++
                const program = real.openProgram(image)
                return {
                    warnings: program.warnings,
                    decompile(address, options) {
                        counts.decompiles++
                        return decompile
                            ? decompile(program, address)
                            : program.decompile(address, options)
                    },
                    dispose() {
                        counts.programsDisposed++
                        program.dispose()
                    }
                }
            }
        }
    }
    return { counts, load }
}

function text(result: DecompiledFunction) {
    if ('error' in result) throw new Error(result.error)
    return result
}

describe('the Pseudocode client without a Worker', () => {
    it('decompiles a function of a Listing, at its link-time addresses', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const stages: PseudocodeStage[] = []
        const main = text(
            await client.decompile('crackme', file, listing, MAIN, {
                onStage: (stage) => stages.push(stage)
            })
        )
        expect(stages).toEqual(['loading', 'decompiling'])
        expect(client.version).toMatch(/^Ghidra_12\.1\.4_build [0-9a-f]{12}$/)
        expect(main.address).toBe(MAIN)
        expect(main.text).toContain('puts("Correct!");')
        const correct = main.lines.find((line) => line.text.trim() === 'puts("Correct!");')!
        const puts = correct.tokens.find((token) => token.kind === 'function')!
        expect(puts.target).toBe(PUTS_PLT)
        // call puts@plt at 0x128a (objdump -d), in the Listing's line table.
        expect(correct.addresses).toEqual([0x128a])
        expect(counts).toEqual({
            loads: 1,
            opens: 1,
            decompiles: 1,
            programsDisposed: 0,
            disposed: 0
        })
        client.dispose()
    })

    it('keeps results, and decompiles a function asked for twice at once only once', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const [first, second] = await Promise.all([
            client.decompile('crackme', file, listing, MAIN),
            client.decompile('crackme', file, listing, MAIN)
        ])
        expect(second).toBe(first)
        // Another copy of the same bytes, as a reloaded Project gives, and another pane's path.
        const copy = crackmeFile()
        expect(await client.decompile('copy', copy, listingOf(copy), MAIN)).toBe(first)
        expect(counts.decompiles).toBe(1)

        const start = listing.functions.find((fn) => fn.name === '_start')!
        expect(text(await client.decompile('crackme', file, listing, start.address)).name).toBe(
            '_start'
        )
        // One program for the File, opened once.
        expect(counts).toMatchObject({ opens: 1, decompiles: 2 })
        client.dispose()
    })

    it('keeps only the last results', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const starts = listing.functions.map((fn) => fn.address)
        expect(starts.length).toBeLessThan(KEPT_PSEUDOCODE)
        for (const address of starts) await client.decompile('crackme', file, listing, address)
        for (const address of starts) await client.decompile('crackme', file, listing, address)
        expect(counts.decompiles).toBe(starts.length)
        client.dispose()
    })

    it('opens the program again for the bytes a Byte edit makes, closing the old one', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const before = text(await client.decompile('crackme', file, listingOf(file), MAIN))
        expect(before.text).toContain('puts("Correct!");')

        const edited = editedCrackme()
        const after = text(await client.decompile('crackme', edited, listingOf(edited), MAIN))
        expect(after.text).toContain('puts("Corrxct!");')
        expect(counts).toMatchObject({ opens: 2, programsDisposed: 1, decompiles: 2 })
        // Undoing the edit finds the first result kept.
        expect(await client.decompile('crackme', file, listingOf(file), MAIN)).toBe(before)
        client.dispose()
    })

    it('answers an address no function starts at with the decompiler’s error, kept', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const result = await client.decompile('crackme', file, listing, MAIN + 1)
        expect(result).toEqual({ address: MAIN + 1, error: 'No function starts at 0x5555555551ea' })
        expect(await client.decompile('crackme', file, listing, MAIN + 1)).toBe(result)
        expect(counts.decompiles).toBe(1)
        client.dispose()
    })

    it('asks again for a function that was past the time limit', async () => {
        const { counts, load } = counting((_, address) => ({
            address,
            error: 'main took longer than 30 seconds to decompile'
        }))
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const result = await client.decompile('crackme', file, listing, MAIN)
        expect(result).toEqual({
            address: MAIN,
            error: 'main took longer than 30 seconds to decompile'
        })
        await client.decompile('crackme', file, listing, MAIN)
        expect(counts.decompiles).toBe(2)
        client.dispose()
    })

    it('loads the decompiler again after it traps, opening the program again', async () => {
        let trap = true
        const { counts, load } = counting((program, address) => {
            if (trap) {
                trap = false
                throw new WebAssembly.RuntimeError('remainder by zero')
            }
            return program.decompile(address)
        })
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        expect(await client.decompile('crackme', file, listing, MAIN)).toEqual({
            address: MAIN,
            error: 'remainder by zero'
        })
        expect(counts).toMatchObject({ loads: 1, disposed: 1 })
        expect(text(await client.decompile('crackme', file, listing, MAIN)).text).toContain(
            'puts("Correct!");'
        )
        expect(counts).toMatchObject({ loads: 2, opens: 2, decompiles: 2 })
        client.dispose()
    })

    it('closes a released program and opens it again when asked', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const start = listing.functions.find((fn) => fn.name === '_start')!.address
        await client.decompile('crackme', file, listing, MAIN)
        client.release('crackme')
        await client.decompile('crackme', file, listing, start)
        expect(counts).toMatchObject({ opens: 2, programsDisposed: 1 })
        client.dispose()
    })

    it('drops a waiting request whose signal aborts, never decompiling it', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const start = listing.functions.find((fn) => fn.name === '_start')!.address
        const abort = new AbortController()
        const first = client.decompile('crackme', file, listing, MAIN)
        const second = client.decompile('crackme', file, listing, start, { signal: abort.signal })
        abort.abort(new DOMException('The function changed', 'AbortError'))
        await expect(second).rejects.toThrow('The function changed')
        await first
        expect(counts.decompiles).toBe(1)
        client.dispose()
    })

    it('drops nothing else when a request no longer queued is aborted', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const start = listing.functions.find((fn) => fn.name === '_start')!.address
        const abort = new AbortController()
        const dropped = client.decompile('crackme', file, listing, MAIN, { signal: abort.signal })
        client.dispose()
        expect(await dropped).toEqual({ address: MAIN, error: 'The decompiler was closed' })
        // Requests queued after it, one of them waiting its turn, are still answered.
        const first = client.decompile('crackme', file, listing, MAIN)
        const second = client.decompile('crackme', file, listing, start)
        abort.abort(new DOMException('The function changed', 'AbortError'))
        expect(text(await first).name).toBe('main')
        expect(text(await second).name).toBe('_start')
        expect(counts.decompiles).toBe(2)
        client.dispose()
    })

    it('answers what waits when disposed, and starts again for a later request', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(undefined, { load })
        const file = crackmeFile()
        const listing = listingOf(file)
        const waiting = client.decompile('crackme', file, listing, MAIN)
        client.dispose()
        expect(await waiting).toEqual({ address: MAIN, error: 'The decompiler was closed' })
        expect(text(await client.decompile('crackme', file, listing, MAIN)).name).toBe('main')
        client.dispose()
        // The worker's decompiler goes with it, and every program with that.
        await vi.waitFor(() => expect(counts.disposed).toBeGreaterThanOrEqual(1))
    })
})

/** A worker that loads and then never answers, as one the browser killed for memory. */
class SilentWorker extends EventTarget {
    static instances: SilentWorker[] = []
    terminated = false
    posted: unknown[] = []
    constructor() {
        super()
        SilentWorker.instances.push(this)
        queueMicrotask(() =>
            this.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' } }))
        )
    }
    postMessage(request: unknown) {
        this.posted.push(request)
    }
    terminate() {
        this.terminated = true
    }
}

describe('the Pseudocode client with a Worker', () => {
    it('answers with an error once the worker falls silent, and starts a new one next', async () => {
        vi.stubGlobal('Worker', SilentWorker)
        SilentWorker.instances = []
        const client = new PseudocodeClient(SilentWorker, {
            silenceMs: 50,
            prototypes: async () => ''
        })
        const file = crackmeFile()
        const listing = listingOf(file)
        expect(await client.decompile('crackme', file, listing, MAIN)).toEqual({
            address: MAIN,
            error: 'The decompiler stopped answering: nothing came from it for 0.05 seconds'
        })
        expect(SilentWorker.instances).toHaveLength(1)
        const [worker] = SilentWorker.instances
        expect(worker.terminated).toBe(true)
        // It was sent the program, its bytes handed over, then the request.
        expect(worker.posted.map((request) => (request as { type: string }).type)).toEqual([
            'open',
            'decompile'
        ])
        expect(worker.posted[1]).toMatchObject({ address: MAIN + listing.base })

        void client.decompile('crackme', file, listing, MAIN)
        await vi.waitFor(() => expect(SilentWorker.instances).toHaveLength(2))
        // The new worker has no program open: it is sent the program again.
        await vi.waitFor(() =>
            expect(
                SilentWorker.instances[1].posted.map(
                    (request) => (request as { type: string }).type
                )
            ).toEqual(['open', 'decompile'])
        )
        client.dispose()
        expect(SilentWorker.instances[1].terminated).toBe(true)
    })
})
