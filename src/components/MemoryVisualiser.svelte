<script lang="ts">
	import type { DiffedMemory, Register, StatusRegister } from '$lib/M68KEmulator'
	import Button from './buttons/Button.svelte'
	import RawInput from './inputs/RawInput.svelte'
	import ValueDiff from './ValueDiff.svelte'
	import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import Icon from './layout/Icon.svelte'
	import Form from './misc/Form.svelte'
	import { MEMORY_SIZE, PAGE_ELEMENT_SIZE, PAGE_SIZE } from '$lib/Config'
	import { createEventDispatcher } from 'svelte'
	import { clamp } from '$lib/utils'
	export let registers: Register[] = []
	export let memory: DiffedMemory
	export let currentAddress: number
	export let sp: number
	import { settingsStore } from '$stores/settingsStore'
	export let statusCodes: StatusRegister[]
	let hexAddress = '00000000'
	let visibleAddresses = new Array(PAGE_ELEMENT_SIZE).fill(0)
	$: visibleAddresses = new Array(PAGE_ELEMENT_SIZE)
		.fill(0)
		.map((_, i) => currentAddress + i * PAGE_ELEMENT_SIZE)

	function searchAddress() {
		const newAddress = parseInt(hexAddress, 16)
		hexAddress = currentAddress.toString(16)
		updateAddress(newAddress)
	}
	function updateAddress(value: number) {
		const clampedSize = value - (value % PAGE_SIZE)
		currentAddress = clamp(clampedSize, 0, MEMORY_SIZE)
	}
	const dispatcher = createEventDispatcher<{
		addressChange: number
		registerClick: Register
	}>()
	$: dispatcher('addressChange', currentAddress)
	let usesHex = !$settingsStore.values.useDecimalAsDefault.value
	$: usesHex = !$settingsStore.values.useDecimalAsDefault.value
	$: hexAddress = currentAddress.toString(16)
</script>

<div class="memory">
	<div class="column" style="margin-right: 0.5rem;">
		<div class="status-codes">
			{#each statusCodes as el, i (i)}
				<div class="column">
					<div>
						{el.name}
					</div>
					<div>
						{el.value}
					</div>
				</div>
			{/each}
		</div>

		<div class="registers">
			{#each registers as register (register.name)}
				<div class="register-wrapper">
					<div class="hover-register-value">
						{#if usesHex}
							{register.value}
						{:else}
							{register.value.toString(16).padStart(8, '0')}
						{/if}
					</div>
					<button class="register-name" on:click={() => dispatcher('registerClick', register)}>
						{register.name}
					</button>
				</div>
				<div class="register-hex">
					{#each register.hex as hex, i}
						<ValueDiff
							style={'padding:0.2rem; '}
							value={usesHex ? hex : parseInt(hex, 16).toString().padStart(5, '0')}
							hoverValue={usesHex ? parseInt(hex, 16) : hex}
							diff={usesHex
								? register.diff.hex[i]
								: parseInt(register.diff.hex[i], 16).toString().padStart(5, '0')}
							monospaced
						/>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<div class="address-wrapper">
		<Form style="width:100%" on:submit={searchAddress}>
			<div class="address-search">
				<RawInput bind:value={hexAddress} label="Address" style="flex:1; padding-right: 0" />
				<Button
					on:click={searchAddress}
					hasIcon
					style="padding:0 0.5rem; height:2.4rem; margin-left: 0.4rem"
					cssVar="primary"
					active={parseInt(hexAddress, 16) !== currentAddress}
				>
					<Icon size={1}>
						<FaSearch />
					</Icon>
				</Button>

				<Button
					on:click={() => updateAddress(currentAddress - PAGE_SIZE)}
					hasIcon
					style="padding:0 0.5rem; height:2.4rem"
					cssVar="primary"
				>
					<Icon size={1.4}>
						<FaAngleLeft />
					</Icon>
				</Button>

				<Button
					on:click={() => updateAddress(currentAddress + PAGE_SIZE)}
					hasIcon
					style="padding:0 0.5rem; height:2.4rem"
					cssVar="primary"
				>
					<Icon size={1.4}>
						<FaAngleRight />
					</Icon>
				</Button>
			</div>
		</Form>
		<div class="memory-grid">
			<div class="memory-offsets">
				{#each new Array(PAGE_ELEMENT_SIZE).fill(0) as _, offset}
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
	</div>
</div>

<style lang="scss">
	.memory {
		display: flex;
	}
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
		background-color: var(--secondary-attention);
		height: 100%;
		margin-top: 0.5rem;
		color: var(--secondary-attention-text);
		border-radius: 0.5rem;
		padding-right: 0.3rem;
		padding-bottom: 0.3rem;
		overflow: hidden;
	}
	.status-codes {
		display: flex;
		background-color: var(--secondary);
		color: var(--secondary-text);
		gap: 0.3rem;
		margin-bottom: 0.5rem;
		justify-content: space-around;
		padding: 0.3rem;
		border-radius: 0.4rem;
	}
	.memory-numbers {
		grid-area: c;
		color: var(--text-darker);
		display: grid;
		background-color: var(--secondary);
		border-radius: 0.3rem;
		width: min-content;
		grid-template-columns: repeat(16, 1fr);
		grid-template-rows: repeat(16, 1fr);
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

	.address-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		flex: 1;
	}
	.memory-grid-address {
		font-family: monospace;
	}
	.address-search {
		display: flex;
		align-items: center;
		width: 100%;
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
	.registers {
		display: grid;
		background-color: var(--secondary);
		padding: 0.5rem;
		border-radius: 0.5rem;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto;
		flex-direction: column;
		gap: 0.2rem;
		align-items: center;
		font-size: 1rem;
		flex: 1;
		@media screen and (max-width: 1000px) {
			width: unset;
		}
	}

	.hover-register-value {
		display: none;
		min-width: 100%;
		background-color: var(--secondary-attention);
		color: var(--secondary-attention-text);
		border-radius: 0.2rem;
		position: absolute;
		cursor: text;
		user-select: all;
		font-family: monospace;
		font-size: 1rem;
		box-shadow: rgba(0, 0, 0, 0.4) 0px 0px 6px;
		left: 1.6rem;
		z-index: 2;
		top: 0;
		height: 100%;
		padding: 0 0.7rem;
		align-items: center;
		font-weight: normal;
	}
	.register-wrapper {
		position: relative;
		&:hover .hover-register-value {
			display: flex;
		}
	}
	.register-name {
		font-weight: bold;
		padding: 0.2rem;
		border-radius: 0.2rem;
		border: none;
		width: 1.6rem;
		background: transparent;
		color: var(--secondary-text);
		cursor: pointer;
		&:hover {
			background-color: var(--accent2);
		}
	}
	.register-value {
		font-weight: bold;
	}
	.register-hex {
		display: flex;
		justify-content: space-between;
		padding-left: 0.2rem;
		gap: 0.1rem;
		border-left: solid 0.1rem var(--secondary-attention);
	}
</style>
