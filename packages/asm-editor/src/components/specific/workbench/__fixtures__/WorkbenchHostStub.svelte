<script lang="ts">
    /**
     * The Workbench's place in a test of the page hosting it: nothing of its own, only buttons for
     * what it reports to the host, a change to the Project and the Save shortcut.
     */
    let {
        onChange,
        onSave
    }: {
        onChange?: () => void
        onSave?: (options: { silent: boolean }) => void | Promise<void>
    } = $props()
</script>

<button type="button" onclick={() => onChange?.()}>Change</button>
<button type="button" onclick={() => onSave?.({ silent: false })}>Save</button>
