/**
 * The Search panel's Pseudocode of every function, decompiled in the background
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 28), through the Pseudocode client and the real decompiler package on the calling thread
 * (`InThreadWorker`), on crackme and the decompiler package's FactCheck-like C++ program.
 */
import { readFileSync } from 'node:fs'
import {
    loadDecompiler,
    type DecompiledFunction,
    type DecompiledProgram,
    type DecompileOptions,
    type Decompiler
} from '@specy/decompiler'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import type { Listing, ListingAnnotations } from '../listing/listing'
import { plannedLoadBase } from '../listing/listingPaths'
import { encodeBase64, fileBytes, type Annotations, type ProjectFile } from '../projectFiles'
import { inThreadWorker } from './inThreadWorker'
import { BACKGROUND_TIME_LIMIT_MS, PseudocodeClient } from './pseudocodeClient'
import {
    PseudocodeSearchCache,
    searchableFunctions,
    searchOrder,
    type PseudocodeSearchChange,
    type PseudocodeSearchProgress
} from './pseudocodeSearchCache'

const read = (path: string) => new Uint8Array(readFileSync(new URL(path, import.meta.url)))
const CRACKME = '../../../../x86/blink-js/tests/fixtures/elf/crackme'
const FACTCHECK = '../../../../decompiler/js/tests/fixtures/elf/factcheck'

/** crackme's main and _start, link-time. */
const MAIN = 0x11e9
const START = 0x1100

let decoder: ListingDecoder
let demangler: Demangler

beforeAll(async () => {
    decoder = await loadDecoder()
    demangler = await loadDemangler()
})

const fileOf = (bytes: Uint8Array, annotations?: Annotations): ProjectFile => ({
    encoding: 'base64',
    content: encodeBase64(bytes),
    ...(annotations ? { annotations } : {})
})

/** A File's Listing as the editor makes it, with its renames and comments, C++ names demangled. */
function listingOf(file: ProjectFile, annotations?: ListingAnnotations, name = 'crackme'): Listing {
    const bytes = fileBytes(file)
    const analysis = decoder.analyze(bytes)
    return generateListing(decoder, {
        bytes,
        name,
        base: plannedLoadBase(analysis.pie),
        version: 'v1',
        analysis,
        demangler,
        ...(annotations ? { annotations } : {})
    })
}

/** A link-time address as a File's Annotations key it. */
const key = (address: number) => `0x${address.toString(16)}`

/**
 * The package's decompiler, listing each decompilation it runs at link-time addresses (`base`
 * known once a program opens), with an optional stand-in for some.
 */
function recording(
    stand?: (
        address: number,
        options: DecompileOptions | undefined
    ) => DecompiledFunction | undefined
) {
    const calls: { address: number; options?: DecompileOptions }[] = []
    let base = 0
    const load = async (): Promise<Decompiler> => {
        const real = await loadDecompiler({ architecture: 'x86-64' })
        return {
            version: real.version,
            architecture: real.architecture,
            memory: () => real.memory(),
            dispose: () => real.dispose(),
            openProgram(image) {
                const program: DecompiledProgram = real.openProgram(image)
                //a PIE's first segment is at its load base
                base = image.regions[0].address - (image.regions[0].address % 0x1000)
                return {
                    warnings: program.warnings,
                    decompile(address, options) {
                        calls.push({ address: address - base, ...(options ? { options } : {}) })
                        return (
                            stand?.(address - base, options) ?? program.decompile(address, options)
                        )
                    },
                    dispose: () => program.dispose()
                }
            }
        }
    }
    return { calls, load }
}

const caches: PseudocodeSearchCache[] = []
const clients: PseudocodeClient[] = []
afterEach(() => {
    caches.splice(0).forEach((cache) => cache.dispose())
    clients.splice(0).forEach((client) => client.dispose())
})

