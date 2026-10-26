import { describe, expect, it, vi } from 'vite-plus/test'
import { normalizeBuildInput } from '#lib/projectFiles.ts'
import type { ProjectWorkerRequest } from './protocol'
import type { LanguageWorkerMessage } from './LanguageWorkerManager'

const worker = vi.hoisted(() => ({
    receive: undefined as ((message: LanguageWorkerMessage) => void) | undefined,
    requests: [] as ProjectWorkerRequest[]
}))

vi.mock('./LanguageWorkerManager', () => ({
    languageWorkerManager: {
        acquire: vi.fn(
            (
                _target: string,
                _sessionId: string,
                receive: (message: LanguageWorkerMessage) => void
            ) => {
                worker.receive = receive
                return {
                    post: (request: ProjectWorkerRequest) => worker.requests.push(request),
                    dispose: vi.fn()
                }
            }
        )
    }
}))

import { ProjectLanguageSession } from './ProjectLanguageSession'
import { languageWorkerManager } from './LanguageWorkerManager'

function snapshot(revision: number) {
    return {
        sessionId: 'session',
        revision,
        target: 'M68K' as const,
        diagnostics: [],
        symbols: [],
        occurrences: [],
        fileStatus: { 'main.s': 'assembled' as const }
    }
}

describe('ProjectLanguageSession', () => {
    it('revises profile-only changes and preserves the profile captured by a Build', () => {
        worker.requests = []
        const initial = normalizeBuildInput({
            entry: 'main.s',
            files: { 'main.s': { encoding: 'plain', content: 'nop' } },
            assemblerProfile: 'rars'
        })
        const session = new ProjectLanguageSession('profile-session', initial, 'RISC-V')
        session.setBuild(1, initial)
        session.update({ ...initial, assemblerProfile: 'gnu-compiler-v1' })
        worker.receive?.({
            type: 'failure',
            sessionId: 'profile-session',
            revision: 1,
            message: 'old profile failed'
        })
        expect(session.snapshot).toBeUndefined()
        expect(worker.requests).toMatchObject([
            { type: 'open', revision: 1, assemblerProfile: 'rars' },
            { type: 'update', revision: 2, changes: [], assemblerProfile: 'gnu-compiler-v1' }
        ])
        expect(session.sourcesFor('build', 1)?.assemblerProfile).toBe('rars')
        expect(session.sources.assemblerProfile).toBe('gnu-compiler-v1')
        session.dispose()
    })
    it('transports support and source languages, revises metadata changes, and clears omitted fields', () => {
        worker.requests = []
        const initial = normalizeBuildInput({
            entry: 'main.s',
            files: { 'main.s': { encoding: 'plain', content: 'nop' } },
            x86Support: true,
            compiledLanguages: { 'main.s': 'cpp' }
        })
        const session = new ProjectLanguageSession('metadata-session', initial, 'X86')
        session.update({ ...initial, x86Support: false })
        session.update({ ...initial, x86Support: false, compiledLanguages: { 'main.s': 'c' } })
        session.update({ entry: initial.entry, files: initial.files })
        expect(worker.requests).toMatchObject([
            { type: 'open', revision: 1, x86Support: true, compiledLanguages: { 'main.s': 'cpp' } },
            { type: 'update', revision: 2, changes: [], x86Support: false },
            { type: 'update', revision: 3, changes: [], compiledLanguages: { 'main.s': 'c' } },
            { type: 'update', revision: 4, changes: [] }
        ])
        expect(worker.requests[3]).not.toHaveProperty('x86Support')
        expect(worker.requests[3]).not.toHaveProperty('compiledLanguages')
        session.dispose()
    })
    it('retains the last complete snapshot while a newer revision is pending', () => {
        worker.requests = []
        const initial = normalizeBuildInput({
            entry: 'main.s',
            files: { 'main.s': { encoding: 'plain', content: 'nop' } }
        })
        const session = new ProjectLanguageSession('session', initial)
        const events: { revision: number | undefined; pending: boolean }[] = []
        const unsubscribe = session.subscribe((value, pending) => {
            events.push({ revision: value?.revision, pending })
        })

        expect(events).toEqual([{ revision: undefined, pending: true }])
        worker.receive?.({ type: 'analysis', snapshot: snapshot(1) })
        expect(events[events.length - 1]).toEqual({ revision: 1, pending: false })

        session.update(
            normalizeBuildInput({
                entry: 'main.s',
                files: { 'main.s': { encoding: 'plain', content: 'nop\nnop' } }
            })
        )
        expect(session.snapshot?.revision).toBe(1)
        expect(events[events.length - 1]).toEqual({ revision: 1, pending: true })

        worker.receive?.({ type: 'analysis', snapshot: snapshot(2) })
        expect(events[events.length - 1]).toEqual({ revision: 2, pending: false })
        expect(worker.requests.map((request) => request.type)).toEqual(['open', 'update'])

        unsubscribe()
        session.dispose()
    })

    it('fails the revision its Worker died on, and opens every File on a new one at the next change', () => {
        worker.requests = []
        const initial = normalizeBuildInput({
            entry: 'main.s',
            files: { 'main.s': { encoding: 'plain', content: 'nop' } }
        })
        const session = new ProjectLanguageSession('dying-session', initial)
        const acquired = vi.mocked(languageWorkerManager.acquire).mock.calls.length
        session.update(
            normalizeBuildInput({
                entry: 'main.s',
                files: { 'main.s': { encoding: 'plain', content: 'nop\nnop' } }
            })
        )
        const message = 'M68K analysis stopped: the worker failed to start.'
        worker.receive?.({ type: 'worker-died', message })
        expect(session.pending).toBe(false)
        expect(session.snapshot).toMatchObject({
            revision: 2,
            diagnostics: [{ severity: 'error', message, location: { path: 'main.s' } }],
            symbols: [],
            //nothing was checked, so no File can be said to be out of the program
            fileStatus: { 'main.s': 'unknown' }
        })
        const files = {
            'main.s': { encoding: 'plain' as const, content: 'nop\nnop\nnop' },
            'more.s': { encoding: 'plain' as const, content: 'nop' }
        }
        session.update(normalizeBuildInput({ entry: 'main.s', files }))
        expect(vi.mocked(languageWorkerManager.acquire).mock.calls.length).toBe(acquired + 1)
        expect(worker.requests.map((request) => request.type)).toEqual(['open', 'update', 'open'])
        expect(worker.requests[2]).toMatchObject({ type: 'open', revision: 3, files })
        expect(session.pending).toBe(true)
        session.dispose()
    })
})
