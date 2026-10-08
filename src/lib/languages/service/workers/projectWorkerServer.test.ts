import { afterEach, describe, expect, it, vi } from 'vitest'
import { startProjectWorker } from './projectWorkerServer'
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
