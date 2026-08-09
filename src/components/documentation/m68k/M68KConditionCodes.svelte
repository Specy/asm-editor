<script lang="ts">
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import {
        branchConditions,
        branchConditionsDescriptions
    } from '$lib/languages/M68K/M68K-documentation'
</script>

<div class="cc-grid">
    {#each branchConditions as bc (bc)}
        {@const description = branchConditionsDescriptions.get(bc)}
        {#if description !== undefined}
            <DocsOperand name={bc} content={description} />
        {/if}
    {/each}
</div>

<style lang="scss">
    @use './style.scss' as *;
</style>
