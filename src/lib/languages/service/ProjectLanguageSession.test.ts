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