/** A cache over a client of its own, and every change it reports. */
function cacheOver(load?: () => Promise<Decompiler>) {
    const client = new PseudocodeClient(inThreadWorker(load))
    const cache = new PseudocodeSearchCache(() => client)
    const changes: PseudocodeSearchChange[] = []
    cache.subscribe((change) => changes.push(change))
    clients.push(client)
    caches.push(cache)
    return { client, cache, changes }
}

/** Settles with the progress once the batch of `path` is no longer running. */
function finished(cache: PseudocodeSearchCache, path: string): Promise<PseudocodeSearchProgress> {
    return new Promise((resolve) => {
        const stop = cache.subscribe((change) => {
            if (
                change.type === 'progress' &&
                change.progress.path === path &&
                !change.progress.running
            ) {
                stop()
                resolve(change.progress)
            }
        })
    })
}

async function run(
    cache: PseudocodeSearchCache,
    path: string,
    file: ProjectFile,
    listing: Listing
) {
    const done = finished(cache, path)
    cache.start(path, file, listing)
    return done
}

function text(result: DecompiledFunction) {
    if ('error' in result) throw new Error(result.error)
    return result.text
}

/** The functions crackme's search decompiles, by address: none of its PLT stubs. */
const CRACKME_FUNCTIONS = [
    '_init',
    '_start',
    'deregister_tm_clones',
    'register_tm_clones',
    '__do_global_dtors_aux',
    'frame_dummy',
    'main',
    '_fini'
]

describe('the functions a search decompiles', () => {
    it('leave out the PLT stubs, the first by its section', () => {
        const bytes = read(CRACKME)
        const listing = listingOf(fileOf(bytes))
        const functions = searchableFunctions(listing, decoder.analyze(bytes))
        expect(functions.map((fn) => fn.name)).toEqual(CRACKME_FUNCTIONS)
        //the first stub, named by the Listing's invented words, is in .plt
        expect(listing.functions.find((fn) => fn.address === 0x1020)?.name).toMatch(/^FUN_/)
        //main calls stubs only: the rest follow by address
        expect(searchOrder(listing, bytes, functions)).toEqual([
            MAIN,
            ...functions.map((fn) => fn.address).filter((address) => address !== MAIN)
        ])
    })

    it('go from main through its direct calls, breadth first, then by address', () => {
        const bytes = read(FACTCHECK)
        const listing = listingOf(fileOf(bytes), undefined, 'factcheck')
        const functions = searchableFunctions(listing, decoder.analyze(bytes))
        expect(functions.length).toBe(290)
        const order = searchOrder(listing, bytes, functions)
        expect(new Set(order).size).toBe(functions.length)
        expect(order.length).toBe(functions.length)
        //main's own calls first, as its Listing writes them, each once
        const main = listing.functions.find((fn) => fn.name === 'main')!
        const byName = new Map(functions.map((fn) => [fn.name, fn.address]))
        const called: number[] = []
        for (const line of listing.text.split('\n').slice(main.line, main.endLine)) {
            const name = /\b(?:call|jmp)\s+([^\s;]+)/.exec(line)?.[1]
            const address = name === undefined ? undefined : byName.get(name)
            if (address !== undefined && address !== main.address && !called.includes(address))
                called.push(address)
        }
        expect(called.length).toBeGreaterThan(5)
        expect(order.slice(0, called.length + 1)).toEqual([main.address, ...called])
        //what main does not reach comes last, by address: _init first
        const init = listing.functions.find((fn) => fn.name === '_init')!
        const tail = order.slice(order.indexOf(init.address))
        expect(order.indexOf(init.address)).toBeGreaterThan(called.length)
        expect(tail).toEqual([...tail].sort((a, b) => a - b))
    })
})

