<script lang="ts">
    import type { ThemeKeys } from '$stores/themeStore.svelte'
    /**
     * A memory tab that follows its own address, the stack pointer's for the one tab there is: the
     * Stack pointer Debug tool. `MemoryTab` puts it in a draggable window; the Workbench also shows
     * it as a section of the debug column.
     */
    import MemoryControls from './MemoryControls.svelte'
    import MemoryVisualiser from './MemoryRenderer.svelte'
    import {
        type ColorizedLabel,
        type MemoryTab,
        RegisterSize
    } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        sp: bigint
        tab: MemoryTab
        memorySize: bigint
        defaultMemoryValue: number
        endianess: 'big' | 'little'
        callStackAddresses: ColorizedLabel[]
        onAddressChange?: (address: bigint, tab: MemoryTab) => void
        systemSize: RegisterSize
        /** Whether the bytes take Pokes ([the design record](../../../../../docs/design/pokes.md)). */
        pokeable?: boolean
        /** One commit of the selection, which is one Poke however many bytes it holds. */
        onPoke?: (address: bigint, bytes: Uint8Array) => void
        style?: string
        /** The colour of the address controls' buttons, see `MemoryControls`. */
        controlsVar?: ThemeKeys
    }

    let {
        systemSize,
        sp,
        tab,
        memorySize,
        defaultMemoryValue,
        endianess,
        callStackAddresses,
        onAddressChange,
        pokeable = false,
        onPoke,
        style = '',
        controlsVar = 'primary'
    }: Props = $props()
</script>

<div class="tab column" {style}>
    <MemoryControls
        {systemSize}
        bytesPerPage={tab.pageSize}
        {memorySize}
        currentAddress={tab.address}
        inputStyle="width: 6rem;"
        onAddressChange={async (e) => {
            onAddressChange?.(e, tab)
        }}
        hideLabel
        buttonVar={controlsVar}
    />
    <MemoryVisualiser
        {systemSize}
        {endianess}
        {defaultMemoryValue}
        bytesPerRow={tab.rowSize}
        pageSize={tab.pageSize}
        memory={tab.data}
        currentAddress={tab.address}
        {sp}
        {callStackAddresses}
        {pokeable}
        {onPoke}
    />
</div>

<style lang="scss">
    .tab {
        gap: 0.4rem;
    }
</style>
