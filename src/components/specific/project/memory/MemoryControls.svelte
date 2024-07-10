<script lang="ts">
    import Button from '$cmp/shared/button/Button.svelte'
    import RawInput from '$cmp/shared/input/RawInput.svelte'
    import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Form from '$cmp/shared/layout/Form.svelte'
    import { createEventDispatcher } from 'svelte'
    import { clamp } from '$lib/utils'

    let hexAddress = '00000000'
    export let currentAddress: number
    export let bytesPerPage: number
    export let memorySize: number
    export let hideLabel = false
    export let inputStyle = ''
    export let style = ''

    function searchAddress() {
        const newAddress = parseInt(hexAddress, 16)
        hexAddress = currentAddress.toString(16)
        updateAddress(newAddress)
    }

    function updateAddress(value: number) {
        const clampedSize = value - (value % bytesPerPage)
        currentAddress = clamp(clampedSize, 0, memorySize - bytesPerPage + 1)
    }

    const dispatcher = createEventDispatcher<{
        addressChange: number
    }>()
    $: hexAddress = currentAddress.toString(16)
    $: dispatcher('addressChange', currentAddress)
</script>

<Form style="width:100%; {style}" on:submit={searchAddress}>
	<div class="address-search">
		<RawInput
			bind:value={hexAddress}
			label={hideLabel ? '' : 'Address'}
			style={`flex:1; padding-right: 0; ${inputStyle}`}
		/>
		<Button
			on:click={searchAddress}
			hasIcon
			style="padding:0 0.5rem; height:100%; width:2.2rem; margin-left: 0.2rem; min-height: 1.8rem;"
			cssVar="primary"
			title="Search address"
			active={parseInt(hexAddress, 16) !== currentAddress}
		>
			<Icon size={1}>
				<FaSearch />
			</Icon>
		</Button>

		<Button
			on:click={() => updateAddress(currentAddress - bytesPerPage)}
			hasIcon
			style="padding:0 0.5rem; height:100%; min-height: 1.8rem;"
			cssVar="primary"
			title="Previous page"
		>
			<Icon size={1.2}>
				<FaAngleLeft />
			</Icon>
		</Button>

		<Button
			on:click={() => updateAddress(currentAddress + bytesPerPage)}
			hasIcon
			style="padding:0 0.5rem; height:100%; min-height: 1.8rem;"
			cssVar="primary"
			title="Next page"
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
    gap: 0.2rem;
    align-items: center;
    flex: 1;
    width: 100%;
  }
</style>
