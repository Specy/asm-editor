<script lang="ts">
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import { directions, directionsDescriptions } from '$lib/languages/M68K/M68K-documentation'
</script>

<div class="cc-grid">
    {#each directions as dr}
        <DocsOperand name={dr} content={directionsDescriptions.get(dr)} />
    {/each}
</div>

<style lang="scss">
    @use './style.scss' as *;
</style>
