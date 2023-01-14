<script lang="ts">
	import Draggable from '$cmp/misc/Draggable.svelte'
	import CallStack from './CallStack.svelte'
	import type { Label } from 's68k'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaGripHorizontal from 'svelte-icons/fa/FaGripHorizontal.svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import FaEye from 'svelte-icons/fa/FaEye.svelte'
	import FaEyeSlash from 'svelte-icons/fa/FaEyeSlash.svelte'
	export let stack: Label[]
	let hidden = true
</script>

<Draggable hiddenOnMobile >
	<button slot="header" class="tab-header row" class:hidden on:dblclick={() => (hidden = !hidden)}>
		<Icon style="cursor:inherit; padding: 0.2rem 0.4rem; height: 1.4rem; width: 1.6rem; min-width: 1.6rem">
			<FaGripHorizontal />
		</Icon>
		<div class="ellipsis">Call stack</div>
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
	</button>
	{#if !hidden}
		<CallStack {stack} on:gotoLabel/>
	{/if}
</Draggable>

<style lang="scss">
	.tab-header {
		display: flex;
		min-width: 12rem;
		width: 100%;
		color: var(--secondary-text);
		margin-bottom: -0.1rem;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
		justify-content: space-between;
        gap: 0.3rem;
		z-index: 2;
		height: 1.6rem;
		transition: all 0.2s ease-out;
		align-items: center;
		cursor: move;
		background-color: var(--secondary);
		color: var(--secondary-text);
		font-family: Orienta;
		position: relative;
		border-top-left-radius: 0.4rem;
		border-top-right-radius: 0.4rem;
		border: 0.1rem solid transparent;
		&.hidden {
			width: 0;
			min-width: 9rem;
			border-bottom-left-radius: 0.4rem;
			border-color: var(--accent2);
			border-bottom-right-radius: 0.4rem;
		}
	}
</style>
