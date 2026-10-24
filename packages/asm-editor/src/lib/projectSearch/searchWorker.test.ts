/**
 * The search worker's service, through its messages, on the calling thread
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 27).
 */
import { describe, expect, it, vi } from 'vite-plus/test'
import type { SearchWorkerRequest, SearchWorkerResponse } from './protocol'
import { createSearchService, startSearchWorker, type SearchServiceOptions } from './searchWorker'

function serve(options: SearchServiceOptions = {}) {
    const responses: SearchWorkerResponse[] = []
    const service = createSearchService((response) => responses.push(response), options)
    const doneWith = (search: number) =>
        vi.waitFor(() => {
            if (
                !responses.some(
                    (response) => response.type === 'done' && response.search === search
                )
            )
                throw new Error(`search ${search} is not done`)
        })
    return { responses, service, doneWith }
}

const put = (
    ...documents: [id: string, text: string, version?: number][]
): SearchWorkerRequest => ({
    type: 'put',
    documents: documents.map(([id, text, version = 1]) => ({ id, version, text }))
})

const search = (id: number, text: string, ids: string[], maxRows = 2_000): SearchWorkerRequest => ({
    type: 'search',
    search: id,
    query: { text },
    ids,
    maxRows
})

/** What a search's responses say, in order: each type, and each `results`' document ids. */
const summary = (responses: SearchWorkerResponse[]) =>
    responses.map((response) =>
        response.type === 'results'
            ? `results ${response.search}: ${response.documents.map((document) => document.id).join(' ')}`
            : response.type === 'done'
              ? `done ${response.search}${response.cancelled ? ' cancelled' : ''}`
              : response.type === 'ready'
                ? 'ready'
                : `${response.type} ${response.search}`
    )

/** A clock that moves on `step` milliseconds each time it is read, as a slow search would. */
const slowClock = (step: number) => {
    let time = 0
    return () => (time += step)
}

/** A pause that waits until the test opens it, and is no pause after. */
function gate() {
    const waiting: (() => void)[] = []
    let open = false
    return {
        pause: () =>
            open ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve)),
        get paused() {
            return waiting.length
        },
        open() {
            open = true
            for (const resolve of waiting.splice(0)) resolve()
        }
    }
}

