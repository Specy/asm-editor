<script lang="ts">
    /** Monaco's place in a test: a textarea bound the way `Editor.svelte` binds its text. */
    let { code = $bindable(''), language }: { code?: string; language: string } = $props()
</script>

<textarea data-language={language} bind:value={code}></textarea>
