<script lang="ts">
    /**
     * How the Testcases fared in the last test run, the button that clears that run's results and
     * the one that runs them all. It sits in the header of whatever holds the list: the
     * Workbench's Testcases panel and the Interactive editor's Testcases window. A Testcase edited
     * since the run counts as not run.
     */
    import Button from '$cmp/shared/button/Button.svelte'
    import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
    import { matchResults } from '$lib/testcases'

    interface Props {
        testcases: Testcase[]
        results: TestcaseResult[]
        /** Runs every Testcase; without it there is no button. */
        onRun?: () => void
        /** Forgets the last run's results, so every Testcase reads as not run again. */
        onClear?: () => void
        /** Whether Run all is unavailable, as Test is: while running, or with assembly errors. */
        disabled?: boolean
        style?: string
    }

    let { testcases, results, onRun, onClear, disabled = false, style = '' }: Props = $props()

    const matched = $derived(matchResults(testcases, results))
    const passed = $derived(matched.filter((result) => result?.passed).length)
    const ran = $derived(matched.some((result) => result !== undefined))
</script>

<div class="summary" {style}>
    {#if testcases.length > 0}
        <span class="count">
            {#if ran}
                {passed}/{testcases.length} passing
            {:else}
                {testcases.length} testcase{testcases.length === 1 ? '' : 's'}
            {/if}
        </span>
    {/if}
    {#if onClear}
        <Button
            cssVar="tertiary"
            style="padding: 0.25rem 0.65rem; font-size: 0.8rem; border-radius: 0.3rem"
            disabled={results.length === 0}
            title="Clear the results of the last test run"
            onClick={onClear}
        >
            Clear
        </Button>
    {/if}
    {#if onRun}
        <Button
            cssVar="accent2"
            style="padding: 0.25rem 0.65rem; font-size: 0.8rem; border-radius: 0.3rem"
            disabled={disabled || testcases.length === 0}
            title="Run every Testcase"
            onClick={onRun}
        >
            Run all
        </Button>
    {/if}
</div>

<style>
    .summary {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex: none;
        font-size: 0.8rem;
        font-weight: 400;
        letter-spacing: normal;
        text-transform: none;
    }

    .count {
        margin-right: 0.2rem;
        color: var(--hint);
        white-space: nowrap;
    }
</style>
