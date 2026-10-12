import { describe, expect, it, vi } from 'vite-plus/test'
import type { EditorSource } from '#cmp/specific/project/editorSource.ts'
import { projectSourceModelKey } from '#lib/languages/service/uri.ts'
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
        /** Offsets to 1-based positions, as Monaco counts them. */
        getPositionAt(offset: number) {
            const before = this.value.slice(0, offset).split('\n')
            return { lineNumber: before.length, column: before[before.length - 1].length + 1 }
        }
        private offsetAt(lineNumber: number, column: number) {
            const lines = this.value.split('\n')
            let offset = 0
            for (let line = 1; line < lineNumber; line++) offset += lines[line - 1].length + 1
            return offset + column - 1
        }
        applyEdits = vi.fn(
            (
                edits: {
                    range: {
                        startLineNumber: number
                        startColumn: number
                        endLineNumber: number
                        endColumn: number
                    }
                    text: string
                }[]
            ) => {
                for (const { range, text } of edits) {
                    const from = this.offsetAt(range.startLineNumber, range.startColumn)
                    const to = this.offsetAt(range.endLineNumber, range.endColumn)
                    this.value = this.value.slice(0, from) + text + this.value.slice(to)
                }
                this.listeners.forEach((listener) => listener())
            }
        )
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
    it('changes a Listing in place: only the lines that differ, with no edit reported', () => {
        const h = harness()
        const before = '; header\nmain:\n    jne .LAB_2\n    ret\n'
        const document = {}
        const build = { ...h.source('crackme', before, 1), generatedFrom: document }
        const model = h.open(build)
        h.open({ ...build, value: before.replace('jne', 'je') })
        expect(model.getValue()).toBe(before.replace('jne', 'je'))
        expect(model.setValue).not.toHaveBeenCalled()
        expect(model.applyEdits).toHaveBeenCalledTimes(1)
        expect(model.applyEdits.mock.calls[0][0]).toEqual([
            {
                range: { startLineNumber: 3, startColumn: 6, endLineNumber: 3, endColumn: 7 },
                text: ''
            }
        ])
        h.open({ ...build, value: before })
        expect(model.getValue()).toBe(before)
        expect(h.edited).not.toHaveBeenCalled()
        //anything else is set whole, as before
        const file = h.open(h.source('main.c', 'one'))
        h.open(h.source('main.c', 'two'))
        expect(file.setValue).toHaveBeenCalledTimes(1)
        expect(file.applyEdits).not.toHaveBeenCalled()
    })
    it('makes a new model for another Listing under the same key, with its whole text', () => {
        const h = harness()
        const first = { ...h.source('crackme', 'old listing\n', 0), generatedFrom: {} }
        const model = h.open(first)
        //the Executable's File replaced by other bytes: the same path, another document
        const replaced = { ...first, value: 'new listing\n', generatedFrom: {} }
        const next = h.open(replaced)
        expect(next).not.toBe(model)
        expect(model.isDisposed()).toBe(true)
        expect(h.created).toHaveLength(2)
        expect(next.getValue()).toBe('new listing\n')
        expect(next.setValue).not.toHaveBeenCalled()
        expect(next.applyEdits).not.toHaveBeenCalled()
        //and the same document again keeps it
        expect(h.open({ ...replaced })).toBe(next)
        //a File's model that was a Listing's becomes a File's own
        const file = h.open({ ...h.source('crackme', 'text', 0) })
        expect(file).not.toBe(next)
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
