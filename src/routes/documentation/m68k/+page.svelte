<script lang="ts">
	import NavigationLinkButton from '$cmp/NavigationLinkButton.svelte'
	import Page from '$cmp/layout/Page.svelte'
	import { instructionsDocumentationList } from '$lib/languages/M68K-documentation'
</script>

<svelte:head>
	<title>M68K Documentation</title>
	<meta
		name="description"
		content="Read the M68K Documentation, including all the instructions with addressing modes and the assembler features"
	/>
	<meta
		property="og:description"
		content="Read the M68K Documentation, including all the instructions with addressing modes and the assembler features"
	/>
	<meta name="tags" content={instructionsDocumentationList.map((i) => i.name).join(', ')} />
</svelte:head>
<Page contentStyle="padding: 1rem; gap: 1rem">
	<h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">M68K Documentation</h1>
	<div class="links">
		<NavigationLinkButton href="/documentation/m68k/instruction">
			<div>Instructions</div>
		</NavigationLinkButton>
		<NavigationLinkButton href="/documentation/m68k/addressing-mode">
			<div>Addressing Modes</div>
		</NavigationLinkButton>
		<NavigationLinkButton href="/documentation/m68k/condition-codes">
			<div>Condition Codes</div>
		</NavigationLinkButton>
		<NavigationLinkButton href="/documentation/m68k/shift-direction">
			<div>Shift directions</div>
		</NavigationLinkButton>
		<NavigationLinkButton href="/documentation/m68k/directive">
			<div>Directives</div>
		</NavigationLinkButton>
		<NavigationLinkButton href="/documentation/m68k/assembler-feature">
			<div>Assembler Features</div>
		</NavigationLinkButton>
	</div>
</Page>

<style lang="scss">
	.links {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		max-width: 60rem;
		gap: 0.8rem;
	}
	@media (max-width: 900px) {
		.links {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 400px) {
		.links {
			grid-template-columns: repeat(1, 1fr);
		}
	}
</style>
