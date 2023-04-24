<script lang="ts">
	import Navbar from '$cmp/Navbar.svelte'
	import { M68kDocumentation } from '$lib/languages/M68K-documentation'
	import InstructionsMenu from './[instructionName]/InstructionsMenu.svelte'
	let instructions = Object.values(M68kDocumentation).sort((a, b) => a.name.localeCompare(b.name))
	let search = ''
	import FuzzySearch from 'fuzzy-search'
	const searcher = new FuzzySearch(instructions, ['name', 'description'], {
		sort: true
	})
	let filteredInstructions = instructions
	$: {
		filteredInstructions = searcher.search(search.toLowerCase())
	}
</script>

<Navbar style="border-bottom-left-radius: 0">
	<div class="row" style="gap: 2rem; align-items:center;">
		<a class="icon" href="/" title="Go to the home">
			<img src="/favicon.png" alt="logo" />
			Home
		</a>
		<a href="/documentation/m68k"> M68k Documentation </a>
	</div>
</Navbar>

<div class="row" style="gap: 1rem; flex: 1">
	<aside class="instructions-menu column" style="gap: 0.5rem">
		<h3>Instructions</h3>
		<input bind:value={search} placeholder="Search" class="instruction-search" />
		<InstructionsMenu instructions={filteredInstructions} />
	</aside>

	<div style="padding-top: 4rem; flex: 1;" class="column">
		<slot />
	</div>
</div>

<style lang="scss">
	.instructions-menu {
		background-color: var(--secondary);
		color: var(--secondary-text);
		max-width: 12rem;
		width: 100%;
		padding: 1rem;
		top: 3.2rem;
		height: calc(100vh - 3.2rem);
		overflow-y: auto;
		position: sticky;
	}
	@media (max-width: 600px) {
		.instructions-menu {
			display: none;
		}
	}
	.instruction-search {
		background-color: var(--tertiary);
		color: var(--tertiary-text);
		padding: 0.6rem;
		border-radius: 0.4rem;
	}
	.icon {
		height: 2.2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		img {
			height: 100%;
		}
	}
</style>
