import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { normalizeBuildInput } from '#lib/projectFiles.ts'

const { FakeWorker, workers } = vi.hoisted(() => {
    /** A Worker on the calling thread: what the page posts it, and what it answers or how it dies. */
    class FakeWorker extends EventTarget {
        readonly posted: unknown[] = []
        terminated = false

        constructor() {
            super()
            workers.push(this)
        }

        postMessage(message: unknown) {
            this.posted.push(message)
        }

        terminate() {
            this.terminated = true
        }

        answer(data: unknown) {
            this.dispatchEvent(new MessageEvent('message', { data }))
        }

        /** What the browser fires when the Worker's script fails to load or throws. */
        crash(message: string) {
            this.dispatchEvent(Object.assign(new Event('error'), { message }))
        }
    }
    const workers: FakeWorker[] = []
    return { FakeWorker, workers }
})

vi.mock('./workers/m68k.worker?worker', () => ({ default: FakeWorker }))
vi.mock('./workers/mars.worker?worker', () => ({ default: FakeWorker }))
vi.mock('./workers/x86.worker?worker', () => ({ default: FakeWorker }))
vi.mock('./workers/z80.worker?worker', () => ({ default: FakeWorker }))

const sources = (content: string) =>
    normalizeBuildInput({ entry: 'main.s', files: { 'main.s': { encoding: 'plain', content } } })

beforeEach(() => {
    workers.length = 0
    vi.stubGlobal('Worker', FakeWorker)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.resetModules()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('an analysis Worker that dies', () => {
    it('fails the revision of every session on it, and starts again at the next change', async () => {
        const { ProjectLanguageSession } = await import('./ProjectLanguageSession')
        const first = new ProjectLanguageSession('first', sources('nop'))
        const second = new ProjectLanguageSession('second', sources('nop'))
        expect(workers).toHaveLength(1)
        workers[0].crash('Failed to fetch dynamically imported module')
        expect(workers[0].terminated).toBe(true)
        for (const session of [first, second]) {
            expect(session.pending).toBe(false)
            expect(session.snapshot?.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
                'M68K analysis stopped: Failed to fetch dynamically imported module. It starts again at the next edit.'
            ])
        }
        first.update(sources('nop\nnop'))
        expect(first.pending).toBe(true)
        expect(workers).toHaveLength(2)
        workers[1].answer({ type: 'ready' })
        expect(workers[1].posted).toMatchObject([{ type: 'open', sessionId: 'first', revision: 2 }])
        //a session that leaves the Worker that died has nothing to tell the new one
        second.dispose()
        expect(workers[1].posted).toHaveLength(1)
        first.dispose()
        expect(workers[1].posted).toMatchObject([
            { type: 'open' },
            { type: 'dispose', sessionId: 'first' }
        ])
    })
})
