<script lang="ts">
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import TestcaseRenderer from './Testcase.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import type { Testcase, TestcaseResult } from '$lib/Project.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import { toast } from '$stores/toastStore'
    import TestcaseResultRenderer from '$cmp/specific/project/testcases/TestcaseResultRenderer.svelte'
    import ExpandableContainer from '$cmp/shared/layout/ExpandableContainer.svelte'
    import type { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        visible: boolean
        testcases: Testcase[]
        testcasesResult: TestcaseResult[]
        registerNames: string[]
        hiddenRegistersNames?: string[]
        editable?: boolean
        systemSize: RegisterSize,
     }

    let {
        visible = $bindable(),
        testcases = $bindable(),
        testcasesResult,
        registerNames,
        hiddenRegistersNames,
        editable = true,
        systemSize,

    }: Props = $props()

    function makeNewTestcase() {
        return {
            expectedMemory: [],
            expectedOutput: '',
            input: [],
            expectedRegisters: {},
            startingMemory: [],
            startingRegisters: {}
        } satisfies Testcase
    }

    let newTestcase = $state(makeNewTestcase())
    let testcaseKey = $state(0)

    function addTestcase() {
        testcases = [...testcases, newTestcase]
        newTestcase = makeNewTestcase()
        toast.logPill('Testcase added', 3000)
        testcaseKey++
    }
</script>

<FloatingContainer bind:visible title="Testcases" style="width: 45rem;">
    <Column style="height: 80vh; overflow-y: auto;">
        {#if testcasesResult.length > 0}
            <Column
                padding="1rem"
                gap="1rem"
                style="border: none; border-bottom: solid 0.2rem var(--secondary)"
            >
                {@const passedTestcases = testcasesResult.filter((t) => t.passed)}
                {@const failedTestcases = testcasesResult.filter((t) => !t.passed)}
                {@const totalTestcases = testcasesResult.length}
                <Header noMargin type="h2">
                    {failedTestcases.length === 0 ? '✅' : '❌'}
                    {passedTestcases.length} / {totalTestcases} testcases passed
                </Header>
                {#each failedTestcases as _, i}
                    <TestcaseResultRenderer
                        {systemSize}
                        bind:testcaseResult={failedTestcases[i]}
                        {registerNames}
                        {hiddenRegistersNames}
                    />
                {/each}
            </Column>
        {/if}
        <Column padding="1rem" gap="1rem">
            <ExpandableContainer expanded={!editable}>
                {#snippet title()}
                    <Header noMargin>Testcases</Header>
                {/snippet}
                <Column gap="1rem">
                    {#if testcases.length === 0}
                        <p style="padding: 1rem">
                            No testcases yet. Add new ones to test the correctness of your code.
                        </p>
                    {:else}
                        {#each testcases as testcase, i}
                            <div class="testcase-wrapper">
                                <TestcaseRenderer
                                    {systemSize}
                                    style="padding-top: 0.3rem"
                                    bind:testcase={testcases[i]}
                                    editable={false}
                                    {registerNames}
                                    {hiddenRegistersNames}
                                >
                                    {#if editable}
                                        <Row justify="end">
                                            <Button
                                                onClick={() =>
                                                    (testcases = testcases.filter(
                                                        (t) => t !== testcase
                                                    ))}
                                                hasIcon
                                                cssVar="red"
                                                style="padding: 0.5rem 0.6rem; gap: 0.4rem"
                                            >
                                                <Icon>
                                                    <FaTimes />
                                                </Icon>
                                                Remove Testcase
                                            </Button>
                                        </Row>
                                    {/if}
                                </TestcaseRenderer>
                            </div>
                        {/each}
                    {/if}
                </Column>
            </ExpandableContainer>
            {#if editable}
                <Header noMargin>New Testcase</Header>
                {#key testcaseKey}
                    <TestcaseRenderer
                        {systemSize}
                        {registerNames}
                        {hiddenRegistersNames}
                        style="border: solid 0.1rem var(--accent)"
                        editable
                        bind:testcase={newTestcase}
                    >
                        <Row justify="end">
                            <Button
                                onClick={addTestcase}
                                hasIcon
                                style="padding: 0.5rem 0.6rem; gap: 0.4rem"
                            >
                                <Icon>
                                    <FaPlus />
                                </Icon>
                                Add Testcase
                            </Button>
                        </Row>
                    </TestcaseRenderer>
                {/key}
            {/if}
        </Column>
    </Column>
</FloatingContainer>

<style>
    .testcase-wrapper:not(:last-child) {
        border-bottom: solid 0.2rem var(--secondary);
    }
</style>