describe('the search service', () => {
    it("searches the documents it is sent, in the request's order, giving each one's version", async () => {
        const { responses, service, doneWith } = serve()
        service.handle(put(['a', 'mov rax, 1\nret'], ['b', 'push rax\npop rax', 4], ['c', 'nop']))
        service.handle(search(1, 'rax', ['b', 'c', 'a', 'missing']))
        await doneWith(1)
        expect(summary(responses)).toEqual(['started 1', 'results 1: b a', 'done 1'])
        const results = responses.find((response) => response.type === 'results')!
        expect(results).toEqual({
            type: 'results',
            search: 1,
            documents: [
                {
                    id: 'b',
                    version: 4,
                    matches: 2,
                    lines: 2,
                    rows: [
                        { line: 1, text: 'push rax', textStart: 0, ranges: [{ start: 5, end: 8 }] },
                        { line: 2, text: 'pop rax', textStart: 0, ranges: [{ start: 4, end: 7 }] }
                    ]
                },
                {
                    id: 'a',
                    version: 1,
                    matches: 1,
                    lines: 1,
                    rows: [
                        {
                            line: 1,
                            text: 'mov rax, 1',
                            textStart: 0,
                            ranges: [{ start: 4, end: 7 }]
                        }
                    ]
                }
            ]
        })
    })

    it('replaces and removes documents', async () => {
        const { responses, service, doneWith } = serve()
        service.handle(put(['a', 'rax'], ['b', 'rax']))
        service.handle(put(['a', 'rbx', 2]))
        service.handle({ type: 'remove', ids: ['b'] })
        service.handle(search(1, 'rax', ['a', 'b']))
        await doneWith(1)
        expect(summary(responses)).toEqual(['started 1', 'done 1'])
    })

    it('lists at most the rows asked for across the documents, and counts the rest', async () => {
        const { responses, service, doneWith } = serve()
        service.handle(put(['a', 'e\ne\ne'], ['b', 'e\ne\ne'], ['c', 'e e']))
        service.handle(search(1, 'e', ['a', 'b', 'c'], 4))
        await doneWith(1)
        const results = responses.find((response) => response.type === 'results')!
        if (results.type !== 'results') return
        expect(
            results.documents.map(({ id, matches, lines, rows }) => [
                id,
                matches,
                lines,
                rows.length
            ])
        ).toEqual([
            ['a', 3, 3, 3],
            ['b', 3, 3, 1],
            ['c', 2, 1, 0]
        ])
    })

    it('sends what it has found at each pause between documents', async () => {
        let pauses = 0
        const { responses, service, doneWith } = serve({
            now: slowClock(15),
            sliceMs: 20,
            pause: async () => void pauses++
        })
        service.handle(put(['a', 'x'], ['b', 'nothing'], ['c', 'x'], ['d', 'x']))
        service.handle(search(1, 'x', ['a', 'b', 'c', 'd']))
        await doneWith(1)
        //each document takes 15 ms: a pause every other one
        expect(summary(responses)).toEqual([
            'started 1',
            'results 1: a',
            'results 1: c d',
            'done 1'
        ])
        expect(pauses).toBe(2)
    })

    it('ends a search at its next pause when a newer one comes, and answers that next', async () => {
        const paused = gate()
        const { responses, service, doneWith } = serve({ now: slowClock(25), pause: paused.pause })
        service.handle(put(['a', 'x y'], ['b', 'x y'], ['c', 'x y']))
        service.handle(search(1, 'x', ['a', 'b', 'c']))
        await vi.waitFor(() => expect(paused.paused).toBe(1))
        service.handle(search(2, 'y', ['c']))
        paused.open()
        await doneWith(2)
        expect(summary(responses)).toEqual([
            'started 1',
            'results 1: a',
            'done 1 cancelled',
            'started 2',
            'results 2: c',
            'done 2'
        ])
    })

    it('ends a search it is told to cancel, and one cancelled before it began at once', async () => {
        const paused = gate()
        const { responses, service, doneWith } = serve({ now: slowClock(25), pause: paused.pause })
        service.handle(put(['a', 'x'], ['b', 'x']))
        service.handle(search(1, 'x', ['a', 'b']))
        await vi.waitFor(() => expect(paused.paused).toBe(1))
        service.handle({ type: 'cancel', search: 1 })
        //a cancel for another search changes nothing
        service.handle({ type: 'cancel', search: 7 })
        paused.open()
        await doneWith(1)
        expect(summary(responses)).toEqual(['started 1', 'results 1: a', 'done 1 cancelled'])
    })

    it('fails a query that does not compile, and is done with it', async () => {
        const { responses, service, doneWith } = serve()
        service.handle(put(['a', 'x']))
        service.handle({
            type: 'search',
            search: 3,
            query: { text: 'str(', regex: true },
            ids: ['a'],
            maxRows: 10
        })
        await doneWith(3)
        expect(responses).toEqual([
            { type: 'started', search: 3 },
            {
                type: 'failure',
                search: 3,
                message: "This regular expression isn't valid: unterminated group."
            },
            { type: 'done', search: 3, cancelled: false }
        ])
    })

    it("runs in a worker's scope, announcing itself, by default pausing on a channel", async () => {
        const posted: SearchWorkerResponse[] = []
        let listener: ((event: MessageEvent<SearchWorkerRequest>) => void) | undefined
        startSearchWorker({
            postMessage: (response) => posted.push(response),
            addEventListener: (_type, listen) => (listener = listen)
        })
        expect(posted).toEqual([{ type: 'ready' }])
        const send = (data: SearchWorkerRequest) => listener!(new MessageEvent('message', { data }))
        const text = Array.from({ length: 20_000 }, (_, line) => `line ${line}`).join('\n')
        send(
            put(...Array.from({ length: 40 }, (_, index): [string, string] => [`d${index}`, text]))
        )
        send({
            type: 'search',
            search: 1,
            query: { text: 'line' },
            ids: Array.from({ length: 40 }, (_, index) => `d${index}`),
            maxRows: 5
        })
        await vi.waitFor(() =>
            expect(posted.at(-1)).toEqual({ type: 'done', search: 1, cancelled: false })
        )
        const results = posted.filter((response) => response.type === 'results')
        const documents = results.flatMap((response) => response.documents)
        expect(documents).toHaveLength(40)
        expect(documents.every((document) => document.matches === 20_000)).toBe(true)
        expect(documents.flatMap((document) => document.rows)).toHaveLength(5)
    })
})