describe('the Search panel’s Pseudocode cache', () => {
    it('decompiles every function in the background, reporting each and its progress', async () => {
        const { calls, load } = recording()
        const { client, cache, changes } = cacheOver(load)
        const file = fileOf(read(CRACKME))
        const listing = listingOf(file)
        const progress = await run(cache, 'crackme', file, listing)
        expect(progress).toEqual({
            path: 'crackme',
            total: 8,
            done: 8,
            running: false,
            failures: []
        })
        expect(calls.map((call) => call.address)).toEqual(
            searchOrder(
                listing,
                fileBytes(file),
                searchableFunctions(listing, decoder.analyze(fileBytes(file)))
            )
        )
        expect(calls.every((call) => call.options?.timeLimitMs === BACKGROUND_TIME_LIMIT_MS)).toBe(
            true
        )
        const order = calls.map((call) => call.address)
        const entries = cache.entries('crackme')
        expect(entries.map((entry) => entry.name)).toEqual(CRACKME_FUNCTIONS)
        const main = entries.find((entry) => entry.address === MAIN)!
        expect(main.text).toBe(text(await client.decompile('crackme', file, listing, MAIN)))
        //where its names are, which a rename rewrites
        expect(main.spans.map((span) => main.text.slice(span.start, span.end))).toEqual(
            expect.arrayContaining(['main', 'printf', 'fgets', 'stdin', 'strcmp', 'puts'])
        )
        //each function as it came, the progress between
        const reported = changes.flatMap((change) =>
            change.type === 'entries' ? change.entries.map((entry) => entry.address) : []
        )
        expect(reported).toEqual(order)
        const done = changes.flatMap((change) =>
            change.type === 'progress' ? [change.progress.done] : []
        )
        expect(done[0]).toBe(0)
        expect(done).toEqual([...done].sort((a, b) => a - b))
    })

    it('lets a pane’s request go before its own waiting ones', async () => {
        const { calls, load } = recording()
        const { client, cache } = cacheOver(load)
        const file = fileOf(read(CRACKME))
        const listing = listingOf(file)
        const fini = listing.functions.find((fn) => fn.name === '_fini')!
        const done = finished(cache, 'crackme')
        cache.start('crackme', file, listing)
        const shown = client.decompile('crackme', file, listing, fini.address)
        await done
        await shown
        //the one under way finished first, then the pane's; the batch read it from the pane's
        expect(calls.map((call) => call.address).slice(0, 2)).toEqual([MAIN, fini.address])
        expect(calls[1].options).toBeUndefined()
        expect(calls.length).toBe(8)
        expect(cache.entries('crackme').length).toBe(8)
    })

    it('stops, keeping what was done, and carries on from there when started again', async () => {
        const { calls, load } = recording()
        const { cache } = cacheOver(load)
        const file = fileOf(read(CRACKME))
        const listing = listingOf(file)
        const stopped = finished(cache, 'crackme')
        const stop = cache.subscribe((change) => {
            if (change.type === 'entries' && cache.entries('crackme').length === 3) {
                stop()
                cache.stop('crackme')
            }
        })
        cache.start('crackme', file, listing)
        expect(await stopped).toMatchObject({ done: 3, running: false })
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(cache.entries('crackme').length).toBe(3)
        const before = calls.length
        expect(before).toBeLessThanOrEqual(4)
        expect(await run(cache, 'crackme', file, listing)).toMatchObject({ done: 8 })
        //the function under way when it stopped may be decompiled twice, no other
        expect(calls.length).toBeLessThanOrEqual(9)
        expect(new Set(calls.map((call) => call.address)).size).toBe(8)
    })

    it('lists a function past the time limit as not searched, and tries it again', async () => {
        let slow = true
        const { calls, load } = recording((address) => {
            if (address === MAIN && slow) {
                slow = false
                return { address, error: 'main took longer than 5 seconds to decompile' }
            }
            if (address === 0x1100 + 0xe0)
                return { address, error: 'frame_dummy has more than 100000 instructions' }
            return undefined
        })
        const { cache } = cacheOver(load)
        const file = fileOf(read(CRACKME))
        const listing = listingOf(file)
        const frame = listing.functions.find((fn) => fn.name === 'frame_dummy')!
        expect(frame.address).toBe(0x1100 + 0xe0)
        const progress = await run(cache, 'crackme', file, listing)
        expect(progress).toMatchObject({ total: 8, done: 8, running: false })
        expect(progress.failures).toEqual([
            {
                address: frame.address,
                name: 'frame_dummy',
                error: 'frame_dummy is too long to decompile (over 100000 instructions).',
                retryable: false
            },
            {
                address: MAIN,
                name: 'main',
                error: 'main took longer than 5 seconds to decompile.',
                retryable: true
            }
        ])
        expect(cache.entries('crackme').length).toBe(6)
        //Try again
        const again = finished(cache, 'crackme')
        cache.retry('crackme', MAIN)
        expect((await again).failures.map((failure) => failure.address)).toEqual([frame.address])
        expect(cache.entries('crackme').some((entry) => entry.address === MAIN)).toBe(true)
        //a decompiler error stays for this version: starting again asks nothing
        const asked = calls.length
        expect(await run(cache, 'crackme', file, listing)).toMatchObject({ done: 8 })
        expect(calls.length).toBe(asked)
    })

    it('tries a function past the time limit again when started again', async () => {
        let slow = true
        const { calls, load } = recording((address) => {
            if (address !== MAIN || !slow) return undefined
            slow = false
            return { address, error: 'main took longer than 5 seconds to decompile' }
        })
        const { cache } = cacheOver(load)
        const file = fileOf(read(CRACKME))
        const listing = listingOf(file)
        expect((await run(cache, 'crackme', file, listing)).failures).toHaveLength(1)
        expect(await run(cache, 'crackme', file, listing)).toMatchObject({ done: 8, failures: [] })
        expect(calls.length).toBe(9)
    })

    it('rewrites the texts naming what a global rename renamed, decompiling nothing again', async () => {
        const { calls, load } = recording()
        const { client, cache, changes } = cacheOver(load)
        const plain = fileOf(read(CRACKME))
        const listing = listingOf(plain)
        await run(cache, 'crackme', plain, listing)
        const asked = calls.length
        const before = new Map(cache.entries('crackme').map((entry) => [entry.address, entry.text]))
        changes.length = 0

        const named = { ...plain, annotations: { names: { [key(MAIN)]: 'check' } } }
        const renamedListing = listingOf(named, { names: new Map([[MAIN, 'check']]) })
        expect(await run(cache, 'crackme', named, renamedListing)).toMatchObject({ done: 8 })
        expect(calls.length).toBe(asked)
        const rewritten = changes.flatMap((change) =>
            change.type === 'entries' ? change.entries : []
        )
        expect(rewritten.map((entry) => entry.address).sort()).toEqual([START, MAIN].sort())
        const entries = new Map(cache.entries('crackme').map((entry) => [entry.address, entry]))
        expect(entries.get(MAIN)!.name).toBe('check')
        expect(entries.get(MAIN)!.text.split('\n')[0]).toBe('undefined8 check(void)')
        expect(entries.get(START)!.text).toContain('__libc_start_main(check,')
        //what a fresh decompilation of the renamed program gives
        for (const address of [MAIN, START])
            expect(entries.get(address)!.text).toBe(
                text(await client.decompile('crackme', named, renamedListing, address))
            )
        //Reset name rewrites them back
        expect(await run(cache, 'crackme', plain, listing)).toMatchObject({ done: 8 })
        expect(
            new Map(cache.entries('crackme').map((entry) => [entry.address, entry.text]))
        ).toEqual(before)
        expect(calls.length).toBe(asked + 2)
    })

    it('decompiles again only the functions whose locals or comments changed', async () => {
        const { calls, load } = recording()
        const { cache, changes } = cacheOver(load)
        const plain = fileOf(read(CRACKME))
        await run(cache, 'crackme', plain, listingOf(plain))
        const asked = calls.length
        changes.length = 0
        const annotated: ProjectFile = {
            ...plain,
            annotations: {
                locals: { [key(MAIN)]: { 'stack:-0x98': 'password' } },
                comments: { [key(START)]: 'the entry' }
            }
        }
        const listing = listingOf(annotated, { comments: new Map([[START, 'the entry']]) })
        cache.update('crackme', annotated, listing)
        const removed = changes.find((change) => change.type === 'removed')
        expect(removed).toEqual({
            type: 'removed',
            path: 'crackme',
            addresses: expect.arrayContaining([START, MAIN])
        })
        expect(removed?.type === 'removed' && removed.addresses.length).toBe(2)
        expect(await run(cache, 'crackme', annotated, listing)).toMatchObject({ done: 8 })
        expect(calls.slice(asked).map((call) => call.address)).toEqual([MAIN, START])
        const entries = new Map(
            cache.entries('crackme').map((entry) => [entry.address, entry.text])
        )
        expect(entries.get(MAIN)).toContain('fgets(password,0x80,stdin)')
        expect(entries.get(START)).toContain('/* the entry */')
    })

    it('carries a running batch on with the File changed under it', async () => {
        const { calls, load } = recording()
        const { cache } = cacheOver(load)
        const plain = fileOf(read(CRACKME))
        const listing = listingOf(plain)
        const annotated: ProjectFile = {
            ...plain,
            annotations: { locals: { [key(MAIN)]: { 'stack:-0x98': 'password' } } }
        }
        const done = finished(cache, 'crackme')
        const changed = cache.subscribe((change) => {
            //main came first; a rename of its local while the next is under way
            if (change.type === 'entries' && change.entries[0].address === MAIN) {
                changed()
                queueMicrotask(() => cache.update('crackme', annotated, listing))
            }
        })
        cache.start('crackme', plain, listing)
        expect(await done).toMatchObject({ done: 8, running: false })
        //main twice, every other function once
        const asked = calls.map((call) => call.address)
        expect(asked.filter((address) => address === MAIN)).toHaveLength(2)
        expect(new Set(asked).size).toBe(8)
        expect(asked).toHaveLength(9)
        expect(cache.entries('crackme').find((entry) => entry.address === MAIN)!.text).toContain(
            'fgets(password,0x80,stdin)'
        )
    })

    it('drops every text when the bytes change, and forgets a File', async () => {
        const { cache, changes } = cacheOver()
        const bytes = read(CRACKME)
        const plain = fileOf(bytes)
        await run(cache, 'crackme', plain, listingOf(plain))
        changes.length = 0
        const edited: ProjectFile = {
            ...plain,
            edits: [{ offset: 0x2023, remove: 1, insert: btoa('x') }]
        }
        cache.update('crackme', edited, listingOf(edited))
        expect(changes).toEqual([
            { type: 'removed', path: 'crackme', addresses: expect.any(Array) },
            {
                type: 'progress',
                progress: { path: 'crackme', total: 8, done: 0, running: false, failures: [] }
            }
        ])
        expect(cache.entries('crackme')).toEqual([])
        await run(cache, 'crackme', edited, listingOf(edited))
        expect(cache.entries('crackme').find((entry) => entry.address === MAIN)!.text).toContain(
            'puts("Corrxct!");'
        )
        //a File renamed keeps its texts; one deleted takes them away
        cache.rename('crackme', 'bin/crackme')
        expect(cache.entries('crackme')).toEqual([])
        expect(cache.entries('bin/crackme')).toHaveLength(8)
        changes.length = 0
        cache.forget('bin/crackme')
        expect(changes).toEqual([
            { type: 'removed', path: 'bin/crackme', addresses: expect.any(Array) }
        ])
        expect(cache.progress('bin/crackme')).toBeUndefined()
    })

    it('decompiles again what names a C++ name renamed out of its namespaces, and its function', async () => {
        const { calls, load } = recording()
        const { client, cache } = cacheOver(load)
        const plain = fileOf(read(FACTCHECK))
        const listing = listingOf(plain, undefined, 'factcheck')
        expect(await run(cache, 'factcheck', plain, listing)).toMatchObject({
            total: 290,
            done: 290
        })
        const asked = calls.length
        const clamp = listing.functions.find((fn) => fn.name === '_ZN4game7clampToIiEET_S1_S1_S1_')!
        const main = listing.functions.find((fn) => fn.name === 'main')!
        const before = cache.entries('factcheck').find((entry) => entry.address === main.address)!
        expect(before.text).toContain('game::clampTo<int>(')
        const names = new Map([[clamp.address, 'clamp_value']])
        const named = { ...plain, annotations: { names: { [key(clamp.address)]: 'clamp_value' } } }
        const renamed = listingOf(named, { names }, 'factcheck')
        await run(cache, 'factcheck', named, renamed)
        //the decompiler qualifies a name relative to the function it prints: main, which names
        //it, and clamp_value itself, whose scope moved, are decompiled again, nothing else
        const again = calls.slice(asked).map((call) => call.address)
        expect(again).toContain(main.address)
        expect(again).toContain(clamp.address)
        expect(again.length).toBeLessThan(6)
        const entries = new Map(cache.entries('factcheck').map((entry) => [entry.address, entry]))
        expect(entries.get(main.address)!.text).toContain('clamp_value(')
        expect(entries.get(clamp.address)!.text).toMatch(/^\S+ clamp_value\(/)
        for (const address of new Set(again))
            expect(entries.get(address)!.text).toBe(
                text(await client.decompile('factcheck', named, renamed, address))
            )
    })

    it('reads as a fresh decompilation after renaming every C++ function out of its namespaces', async () => {
        const { cache, client } = cacheOver()
        const plain = fileOf(read(FACTCHECK))
        const listing = listingOf(plain, undefined, 'factcheck')
        await run(cache, 'factcheck', plain, listing)
        const names = new Map<number, string>()
        for (const label of listing.labels)
            if (label.kind === 'function' && label.origin !== 'plt' && label.demangled)
                names.set(label.address, `renamed_${names.size}`)
        expect(names.size).toBeGreaterThan(200)
        const named = {
            ...plain,
            annotations: {
                names: Object.fromEntries([...names].map(([address, name]) => [key(address), name]))
            }
        }
        const renamed = listingOf(named, { names }, 'factcheck')
        expect(await run(cache, 'factcheck', named, renamed)).toMatchObject({ done: 290 })
        const differ: string[] = []
        for (const entry of cache.entries('factcheck')) {
            const fresh = await client.decompile('factcheck', named, renamed, entry.address)
            if (!('error' in fresh) && fresh.text !== entry.text) differ.push(entry.name)
        }
        expect(differ).toEqual([])
    })

    it('decompiles again a function that prints a renamed global widened, `_name`', async () => {
        const { calls, load } = recording()
        const { client, cache } = cacheOver(load)
        const plain = fileOf(read(CRACKME))
        const listing = listingOf(plain)
        await run(cache, 'crackme', plain, listing)
        const dtors = listing.functions.find((fn) => fn.name === '__do_global_dtors_aux')!
        const entry = () => cache.entries('crackme').find((each) => each.address === dtors.address)!
        //read at another size than its symbol's, Ghidra writes `_` before the name
        expect(entry().text).toContain('__cxa_finalize(___dso_handle)')
        const handle = listing.labels.find((label) => label.name === '__dso_handle')!
        const asked = calls.length
        const named = { ...plain, annotations: { names: { [key(handle.address)]: 'handle' } } }
        const renamed = listingOf(named, { names: new Map([[handle.address, 'handle']]) })
        await run(cache, 'crackme', named, renamed)
        expect(calls.slice(asked).map((call) => call.address)).toEqual([dtors.address])
        expect(entry().text).toContain('__cxa_finalize(_handle)')
        expect(entry().text).toBe(
            text(await client.decompile('crackme', named, renamed, dtors.address))
        )
        //and back, on Reset name
        await run(cache, 'crackme', plain, listing)
        expect(entry().text).toContain('__cxa_finalize(___dso_handle)')
    })
})
