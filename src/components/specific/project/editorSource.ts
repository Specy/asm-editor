import type { ProjectModelIdentity } from '$lib/languages/service/uri'

/**
 * Which model the editor shows and what it should hold, as one value.
 *
 * The key and the text belong together: passed as separate props, an effect could run with the
 * newly selected File's key and the previously selected File's text, and create that File's model
 * holding the other one's source. Bundling them makes that state unrepresentable.
 */
export type EditorSource = {
    /** Identifies the model. Changing it switches which File the editor shows. */
    key: string
    /** The text the model named by `key` should hold. */
    value: string
    /** Gives the model a stable URI that language providers route back to the Project session. */
    identity?: ProjectModelIdentity
}

/** The model bookkeeping `resolveEditorModel` drives, so the rule itself holds no Monaco types. */
export interface EditorModelStore<TModel> {
    get(key: string): TModel | undefined
    set(key: string, model: TModel): void
    delete(key: string): void
    isDisposed(model: TModel): boolean
    create(source: EditorSource): TModel
    setValue(model: TModel, value: string): void
}

/**
 * The model for `source`, brought up to date: created with the source's own text when it is new,
 * and otherwise set to it. A model disposed behind our back (a File deleted while it was open) is
 * dropped and rebuilt rather than reused.
 *
 * Takes the whole source rather than a key and a value, which is the point: the text a model is
 * created with or set to is always the text of the key being resolved.
 */
export function resolveEditorModel<TModel>(
    store: EditorModelStore<TModel>,
    source: EditorSource
): TModel {
    let model = store.get(source.key)
    if (model !== undefined && store.isDisposed(model)) {
        store.delete(source.key)
        model = undefined
    }
    if (model === undefined) {
        model = store.create(source)
        store.set(source.key, model)
        return model
    }
    store.setValue(model, source.value)
    return model
}
