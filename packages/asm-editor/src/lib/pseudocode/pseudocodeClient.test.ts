/**
 * The Pseudocode client in Node, where there is no Worker, so its requests are answered on the
 * calling thread through the worker's messages (`InThreadWorker`), by the real decompiler package
 * unless a test passes a stand-in.
 */
import { readFileSync } from 'node:fs'
import {
    loadDecompiler,
    type DecompiledFunction,
    type DecompiledProgram,
    type DecompileOptions,
    type Decompiler,
    type ProgramImage
} from '@specy/decompiler'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { loadDecoder, type ListingDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import type { Listing, ListingAnnotations } from '../listing/listing'
import { plannedLoadBase } from '../listing/listingPaths'
import { encodeBase64, fileBytes, type Annotations, type ProjectFile } from '../projectFiles'
import { inThreadWorker } from './inThreadWorker'
import {
    BACKGROUND_TIME_LIMIT_MS,
    KEPT_PSEUDOCODE,
    PseudocodeClient,
    type PseudocodeStage
} from './pseudocodeClient'
import { pseudocodeCommentPlace, pseudocodeMap } from './pseudocodeMap'

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

/**
 * A File's Listing as the editor makes it: at its load base, from its edited bytes, with the
 * renames and comments given.
 */
function listingOf(file: ProjectFile, annotations?: ListingAnnotations, name = 'crackme'): Listing {
    const bytes = fileBytes(file)
    return generateListing(decoder, {
        bytes,
        name,
        base: plannedLoadBase(decoder.analyze(bytes).pie),
        version: 'v1',
        ...(annotations ? { annotations } : {})
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

/** A decompilation asked of the package, at the image's addresses. */
type Call = { address: number; options?: DecompileOptions }

/**
 * The package's decompiler, counting what is asked of it, with an optional stand-in for each
 * decompilation; `calls` lists the decompilations in the order they ran.
 */
function counting(
    decompile?: (
        program: DecompiledProgram,
        address: number,
        options?: DecompileOptions
    ) => DecompiledFunction
) {
    const counts: Counts = { loads: 0, opens: 0, decompiles: 0, programsDisposed: 0, disposed: 0 }
    const calls: Call[] = []
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
                        calls.push({ address, ...(options ? { options } : {}) })
                        return decompile
                            ? decompile(program, address, options)
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
    return { counts, calls, load }
}

function text(result: DecompiledFunction) {
    if ('error' in result) throw new Error(result.error)
    return result
}

describe('the Pseudocode client without a Worker', () => {
    it('decompiles a function of a Listing, at its link-time addresses', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const result = await client.decompile('crackme', file, listing, MAIN)
        expect(result).toEqual({
            address: MAIN,
            error: 'main took longer than 30 seconds to decompile.'
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
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
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const start = listing.functions.find((fn) => fn.name === '_start')!.address
        const abort = new AbortController()
        const dropped = client.decompile('crackme', file, listing, MAIN, { signal: abort.signal })
        client.dispose()
        expect(await dropped).toEqual({
            address: MAIN,
            error: 'The decompiler stopped unexpectedly. Try again.'
        })
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
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const waiting = client.decompile('crackme', file, listing, MAIN)
        client.dispose()
        expect(await waiting).toEqual({
            address: MAIN,
            error: 'The decompiler stopped unexpectedly. Try again.'
        })
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
    it('answers with an error where its worker cannot start, as without a Worker', async () => {
        expect(typeof Worker).toBe('undefined')
        const client = new PseudocodeClient(undefined, { prototypes: async () => '' })
        const file = crackmeFile()
        const result = await client.decompile('crackme', file, listingOf(file), MAIN)
        expect(result).toMatchObject({ address: MAIN })
        expect('error' in result && result.error).toBe(
            'The decompiler stopped unexpectedly. Try again.'
        )
        client.dispose()
    })

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
            error: 'The decompiler stopped responding after 0.05 seconds.'
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

/** A link-time address as a File's Annotations key it. */
const key = (address: number) => `0x${address.toString(16)}`

/** The link-time address of the first instruction in `fn`'s Listing lines that `pattern` finds. */
function instructionAddress(listing: Listing, fnAddress: number, pattern: RegExp): number {
    const fn = listing.functions.find((candidate) => candidate.address === fnAddress)!
    const lines = listing.text.split('\n')
    for (let line = fn.line; line < fn.endLine; line++)
        if (pattern.test(lines[line])) return listing.lines.addresses[line]
    throw new Error(`no ${pattern} in ${fn.name}`)
}

/** crackme's `_start`, link-time. */
const START = 0x1100

describe("the Pseudocode client with a File's Annotations", () => {
    it('decompiles a function with its renamed locals, comments and function comment', async () => {
        const { calls, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const plain = crackmeFile()
        const listing = listingOf(plain)
        const strcmp = instructionAddress(listing, MAIN, /\bcall\s+strcmp@plt\b/)
        const annotations: Annotations = {
            comments: {
                [key(MAIN)]: 'at endbr64',
                [key(strcmp)]: 'compares it',
                [key(START)]: 'in _start'
            },
            functionComments: { [key(MAIN)]: 'Reads the password' },
            locals: {
                [key(MAIN)]: { 'stack:-0x98': 'password', 'register:0x0:4@+0x8e': 'result' }
            }
        }
        const main = text(
            await client.decompile('crackme', { ...plain, annotations }, listing, MAIN)
        )
        //the function comment, then what no statement holds: the endbr64 has no p-code
        expect(main.lines.slice(0, 6).map((line) => line.text)).toEqual([
            '/* Reads the password */',
            '',
            '/* Comments that could not be placed in the function body: */',
            ' /* at endbr64 */',
            '',
            'undefined8 main(void)'
        ])
        //only the comments in main's range were passed: _start's is listed nowhere
        expect(main.text).not.toContain('in _start')
        expect(calls[0].options).toEqual({
            locals: [
                { id: 'register:0x0:4@+0x8e', name: 'result' },
                { id: 'stack:-0x98', name: 'password' }
            ],
            comments: [
                { address: MAIN + listing.base, text: 'at endbr64' },
                { address: strcmp + listing.base, text: 'compares it' }
            ],
            unplacedComments: true,
            functionComment: 'Reads the password'
        })
        //the comment above the statement whose code holds its address
        const call = main.lines.findIndex(
            (line) => line.text.trim() === 'result = strcmp(password,"hunter2");'
        )
        expect(main.lines[call - 1].text.trim()).toBe('/* compares it */')
        expect(main.text).toContain('pcVar2 = fgets(password,0x80,stdin);')
        //the tokens say whose names and comments they are, at link-time addresses
        expect(main.lines[call - 1].tokens[0]).toMatchObject({
            kind: 'comment',
            comment: 'user',
            address: strcmp
        })
        expect(main.lines[0].tokens[0]).toMatchObject({ comment: 'user', address: MAIN })
        expect(main.lines[2].tokens[0]).toMatchObject({ comment: 'warning' })
        const [result] = main.lines[call].tokens
        expect(result).toMatchObject({ kind: 'variable', variable: 'register:0x0:4@+0x8e' })
        expect(main.variables).toContainEqual({
            id: 'stack:-0x98',
            kind: 'local',
            name: 'password',
            storage: 'Stack[-0x98]'
        })
        client.dispose()
    })

    it('keys a function by its own Annotations, opening the program again only for renames', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const plain = crackmeFile()
        const listing = listingOf(plain)
        const first = text(await client.decompile('crackme', plain, listing, MAIN))
        expect(counts).toMatchObject({ opens: 1, decompiles: 1 })

        //another function's comment and locals, and the Listing they make: nothing changes
        const elsewhere: ProjectFile = {
            ...plain,
            annotations: {
                comments: { [key(START)]: 'the entry' },
                locals: { [key(START)]: { 'register:0x10:8@-0x1': 'finish' } }
            }
        }
        const commentedListing = listingOf(elsewhere, {
            comments: new Map([[START, 'the entry']])
        })
        expect(await client.decompile('crackme', elsewhere, commentedListing, MAIN)).toBe(first)
        expect(counts).toMatchObject({ opens: 1, decompiles: 1 })

        //a local of its own: decompiled again, the program as it was
        const local: ProjectFile = {
            ...plain,
            annotations: { locals: { [key(MAIN)]: { 'stack:-0x98': 'password' } } }
        }
        expect(text(await client.decompile('crackme', local, listing, MAIN)).text).toContain(
            'fgets(password,0x80,stdin)'
        )
        expect(counts).toMatchObject({ opens: 1, decompiles: 2 })
        //a comment of its own, with the Listing it makes
        const commented: ProjectFile = {
            ...local,
            annotations: { ...local.annotations, comments: { [key(MAIN)]: 'the start' } }
        }
        const withComment = text(
            await client.decompile(
                'crackme',
                commented,
                listingOf(commented, { comments: new Map([[MAIN, 'the start']]) }),
                MAIN
            )
        )
        expect(withComment.text).toContain('/* the start */')
        expect(counts).toMatchObject({ opens: 1, decompiles: 3 })

        //a global rename names main in the program: it is opened again
        const named: ProjectFile = { ...plain, annotations: { names: { [key(MAIN)]: 'check' } } }
        const renamed = text(
            await client.decompile(
                'crackme',
                named,
                listingOf(named, { names: new Map([[MAIN, 'check']]) }),
                MAIN
            )
        )
        expect(renamed.lines[0].text).toBe('undefined8 check(void)')
        expect(counts).toMatchObject({ opens: 2, programsDisposed: 1, decompiles: 4 })
        //Reset name finds the first result kept
        expect(await client.decompile('crackme', plain, listing, MAIN)).toBe(first)
        expect(counts.decompiles).toBe(4)
        client.dispose()
    })

    it("names a local and places a comment at a statement's first instruction in factcheck", async () => {
        const client = new PseudocodeClient(inThreadWorker())
        const plain: ProjectFile = {
            encoding: 'base64',
            content: encodeBase64(
                new Uint8Array(
                    readFileSync(
                        new URL(
                            '../../../../decompiler/js/tests/fixtures/elf/factcheck',
                            import.meta.url
                        )
                    )
                )
            )
        }
        const listing = listingOf(plain, undefined, 'factcheck')
        const fn = listing.functions.find((candidate) => candidate.name === 'main')!
        const before = text(await client.decompile('factcheck', plain, listing, fn.address))
        const stack = before.variables.find((variable) => /Stack_/.test(variable.name))!
        expect(stack.id).toMatch(/^stack:-0x[\da-f]+$/)
        //a call on a line of its own, and where Comment… on that line keeps its comment
        const map = pseudocodeMap(listing, fn, before.lines, 0)
        const statement = before.lines.findIndex(
            (line, index) =>
                /^\s+\w+\(.*\);$/.test(line.text) &&
                pseudocodeCommentPlace(map, listing, before.lines, fn, index)?.kind === 'line'
        )
        const place = pseudocodeCommentPlace(map, listing, before.lines, fn, statement)!
        expect(place.address).toBe(before.lines[statement].addresses[0])
        const after = text(
            await client.decompile(
                'factcheck',
                {
                    ...plain,
                    annotations: {
                        locals: { [key(fn.address)]: { [stack.id]: 'flag' } },
                        comments: { [key(place.address)]: 'the call' }
                    }
                },
                listing,
                fn.address
            )
        )
        const rename = (line: string) => line.split(stack.name).join('flag')
        expect(after.text.split('\n').filter((line) => !line.includes('the call'))).toEqual(
            before.text.split('\n').map(rename)
        )
        //directly above the statement, or above the decompiler's warnings there
        const comment = after.lines.findIndex((line) => line.text.trim() === '/* the call */')
        const below = after.lines
            .slice(comment + 1)
            .find((line) => !line.tokens.every((token) => token.kind === 'comment'))!
        expect(below.text).toBe(rename(before.lines[statement].text))
        expect(after.variables.find((variable) => variable.id === stack.id)?.name).toBe('flag')
        client.dispose()
    })
})

/** A Promise's state once pending callbacks have run. */
async function settled<T>(promise: Promise<T>): Promise<'pending' | 'settled'> {
    let state: 'pending' | 'settled' = 'pending'
    void promise.then(
        () => (state = 'settled'),
        () => (state = 'settled')
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    return state
}

describe('the Pseudocode client’s keys', () => {
    it('keeps its program open over many comments of one function', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const first = text(await client.decompile('crackme', file, listing, MAIN))
        //more Annotations keys than the client numbers at once, each a function comment
        for (let k = 0; k < 4 * KEPT_PSEUDOCODE + 12; k++)
            await client.decompile('crackme', file, listing, START, {
                annotations: { locals: [], comments: [], functionComment: `note ${k}` }
            })
        expect(counts.opens).toBe(1)
        //the File's content keeps its number: the same program, and main's result is not kept
        //past the last 32, so it is decompiled once more, by the program opened once
        const again = text(await client.decompile('crackme', file, listing, MAIN))
        expect(again.text).toBe(first.text)
        expect(counts.opens).toBe(1)
        client.dispose()
    }, 60_000)
})

describe('the Pseudocode client’s background lane', () => {
    it('answers a pane’s request before the background’s waiting ones', async () => {
        const { calls, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const deregister = listing.functions.find((fn) => fn.name === 'deregister_tm_clones')!
        const background = [
            client.decompile('crackme', file, listing, MAIN, { priority: 'background' }),
            client.decompile('crackme', file, listing, START, { priority: 'background' })
        ]
        const visible = client.decompile('crackme', file, listing, deregister.address)
        await Promise.all([...background, visible])
        expect(calls.map((call) => call.address - listing.base)).toEqual([
            MAIN,
            deregister.address,
            START
        ])
        client.dispose()
    })

    it('gives the background its time limit, keeping neither its results nor its failures', async () => {
        const { calls, counts, load } = counting((program, address, options) =>
            options?.timeLimitMs
                ? { address, error: 'main took longer than 1.234 seconds to decompile' }
                : program.decompile(address, options)
        )
        const client = new PseudocodeClient(inThreadWorker(load), {
            backgroundTimeLimitMs: 1234
        })
        expect(BACKGROUND_TIME_LIMIT_MS).toBe(5000)
        const file = crackmeFile()
        const listing = listingOf(file)
        const background = () =>
            client.decompile('crackme', file, listing, MAIN, { priority: 'background' })
        expect(await background()).toEqual({
            address: MAIN,
            error: 'main took longer than 1.234 seconds to decompile.'
        })
        expect(calls[0].options).toEqual({ timeLimitMs: 1234 })
        await background()
        expect(counts.decompiles).toBe(2)
        //a pane's has the decompiler's own limit, and is kept; the background then reads it
        const shown = text(await client.decompile('crackme', file, listing, MAIN))
        expect(calls[2].options).toBeUndefined()
        expect(await background()).toBe(shown)
        expect(counts.decompiles).toBe(3)
        client.dispose()
    })

    it('never keeps what the background decompiled for a pane', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        await client.decompile('crackme', file, listing, MAIN, { priority: 'background' })
        await client.decompile('crackme', file, listing, MAIN, { priority: 'background' })
        expect(counts.decompiles).toBe(2)
        await client.decompile('crackme', file, listing, MAIN)
        expect(counts.decompiles).toBe(3)
        client.dispose()
    })

    it('moves a waiting background request to a pane that asks for it, with the pane’s limit', async () => {
        const { calls, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const running = client.decompile('crackme', file, listing, MAIN)
        const background = client.decompile('crackme', file, listing, START, {
            priority: 'background'
        })
        const visible = client.decompile('crackme', file, listing, START)
        await running
        expect(await visible).toBe(await background)
        expect(calls.map((call) => [call.address - listing.base, call.options])).toEqual([
            [MAIN, undefined],
            [START, undefined]
        ])
        client.dispose()
    })

    it('lets a background request ride along a pane’s waiting one', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const running = client.decompile('crackme', file, listing, MAIN)
        const visible = client.decompile('crackme', file, listing, START)
        const background = client.decompile('crackme', file, listing, START, {
            priority: 'background'
        })
        await running
        expect(await background).toBe(await visible)
        expect(counts.decompiles).toBe(2)
        client.dispose()
    })

    it('gives a pane waiting behind the background’s request its own try past the time limit', async () => {
        const { counts, load } = counting((program, address, options) =>
            options?.timeLimitMs
                ? { address, error: 'main took longer than 5 seconds to decompile' }
                : program.decompile(address, options)
        )
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const background = client.decompile('crackme', file, listing, MAIN, {
            priority: 'background'
        })
        //once the background's has started
        await vi.waitFor(() => expect(counts.decompiles).toBe(1))
        const visible = client.decompile('crackme', file, listing, MAIN)
        expect(await background).toMatchObject({ error: expect.stringContaining('5 seconds') })
        expect(text(await visible).name).toBe('main')
        expect(counts.decompiles).toBe(2)
        client.dispose()
    })

    it('reaches the decompiler’s own time limit', async () => {
        const client = new PseudocodeClient(inThreadWorker(), { backgroundTimeLimitMs: 1 })
        const file = crackmeFile()
        const listing = listingOf(file)
        const result = await client.decompile('crackme', file, listing, MAIN, {
            priority: 'background'
        })
        expect(result).toEqual({ address: MAIN, error: 'main took longer than 1 ms to decompile.' })
        client.dispose()
    })

    it('moves a pane’s request back to the background once only the background waits on it', async () => {
        const { counts, calls, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const deregister = listing.functions.find((fn) => fn.name === 'deregister_tm_clones')!
        const running = client.decompile('crackme', file, listing, MAIN)
        const pane = new AbortController()
        const visible = client.decompile('crackme', file, listing, START, { signal: pane.signal })
        const background = client.decompile('crackme', file, listing, START, {
            priority: 'background'
        })
        //the pane moved on before its turn: the background's request stays, as the background's
        pane.abort(new DOMException('Moved on', 'AbortError'))
        await expect(visible).rejects.toThrow('Moved on')
        const later = client.decompile('crackme', file, listing, deregister.address)
        await Promise.all([running, background, later])
        expect(calls.map((call) => [call.address - listing.base, call.options])).toEqual([
            [MAIN, undefined],
            [deregister.address, undefined],
            [START, { timeLimitMs: BACKGROUND_TIME_LIMIT_MS }]
        ])
        //and its result is not kept, as the background's never are
        await client.decompile('crackme', file, listing, START, { priority: 'background' })
        expect(counts.decompiles).toBe(4)
        client.dispose()
    })

    it('drops a waiting background request when its signal aborts', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const running = client.decompile('crackme', file, listing, MAIN)
        const abort = new AbortController()
        const background = client.decompile('crackme', file, listing, START, {
            priority: 'background',
            signal: abort.signal
        })
        abort.abort(new DOMException('Stopped', 'AbortError'))
        await expect(background).rejects.toThrow('Stopped')
        await running
        expect(await settled(running)).toBe('settled')
        expect(counts.decompiles).toBe(1)
        client.dispose()
    })

    it('keeps a held program open after its release, closing it as the batch lets go', async () => {
        const { counts, load } = counting()
        const client = new PseudocodeClient(inThreadWorker(load))
        const file = crackmeFile()
        const listing = listingOf(file)
        const letGo = client.hold('crackme')
        await client.decompile('crackme', file, listing, MAIN)
        client.release('crackme')
        await client.decompile('crackme', file, listing, START, { priority: 'background' })
        expect(counts).toMatchObject({ opens: 1, programsDisposed: 0 })
        letGo()
        letGo()
        await vi.waitFor(() => expect(counts.programsDisposed).toBe(1))

        //a batch's alone closes as it lets go; one a pane shows stays for the pane
        const batch = client.hold('crackme')
        const deregister = listing.functions.find((fn) => fn.name === 'deregister_tm_clones')!
        await client.decompile('crackme', file, listing, deregister.address, {
            priority: 'background'
        })
        batch()
        await vi.waitFor(() => expect(counts.programsDisposed).toBe(2))
        const shown = client.hold('crackme')
        await client.decompile('crackme', file, listing, START)
        shown()
        await client.decompile('crackme', file, listing, MAIN)
        expect(counts).toMatchObject({ opens: 3, programsDisposed: 2 })
        client.dispose()
    })
})
