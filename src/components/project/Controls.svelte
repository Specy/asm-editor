<script lang="ts">
	import { createEventDispatcher } from 'svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import FaPlay from 'svelte-icons/fa/FaPlay.svelte'
	import FaWrench from 'svelte-icons/fa/FaWrench.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaStepForward from 'svelte-icons/fa/FaStepForward.svelte'
	import FaRegClock from 'svelte-icons/fa/FaRegClock.svelte'
	import FaStop from 'svelte-icons/fa/FaStop.svelte'
	import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
	const dispatch = createEventDispatcher()
	export let executionDisabled: boolean
	export let hasCompiled: boolean
	export let buildDisabled: boolean
	export let canUndo: boolean
	export let running: boolean
</script>

<div class="project-controls">
	{#if !hasCompiled}
		<Button style="max-width: 5.5rem; flex:1; padding: 0.5rem 0" on:click={() => dispatch('build')} disabled={buildDisabled}>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaWrench />
			</Icon>
			Build
		</Button>
	{:else}
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0"
			cssVar="accent2"
			on:click={() => dispatch('stop')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaStop />
			</Icon>
			Stop
		</Button>
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0"
			on:click={() => dispatch('run')}
			disabled={executionDisabled || running}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				{#if running}
					<FaRegClock />
				{:else}
					<FaPlay />
				{/if}
			</Icon>
			Run
		</Button>
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0"
			disabled={executionDisabled || !canUndo}
			on:click={() => dispatch('undo')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaUndo />
			</Icon>
			Undo
		</Button>
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0"
			disabled={executionDisabled}
			on:click={() => dispatch('step')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaStepForward />
			</Icon>
			Step
		</Button>
	{/if}
</div>

<style lang="scss">
	.project-controls {
		display: flex;
		gap: 0.5rem;
	}
</style>
