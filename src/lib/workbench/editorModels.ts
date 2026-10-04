import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import type { EditorSource } from '$cmp/specific/project/editorSource'
import { parseProjectSourceUri, projectSourceUri } from '$lib/languages/service/uri'
import { setModelBuildArtifacts } from '$lib/monaco/assemblyInsights'
import type { BuildArtifact } from '$lib/languages/commonLanguageFeatures.svelte'
import type { ProjectFiles } from '$lib/projectFiles'

/** Session ownership lets multiple editor widgets attach to one canonical file model. */
export class EditorModels {
    private models = new Map<string, monaco.editor.ITextModel>()
    private listeners = new Map<string, monaco.IDisposable>()
    private artifactDisposers = new Map<string, () => void>()
    private applyingExternalValue = false

    constructor(private readonly edited: (path: string, value: string) => void) {}

    resolve(currentMonaco: MonacoType, source: EditorSource, language: string) {
        let model = this.models.get(source.key)
        if (model?.isDisposed()) {
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
            const owned = model
            this.listeners.set(
                source.key,
                model.onDidChangeContent(() => {
                    const identity = parseProjectSourceUri(owned.uri)
                    if (!this.applyingExternalValue && identity?.sourceKind === 'live')
                        this.edited(identity.path, owned.getValue())
                })
            )
        } else if (model.getValue() !== source.value) {
            this.applyingExternalValue = true
            try {
                model.setValue(source.value)
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
            for (const model of this.models.values()) {
                const identity = parseProjectSourceUri(model.uri)
                const file = identity?.sourceKind === 'live' ? files[identity.path] : undefined
                if (file?.encoding === 'plain' && model.getValue() !== file.content)
                    model.setValue(file.content)
            }
        } finally {
            this.applyingExternalValue = false
        }
    }

    private remove(key: string) {
        this.listeners.get(key)?.dispose()
        this.artifactDisposers.get(key)?.()
        this.models.get(key)?.dispose()
        this.listeners.delete(key)
        this.artifactDisposers.delete(key)
        this.models.delete(key)
    }

    dispose() {
        for (const key of this.models.keys()) this.remove(key)
    }
}
