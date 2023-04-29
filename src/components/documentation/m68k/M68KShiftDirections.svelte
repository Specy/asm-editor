<script lang="ts">

	import DocsOperand from "$cmp/documentation/m68k/DocsOperand.svelte"
	import { directions, directionsDescriptions } from "$lib/languages/M68K-documentation"

</script>


<div class="cc-grid">
    {#each directions as dr}
        <DocsOperand name={dr} content={directionsDescriptions.get(dr)} />
    {/each}
</div>



<style lang="scss">
	@import './style.scss'	
</style>
