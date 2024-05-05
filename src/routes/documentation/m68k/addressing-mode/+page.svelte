<script lang="ts">
	import M68KAddressingModes from '$cmp/documentation/m68k/M68KAddressingModes.svelte'
	import Page from '$cmp/shared/layout/Page.svelte'
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
	<h1>Addressing modes</h1>
	<div class="column content">
		<M68KAddressingModes />
	</div>
</Page>


<style>
	.content{
		padding: 1rem;
	}
	@media (max-width: 800px) {
		.content{
			padding: unset;
		}
	}
</style>