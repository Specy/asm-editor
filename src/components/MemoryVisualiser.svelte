<script lang="ts">
	import type { Memory, Register } from '$lib/M68KEmulator'
	import Button from './buttons/Button.svelte'
	import RawInput from './inputs/RawInput.svelte'
	import RegisterDiff from './RegisterDiff.svelte'
	import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import { fade } from 'svelte/transition'
	import Icon from './layout/Icon.svelte'
	import Form from './misc/Form.svelte'
	export let registers: Register[] = []
	export let memory: Memory = {}
	export let currentAddress = 0
	let hexAddress = '00000000'
	type DataType = 'register' | 'memory'
	let type: DataType = 'memory'
	const ADDRESSES_PER_PAGE = 16
	let visibleAddresses = new Array(ADDRESSES_PER_PAGE).fill(0)
	$: visibleAddresses = new Array(ADDRESSES_PER_PAGE).fill(0).map((_, i) => currentAddress + i)
	$: hexAddress = (currentAddress >>> 0).toString(16).padStart(8, '0')

	function searchAddress() {
		const newAddress = parseInt(hexAddress, 16)
		if (newAddress > 0) currentAddress = newAddress
	}
</script>

{#if type === 'register'}
	<div class="register-grid" in:fade={{ duration: 400 }}>
		<div class="register-grid-title">Name</div>
		<div class="register-grid-title">Value</div>
		<div class="register-grid-title">Hex</div>
		{#each registers as register (register.name)}
			<div class="register-name">
				{register.name}
			</div>
			<div class="register-value">
				<RegisterDiff value={register.value} diff={register.diff.value} />
			</div>
			<div class="register-hex">
				{#each register.hex as hex, i}
					<RegisterDiff value={hex} diff={register.diff.hex[i]} monospaced />
				{/each}
			</div>
		{/each}
	</div>
{:else}
	<div class="address-wrapper" in:fade={{ duration: 400 }}>
		<Form style="width:100%" on:submit={searchAddress}>
			<div class="address-search">
				<RawInput bind:value={hexAddress} label="Address" style="flex:1; padding-right: 0" />
				<Button
					on:click={searchAddress}
					hasIcon
					style="padding:0; width:1.9rem; height:2.4rem; margin-left: 0.4rem"
					cssVar="primary"
				>
					<Icon size={1}>
						<FaSearch />
					</Icon>
				</Button>

				<Button
					on:click={() => {
						if (currentAddress - ADDRESSES_PER_PAGE >= 0) {
							currentAddress -= ADDRESSES_PER_PAGE
						}
					}}
					hasIcon
					style="padding:0; width:1.9rem; height:2.4rem"
					cssVar="primary"
				>
					<Icon size={1.4}>
						<FaAngleLeft />
					</Icon>
				</Button>

				<Button
					on:click={() => {
						if (currentAddress + ADDRESSES_PER_PAGE < 4294967295) {
							currentAddress += ADDRESSES_PER_PAGE
						}
					}}
					hasIcon
					style="padding:0; width:1.9rem; height:2.4rem"
					cssVar="primary"
				>
					<Icon size={1.4}>
						<FaAngleRight />
					</Icon>
				</Button>
			</div>
		</Form>

		<div class="memory-grid">
			<div class="memory-grid-title">Address</div>
			<div>Decimal</div>
			<div>Char</div>
			{#each visibleAddresses as address (address)}
				<div class="memory-grid-address">
					0x{(address >>> 0).toString(16).padStart(8, '0')}
				</div>
				<div class="memory-grid-value">
					<RegisterDiff value={Number(memory[address]) || 0} diff={0} />
				</div>
				<div class="memory-grid-value">
					<RegisterDiff value={String.fromCharCode(Number(memory[address]) || 0)} diff={'\x00'} />
				</div>
			{/each}
		</div>
	</div>
{/if}
<div class="data-type-selector">
	<Button
		style="width: 100%"
		cssVar={type === 'register' ? 'accent' : 'accent2'}
		on:click={() => (type = 'register')}
	>
		Registers
	</Button>
	<Button
		style="width: 100%"
		cssVar={type === 'memory' ? 'accent' : 'accent2'}
		on:click={() => (type = 'memory')}
	>
		Memory
	</Button>
</div>

<style lang="scss">
	.address-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		flex: 1;
	}
	.memory-grid-address {
		font-family: 'Lucida Console', 'Menlo', 'Monaco', 'Courier', monospace;
	}
	.address-search {
		margin-bottom: 1rem;
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
	.memory-grid {
		display: grid;
		grid-template-columns: auto auto auto;
		justify-content: space-between;
		min-width: 70%;
		height: 100%;
		row-gap: 0.5rem;
		column-gap: 1rem;
	}
	.register-grid {
		display: grid;
		grid-template-columns: auto auto auto;
		justify-content: center;
		width: 100%;
		row-gap: 0.4rem;
		font-size: 0.9rem;
		column-gap: 3vw;
		margin-bottom: 1rem;
		overflow-y: auto;
		flex: 1;
		.register-grid-title {
			margin-bottom: 0.7rem;
			text-align: center;
		}
		.register-name {
			font-weight: bold;
		}
		.register-value {
			font-weight: bold;
		}
		.register-hex {
			display: flex;
			gap: 0.3rem;
		}
		@media screen and (max-width: 700px) {
			width: unset;
			column-gap: 10vw;
		}
	}
</style>
