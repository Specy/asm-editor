/**
 * The search worker's client ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 27): on the calling thread through `InThreadSearchWorker`, with stand-ins for a worker
 * stuck in a regular expression, and with the real service in a Node thread, which the time limit
 * ends as the browser's `Worker.terminate` would.
 */
import { Worker as ThreadWorker } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { InThreadSearchWorker } from './inThreadSearchWorker'
import type { SearchWorkerRequest, SearchWorkerResponse } from './protocol'
import {
    ProjectSearchClient,
    SEARCH_ROW_LIMIT,
    type SearchOutcome,
    type SearchWorkerLike
} from './searchClient'
import {
    groupResults,
    searchDocumentId,
    type SearchDocument,
    type SearchDocumentResult
} from './searchResults'

/** A stand-in that sends its results after every document, so a search streams in many batches. */
class SlicedWorker extends InThreadSearchWorker {
    constructor() {
        super({ sliceMs: 0 })
    }
}

/**
 * A stand-in whose search for `(a+)+$` never ends, as a worker stuck in a regular expression that
 * backtracks: it says it began, and then reads no message and answers nothing.
 */
class HangingWorker extends InThreadSearchWorker {
    stuck = false

    postMessage(request: SearchWorkerRequest): void {
        if (this.stuck) return void this.received.push(structuredClone(request))
        if (request.type === 'search' && request.query.text === '(a+)+$') {
            this.stuck = true
            this.received.push(structuredClone(request))
            const started: SearchWorkerResponse = { type: 'started', search: request.search }
            queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: started })))
            return
        }
        super.postMessage(request)
    }
}

const SERVICE = new URL('./searchWorker.ts', import.meta.url).href
/** Runs the service in a Node thread, loading its TypeScript as Node strips its types. */
const BOOTSTRAP = `
const { parentPort, workerData } = require('node:worker_threads')
import(workerData.module).then(({ startSearchWorker }) =>
    startSearchWorker({
        postMessage: (response) => parentPort.postMessage(response),
        addEventListener: (_type, listener) => parentPort.on('message', (data) => listener({ data }))
    })
)`

/** The real service on a thread of its own, behind a Worker's methods. */
class ThreadSearchWorker extends EventTarget implements SearchWorkerLike {
    static readonly made: ThreadSearchWorker[] = []
    readonly thread = new ThreadWorker(BOOTSTRAP, { eval: true, workerData: { module: SERVICE } })
    readonly exited: Promise<number>
    terminated = false

    constructor() {
        super()
        ThreadSearchWorker.made.push(this)
        this.thread.on('message', (data) =>
            this.dispatchEvent(new MessageEvent('message', { data }))
        )
        this.thread.on('error', (error: Error) =>
            this.dispatchEvent(Object.assign(new Event('error'), { message: error.message }))
        )
        this.exited = new Promise((resolve) => this.thread.once('exit', resolve))
    }

    postMessage(request: SearchWorkerRequest) {
        this.thread.postMessage(request)
    }

    terminate() {
        this.terminated = true
        void this.thread.terminate()
    }
}

const file = (path: string, text: string): SearchDocument => ({ kind: 'file', path, text })
const listing = (path: string, text: string): SearchDocument => ({ kind: 'listing', path, text })
const pseudocode = (path: string, address: number, name: string, text: string): SearchDocument => ({
    kind: 'pseudocode',
    path,
    function: { address, name },
    text
})

const PROJECT: SearchDocument[] = [
    file('src/util.s', 'util:\n    mov rax, 1\n    ret'),
    pseudocode('crackme', 0x11e9, 'main', 'int main(void)\n{\n  strcmp(a,"hunter2");\n}'),
    file('main.s', 'main:\n    call util\n    mov rax, 60\n    syscall'),
    listing('crackme', 'main:\n    call strcmp@plt\n    mov eax, 0'),
    pseudocode('crackme', 0x1189, 'check', 'int check(void)\n{\n  return strcmp(a,b);\n}'),
    file('notes.md', 'Nothing to see')
]

/** Where each result is, as `path kind[@function]: lines`. */
const where = (results: readonly SearchDocumentResult[]) =>
    results.map(({ document, rows }) => {
        const at = document.function ? `@${document.function.name}` : ''
        return `${document.path} ${document.kind}${at}: ${rows.map((row) => row.line).join(',')}`
    })

const completed = (outcome: SearchOutcome) => {
    if (outcome.status !== 'complete') throw new Error(`the search ended ${outcome.status}`)
    return outcome
}

