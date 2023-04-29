<script lang="ts">
	import Navbar from '$cmp/Navbar.svelte'
	import TogglableSection from '$cmp/layout/TogglableSection.svelte'
	import { M68KUncompoundedInstructions } from '$lib/languages/M68K-documentation'
	import InstructionsMenu from './instruction/[instructionName]/InstructionsMenu.svelte'
	let instructions = Array.from(M68KUncompoundedInstructions.values()).sort(
		(a, b) => a.name.localeCompare(b.name)
	)
	let search = ''
	import FuzzySearch from 'fuzzy-search'
	import MenuLink from './instruction/MenuLink.svelte'
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
	<aside class="instructions-menu column">
		<div class="column" style="gap: 1rem; padding: 0 1rem;">
			<MenuLink href="/documentation/m68k/addressing-mode" title="Addressing Modes" />
			<MenuLink href="/documentation/m68k/condition-codes" title="Condition Codes" />
			<MenuLink href="/documentation/m68k/shift-direction" title="Shifts & directions" />
			<MenuLink href="/documentation/m68k/directive" title="Directives" />
			<MenuLink href="/documentation/m68k/assembler-feature" title="Assembler features" />
		</div>
		<TogglableSection
			open={true}
			sectionStyle="margin-left: 0; padding-left: 0.5rem;"
			style="padding: 0 0.5rem;"
		>
			<h2 slot="title" style="font-size: 1rem; font-weight: normal; margin-left: -0.1rem">
				Instructions
			</h2>
			<input bind:value={search} placeholder="Search" class="instruction-search" />
			<InstructionsMenu instructions={filteredInstructions} />
		</TogglableSection>
	</aside>

	<div style="padding-top: 4rem; flex: 1;" class="column">
		<slot />
	</div>
</div>

<style lang="scss">
	.instructions-menu {
		background-color: var(--secondary);
		color: var(--secondary-text);
		max-width: 15rem;
		width: 100%;
		gap: 1rem;
		top: 3.2rem;
		padding-top: 1rem;
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
