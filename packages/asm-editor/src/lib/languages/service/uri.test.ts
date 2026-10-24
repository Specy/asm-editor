import { describe, expect, it } from 'vite-plus/test'
import {
    ASSEMBLY_MODEL_SCHEME,
    fileViewIdentity,
    parseProjectSourceUri,
    projectSourceModelKey,
    projectSourceUri,
    type ProjectModelIdentity
} from './uri'

const monacoStub = {
    Uri: {
        from: (parts: { scheme: string; authority: string; path: string; fragment?: string }) =>
            parts
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

    it("gives a File's Listing and Pseudocode models of their own beside its text's", () => {
        const listing = { ...build, path: 'crackme', view: 'listing' } as const
        const pseudocode = { ...listing, view: 'pseudocode' } as const
        const text = { ...build, path: 'crackme' }
        //each function's Pseudocode a model of its own, its address in hex
        const main = { ...pseudocode, functionAddress: 0x11e9 }
        const start = { ...pseudocode, functionAddress: 0x1100 }
        const keys = [listing, pseudocode, text, main, start].map(projectSourceModelKey)
        expect(new Set(keys).size).toBe(5)
        expect(keys[0]).toBe('session-1:/build-7/crackme#listing')
        expect(keys[2]).toBe('session-1:/build-7/crackme')
        expect(keys[3]).toBe('session-1:/build-7/crackme#pseudocode-11e9')
        expect(projectSourceUri(monacoStub, main)).toMatchObject({ fragment: 'pseudocode-11e9' })
        //a Pseudocode's Listing, and its text, have no function
        expect(fileViewIdentity(main, 'listing')).toEqual(listing)
        expect(fileViewIdentity(main)).toEqual(text)
        expect(() => projectSourceModelKey({ ...listing, functionAddress: 0x11e9 })).toThrow()
        expect(() => projectSourceModelKey({ ...pseudocode, functionAddress: -1 })).toThrow()
        //the view is the URI's fragment, so its path still names the File
        for (const identity of [listing, pseudocode, text, main, start]) {
            const uri = projectSourceUri(monacoStub, identity)
            expect(uri.path).toBe('/build-7/crackme')
            expect(parseProjectSourceUri(uri)).toEqual(identity)
        }
        expect(
            parseProjectSourceUri({
                scheme: ASSEMBLY_MODEL_SCHEME,
                authority: 'session-1',
                path: '/live/crackme',
                fragment: 'hex'
            })
        ).toEqual({ sessionId: 'session-1', sourceKind: 'live', path: 'crackme' })
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
