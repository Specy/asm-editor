<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaPlay from 'svelte-icons/fa/FaPlay.svelte'
    import FaWrench from 'svelte-icons/fa/FaWrench.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaStepForward from 'svelte-icons/fa/FaStepForward.svelte'
    import FaRegClock from 'svelte-icons/fa/FaRegClock.svelte'
    import FaStop from 'svelte-icons/fa/FaStop.svelte'
    import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
    import FaFlask from 'svelte-icons/fa/FaFlask.svelte'
    import FaListOl from 'svelte-icons/fa/FaListOl.svelte'
    import FaExclamationTriangle from 'svelte-icons/fa/FaExclamationTriangle.svelte'

    const dispatch = createEventDispatcher()
    export let executionDisabled: boolean

    export let hasTests: boolean

    export let canEditTests: boolean
    export let hasErrorsInTests = false
		export let hasNoErrorsInTests = false
    export let hasCompiled: boolean
    export let buildDisabled: boolean
    export let canUndo: boolean
    export let running: boolean
</script>

<div class="project-controls">
	{#if !hasCompiled}
		<Button style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem" on:click={() => dispatch('build')}
						disabled={buildDisabled}>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaWrench />
			</Icon>
			Build
		</Button>
		{#if hasTests}
			<Button style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem" on:click={() => dispatch('test')}
							disabled={buildDisabled} cssVar="accent2">
				<Icon size={1} style="margin-right: 0.4rem;">
					<FaFlask />
				</Icon>
				Test
			</Button>
		{/if}
	{:else}
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
			cssVar="accent2"
			on:click={() => dispatch('stop')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaStop />
			</Icon>
			Stop
		</Button>
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
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
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
			disabled={executionDisabled || !canUndo}
			on:click={() => dispatch('undo')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaUndo />
			</Icon>
			Undo
		</Button>
		<Button
			style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
			disabled={executionDisabled}
			on:click={() => dispatch('step')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				<FaStepForward />
			</Icon>
			Step
		</Button>
	{/if}
	{#if canEditTests}
		<Button
			style="max-width: 7rem; padding: 0.5rem 0.8rem; margin-left: auto;"
			cssVar={hasErrorsInTests ? 'red' :
			hasNoErrorsInTests ? "green" : 'accent2'}
			on:click={() => dispatch('edit-tests')}
		>
			<Icon size={1} style="margin-right: 0.4rem;">
				{#if hasErrorsInTests}
					<FaExclamationTriangle />
				{:else}
					<FaListOl />
				{/if}
			</Icon>
			Testcases
		</Button>
	{/if}
</div>

<style lang="scss">
  .project-controls {
    display: flex;
		flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
