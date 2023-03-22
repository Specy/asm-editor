<script lang="ts">
	import type { PageData } from './$types'
	import Page from '$cmp/layout/Page.svelte'
	import Navbar from '$cmp/Navbar.svelte'
	import { onMount } from 'svelte'
	import {
		fromSizesToString,
		fromSizeToString,
		getAddressingModeNames,
		type InstructionDocumentation
	} from '$lib/languages/M68K-documentation'
	import DocsOperand from '$cmp/project/DocsOperand.svelte'
	export let data: PageData
	let ins: InstructionDocumentation = data.props.instruction
	let component
	onMount(async () => {
		//HUGE ASS HACK TO MAKE SVELTEKIT WORK
		const imp = (await import('./ClientOnly.svelte'))
		await imp?.__tla
		component = imp?.default
	})
	let code = ins.interactiveExample?.code ?? '; no interactive instruction available'
</script>


<svelte:head>
	<meta name="description" content={`The ${ins.name} instruction.\n${ins.description}`} />
	<meta name="keywords" content={ins.name} />
	<meta name="author" content="specy" />
	<title>
		Docs - {ins.name}
	</title>
</svelte:head>

<Navbar>
	<div class="row" style="gap: 2rem; align-items:center;">
		<a class="icon" href="/" title="Go to the home">
			<img src="/favicon.png" alt="logo" />
			Home
		</a>
		<a href="/documentation/m68k"> M68k Documentation </a>
	</div>
</Navbar>
<Page cropped>
	<div class="instruction-info" style="flex: 1;">
		<div class="column">
			<div class="instruction-name">
				{ins.name}
			</div>
			<div class="column" style="margin-left: 0.8rem;">
				{#if ins.sizes.length}
					<h3>Sizes</h3>
					<div style="margin: 0.8rem">
						{fromSizesToString(ins.sizes, true)}
					</div>
				{/if}
				{#if ins.defaultSize}
					<h3>Default Size</h3>
					<div style="margin: 0.8rem">
						{fromSizeToString(ins.defaultSize, true)}
					</div>
				{/if}
			</div>
		</div>

		<div class="column" style="gap: 1rem;">
			<article class="column">
				<h3>Operands</h3>
				<div class="column" style="gap: 0.5rem; margin: 0.8rem;">
					{#if ins.args.length}
						{#each ins.args as arg, i}
							<DocsOperand
								name={`Op ${i + 1}`}
								content={getAddressingModeNames(arg)}
								style="width: fit-content;"
							/>
						{/each}
					{/if}
				</div>
			</article>
			<article class="description">
				{ins.description}
			</article>
		</div>
	</div>
	{#if component}
	    <svelte:component this={component} {code}/>
	{:else}
		<div class="loading">Loading...</div>
	{/if}
</Page>

<style lang="scss">
	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		flex: 1;
		background-color: var(--secondary);
		color: var(--secondary-text);
		font-size: 2rem;
		border-radius: 0.5rem;
	}
	.instruction-info {
		display: flex;
		gap: 1rem;
	}
	.instruction-name {
		font-size: 4rem;
		margin-right: 3rem;
		font-weight: 600;
		color: var(--accent);
		margin-bottom: 1rem;
	}
	.description {
		font-size: 1.1rem;
		line-height: 1.4rem;
		background-color: var(--secondary);
		color: var(--secondary-text);
		padding: 1rem;
		width: 100%;
		border-radius: 0.6rem;
	}
	@media (max-width: 800px) {
		.instruction-info {
			flex-direction: column;
		}
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
