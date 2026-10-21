<script lang="ts">
    /**
     * Above a Pseudocode: what it is. Ghidra's decompiler makes it from the File's bytes whenever
     * it is shown, one function at a time, the one the Listing beside it is in; it reads like C
     * without being meant to compile ([ADR 0048](../../../../../docs/adr/0048-decompiled-code-is-a-view-not-a-file.md)).
     */
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
    import ReadOnlyNotice from './ReadOnlyNotice.svelte'

    let {
        group,
        findOpen = false
    }: {
        group: EditorGroup
        /** Whether the editor's find widget is open, which the notice hides for. */
        findOpen?: boolean
    } = $props()
    /** The Executable's File name. */
    const name = $derived(
        group.pseudocodeListing?.name ??
            group.displayedPath.slice(group.displayedPath.lastIndexOf('/') + 1)
    )
    /**
     * The pane's function once the Listing names it: while another function decompiles, that
     * one, as "Decompiling…" over the Pseudocode still shown names it.
     */
    const fn = $derived(group.pseudocodeFunction?.name)
</script>

<ReadOnlyNotice label={`Pseudocode of ${fn ?? 'a function'} in ${name}, read-only`} {findOpen} />
