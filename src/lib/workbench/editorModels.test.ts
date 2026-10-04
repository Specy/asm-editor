import { describe, expect, it, vi } from 'vitest'
import type { EditorSource } from '$cmp/specific/project/editorSource'
import { projectSourceModelKey } from '$lib/languages/service/uri'
import { EditorModels } from './editorModels'

function harness() {
    const created: FakeModel[] = []
    class FakeModel {
        private listeners = new Set<() => void>()
        private disposed = false
        constructor(
            private value: string,
            private language: string,
            readonly uri: { scheme: string; authority: string; path: string }
        ) {}
        getValue() {
            return this.value
        }
        setValue = vi.fn((value: string) => {
            this.value = value
            this.listeners.forEach((listener) => listener())
        })
        getLanguageId() {
            return this.language
        }
        setLanguage(language: string) {
            this.language = language
        }
        setEOL() {}
        onDidChangeContent(listener: () => void) {
            this.listeners.add(listener)
            return { dispose: () => this.listeners.delete(listener) }
        }
        isDisposed() {
            return this.disposed
        }
        dispose() {
            this.disposed = true
        }
    }
    const monaco = {
        Uri: { from: (parts: FakeModel['uri']) => parts },
        editor: {
            createModel: (value: string, language: string, uri: FakeModel['uri']) => {
                const model = new FakeModel(value, language, uri)
                created.push(model)
                return model
            },
            setModelLanguage: (model: FakeModel, language: string) => model.setLanguage(language)
        }
    }
    const edited = vi.fn()
    const registry = new EditorModels(edited)
    const source = (path: string, value: string, generation?: number): EditorSource => {
        const identity =
            generation === undefined
                ? { sessionId: 'project', sourceKind: 'live' as const, path }
                : {
                      sessionId: 'project',
                      sourceKind: 'build' as const,
                      path,
                      buildGeneration: generation
                  }
        return { identity, value, key: projectSourceModelKey(identity) }
    }
    const open = (input: EditorSource) =>
        registry.resolve(monaco as never, input, 'cpp') as unknown as FakeModel
    return { registry, edited, source, open, created }
}

describe('shared Project editor models', () => {
    it('reuses the same model and reports each edit once across two widgets', () => {
        const h = harness(),
            source = h.source('main.c', 'original')
        const first = h.open(source),
            second = h.open(source)
        expect(first).toBe(second)
        expect(h.created).toHaveLength(1)
        first.setValue('edited')
        expect(second.getValue()).toBe('edited')
        expect(h.edited.mock.calls).toEqual([['main.c', 'edited']])
        h.open({ ...source, value: 'edited' })
        expect(first.setValue).toHaveBeenCalledTimes(1)
    })
    it('synchronizes external edits to hidden models without sending them back to the Project', () => {
        const h = harness(),
            first = h.open(h.source('main.c', 'original'))
        h.registry.synchronize({ 'main.c': { encoding: 'plain', content: 'external' } })
        expect(first.getValue()).toBe('external')
        expect(h.edited).not.toHaveBeenCalled()
        h.registry.synchronize({ 'main.c': { encoding: 'plain', content: 'external' } })
        expect(first.setValue).toHaveBeenCalledTimes(1)
    })
    it('retains models through tab closure and separates immutable build generations', () => {
        const h = harness(),
            live = h.source('main.c', 'live'),
            build = h.source('main.c', 'compiled', 1)
        const liveModel = h.open(live),
            buildModel = h.open(build)
        expect(liveModel).not.toBe(buildModel)
        buildModel.setValue('snapshot edit')
        expect(h.edited).not.toHaveBeenCalled()
        h.registry.retain([live.key, build.key])
        expect(h.open(live)).toBe(liveModel)
        h.registry.retain([live.key])
        expect(buildModel.isDisposed()).toBe(true)
        expect(liveModel.isDisposed()).toBe(false)
        h.registry.dispose()
        expect(liveModel.isDisposed()).toBe(true)
        liveModel.setValue('after disposal')
        expect(h.edited).not.toHaveBeenCalled()
    })
})
