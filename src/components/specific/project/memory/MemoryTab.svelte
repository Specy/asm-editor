<script lang="ts">
    import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
    import { MEMORY_SIZE } from '$lib/Config'
    import { createEventDispatcher } from 'svelte'
    import MemoryControls from './MemoryControls.svelte'
    import MemoryVisualiser from './MemoryRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import type { ColorizedLabel, MemoryTab } from '$lib/languages/commonLanguageFeatures.svelte'
    interface Props {
        sp: number
        tab: MemoryTab
        left?: number
        memorySize: number
        defaultMemoryValue: number
        endianess: 'big' | 'little'
        callStackAddresses: ColorizedLabel[]
    }

    let { sp, tab, left = 500, memorySize, defaultMemoryValue, endianess, callStackAddresses }: Props = $props()
    const dispatcher = createEventDispatcher<{
        addressChange: {
            address: number
            tab: MemoryTab
        }
    }>()
</script>

<ToggleableDraggable title="Stack pointer" {left}>
    <div class="tab column">
        <MemoryControls
            bytesPerPage={tab.pageSize}
            {memorySize}
            currentAddress={tab.address}
            inputStyle="width: 6rem"
            on:addressChange={async (e) => {
                dispatcher('addressChange', { address: e.detail, tab })
            }}
            hideLabel
        />
        <MemoryVisualiser
            {endianess}
            {defaultMemoryValue}
            bytesPerRow={tab.rowSize}
            pageSize={tab.pageSize}
            memory={tab.data}
            currentAddress={tab.address}
            {sp}
            {callStackAddresses}
        />
    </div>
</ToggleableDraggable>

<style lang="scss">
    .tab {
        background-color: var(--primary);
        color: var(--primary-text);
        padding: 0.4rem;
        gap: 0.4rem;
        border-radius: 0.7rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
</style>
