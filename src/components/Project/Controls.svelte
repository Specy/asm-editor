<script lang="ts">
	import { createEventDispatcher } from 'svelte'
	import Button from '$cmp/buttons/Button.svelte'
	import FaPlay from 'svelte-icons/fa/FaPlay.svelte'
	import FaWrench from 'svelte-icons/fa/FaWrench.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
	import FaStepForward from 'svelte-icons/fa/FaStepForward.svelte'
	import FaStop from 'svelte-icons/fa/FaStop.svelte'
	const dispatch = createEventDispatcher()
	export let executionDisabled: boolean
	export let hasCompiled: boolean
	export let buildDisabled: boolean
</script>

<div class="project-controls">
	{#if !hasCompiled}
		<Button style="width: 5.5rem; padding: 0.5rem 0" on:click={() => dispatch('build')} disabled={buildDisabled}>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaWrench />
			</Icon>
			Build
		</Button>
	{:else}
		<Button
			style="width: 5.5rem; padding: 0.5rem 0"
			cssVar="accent2"
			on:click={() => dispatch('stop')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaStop />
			</Icon>
			Stop
		</Button>
		<Button
			style="width: 5.5rem; padding: 0.5rem 0"
			on:click={() => dispatch('run')}
			disabled={executionDisabled}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaPlay />
			</Icon>
			Run
		</Button>
		<Button
			style="width: 5.5rem; padding: 0.5rem 0"
			disabled={executionDisabled}
			on:click={() => dispatch('step')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaStepForward />
			</Icon>
			Step
		</Button>
		<!--
		<Button
            style="width: 5.5rem; padding: 0.5rem 0"
			disabled={line <= 1}
			on:click={() => dispatch('undo')}
		>
            <Icon size={1} style='margin-right: 0.4rem;'>
                <FaUndo />
            </Icon>
			Undo
		</Button>
		-->
	{/if}
</div>

<style lang="scss">
	.project-controls {
		margin-top: 0.5rem;
		display: flex;
		gap: 0.5rem;
		padding-left: 0.2rem;
	}
</style>
