<script lang="ts">
    import type { ThemeKeys } from '$stores/themeStore.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaSearch from '~icons/fa-solid/search'
    import FaAngleLeft from '~icons/fa-solid/angle-left'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Form from '$cmp/shared/layout/Form.svelte'
    import { clampBigInt } from '$lib/utils'
    import { type RegisterSize, toHexString } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        currentAddress: bigint
        bytesPerPage: number
        memorySize: bigint
        hideLabel?: boolean
        inputStyle?: string
        style?: string
        systemSize: RegisterSize
        onAddressChange: (address: bigint) => void
        /**
         * The buttons' colour: the page's own by default, where the controls sit on the page; a
         * caller that puts them on a card passes the card's, so they read as part of it.
         */
        buttonVar?: ThemeKeys
    }

    let {
        currentAddress = $bindable(),
        bytesPerPage,
        memorySize,
        hideLabel = false,
        inputStyle = '',
        style = '',
        systemSize,
        onAddressChange,
        buttonVar = 'primary'
    }: Props = $props()

    let hexAddress = $derived(currentAddress.toString(16))
    let inputRef = $state<HTMLInputElement | undefined>()

    function searchAddress() {
        const cleaned = hexAddress.replace('0x', '')
        const newAddress = BigInt(`0x${cleaned || '0'}`)
        hexAddress = toHexString(newAddress, systemSize)
        updateAddress(newAddress)
    }

    function updateAddress(value: bigint) {
        const clampedSize = value - (value % BigInt(bytesPerPage))
        const minMaxAddress = clampBigInt(clampedSize, 0n, memorySize - BigInt(bytesPerPage - 1))
        onAddressChange(minMaxAddress)
    }
</script>

<Form style="width:100%; {style}" on:submit={searchAddress}>
    <div class="address-search">
        <div
            class="hex-address"
            style={inputStyle}
            onclick={() => {
                inputRef?.focus()
            }}
        >
            {#if !hideLabel}
                <span> Address </span>
            {/if}
            <span class="hex-address-label" class:hex-address-label-no-prefix={hideLabel}>
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
            style="padding: 0; margin-left: 0.3rem; width:1.8rem; min-height: 1.8rem;"
            cssVar={buttonVar}
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
            style="padding: 0; width:1.8rem; min-height: 1.8rem;"
            cssVar={buttonVar}
            title="Previous page"
        >
            <Icon size={1.2}>
                <FaAngleLeft />
            </Icon>
        </Button>

        <Button
            onClick={() => updateAddress(currentAddress + BigInt(bytesPerPage))}
            hasIcon
            style="padding: 0; width:1.8rem; min-height: 1.8rem;"
            cssVar={buttonVar}
            title="Next page"
        >
            <Icon size={1.2}>
                <FaAngleRight />
            </Icon>
        </Button>
    </div>
</Form>

<style lang="scss">
    .hex-address-label {
        margin-left: 0.5rem;
        padding: 0.3rem 0 0.3rem 0.5rem;
        opacity: 0.6;
        border-left: solid 1px var(--wb-line, var(--tertiary));
    }
    .hex-address-label-no-prefix {
        margin-left: 0;
        padding: 0.3rem 0;
        border-left: none;
    }
    .address-search {
        display: flex;
        flex: 1;
        width: 100%;
    }

    .hex-address {
        flex: 1;
        display: flex;
        border-radius: 0.4rem;
        /* the text has as much room on its right as above and below it, the input's own 0.3rem
           included */
        padding: 0.4rem 0.4rem 0.4rem 0.8rem;
        align-items: center;
        font-size: 0.9rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .hex-address-input {
        width: 100%;
        padding: 0.3rem 0.3rem 0.3rem 0;
        font-size: 1rem;
        font-family: monospace;
        color: var(--secondary-text);
        display: flex;
        flex: 1;
        border: none;
        background-color: transparent;
    }
</style>
