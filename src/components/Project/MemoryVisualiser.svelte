<script lang="ts">
	import type { DiffedMemory } from '$lib/M68KEmulator'
	import ValueDiff from '../ValueDiff.svelte'
	export let memory: DiffedMemory
	export let currentAddress: number
	export let sp: number
	export let pageSize: number
	export let bytesPerRow: number
	let visibleAddresses = new Array(pageSize / bytesPerRow).fill(0)
	$: visibleAddresses = new Array(pageSize / bytesPerRow)
		.fill(0)
		.map((_, i) => currentAddress + i * bytesPerRow)
</script>

<div class="memory-grid"
	style={`--bytesPerRow: ${bytesPerRow}`}
>
	<div class="memory-offsets">
		{#each new Array(bytesPerRow).fill(0) as _, offset}
			<div>
				{offset.toString(16).toUpperCase().padStart(2, '0')}
			</div>
		{/each}
	</div>
	<div class="memory-addresses">
		{#each visibleAddresses as address (address)}
			<div class="memory-grid-address">
				{address.toString(16).padStart(4, '0').toUpperCase()}
			</div>
		{/each}
	</div>
	<div class="memory-numbers">
		{#each memory.current as word, i}
			<ValueDiff
				value={word.toString(16).toUpperCase()}
				diff={memory.prevState[i]?.toString(16).toUpperCase() ?? 'FF'}
				hasSoftDiff={word.toString(16).toUpperCase() !== 'FF'}
				style={`padding: 0.3rem;  ${
					currentAddress + i === sp
						? ' background-color: var(--accent2); color: var(--accent2-text);'
						: 'border-radius: 0;'
				}`}
				hoverValue={word}
				monospaced
			/>
		{/each}
	</div>
</div>

<style lang="scss">
	.memory-grid {
		display: grid;
		font-family: monospace;
		font-size: 1rem;
		grid-template-columns: min-content;
		grid-template-rows: min-content;
		grid-template-areas:
			'b a a a a'
			'b c c c c'
			'b c c c c'
			'b c c c c'
			'b c c c c';
		background-color: var(--tertiary);
		margin-top: 0.5rem;
		color: var(--tertiary-text);
		border-radius: 0.5rem;
		padding-right: 0.3rem;
		padding-bottom: 0.3rem;
		overflow: hidden;
	}

	.memory-numbers {
		grid-area: c;
		color: var(--text-darker);
		display: grid;
		background-color: var(--secondary);
		border-radius: 0.3rem;
		grid-template-columns: repeat(var(--bytesPerRow), 1fr);
		grid-template-rows: repeat(var(--bytesPerRow), 1fr);
	}
	.memory-offsets {
		gap: 0.2rem;
		display: flex;
		grid-area: a;
		height: 2rem;
		align-items: center;
		justify-content: space-around;
	}

	.memory-addresses {
		margin-top: 2rem;
		padding: 0 0.5rem;
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		grid-area: b;
	}

	.memory-grid-address {
		font-family: monospace;
	}

	.data-type-selector {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		width: 100%;
		margin-top: auto;
		padding-top: 1rem;
		justify-content: space-around;
	}
</style>
