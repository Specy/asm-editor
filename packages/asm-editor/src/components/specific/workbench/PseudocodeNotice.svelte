<script lang="ts">
    /**
     * Above a Pseudocode: what it is. Ghidra's decompiler makes it from the File's bytes whenever
     * it is shown, one function at a time, the one the Listing beside it is in; it reads like C
     * without being meant to compile ([ADR 0048](../../../../../docs/adr/0048-decompiled-code-is-a-view-not-a-file.md)).
     */
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'

    let { group }: { group: EditorGroup } = $props()
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

<div class="pseudocode-notice" role="status">
    Pseudocode of {fn ?? 'a function'}, decompiled from {name}{group.displayedBuildOutput
        ? ', the program the Build linked,'
        : ''} by Ghidra: read-only, and not meant to compile.
</div>

<style lang="scss">
    .pseudocode-notice {
        padding: 0.45rem 0.75rem;
        color: var(--secondary-text);
        border-bottom: 1px solid var(--wb-line);
        background: color-mix(in srgb, var(--accent2, var(--accent)) 10%, var(--secondary));
        font-size: 0.8rem;
        overflow-wrap: anywhere;
    }
</style>
