import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
    ANALYSIS_RETRY_MS,
    AnalysisUnavailableError,
    startProjectWorker
} from './projectWorkerServer'
import type { ProjectWorkerRequest } from '../protocol'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('worker build configuration', () => {
    it('carries every build field to analysis and clears fields omitted by an update', async () => {
        vi.useFakeTimers()
        let receive!: (event: { data: ProjectWorkerRequest }) => void
        vi.stubGlobal('self', {
            addEventListener: (_type: string, listener: typeof receive) => {
                receive = listener
            },
            postMessage: vi.fn()
        })
        const analyze = vi.fn((_sources, sessionId, revision, target) => ({
            sessionId,
            revision,
            target,
            diagnostics: [],
            symbols: [],
            occurrences: [],
            fileStatus: {}
        }))
        startProjectWorker(analyze)
        const files = { 'main.asm': { encoding: 'plain' as const, content: 'nop' } }
        receive({
            data: {
                type: 'open',
                sessionId: 'metadata',
                revision: 1,
                target: 'X86',
                entry: 'main.asm',
                files,
                x86Support: true,
                compiledLanguages: { 'main.asm': 'cpp' }
            }
        })
        await vi.advanceTimersByTimeAsync(40)
        expect(analyze.mock.calls[0][0]).toEqual({
            entry: 'main.asm',
            files,
            x86Support: true,
            compiledLanguages: { 'main.asm': 'cpp' }
        })
        receive({
            data: {
                type: 'update',
                sessionId: 'metadata',
                revision: 2,
                entry: 'main.asm',
                changes: []
            }
        })
        await vi.advanceTimersByTimeAsync(40)
        expect(analyze.mock.calls[1][0]).toEqual({ entry: 'main.asm', files })
    })
})

describe('an analysis that could not run', () => {
    /** A worker over one x86 session, whose analysis the test writes. */
    function worker(analyze: Parameters<typeof startProjectWorker>[0]) {
        vi.useFakeTimers()
        let receive!: (event: { data: ProjectWorkerRequest }) => void
        const postMessage = vi.fn()
        vi.stubGlobal('self', {
            addEventListener: (_type: string, listener: typeof receive) => {
                receive = listener
            },
            postMessage
        })
        startProjectWorker(analyze)
        receive({
            data: {
                type: 'open',
                sessionId: 'download',
                revision: 1,
                target: 'X86',
                entry: 'main.asm',
                files: { 'main.asm': { encoding: 'plain', content: 'nop' } }
            }
        })
        return { receive, posted: () => postMessage.mock.calls.map(([message]) => message) }
    }

    const snapshot = (revision: number, message?: string) => ({
        sessionId: 'download',
        revision,
        target: 'X86' as const,
        diagnostics: message
            ? [
                  {
                      severity: 'warning' as const,
                      source: 'nasm-project',
                      location: {
                          path: 'main.asm',
                          range: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } }
                      },
                      message
                  }
              ]
            : [],
        symbols: [],
        occurrences: [],
        fileStatus: {}
    })

    it('sends what the adapter says instead, and analyzes the revision again later', async () => {
        const analyze = vi.fn((_sources, _sessionId, revision: number) => {
            if (analyze.mock.calls.length === 1)
                throw new AnalysisUnavailableError('no assembler', snapshot(revision, 'later'))
            return snapshot(revision)
        })
        const { posted } = worker(analyze)
        await vi.advanceTimersByTimeAsync(40)
        //no failure, which the session would show as an error that holds Build back
        expect(posted()).toEqual([
            { type: 'ready' },
            { type: 'analysis', snapshot: snapshot(1, 'later') }
        ])
        await vi.advanceTimersByTimeAsync(ANALYSIS_RETRY_MS)
        await vi.advanceTimersByTimeAsync(40)
        expect(analyze).toHaveBeenCalledTimes(2)
        expect(posted().at(-1)).toEqual({ type: 'analysis', snapshot: snapshot(1) })
    })

    it('leaves the retry to an edit that came first, and to none when it cannot help', async () => {
        const analyze = vi.fn((_sources, _sessionId, revision: number) => {
            throw new AnalysisUnavailableError('refused', snapshot(revision, 'reload'), {
                retry: revision === 1
            })
        })
        const { receive } = worker(analyze)
        await vi.advanceTimersByTimeAsync(40)
        receive({
            data: {
                type: 'update',
                sessionId: 'download',
                revision: 2,
                entry: 'main.asm',
                changes: []
            }
        })
        await vi.advanceTimersByTimeAsync(40)
        expect(analyze.mock.calls.map((call) => call[2])).toEqual([1, 2])
        //revision 1's retry finds revision 2 analyzed, which asked for none
        await vi.advanceTimersByTimeAsync(ANALYSIS_RETRY_MS * 3)
        expect(analyze).toHaveBeenCalledTimes(2)
    })
})
