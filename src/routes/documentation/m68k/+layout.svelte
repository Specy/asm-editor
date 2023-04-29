<script lang="ts">
	import Navbar from '$cmp/Navbar.svelte'
	import TogglableSection from '$cmp/layout/TogglableSection.svelte'
	import { M68KUncompoundedInstructions } from '$lib/languages/M68K-documentation'
	import InstructionsMenu from './InstructionsMenu.svelte'
	import FaBars from 'svelte-icons/fa/FaBars.svelte'
	let instructions = Array.from(M68KUncompoundedInstructions.values()).sort((a, b) =>
		a.name.localeCompare(b.name)
	)
	let menuOpen = false
	let search = ''
	import FuzzySearch from 'fuzzy-search'
	import MenuLink from './instruction/MenuLink.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
	const searcher = new FuzzySearch(instructions, ['name', 'description'], {
		sort: true
	})
	let filteredInstructions = instructions
	$: {
		filteredInstructions = searcher.search(search.toLowerCase())
	}
</script>

<Navbar style="border-bottom-left-radius: 0;">
	<div class="row" style="gap: 2rem; align-items:center; flex: 1">
		<a class="icon" href="/" title="Go to the home">
			<img src="/favicon.png" alt="logo" />
			Home
		</a>
		<a href="/documentation/m68k"> M68k </a>
		<div class="mobile-only" style="margin-left: auto; margin-right: 0.5rem">
			<Icon on:click={() => (menuOpen = !menuOpen)}>
				{#if menuOpen}
					<FaTimes />
				{:else}
					<FaBars />
				{/if}
			</Icon>
		</div>
	</div>
</Navbar>

<div class="row" style="gap: 1rem; flex: 1">
	<aside class="side-menu column" class:menu-open={menuOpen}>
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
	.side-menu {
		background-color: var(--secondary);
		color: var(--secondary-text);
		width: 15rem;
		gap: 1rem;
		top: 3.2rem;
		padding-top: 1rem;
		height: calc(100vh - 3.2rem);
		overflow-y: auto;
		position: sticky;
	}
	.mobile-only {
		display: none;
	}
	@media (max-width: 600px) {
		.side-menu {
			position: fixed;
			width: calc(100vw - 4rem);
			left: 0;
			z-index: 2;
			transition: transform 0.3s;
			background-color: rgba(var(--RGB-secondary), 0.9);
			backdrop-filter: blur(0.3rem);
			transform: translateX(calc((100vw - 4rem) * -1));
		}
		.mobile-only {
			display: flex;
		}
		.menu-open {
			transform: translateX(0);
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
