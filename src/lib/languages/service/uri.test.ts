import { describe, expect, it } from 'vitest'
import {
    ASSEMBLY_MODEL_SCHEME,
    parseProjectSourceUri,
    projectSourceModelKey,
    projectSourceUri,
    type ProjectModelIdentity
} from './uri'

const monacoStub = {
    Uri: {
        from: (parts: { scheme: string; authority: string; path: string }) => parts
    }
} as never

describe('Project source URIs', () => {
    const live: ProjectModelIdentity = {
        sessionId: 'session-1',
        sourceKind: 'live',
        path: 'src/main.m68k'
    }
    const build: ProjectModelIdentity = {
        sessionId: 'session-1',
        sourceKind: 'build',
        buildGeneration: 7,
        path: 'lib/math.m68k'
    }

    it('round-trips live and Build identities without using the Project name', () => {
        for (const identity of [live, build]) {
            const uri = projectSourceUri(monacoStub, identity)
            expect(parseProjectSourceUri(uri)).toEqual(identity)
            expect(uri.scheme).toBe(ASSEMBLY_MODEL_SCHEME)
        }
    })

    it('gives live and Build models distinct stable keys', () => {
        expect(projectSourceModelKey(live)).not.toBe(projectSourceModelKey(build))
        expect(projectSourceModelKey(live)).toBe(projectSourceModelKey({ ...live }))
    })

    it('rejects malformed or root-escaping identities', () => {
        expect(
            parseProjectSourceUri({
                scheme: ASSEMBLY_MODEL_SCHEME,
                authority: 'session-1',
                path: '/live/../secret'
            })
        ).toBeNull()
        expect(
            parseProjectSourceUri({
                scheme: ASSEMBLY_MODEL_SCHEME,
                authority: 'session-1',
                path: '/live/src//main.m68k'
            })
        ).toBeNull()
        expect(() => projectSourceUri(monacoStub, { ...live, path: '../secret' })).toThrowError(
            'Invalid Project path'
        )
    })
})
