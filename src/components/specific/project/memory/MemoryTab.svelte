<script lang="ts">
	import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
	import { MEMORY_SIZE } from '$lib/Config'
	import type { MemoryTab } from '$lib/languages/M68KEmulator'
	import { createEventDispatcher } from 'svelte'
	import MemoryControls from './MemoryControls.svelte'
	import MemoryVisualiser from './MemoryRenderer.svelte'
  import Column from '$cmp/shared/layout/Column.svelte'
	export let sp: number
	export let tab: MemoryTab
	export let left = 500
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
			memorySize={MEMORY_SIZE}
			currentAddress={tab.address}
			inputStyle="width: 6rem"
			on:addressChange={async (e) => {
				dispatcher('addressChange', { address: e.detail, tab })
			}}
			hideLabel
		/>
		<MemoryVisualiser
			bytesPerRow={tab.rowSize}
			pageSize={tab.pageSize}
			memory={tab.data}
			currentAddress={tab.address}
			{sp}
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
