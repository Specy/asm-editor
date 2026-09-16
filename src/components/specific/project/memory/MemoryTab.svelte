<script lang="ts">
    import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
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
        left?: number
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
    }

    let {
        systemSize,
        sp,
        tab,
        left = 500,
        memorySize,
        defaultMemoryValue,
        endianess,
        callStackAddresses,
        onAddressChange,
        pokeable = false,
        onPoke
    }: Props = $props()
</script>

<ToggleableDraggable title="Stack pointer" {left}>
    <div class="tab column">
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
</ToggleableDraggable>

<style lang="scss">
    .tab {
        background-color: var(--primary);
        color: var(--primary-text);
        padding: 0.4rem;
        gap: 0.4rem;
        max-width: 16rem;
        border-radius: 0.7rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
</style>
