<script lang="ts">
	import Button from '../buttons/Button.svelte'
	import RawInput from '../inputs/RawInput.svelte'
	import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
	import Icon from '../layout/Icon.svelte'
	import Form from '../misc/Form.svelte'
	import { createEventDispatcher } from 'svelte'
	import { clamp } from '$lib/utils'
	let hexAddress = '00000000'
	export let currentAddress: number
	export let bytesPerPage: number
	export let memorySize: number
	export let hideLabel = false
	export let inputStyle = ''
	function searchAddress() {
		const newAddress = parseInt(hexAddress, 16)
		hexAddress = currentAddress.toString(16)
		updateAddress(newAddress)
	}
	function updateAddress(value: number) {
		const clampedSize = value - (value % bytesPerPage)
		currentAddress = clamp(clampedSize, 0, memorySize)
	}
	const dispatcher = createEventDispatcher<{
		addressChange: number
	}>()
	$: hexAddress = currentAddress.toString(16)
	$: dispatcher('addressChange', currentAddress)
</script>

<Form style="width:100%" on:submit={searchAddress}>
	<div class="address-search">
		<RawInput
			bind:value={hexAddress}
			label={hideLabel ? '' : 'Address'}
			style={`flex:1; padding-right: 0; ${inputStyle}`}
		/>
		<Button
			on:click={searchAddress}
			hasIcon
			style="padding:0 0.5rem; height:2.4rem; width:2.2rem; margin-left: 0.4rem"
			cssVar="primary"
			active={parseInt(hexAddress, 16) !== currentAddress}
		>
			<Icon size={1}>
				<FaSearch />
			</Icon>
		</Button>

		<Button
			on:click={() => updateAddress(currentAddress - bytesPerPage)}
			hasIcon
			style="padding:0 0.5rem; height:2.4rem"
			cssVar="primary"
		>
			<Icon size={1.2}>
				<FaAngleLeft />
			</Icon>
		</Button>

		<Button
			on:click={() => updateAddress(currentAddress + bytesPerPage)}
			hasIcon
			style="padding:0 0.5rem; height:2.4rem"
			cssVar="primary"
		>
			<Icon size={1.2}>
				<FaAngleRight />
			</Icon>
		</Button>
	</div>
</Form>

<style lang="scss">
	.address-search {
		display: flex;
		align-items: center;
		flex: 1;
		width: 100%;
	}
</style>
