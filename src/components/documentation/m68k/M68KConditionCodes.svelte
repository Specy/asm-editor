<script lang="ts">
	import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import { branchConditions, branchConditionsDescriptions } from '$lib/languages/M68K-documentation'
</script>


<div class="cc-grid">
    {#each branchConditions as bc}
        <DocsOperand name={bc} content={branchConditionsDescriptions.get(bc)} />
    {/each}
</div>



<style lang="scss">
	@import './style.scss'	
</style>
