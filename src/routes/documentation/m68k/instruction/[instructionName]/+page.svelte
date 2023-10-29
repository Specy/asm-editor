<script lang="ts">
	import type { PageData } from './$types'
	import Page from '$cmp/layout/Page.svelte'
	import { onMount, SvelteComponent } from 'svelte'
	import {
		fromSizesToString,
		fromSizeToString,
		getAddressingModeNames,
	} from '$lib/languages/M68K-documentation'
	import DocsOperand from '$cmp/documentation/m68k/DocsOperand.svelte'
	import { createMarkdownWithOptions } from '$lib/markdown'
	import MarkdownRenderer from '$cmp/MarkdownRenderer.svelte'
	export let data: PageData
	let ins = data.props.instruction
	$: ins = data.props.instruction
	let component: typeof SvelteComponent<any>

	onMount(async () => {
		//HUGE ASS HACK TO MAKE SVELTEKIT WORK BECAUSE OF TOP LEVEL AWAIT 
		const imp = await import('./ClientOnly.svelte')
		await imp?.__tla
		component = imp?.default
	})
	let code = ins.interactiveExample?.code ?? '; no interactive instruction available'
	$: code = ins.interactiveExample?.code ?? '; no interactive instruction available'
</script>

<svelte:head>
	<meta name="description" content={`The ${ins.name} instruction.\n${ins.description}`} />
	<meta name="og:description" content={`The ${ins.name} instruction.\n${ins.description}`} />
	<meta name="keywords" content={ins.name} />
	<meta name="author" content="specy" />
	<title>
		Docs - {ins.name}
	</title>
	<meta name="og:title" content="Docs - {ins.name}" />
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;">
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
				<MarkdownRenderer source={createMarkdownWithOptions(ins.description, {})} />
			</article>
		</div>
	</div>
	{#if component}
		<svelte:component this={component} bind:code instructionKey={ins.name}/>
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
		min-height: 19.75rem;
	}
	.instruction-info {
		display: flex;
		gap: 1rem;
	}
	.instruction-name {
		font-size: 4rem;
		margin-right: 2rem;
		min-width: 11.2rem;
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
	:global(.description a) {
		color: var(--accent);
		text-decoration: underline;
	}
	@media (max-width: 800px) {
		.instruction-info {
			flex-direction: column;
		}
	}

</style>
