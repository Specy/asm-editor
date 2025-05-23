<script lang="ts">
    import { run } from 'svelte/legacy'

    import Button from '$cmp/shared/button/Button.svelte'
    import RawInput from '$cmp/shared/input/RawInput.svelte'
    import FaSearch from 'svelte-icons/fa/FaSearch.svelte'
    import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte'
    import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Form from '$cmp/shared/layout/Form.svelte'
    import { clampBigInt } from '$lib/utils'
    import { type RegisterSize, toHexString } from '$lib/languages/commonLanguageFeatures.svelte'

    let hexAddress = $state('00000000')
    interface Props {
        currentAddress: bigint
        bytesPerPage: number
        memorySize: bigint
        hideLabel?: boolean
        inputStyle?: string
        style?: string
        systemSize: RegisterSize
        onAddressChange: (address: bigint) => void
    }

    let {
        currentAddress = $bindable(),
        bytesPerPage,
        memorySize,
        hideLabel = false,
        inputStyle = '',
        style = '',
        systemSize,
        onAddressChange
    }: Props = $props()

    function searchAddress() {
        const newAddress = BigInt(`0x${hexAddress || '0'}`)
        hexAddress = toHexString(newAddress, systemSize)
        updateAddress(newAddress)
    }

    function updateAddress(value: bigint) {
        const clampedSize = value - (value % BigInt(bytesPerPage))
        onAddressChange(clampBigInt(clampedSize, 0n, memorySize - BigInt(bytesPerPage + 1)))
    }

    $effect(() => {
        hexAddress = currentAddress.toString(16)
    })
</script>

<Form style="width:100%; {style}" on:submit={searchAddress}>
    <div class="address-search">
        <RawInput
            bind:value={hexAddress}
            label={hideLabel ? '' : 'Address'}
            style={`flex:1; padding-right: 0; ${inputStyle}`}
        />
        <Button
            onClick={searchAddress}
            hasIcon
            style="padding:0 0.5rem; height:100%; width:2.2rem; margin-left: 0.2rem; min-height: 1.8rem;"
            cssVar="primary"
            title="Search address"
            active={BigInt(`0x${hexAddress || '0'}`) !== currentAddress}
        >
            <Icon size={1}>
                <FaSearch />
            </Icon>
        </Button>

        <Button
            onClick={() => updateAddress(currentAddress - BigInt(bytesPerPage))}
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
            onClick={() => updateAddress(currentAddress + BigInt(bytesPerPage))}
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
