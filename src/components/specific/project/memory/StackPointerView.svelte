<script lang="ts">
    import type { ThemeKeys } from '$stores/themeStore.svelte'
    /**
     * A memory tab that follows its own address, the stack pointer's for the one tab there is: the
     * Stack pointer Debug tool, in a draggable window or a section of the debug column. Its address
     * controls are ruled off from the page under them from edge to edge of whatever holds it, so it
     * pads its own parts and its host gives it none.
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
    <div class="controls">
        <MemoryControls
            {systemSize}
            bytesPerPage={tab.pageSize}
            {memorySize}
            currentAddress={tab.address}
            inputStyle="width: 6rem; padding: 0 0 0 0.6rem;"
            onAddressChange={async (e) => {
                onAddressChange?.(e, tab)
            }}
            hideLabel
            buttonVar={controlsVar}
        />
    </div>
    <div class="page">
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
</div>

<style lang="scss">
    .controls {
        display: flex;
        padding: 0.3rem;
        border-bottom: 1px solid var(--wb-line, var(--tertiary));
    }

    .page {
        padding: 0.3rem;
    }
</style>
