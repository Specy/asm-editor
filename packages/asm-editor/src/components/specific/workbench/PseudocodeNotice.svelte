<script lang="ts">
    /**
     * Above a Pseudocode: what it is. Ghidra's decompiler makes it from the File's bytes whenever
     * it is shown, one function at a time, the one the Listing beside it is in; it reads like C
     * without being meant to compile ([ADR 0048](../../../../../docs/adr/0048-decompiled-code-is-a-view-not-a-file.md)).
     */
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
    import HelpButton from './HelpButton.svelte'
    import ReadOnlyNotice from './ReadOnlyNotice.svelte'

    let {
        group,
        findOpen = false,
        onHelp
    }: {
        group: EditorGroup
        /** Whether the editor's find widget is open, which the notice hides for. */
        findOpen?: boolean
        /** Opens the Documentation's section on the Pseudocode, from the notice's "?". */
        onHelp?: () => void
    } = $props()
    /** The Executable's File name. */
    const name = $derived(
        group.pseudocodeListing?.name ??
            group.displayedPath.slice(group.displayedPath.lastIndexOf('/') + 1)
    )
    /**
     * The pane's function once the Listing names it: while another function decompiles, that
     * one, as "Decompiling…" over the Pseudocode still shown names it. A C++ function by its
     * short name, as lists show it.
     */
    const fn = $derived(group.pseudocodeFunction?.list ?? group.pseudocodeFunction?.name)
</script>

{#snippet help()}
    <HelpButton label="What is the Pseudocode?" onclick={onHelp} />
{/snippet}

<ReadOnlyNotice
    label={`Pseudocode of ${fn ?? 'a function'} in ${name}, read-only`}
    action={onHelp ? help : undefined}
    {findOpen}
/>
