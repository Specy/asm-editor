<script lang="ts">
    /**
     * The Editor's content-sync contract, with Monaco replaced by a value holder: an atomic
     * `source` prop, one model per key resolved through the real `resolveEditorModel`, and no write
     * to `code` while a multi-File host owns the content. Mounting the real Editor needs Monaco,
     * which does not run under jsdom, so this stands in for the parts Monaco is not involved in.
     */
    import { resolveEditorModel, type EditorModelStore, type EditorSource } from '../editorSource'

    type Model = { value: string; path: string; listeners: (() => void)[] }

    interface Props {
        code: string
        source?: EditorSource
        onfilechange: (path: string, value: string) => void
    }
    let { code = $bindable(), source, onfilechange }: Props = $props()

    const activeSource = $derived<EditorSource>(source ?? { key: 'legacy-entry', value: code })
    // Mirrors the Editor's plain Map: the effect that resolves models both reads and writes it,
    // which a reactive map would re-enter.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const models = new Map<string, Model>()
    let applyingExternalValue = false
    let active: Model | undefined

    const store: EditorModelStore<Model> = {
        get: (key) => models.get(key),
        set: (key, model) => void models.set(key, model),
        delete: (key) => void models.delete(key),
        isDisposed: () => false,
        create: (next) => {
            const model: Model = {
                value: next.value,
                path: next.identity?.path ?? '',
                listeners: []
            }
            model.listeners.push(() => {
                if (applyingExternalValue || !model.path) return
                onfilechange(model.path, model.value)
            })
            return model
        },
        setValue: (model, value) => {
            if (model.value === value) return
            applyingExternalValue = true
            try {
                model.value = value
                for (const listener of model.listeners) listener()
            } finally {
                applyingExternalValue = false
            }
        }
    }

    $effect(() => {
        active = resolveEditorModel(store, activeSource)
    })

    /** A keystroke: the model changes, its listeners fire, then the editor reports the new text. */
    export function typeInto(next: string) {
        const model = active!
        model.value = next
        for (const listener of model.listeners) listener()
        if (!source) code = model.value
    }
    export function shown() {
        return active?.value
    }
</script>
