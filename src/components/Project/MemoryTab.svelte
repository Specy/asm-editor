<script lang="ts">
	import Button from '$cmp/buttons/Button.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import Draggable from '$cmp/misc/Draggable.svelte'
	import { MEMORY_SIZE } from '$lib/Config'
	import type { MemoryTab } from '$lib/M68KEmulator'
	import { createEventDispatcher } from 'svelte'
	import FaEye from 'svelte-icons/fa/FaEye.svelte'
	import FaEyeSlash from 'svelte-icons/fa/FaEyeSlash.svelte'
	import FaGripHorizontal from 'svelte-icons/fa/FaGripHorizontal.svelte'
	import { fly } from 'svelte/transition'
	import MemoryControls from './MemoryControls.svelte'
	import MemoryVisualiser from './MemoryVisualiser.svelte'
	export let sp: number
	export let tab: MemoryTab
	let hidden = true
	const dispatcher = createEventDispatcher<{
		addressChange: {
			address: number
			tab: MemoryTab
		}
	}>()
</script>

<Draggable hiddenOnMobile>
	<div slot="header" class="tab-header row" class:hidden>
		<Icon size={1.2} style="cursor:inherit">
			<FaGripHorizontal />
		</Icon>
		<div class="float-right">
			<Button
				style="padding: 0.2rem 0.3rem; height: 1.4rem; border-radius: 0.3rem"
				cssVar="secondary"
				on:click={() => (hidden = !hidden)}
			>
				<Icon size={1.1}>
					{#if !hidden}
						<FaEye />
					{:else}
						<FaEyeSlash />
					{/if}
				</Icon>
			</Button>
		</div>
	</div>
	{#if !hidden}
		<div class="tab" in:fly={{ x: -10, duration: 400 }} out:fly={{ x: -10, duration: 300 }}>
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
	{/if}
</Draggable>

<style lang="scss">
	.tab-header {
		display: flex;
		min-width: 12rem;
		width: 100%;

		margin-bottom: -0.1rem;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
		justify-content: center;
		z-index: 2;
		height: 1.6rem;
		transition: all 0.2s ease-out;
		align-items: center;

		background-color: var(--secondary);
		position: relative;
		border-top-left-radius: 0.4rem;
		border-top-right-radius: 0.4rem;
		border: 0.1rem solid transparent;
		&.hidden {
			width: 0;

			min-width: 8rem;

			border-bottom-left-radius: 0.4rem;
			border-color: var(--accent2);
			border-bottom-right-radius: 0.4rem;
		}
	}
	.float-right {
		position: absolute;
		right: 0rem;
	}
	.tab {
		background-color: var(--primary);
		padding: 0.4rem;
		border-radius: 0.7rem;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
</style>
