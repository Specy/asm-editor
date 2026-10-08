import { afterEach, describe, expect, it, vi } from 'vitest'
import type monaco from 'monaco-editor'
import { ProjectLanguageSession } from '$lib/languages/service/ProjectLanguageSession'
import { normalizeBuildInput } from '$lib/projectFiles'
import { compilerCapabilities } from '$lib/sourceCompilation/capabilities'
import { helpLanguage, resolveSourceHelpContext, setSourceHelpLanguage } from './context'

vi.mock('$lib/languages/service/LanguageWorkerManager', () => ({
    languageWorkerManager: { acquire: () => undefined }
}))
const sessions: ProjectLanguageSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const files = {
    'main.c': { encoding: 'plain' as const, content: 'int main(void) { return 0; }' },
    'local.h': { encoding: 'plain' as const, content: '#define ANSWER 42' }
}
function session(
    id = 'project',
    target: 'MIPS' | 'X86' | 'RISC-V' | 'RISC-V-64' | 'M68K' = 'MIPS'
) {
    const value = new ProjectLanguageSession(
        id,
        normalizeBuildInput({ entry: 'main.c', files }),
        target
    )
    sessions.push(value)
    return value
}
function model(path = 'main.c', id = 'project', build?: number) {
    let version = 1,
        disposed = false
    const value = {
        uri: {
            scheme: 'asm-editor',
            authority: id,
            path: `/${build === undefined ? 'live' : `build-${build}`}/${path}`
        },
        isDisposed: () => disposed,
        getVersionId: () => version,
        getLanguageId: () => 'cpp'
    } as unknown as monaco.editor.ITextModel
    return {
        value,
        edit: () => version++,
        dispose: () => {
            disposed = true
        }
    }
}

describe('source help context', () => {
    it.each([
        ['main.c', 'c'],
        ['main.cpp', 'cpp'],
        ['main.cc', 'cpp'],
        ['main.hpp', 'cpp'],
        ['main.hh', 'cpp'],
        ['main.hxx', 'cpp'],
        ['main.h', 'header'],
        ['main.s', undefined]
    ])('derives %s from the File path', (path, language) =>
        expect(helpLanguage(path)).toBe(language)
    )
    it('offers the hosted library before Compile with no assembly runtime selected', () => {
        session()
        const context = resolveSourceHelpContext(model().value)!
        expect(context.language).toBe('c')
        expect(context.capabilities?.runtimeAbi).toBe('v1')
        expect(context.capabilities?.headers.c).toContain('stdio.h')
        expect(context.current()).toBe(true)
    })
    it('requires explicit hints in standalone models and never assumes cpp from the tokenizer', () => {
        const standalone = model().value
        Object.assign(standalone, { uri: { scheme: 'inmemory', authority: '', path: '/1' } })
        expect(resolveSourceHelpContext(standalone)).toBeUndefined()
        setSourceHelpLanguage(standalone, 'c')
        expect(resolveSourceHelpContext(standalone)?.language).toBe('c')
        expect(resolveSourceHelpContext(standalone)?.capabilities).toBeUndefined()
        setSourceHelpLanguage(standalone, 'cpp')
        expect(resolveSourceHelpContext(standalone)?.language).toBe('cpp')
    })
    it('keeps two Projects with the same path and different Targets distinct', () => {
        session('a', 'MIPS')
        session('b', 'X86')
        expect(
            resolveSourceHelpContext(model('main.c', 'a').value)?.capabilities?.headers.c
        ).toContain('stdio.h')
        expect(
            resolveSourceHelpContext(model('main.c', 'b').value)?.capabilities?.headers.c
        ).not.toContain('stdio.h')
    })
    it('freezes a Build source set and unavailable ABI rather than replacing it with live data', () => {
        const owner = session()
        owner.setBuild(7, { ...owner.sources, runtimeAbi: 'v9' })
        const snapshot = resolveSourceHelpContext(model('main.c', 'project', 7).value)!
        const live = resolveSourceHelpContext(model().value)!
        owner.update({
            entry: 'main.c',
            files: { 'main.c': { encoding: 'plain', content: 'changed' } }
        })
        expect(snapshot.sources?.files['local.h'].content).toContain('ANSWER')
        expect(snapshot.capabilities?.runtimeAbi).toBe('v9')
        expect(snapshot.capabilities?.headers.c).toEqual(['sim.h'])
        expect(snapshot.current()).toBe(true)
        expect(live.current()).toBe(false)
        expect(resolveSourceHelpContext(model('main.c', 'project', 8).value)).toBeUndefined()
        owner.setBuild(8, owner.sources)
        expect(snapshot.current()).toBe(false)
    })
    it('invalidates requests on edits, model/session disposal and missing paths', () => {
        const owner = session(),
            source = model()
        const context = resolveSourceHelpContext(source.value)!
        source.edit()
        expect(context.current()).toBe(false)
        const fresh = resolveSourceHelpContext(source.value)!
        source.dispose()
        expect(fresh.current()).toBe(false)
        expect(resolveSourceHelpContext(source.value)).toBeUndefined()
        const alive = resolveSourceHelpContext(model().value)!
        owner.dispose()
        expect(alive.current()).toBe(false)
        expect(resolveSourceHelpContext(model('missing.c').value)).toBeUndefined()
    })
    it('limits x86 headers and declines library help on unsupported Targets', () => {
        expect(compilerCapabilities('X86')?.headers.cpp).toContain('new')
        expect(compilerCapabilities('X86')?.headers.cpp).not.toContain('cstdio')
        expect(compilerCapabilities('M68K')).toBeUndefined()
        expect(compilerCapabilities('Z80')).toBeUndefined()
        session('project', 'M68K')
        expect(resolveSourceHelpContext(model().value)?.capabilities).toBeUndefined()
    })
})
