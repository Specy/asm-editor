<script lang="ts">
	import type { Memory, Register } from '$lib/M68KEmulator'
	import Button from './buttons/Button.svelte'
	import RawInput from './inputs/RawInput.svelte'
	import RegisterDiff from './RegisterDiff.svelte'
	import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
    import { fade } from 'svelte/transition';
	import Icon from './layout/Icon.svelte'
	export let registers: Register[] = []
	export let memory: Memory = {}
	export let currentAddress = 0
	let hexAddress = '00000000'
	type DataType = 'register' | 'memory'
	let type: DataType = 'register'
	const maxAddresses = 16
	let visibleAddresses = new Array(maxAddresses).fill(0)
	$: visibleAddresses = new Array(maxAddresses).fill(0).map((_, i) => currentAddress + i)
    $: hexAddress = (currentAddress >>> 0).toString(16).padStart(8, '0')
</script>

{#if type === 'register'}
	<div class="register-grid" in:fade={{duration: 400}}>
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
    <div class="address-wrapper" in:fade={{duration: 400}}>
        <div class="address-search">
            <RawInput bind:value={hexAddress} label="Address" style="width: 100%;" />
            <Icon style='height:100%;' size={1} on:click={() => {
                if(currentAddress - maxAddresses >= 0){
                    currentAddress -= maxAddresses
                }
            }}>
                <FaAngleLeft />
            </Icon>
            <Icon style='height:100%;' size={1} on:click={() => {
                if(currentAddress + maxAddresses < 4294967295){
                    currentAddress += maxAddresses
                }
            }}>
                <FaAngleRight />
            </Icon>
            <Icon
                on:click={() => {
                    const newAddress = parseInt(hexAddress, 16)
                    if(newAddress > 0) currentAddress = newAddress
                }}
            >
                <FaSearch />
            </Icon>

        </div>
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
	.data-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		background-color: var(--secondary-darker);
		width: 100%;
	}
    .address-wrapper{
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        flex: 1;
    }
    .memory-grid-address{
		font-family: 'Lucida Console', 'Menlo', 'Monaco', 'Courier', monospace;
    }
	.address-search {
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding-right: 0.5rem;
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
		column-gap: 1rem;
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
		}
	}
</style>
