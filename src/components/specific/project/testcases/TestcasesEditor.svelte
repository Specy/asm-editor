<script lang="ts">
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import TestcasesList from './TestcasesList.svelte'
    import TestcasesSummary from './TestcasesSummary.svelte'
    import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
    import type { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'

    /** The Interactive editor's Testcases: `TestcasesList` in a floating window. */
    interface Props {
        visible: boolean
        testcases: Testcase[]
        testcasesResult: TestcaseResult[]
        registerNames: string[]
        startingRegisterNames: string[]
        hiddenRegistersNames?: string[]
        registerSizes?: Record<string, number>
        editable?: boolean
        systemSize: RegisterSize
        /** The Target, which decides how its numbers are written. */
        language: AvailableLanguages
        /** Runs every Testcase, from the window's header. */
        onRun?: () => void
        /** Forgets the last run's results, from the window's header. */
        onClear?: () => void
        runDisabled?: boolean
    }

    let {
        visible = $bindable(),
        testcases = $bindable(),
        onRun,
        onClear,
        runDisabled = false,
        ...rest
    }: Props = $props()
</script>

<FloatingContainer bind:visible title="Testcases" style="width: 45rem;">
    {#snippet header()}
        <TestcasesSummary
            {testcases}
            results={rest.testcasesResult}
            {onRun}
            {onClear}
            disabled={runDisabled}
            style="margin-left: auto"
        />
    {/snippet}
    <TestcasesList bind:testcases {...rest} style="height: calc(var(--screen-height) * 0.8);" />
</FloatingContainer>
