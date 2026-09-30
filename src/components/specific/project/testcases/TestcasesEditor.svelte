<script lang="ts">
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import TestcasesList from './TestcasesList.svelte'
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
        editable?: boolean
        systemSize: RegisterSize
        /** The Target, which names the widths the register panels below group by. */
        language: AvailableLanguages
    }

    let { visible = $bindable(), testcases = $bindable(), ...rest }: Props = $props()
</script>

<FloatingContainer bind:visible title="Testcases" style="width: 45rem;">
    <TestcasesList bind:testcases {...rest} style="height: calc(var(--screen-height) * 0.8);" />
</FloatingContainer>
