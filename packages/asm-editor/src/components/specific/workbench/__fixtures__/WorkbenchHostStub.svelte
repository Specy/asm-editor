<script lang="ts">
    /**
     * The Workbench's place in a test of the page hosting it: nothing of its own but the host's
     * header, and buttons for what it reports to the host, a change to the Project, a change to
     * only how it is viewed, autosave and the Save shortcut. Like the Workbench, it keeps a change
     * waiting for autosave's pause, which `saveNow` of the session it hands `onReady` saves.
     */
    import { onMount, type Snippet } from 'svelte'
    import type { Project } from '#lib/Project.svelte.ts'
    import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import type { EditJournalStore } from '#lib/editJournal.ts'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'

    let {
        project,
        onChange,
        onSave,
        onReady,
        editJournals,
        header
    }: {
        project: Project
        onChange?: () => void
        onSave?: (options: { silent: boolean }) => void | Promise<void>
        onReady?: (session: WorkbenchSession, signal: AbortSignal) => void
        editJournals?: EditJournalStore
        header?: Snippet<[{ deviceClass: 'desktop'; drawerOpen: boolean }]>
    } = $props()

    /** A change autosave waits on, as the session keeps one. */
    let waiting = false
    function changed() {
        waiting = preferencesStore.values.autoSave.value
        onChange?.()
    }
    const session = {
        saveNow() {
            if (!waiting) return
            waiting = false
            void onSave?.({ silent: true })
        }
    }

    onMount(() => {
        const controller = new AbortController()
        onReady?.(session as unknown as WorkbenchSession, controller.signal)
        return () => controller.abort()
    })
</script>

{@render header?.({ deviceClass: 'desktop', drawerOpen: false })}
<button
    type="button"
    onclick={() => {
        project.description = `${project.description}.`
        changed()
    }}>Change</button
>
<button
    type="button"
    onclick={() => {
        project.setFileView(Object.keys(project.files)[0], 'hex')
        changed()
    }}>View</button
>
<button
    type="button"
    onclick={() => {
        waiting = false
        void onSave?.({ silent: true })
    }}>Autosave</button
>
<button
    type="button"
    onclick={() => {
        waiting = false
        void onSave?.({ silent: false })
    }}>Save</button
>
<!-- a Hex editor's Undo step on main.s, as the Workbench reports it to the journals' store -->
<button
    type="button"
    onclick={() =>
        editJournals?.changed('main.s', () => ({
            fingerprint: 'from this visit',
            undo: [],
            redo: []
        }))}>Journal</button
>