/** What each worker made was sent, as types, with each `put`'s ids. */
const sent = (worker: InThreadSearchWorker) =>
    worker.received.map((request) =>
        request.type === 'put'
            ? `put ${request.documents.map((document) => document.id).join(' ')}`
            : request.type === 'remove'
              ? `remove ${request.ids.join(' ')}`
              : request.type
    )

beforeEach(() => {
    InThreadSearchWorker.made.length = 0
})

afterEach(async () => {
    for (const worker of ThreadSearchWorker.made.splice(0)) {
        worker.terminate()
        await worker.exited
    }
})

describe('the search client', () => {
    it('streams the matches by File, then by function, and ends complete with the totals', async () => {
        const client = new ProjectSearchClient(SlicedWorker)
        client.sync(PROJECT)
        const batches: (readonly SearchDocumentResult[])[] = []
        const outcome = completed(
            await client.search({ text: 'STRCMP' }, { onResults: (batch) => batches.push(batch) })
                .done
        )
        expect(batches.length).toBeGreaterThan(1)
        expect(batches.flat()).toEqual(outcome.results)
        expect(where(outcome.results)).toEqual([
            'crackme listing: 2',
            'crackme pseudocode@check: 3',
            'crackme pseudocode@main: 3'
        ])
        expect(outcome.totals).toEqual({ matches: 3, lines: 3, rows: 3, documents: 3, files: 1 })
        expect(
            groupResults(outcome.results).map((group) => [
                group.kind,
                group.path,
                group.matches,
                group.documents.map((result) => result.document.function?.name ?? '')
            ])
        ).toEqual([
            ['listing', 'crackme', 1, ['']],
            ['pseudocode', 'crackme', 2, ['check', 'main']]
        ])

        const rax = completed(await client.search({ text: 'rax', wholeWord: true }).done)
        expect(where(rax.results)).toEqual(['main.s file: 3', 'src/util.s file: 2'])
        expect(rax.results[0].rows[0]).toEqual({
            line: 3,
            text: '    mov rax, 60',
            textStart: 0,
            ranges: [{ start: 8, end: 11 }]
        })
    })

    it('searches only what the include and exclude patterns leave, or the documents named', async () => {
        const client = new ProjectSearchClient(InThreadSearchWorker)
        client.sync(PROJECT)
        const found = async (query: Parameters<typeof client.search>[0], only?: string[]) =>
            where(completed(await client.search(query, { only }).done).results)
        expect(await found({ text: 'main', include: '*.s' })).toEqual(['main.s file: 1'])
        expect(await found({ text: 'main', exclude: 'crackme' })).toEqual(['main.s file: 1'])
        expect(await found({ text: 'main', include: 'src/**, crackme' })).toEqual([
            'crackme listing: 1',
            'crackme pseudocode@main: 1'
        ])
        const main = searchDocumentId({
            kind: 'pseudocode',
            path: 'crackme',
            function: { address: 0x11e9, name: 'main' }
        })
        expect(main).toBe('pseudocode:crackme@0x11e9')
        expect(await found({ text: 'strcmp' }, [main])).toEqual(['crackme pseudocode@main: 3'])
        //nothing to search is complete at once, with no worker
        const none = new ProjectSearchClient(InThreadSearchWorker)
        none.sync(PROJECT)
        expect(completed(await none.search({ text: 'x', include: '*.zip' }).done).results).toEqual(
            []
        )
        expect(InThreadSearchWorker.made).toHaveLength(1)
    })

    it("sends a document's text once, and again only when it changes", async () => {
        const client = new ProjectSearchClient(InThreadSearchWorker)
        client.sync(PROJECT)
        await client.search({ text: 'x' }).done
        const [worker] = InThreadSearchWorker.made
        expect(sent(worker)).toEqual([`put ${PROJECT.map(searchDocumentId).join(' ')}`, 'search'])
        worker.received.length = 0
        //the same texts as other strings, one changed, one gone
        const next = PROJECT.slice(0, -1).map((document) => ({
            ...document,
            text: `${document.text}`
        }))
        next[0] = { ...next[0], text: 'util:\n    ret' }
        client.sync(next)
        await client.search({ text: 'ret' }).done
        expect(sent(worker)).toEqual(['remove file:notes.md', 'put file:src/util.s', 'search'])
        worker.received.length = 0
        client.put([file('new.s', 'ret')])
        client.remove(['file:main.s'])
        await Promise.resolve()
        expect(sent(worker)).toEqual(['remove file:main.s', 'put file:new.s'])
        expect(client.size).toBe(PROJECT.length - 1)
    })

    it('waits as one types, a newer search replacing the one waiting', async () => {
        const client = new ProjectSearchClient(InThreadSearchWorker)
        client.sync(PROJECT)
        const first = client.search({ text: 'mo' }, { delayMs: 30 })
        const second = client.search({ text: 'mov' }, { delayMs: 30 })
        expect(await first.done).toEqual({ status: 'cancelled' })
        expect(InThreadSearchWorker.made).toHaveLength(0)
        const outcome = completed(await second.done)
        expect(outcome.totals.matches).toBe(3)
        const [worker] = InThreadSearchWorker.made
        const searches = worker.received.filter((request) => request.type === 'search')
        expect(searches.map((request) => request.query.text)).toEqual(['mov'])
    })

    it('ends a search on cancel or a newer one, sending nothing more for it', async () => {
        const client = new ProjectSearchClient(SlicedWorker)
        client.sync(Array.from({ length: 50 }, (_, index) => file(`f${index}.s`, 'mov rax, rbx')))
        let batches = 0
        const first = client.search(
            { text: 'rax' },
            {
                onResults: () => {
                    batches++
                    first.cancel()
                }
            }
        )
        expect(await first.done).toEqual({ status: 'cancelled' })
        expect(batches).toBe(1)
        const [worker] = InThreadSearchWorker.made
        expect(sent(worker).slice(-2)).toEqual(['search', 'cancel'])

        const older = client.search({ text: 'rbx' })
        const newer = client.search({ text: 'mov' })
        expect(await older.done).toEqual({ status: 'cancelled' })
        expect(completed(await newer.done).totals.matches).toBe(50)
    })

    it('lists 2,000 rows of 4,096 Files of 4 KiB, counting every match', async () => {
        const lines = [
            '    mov rax, qword [rbp-0x8]',
            '    call strcmp@plt',
            '  iVar1 = strcmp(a,b);',
            'end:'
        ]
        const documents = Array.from({ length: 4_096 }, (_, index) => {
            let text = ''
            for (let line = index; text.length < 4_096; line++)
                text += `${lines[line % lines.length]}\n`
            return file(`src/f${String(index).padStart(4, '0')}.s`, text.slice(0, 4_096))
        })
        const expected = documents.reduce(
            (count, { text }) => count + (text.match(/e/gi)?.length ?? 0),
            0
        )
        const client = new ProjectSearchClient(InThreadSearchWorker)
        client.sync(documents)
        let batches = 0
        const outcome = completed(
            await client.search({ text: 'E' }, { onResults: () => batches++ }).done
        )
        expect(outcome.totals.matches).toBe(expected)
        expect(outcome.totals.documents).toBe(4_096)
        expect(outcome.totals.rows).toBe(SEARCH_ROW_LIMIT)
        expect(outcome.totals.lines).toBeGreaterThan(SEARCH_ROW_LIMIT * 10)
        expect(outcome.results[0].document.path).toBe('src/f0000.s')
        expect(outcome.results.at(-1)?.rows).toEqual([])
        expect(batches).toBeGreaterThan(0)
        //Show more: the same search with more rows
        const more = completed(
            await client.search({ text: 'E' }, { maxRows: 2 * SEARCH_ROW_LIMIT }).done
        )
        expect(more.totals.rows).toBe(2 * SEARCH_ROW_LIMIT)
    })

    it('drops the rows of a document changed after it was searched', async () => {
        const client = new ProjectSearchClient(InThreadSearchWorker)
        client.sync(PROJECT)
        await client.search({ text: 'x' }).done
        const search = client.search({ text: 'rax' })
        //sent after the search, so the worker searches the text before it
        client.put([file('main.s', 'main:\n    xor rax, rax\n    ret')])
        expect(where(completed(await search.done).results)).toEqual(['src/util.s file: 2'])
        expect(where(completed(await client.search({ text: 'rax' }).done).results)).toEqual([
            'main.s file: 2',
            'src/util.s file: 2'
        ])
    })

    it('says why a query cannot be searched, and searches nothing for an empty one', async () => {
        const client = new ProjectSearchClient(InThreadSearchWorker)
        client.sync(PROJECT)
        expect(await client.search({ text: '(', regex: true }).done).toEqual({
            status: 'invalid',
            problem: "This regular expression isn't valid: unterminated group."
        })
        expect(await client.search({ text: '' }).done).toEqual({
            status: 'complete',
            results: [],
            totals: { matches: 0, lines: 0, rows: 0, documents: 0, files: 0 }
        })
        expect(InThreadSearchWorker.made).toHaveLength(0)
    })

    it('ends a search past its time limit, and starts a new worker with every document for the next', async () => {
        const client = new ProjectSearchClient(HangingWorker, { timeLimitMs: 50 })
        client.sync(PROJECT)
        const batches: unknown[] = []
        const outcome = await client.search(
            { text: '(a+)+$', regex: true },
            { onResults: (batch) => batches.push(batch) }
        ).done
        expect(outcome).toEqual({ status: 'timedOut', results: [] })
        const [stuck] = InThreadSearchWorker.made
        expect(stuck.terminated).toBe(true)
        const after = completed(await client.search({ text: 'strcmp' }).done)
        expect(after.totals.matches).toBe(3)
        const [, fresh] = InThreadSearchWorker.made
        expect(sent(fresh)).toEqual([`put ${PROJECT.map(searchDocumentId).join(' ')}`, 'search'])
    })

    it('ends a worker stuck on a search a newer one replaced, and runs the newer on a new worker', async () => {
        const client = new ProjectSearchClient(HangingWorker, { timeLimitMs: 50 })
        client.sync(PROJECT)
        const stuck = client.search({ text: '(a+)+$', regex: true })
        await vi.waitFor(() =>
            expect((InThreadSearchWorker.made[0] as HangingWorker)?.stuck).toBe(true)
        )
        const next = client.search({ text: 'strcmp' })
        expect(await stuck.done).toEqual({ status: 'cancelled' })
        expect(completed(await next.done).totals.matches).toBe(3)
        expect(InThreadSearchWorker.made.map((worker) => worker.terminated)).toEqual([true, false])
    })

    it('fails a search whose worker dies or cannot start, and starts another for the next', async () => {
        const client = new ProjectSearchClient(HangingWorker)
        client.sync(PROJECT)
        const dying = client.search({ text: '(a+)+$', regex: true })
        await vi.waitFor(() => expect(InThreadSearchWorker.made).toHaveLength(1))
        InThreadSearchWorker.made[0].dispatchEvent(
            Object.assign(new Event('error'), { message: 'out of memory' })
        )
        expect(await dying.done).toEqual({
            status: 'failed',
            message: 'Search stopped unexpectedly. Search again to retry.'
        })
        expect(completed(await client.search({ text: 'strcmp' }).done).totals.matches).toBe(3)
        expect(InThreadSearchWorker.made).toHaveLength(2)

        const nowhere = new ProjectSearchClient(
            class {
                constructor() {
                    throw new ReferenceError('Worker is not defined')
                }
            } as unknown as new () => SearchWorkerLike
        )
        nowhere.sync(PROJECT)
        expect(await nowhere.search({ text: 'strcmp' }).done).toEqual({
            status: 'failed',
            message: "Search couldn't start (Worker is not defined). Reload the page to try again."
        })
    })

    it('ends its worker and forgets its documents when disposed', async () => {
        const client = new ProjectSearchClient(SlicedWorker)
        client.sync(PROJECT)
        const search = client.search({ text: 'e' })
        client.dispose()
        expect(await search.done).toEqual({ status: 'cancelled' })
        expect(client.size).toBe(0)
        expect(InThreadSearchWorker.made.every((worker) => worker.terminated)).toBe(true)
    })
})

describe('the search client with the service in a thread', () => {
    it('ends a regular expression that backtracks for minutes, and searches again in a new thread', async () => {
        const client = new ProjectSearchClient(ThreadSearchWorker, { timeLimitMs: 1_000 })
        client.sync([...PROJECT, file('aaa.txt', `${'a'.repeat(40)}b`)])
        expect(completed(await client.search({ text: 'strcmp' }).done).totals.matches).toBe(3)
        const started = performance.now()
        const outcome = await client.search({ text: '(a+)+$', regex: true }).done
        expect(outcome.status).toBe('timedOut')
        expect(performance.now() - started).toBeLessThan(5_000)
        const [first] = ThreadSearchWorker.made
        expect(first.terminated).toBe(true)
        await first.exited
        const again = completed(await client.search({ text: 'aaab', include: '*.txt' }).done)
        expect(where(again.results)).toEqual(['aaa.txt file: 1'])
        expect(ThreadSearchWorker.made).toHaveLength(2)
    }, 20_000)
})
