<script lang="ts">
	import Button from '$cmp/shared/button/Button.svelte'
	import Icon from '$cmp/shared/layout/Icon.svelte'
	import type { DiffedMemory } from '$lib/languages/M68KEmulator'
	import ValueDiff from '$cmp/specific/project/user-tools/ValueDiffer.svelte'
	export let memory: DiffedMemory
	export let currentAddress: number
	export let sp: number
	export let pageSize: number
	export let bytesPerRow: number
	import MdTextFields from 'svelte-icons/md/MdTextFields.svelte'
	enum DisplayType {
		Hex,
		Char,
		Decimal
	}
	export let style = ''
	let type = DisplayType.Hex
	let visibleAddresses = new Array(pageSize / bytesPerRow).fill(0)
	$: visibleAddresses = new Array(pageSize / bytesPerRow)
		.fill(0)
		.map((_, i) => currentAddress + i * bytesPerRow)

	function getTextFromValue(value: number, padding?: number, typeOverride?: DisplayType) {
		switch (typeOverride ?? type) {
			case DisplayType.Hex:
				return value
					.toString(16)
					.padStart(padding ?? 0, '0')
					.toUpperCase()
			case DisplayType.Char:
				//hides last extended ascii to have prettier view
				return value === 0xff ? '' : String.fromCharCode(value)
			case DisplayType.Decimal:
				return value.toString().padStart(padding ?? 2, '0')
			default:
				return value.toString()
		}
	}
</script>

<div class="memory-grid" style={`--bytesPerRow: ${bytesPerRow}; ${style}`}>
	<div class="memory-offsets">
		{#each new Array(bytesPerRow).fill(0) as _, offset}
			<div>
				{getTextFromValue(offset, 2, DisplayType.Hex)}
			</div>
		{/each}
	</div>
	<div class="memory-addresses">
		<div class="row" style="padding: 0.25rem; height:2rem; padding-bottom: 0; padding-right: 0.1rem">
			<Button
				title={type === DisplayType.Hex ? 'Show as character' : 'Show as hex'}
				style="padding: 0.2rem; border-radius: 0.35rem; height:100%; width: 100%"
				on:click={() => (type = type === DisplayType.Hex ? DisplayType.Char : DisplayType.Hex)}
				active={type === DisplayType.Char}
				cssVar="accent2"
			>
				<Icon size={1}>
					<MdTextFields />
				</Icon>
			</Button>
		</div>
		{#each visibleAddresses as address (address)}
			<div class="memory-grid-address">
				{getTextFromValue(address, 4, DisplayType.Hex)}
			</div>
		{/each}
	</div>
	<div class="memory-numbers">
		{#each memory.current as word, i}
			<ValueDiff
				value={getTextFromValue(word, 0, type)}
				diff={getTextFromValue(memory.prevState[i] ?? 0xff, 0, type)}
				hasSoftDiff={word !== 0xff}
				style={`padding: 0.3rem; min-width: calc(0.6rem + 2ch); height: calc(2ch + 0.65rem); ${
					currentAddress + i === sp
						? ' background-color: var(--accent2); color: var(--accent2-text);'
						: 'border-radius: 0;'
				}`}
				monospaced
			>
				<div slot="hoverValue" style="user-select: all;">
					{word}
				</div>
			</ValueDiff>
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
		color: var(--tertiary-text);
		border-radius: 0.5rem;
		padding-right: 0.3rem;
		padding-bottom: 0.3rem;
		overflow: hidden;
	}

	.memory-numbers {
		grid-area: c;
		color: var(--text-layered);
		display: grid;
		background-color: var(--secondary);
		color: var(--secondary-text);
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
		display: flex;
		flex-direction: column;
		grid-area: b;
	}

	.memory-grid-address {
		font-family: monospace;
		padding: 0 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
	}
</style>
