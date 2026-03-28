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

    let inputRef = $state<HTMLInputElement>(null)

    function searchAddress() {
        const cleaned = hexAddress.replace('0x', '')
        const newAddress = BigInt(`0x${cleaned || '0'}`)
        hexAddress = toHexString(newAddress, systemSize)
        updateAddress(newAddress)
    }

    function updateAddress(value: bigint) {
        const clampedSize = value - (value % BigInt(bytesPerPage))
        const minMaxAddress = clampBigInt(
          clampedSize,
          0n,
          memorySize - BigInt(bytesPerPage - 1))
        onAddressChange(minMaxAddress)
    }

    $effect(() => {
        hexAddress = currentAddress.toString(16)
    })
</script>

<Form style="width:100%; {style}" on:submit={searchAddress}>
    <div class="address-search">
        <div
          class="hex-address"
          onclick={() => {
              inputRef?.focus()
          }}
        >
            {#if !hideLabel}
                <span>
                    Address
                </span>
            {/if}
            <span
                class="hex-address-label"
                class:hex-address-label-no-prefix={hideLabel}
            >
                0x
            </span>
            <input
              bind:this={inputRef}
              spellcheck="false"
              bind:value={hexAddress}
              class="hex-address-input"
            />
        </div>
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
    .hex-address-label{
        margin-left: 0.5rem;
        padding: 0.3rem 0 0.3rem 0.5rem;
        opacity: 0.6;
        border-left: solid 1px var(--primary-text);
    }
    .hex-address-label-no-prefix{
        margin-left: 0;
        padding: 0.3rem 0;
        border-left: none;
    }
    .address-search {
        display: flex;
        gap: 0.2rem;
        align-items: center;
        flex: 1;
        width: 100%;
    }

    .hex-address{
        flex:1;
        display: flex;
        border-radius: 0.4rem;
        padding: 0.4rem 0.8rem;
        align-items: center;
        font-size: 0.9rem;
        background-color: var(--secondary);
        color: var(--secondary-text);

    }
    .hex-address-input{
        width: 100%;
        padding: 0.3rem 0.8rem 0.3rem 0;
        font-size: 1rem;
        font-family: monospace;
        color: var(--secondary-text);
        display: flex;
        flex: 1;
        border: none;
        background-color: transparent;
    }
</style>
