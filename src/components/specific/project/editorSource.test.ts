import { describe, expect, it } from 'vitest'
import { resolveEditorModel, type EditorModelStore, type EditorSource } from './editorSource'

type FakeModel = { value: string; createdFrom: string; disposed: boolean }

function fakeStore() {
    const models = new Map<string, FakeModel>()
    const created: string[] = []
    const store: EditorModelStore<FakeModel> = {
        get: (key) => models.get(key),
        set: (key, model) => void models.set(key, model),
        delete: (key) => void models.delete(key),
        isDisposed: (model) => model.disposed,
        create: (source) => {
            created.push(source.key)
            return { value: source.value, createdFrom: source.key, disposed: false }
        },
        setValue: (model, value) => void (model.value = value)
    }
    return { store, models, created }
}

const source = (key: string, value: string): EditorSource => ({ key, value })

describe('resolveEditorModel', () => {
    it('creates a model holding its own source, never the previously shown one', () => {
        const { store, models, created } = fakeStore()
        resolveEditorModel(store, source('live:a.asm', 'contents of A'))
        resolveEditorModel(store, source('live:b.asm', 'contents of B'))
        expect(created).toEqual(['live:a.asm', 'live:b.asm'])
        expect(models.get('live:a.asm')?.value).toBe('contents of A')
        expect(models.get('live:b.asm')?.value).toBe('contents of B')
    })

    it('reuses an existing model and brings it up to date', () => {
        const { store, models, created } = fakeStore()
        resolveEditorModel(store, source('live:a.asm', 'first'))
        const model = models.get('live:a.asm')
        resolveEditorModel(store, source('live:a.asm', 'second'))
        expect(created).toEqual(['live:a.asm'])
        expect(models.get('live:a.asm')).toBe(model)
        expect(model?.value).toBe('second')
    })

    it('rebuilds a model that was disposed behind our back', () => {
        const { store, models, created } = fakeStore()
        resolveEditorModel(store, source('live:a.asm', 'first'))
        models.get('live:a.asm')!.disposed = true
        const rebuilt = resolveEditorModel(store, source('live:a.asm', 'second'))
        expect(created).toEqual(['live:a.asm', 'live:a.asm'])
        expect(rebuilt.disposed).toBe(false)
        expect(rebuilt.value).toBe('second')
    })
})
