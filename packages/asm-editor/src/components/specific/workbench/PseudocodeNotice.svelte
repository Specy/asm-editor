<script lang="ts">
    /**
     * Above a Pseudocode: what it is. Ghidra's decompiler makes it from the File's bytes whenever
     * it is shown, one function at a time, the one the Listing beside it is in; it reads like C
     * without being meant to compile ([ADR 0048](../../../../../docs/adr/0048-decompiled-code-is-a-view-not-a-file.md)).
     */
    let {
        name,
        fn,
        built = false
    }: {
        /** The Executable's File name. */
        name: string
        /** The function shown, once the Listing names it. */
        fn?: string
        /** The Build output's, which the debugger follows in its source. */
        built?: boolean
    } = $props()
</script>

<div class="pseudocode-notice" role="status">
    Pseudocode of {fn ?? 'a function'} in {name}{built ? ', the program the Build linked' : ''},
    decompiled by Ghidra: read-only. It reads like C without being meant to compile, and follows the
    Listing's cursor.
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
