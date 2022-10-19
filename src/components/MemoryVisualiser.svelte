<script lang="ts">
	import type { Register, StatusRegister } from '$lib/M68KEmulator'
	import Button from './buttons/Button.svelte'
	import RawInput from './inputs/RawInput.svelte'
	import RegisterDiff from './ValueDiff.svelte'
	import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import { fade } from 'svelte/transition'
	import Icon from './layout/Icon.svelte'
	import Form from './misc/Form.svelte'
	import { MEMORY_SIZE, PAGE_ELEMENT_SIZE, PAGE_SIZE } from '$lib/Config'
	import { createEventDispatcher } from 'svelte'
	import { clamp } from '$lib/utils'
	export let registers: Register[] = []
	export let memory: Uint8Array
	export let currentAddress: number
	export let sp: number
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
	const dispatcher = createEventDispatcher<{ addressChange: number }>()
	$: dispatcher('addressChange', currentAddress)
	$: hexAddress = currentAddress.toString(16)
</script>

<div class="memory">
	<div class="column" style="margin-right: 0.5rem;">
		<div class="status-codes" >
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
				<div class="register-name">
					{register.name}
				</div>
				<div class="register-hex">
					{#each register.hex as hex, i}
						<RegisterDiff
							style="padding:0.2rem"
							value={hex}
							hoverValue={parseInt(hex, 16)}
							diff={register.diff.hex[i]}
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
				{#each memory as word, i}
					<RegisterDiff
						value={word.toString(16).toUpperCase()}
						diff={'FF'}
						style={`padding: 0.35rem; ${
							currentAddress + i == sp
								? ' background-color: var(--accent2); color: var(--accent2-text);'
								: ''
						}`}
						hoverValue={word}
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
		background-color: #2f4457;
		height: 100%;
		margin-top: 0.5rem;
		color: #f5f5f5;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.status-codes {
		display: flex;
		background-color: var(--secondary);
		color: var(--secondary-color);
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
		padding-right: 0.3rem;
		padding-bottom: 0.2rem;
		background-color: var(--secondary);
		border-top-left-radius: 0.2rem;
		grid-template-columns: repeat(16, 1fr);
		grid-template-rows: repeat(16, 1fr);
	}

	.memory-offsets {
		padding-right: 0.4rem;
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
		padding-bottom: 0.2rem;
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
		gap: 0.4rem;
		align-items: center;
		font-size: 1rem;
		flex: 1;
		@media screen and (max-width: 700px) {
			width: unset;
		}
	}

	.register-name {
		font-weight: bold;
		padding-right: 0.2rem;
		border-right: solid 2px #2f4457;
	}
	.register-value {
		font-weight: bold;
	}
	.register-hex {
		display: flex;
	}
</style>
