import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import type { EditorSource } from '#cmp/specific/project/editorSource.ts'
import { parseProjectSourceUri, projectSourceUri } from '#lib/languages/service/uri.ts'
import { setModelBuildArtifacts } from '#lib/monaco/assemblyInsights.ts'
import type { BuildArtifact } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { ProjectFiles } from '#lib/projectFiles.ts'

/** Session ownership lets multiple editor widgets attach to one canonical file model. */
export class EditorModels {
    private models = new Map<string, monaco.editor.ITextModel>()
    /**
     * The text each model was last given, while nothing has edited it since: comparing with it
     * spares reading a whole model back out, which for a library's Listing is megabytes.
     */
    private values = new Map<string, string>()
    /** What each generated model's text is a version of, see `EditorSource.generatedFrom`. */
    private origins = new Map<string, object>()
    private listeners = new Map<string, monaco.IDisposable>()
    private artifactDisposers = new Map<string, () => void>()
    private applyingExternalValue = false

    constructor(private readonly edited: (path: string, value: string) => void) {}

    resolve(currentMonaco: MonacoType, source: EditorSource, language: string) {
        let model = this.models.get(source.key)
        if (
            model?.isDisposed() ||
            (model && source.generatedFrom !== this.origins.get(source.key))
        ) {
            this.remove(source.key)
            model = undefined
        }
        if (!model) {
            model = currentMonaco.editor.createModel(
                source.value,
                language,
                source.identity ? projectSourceUri(currentMonaco, source.identity) : undefined
            )
            model.setEOL(0)
            this.models.set(source.key, model)
            this.values.set(source.key, source.value)
            if (source.generatedFrom) this.origins.set(source.key, source.generatedFrom)
            const owned = model
            const key = source.key
            this.listeners.set(
                source.key,
                model.onDidChangeContent(() => {
                    if (this.applyingExternalValue) return
                    this.values.delete(key)
                    const identity = parseProjectSourceUri(owned.uri)
                    if (identity?.sourceKind === 'live' && !identity.view)
                        this.edited(identity.path, owned.getValue())
                })
            )
        } else if (
            this.values.get(source.key) !== source.value &&
            model.getValue() !== source.value
        ) {
            this.applyingExternalValue = true
            try {
                const previous = this.values.get(source.key)
                if (source.generatedFrom && previous !== undefined)
                    replaceChangedText(model, previous, source.value)
                else model.setValue(source.value)
                this.values.set(source.key, source.value)
            } finally {
                this.applyingExternalValue = false
            }
        }
        if (model.getLanguageId() !== language)
            currentMonaco.editor.setModelLanguage(model, language)
        return model
    }

    artifacts(key: string, artifacts: readonly BuildArtifact[]) {
        const model = this.models.get(key)
        if (!model) return
        this.artifactDisposers.get(key)?.()
        this.artifactDisposers.set(key, setModelBuildArtifacts(model.uri.toString(), artifacts))
    }

    retain(keys: readonly string[]) {
        const keep = new Set(keys)
        for (const key of this.models.keys()) if (!keep.has(key)) this.remove(key)
    }

    /** Keep cached live models current for code actions on files that have no visible editor. */
    synchronize(files: ProjectFiles) {
        this.applyingExternalValue = true
        try {
            for (const [key, model] of this.models) {
                const identity = parseProjectSourceUri(model.uri)
                //a view's model, such as a Listing, is not the File's text
                const file =
                    identity?.sourceKind === 'live' && !identity.view
                        ? files[identity.path]
                        : undefined
                if (file?.encoding === 'plain' && model.getValue() !== file.content) {
                    model.setValue(file.content)
                    this.values.delete(key)
                }
            }
        } finally {
            this.applyingExternalValue = false
        }
    }

    private remove(key: string) {
        this.listeners.get(key)?.dispose()
        this.artifactDisposers.get(key)?.()
        this.models.get(key)?.dispose()
        this.values.delete(key)
        this.origins.delete(key)
        this.listeners.delete(key)
        this.artifactDisposers.delete(key)
        this.models.delete(key)
    }

    dispose() {
        for (const key of this.models.keys()) this.remove(key)
    }
}

/**
 * Replaces the part of a model's text between the first and the last character that differ from
 * the new text, which the model holds as `previous`: one edit, outside the undo stack, that leaves
 * the cursor and the scroll position alone where `setValue` would reset them.
 */
function replaceChangedText(model: monaco.editor.ITextModel, previous: string, next: string) {
    const shorter = Math.min(previous.length, next.length)
    let start = 0
    while (start < shorter && previous.charCodeAt(start) === next.charCodeAt(start)) start++
    let end = 0
    while (
        end < shorter - start &&
        previous.charCodeAt(previous.length - 1 - end) === next.charCodeAt(next.length - 1 - end)
    )
        end++
    const from = model.getPositionAt(start)
    const to = model.getPositionAt(previous.length - end)
    model.applyEdits([
        {
            range: {
                startLineNumber: from.lineNumber,
                startColumn: from.column,
                endLineNumber: to.lineNumber,
                endColumn: to.column
            },
            text: next.slice(start, next.length - end)
        }
    ])
}
