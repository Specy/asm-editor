<script lang="ts">
    import type { TestcaseResult } from '$lib/Project'
    import Card from '$cmp/shared/layout/Card.svelte'
    import { toHexString } from '$lib/languages/M68kUtils'
    import ExpandableContainer from '$cmp/shared/layout/ExpandableContainer.svelte'
    import Testcase from '$cmp/specific/project/testcases/Testcase.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'

    export let testcaseResult: TestcaseResult
</script>


<Card
	border={testcaseResult.passed ? 'background' : 'red'}
>
	<Column
		padding="0.5rem"
	>

		{#each testcaseResult.errors as err}
			{#if err.type === 'wrong-register'}
				<div class="testcase-error">
					Wrong register "{err.register}" value, expected <b>${toHexString(err.expected, 4)}</b> but got
					<b>${toHexString(err.got, 4)}</b>
				</div>
			{:else if err.type === 'wrong-output'}
				<div class="testcase-error">
					Wrong output value, expected "{err.expected}" but got "{err.got}"
				</div>
			{:else if err.type === 'wrong-memory-string'}
				<div class="testcase-error">
					Wrong string at address <b>${toHexString(err.address, 4)}</b>, expected "<b>{err.expected}</b>" but got
					<b>{err.got}</b>
				</div>
			{:else if err.type === 'wrong-memory-number'}
				<div class="testcase-error">
					Wrong number at address <b>${toHexString(err.address, 4)}</b>, expected <b>${toHexString(err.expected, err.bytes * 2)}</b>
					({err.bytes} bytes)
					but got
					<b>${toHexString(err.got)}</b>
				</div>
			{:else if err.type === 'wrong-memory-chunk'}
				<div class="testcase-error">
					Wrong memory chunk at address <b>${toHexString(err.address, 4)}</b>, expected <b>[{
					err.expected.map((v) => `0x${toHexString(v, 2)}`).join(", ")
				}]
				</b> but got <b>[{
					err.got.map((v) => `0x${toHexString(v, 2)}`).join(", ")
				}]
				</b>
				</div>
			{/if}
		{/each}
	</Column>

	<ExpandableContainer
		style="border-top: solid 0.1rem var(--red); border-top-right-radius: 0; border-top-left-radius: 0"
	>
		<Header type="h3" slot="title" noMargin>
			Show testcase
		</Header>
		<Testcase
			testcase={testcaseResult.testcase}
		/>
	</ExpandableContainer>
</Card>

<style>
    .testcase-error {
        word-break: break-all;
        padding: 0.4rem 0;
    }

    .testcase-error:not(:last-child) {
        border-bottom: 0.1rem solid var(--secondary);
    }
</style>