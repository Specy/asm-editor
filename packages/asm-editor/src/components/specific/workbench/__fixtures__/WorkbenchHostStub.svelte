<script lang="ts">
    /**
     * The Workbench's place in a test of the page hosting it: nothing of its own but the host's
     * header, and buttons for what it reports to the host, a change to the Project, autosave and
     * the Save shortcut.
     */
    import type { Snippet } from 'svelte'
    import type { Project } from '#lib/Project.svelte.ts'

    let {
        project,
        onChange,
        onSave,
        header
    }: {
        project: Project
        onChange?: () => void
        onSave?: (options: { silent: boolean }) => void | Promise<void>
        header?: Snippet<[{ deviceClass: 'desktop'; drawerOpen: boolean }]>
    } = $props()
</script>

{@render header?.({ deviceClass: 'desktop', drawerOpen: false })}
<button
    type="button"
    onclick={() => {
        project.description = `${project.description}.`
        onChange?.()
    }}>Change</button
>
<button type="button" onclick={() => onSave?.({ silent: true })}>Autosave</button>
<button type="button" onclick={() => onSave?.({ silent: false })}>Save</button>
