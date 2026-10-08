import { describe, expect, it, vi } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
import type { ProjectWorkerRequest, ProjectWorkerResponse } from './protocol'

const worker = vi.hoisted(() => ({
    receive: undefined as ((response: ProjectWorkerResponse) => void) | undefined,
    requests: [] as ProjectWorkerRequest[]
}))

vi.mock('./LanguageWorkerManager', () => ({
    languageWorkerManager: {
        acquire: vi.fn(
            (
                _target: string,
                _sessionId: string,
                receive: (response: ProjectWorkerResponse) => void
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
})
