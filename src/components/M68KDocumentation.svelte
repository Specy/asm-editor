<script lang="ts">
	import FloatingContainer from './FloatingContainer.svelte'
	import {
		fromSizesToString,
		getAddressingModeNames,
		instructionsDocumentationList
	} from '$lib/languages/M68K-documentation'
	import Input from './inputs/Input.svelte'
	export let visible: boolean
	let wrapper: HTMLDivElement
	let searchValue = ''

	$: {
		if (visible && wrapper) {
			const els = wrapper.querySelectorAll('.instruction-name')
			const el = Array.from(els).find((el) =>
				el.textContent.toLowerCase().startsWith(searchValue.toLowerCase())
			)
			if (el) {
				el.scrollIntoView({ inline: 'nearest' })
			} else {
				const descr = wrapper.querySelectorAll('.instruction-description')
				const el = Array.from(descr).find((el) =>
					el.innerHTML.toLowerCase().includes(searchValue.toLowerCase())
				)
				if (el) el.scrollIntoView({ inline: 'nearest' })
			}
		}
	}
</script>

<FloatingContainer bind:visible title="M68K Documentation" style="width: 40rem">
	<div class="search-bar" slot="header">
		<Input
			bind:value={searchValue}
			placeholder="Search"
			style="padding: 0rem; background-color: var(--tertiary);"
		/>
	</div>
	<div class="instructions-list" bind:this={wrapper}>
		{#each instructionsDocumentationList as ins}
			<div class="instruction">
				<div class="row align-center">
					<div class="instruction-name">
						{ins.name}
					</div>
					{#if ins.sizes.length}
						<span style="font-size: 0.9rem;">
							({fromSizesToString(ins.sizes)})
						</span>
					{/if}
				</div>
				<div class="row instruction-addressing-modes">
					{#if ins.args.length}
						{#each ins.args as arg, i}
							<div class="row align-center args">
								<div class="op-index row align-center">
									Op {i + 1}
								</div>
								<div class="op">
									{getAddressingModeNames(arg)}
								</div>
							</div>
						{/each}
					{/if}
				</div>
				{#if ins.description}
					<span class="instruction-description">{ins.description}</span>
				{/if}
				{#if ins.example}
					<div>Example</div>
					<span class="instruction-example">
						{ins.example}
					</span>
				{/if}
			</div>
		{/each}
	</div>
</FloatingContainer>

<style>
	.instructions-list {
		display: flex;
		padding: 0.8rem;
		flex-direction: column;
		max-height: 75vh;
		overflow-y: auto;
		font-family: FiraCode;
		gap: 1rem;
	}
	.search-bar {
		max-width: 15rem;
	}
	.instruction {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.instruction-name {
		font-size: 1.5rem;
		margin-right: 0.4rem;
	}
	.instruction-addressing-modes {
		flex-wrap: wrap;
		gap: 0.2rem;
	}

	.args {
		font-size: 0.8rem;
		padding: 0.2rem;
		background-color: var(--secondary);
		border-radius: 0.4rem;
	}
	.op-index {
		height: 100%;
		padding-left: 0.6rem;
		padding-right: 0.4rem;
		font-size: 1rem;
		font-family: Orienta;
	}
	.op {
		height: 100%;
		padding: 0.3rem 0.4rem;
		background-color: var(--tertiary);
		border-radius: 0.3rem;
	}
	.instruction-description {
		padding: 0.6rem 0.8rem;
		background-color: rgba(var(--RGB-secondary), 0.7);
		border-radius: 0.4rem;
	}
</style>
