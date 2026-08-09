<script lang="ts">
    import { createEventDispatcher, type Snippet } from 'svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaPlay from '~icons/fa-solid/play'
    import FaWrench from '~icons/fa-solid/wrench'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaStepForward from '~icons/fa-solid/step-forward'
    import FaRegClock from '~icons/fa-regular/clock'
    import FaStop from '~icons/fa-solid/stop'
    import FaUndo from '~icons/fa-solid/undo'
    import FaFlask from '~icons/fa-solid/flask'
    import FaListOl from '~icons/fa-solid/list-ol'
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'

    const dispatch = createEventDispatcher()

    interface Props {
        executionDisabled: boolean
        hasTests: boolean
        canEditTests: boolean
        hasErrorsInTests?: boolean
        hasNoErrorsInTests?: boolean
        hasCompiled: boolean
        buildDisabled: boolean
        building?: boolean
        canUndo: boolean
        running: boolean
        children?: Snippet
    }

    let {
        executionDisabled,
        hasTests,
        canEditTests,
        hasErrorsInTests = false,
        hasNoErrorsInTests = false,
        hasCompiled,
        buildDisabled,
        building = false,
        canUndo,
        running,
        children
    }: Props = $props()
</script>

<div class="project-controls">
    {#if !hasCompiled}
        <Button
            style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
            onClick={() => dispatch('build')}
            disabled={buildDisabled || building || running}
        >
            <Icon size={1} style="margin-right: 0.4rem;">
                {#if building}
                    <FaRegClock />
                {:else}
                    <FaWrench />
                {/if}
            </Icon>
            Build
        </Button>
        {#if hasTests}
            <Button
                style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
                onClick={() => dispatch('test')}
                disabled={buildDisabled || building || running}
                cssVar="accent2"
            >
                <Icon size={1} style="margin-right: 0.4rem;">
                    <FaFlask />
                </Icon>
                Test
            </Button>
        {/if}
        {@render children?.()}
    {:else}
        <Button
            style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
            cssVar="accent2"
            onClick={() => dispatch('stop')}
        >
            <Icon size={1} style="margin-right: 0.4rem;">
                <FaStop />
            </Icon>
            Stop
        </Button>
        <Button
            style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
            onClick={() => dispatch('run')}
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
            onClick={() => dispatch('undo')}
        >
            <Icon size={1} style="margin-right: 0.4rem;">
                <FaUndo />
            </Icon>
            Undo
        </Button>
        <Button
            style="max-width: 5.5rem; flex:1; padding: 0.5rem 0.3rem"
            disabled={executionDisabled}
            onClick={() => dispatch('step')}
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
            cssVar={hasErrorsInTests ? 'red' : hasNoErrorsInTests ? 'green' : 'accent2'}
            onClick={() => dispatch('edit-tests')}
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
