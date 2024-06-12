<script lang="ts">
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import TestcaseRenderer from './Testcase.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import type { Testcase, TestcaseResult } from '$lib/Project'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import { toast } from '$stores/toastStore'
    import TestcaseResultRenderer from '$cmp/specific/project/testcases/TestcaseResultRenderer.svelte'
    import ExpandableContainer from '$cmp/shared/layout/ExpandableContainer.svelte'

    export let visible: boolean

    export let testcases: Testcase[]
    export let testcasesResult: TestcaseResult[]

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

    let newTestcase = makeNewTestcase()
    let testcaseKey = 0

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
				{@const passedTestcases = testcasesResult.filter(t => t.passed)}
				{@const failedTestcases = testcasesResult.filter(t => !t.passed)}
				{@const totalTestcases = testcasesResult.length}
				<Header noMargin type="h2">
					{failedTestcases.length === 0 ? '✅' : '❌'}
					{passedTestcases.length} / {totalTestcases} testcases passed
				</Header>
				{#each failedTestcases as testcase}
					<TestcaseResultRenderer testcaseResult={testcase} />
				{/each}
			</Column>
		{/if}
		<Column padding="1rem" gap="1rem">
			<ExpandableContainer>
				<Header noMargin slot="title">
					Testcases
				</Header>
				<Column gap="1rem">
					{#if testcases.length === 0}
						<p>
							No testcases yet. Add new ones to test the correctness of your code.
						</p>
					{:else}
						{#each testcases as testcase}
							<div class="testcase-wrapper">

								<TestcaseRenderer
									bind:testcase
									editable={false}
								>
									<Row justify="end">
										<Button
											on:click={() => testcases = testcases.filter(t => t !== testcase) }
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
								</TestcaseRenderer>
							</div>

						{/each}

					{/if}
				</Column>
			</ExpandableContainer>
			<Header noMargin>
				New Testcase
			</Header>
			{#key testcaseKey}
				<TestcaseRenderer
					style="border: solid 0.1rem var(--accent)"
					editable
					bind:testcase={newTestcase}
				>
					<Row justify="end">
						<Button on:click={addTestcase} hasIcon style="padding: 0.5rem 0.6rem; gap: 0.4rem">
							<Icon>
								<FaPlus />
							</Icon>
							Add Testcase
						</Button>
					</Row>
				</TestcaseRenderer>
			{/key}
		</Column>
	</Column>
</FloatingContainer>


<style>
	.testcase-wrapper:not(:last-child){
			border-bottom: solid 0.2rem var(--accent);
	}
</style>