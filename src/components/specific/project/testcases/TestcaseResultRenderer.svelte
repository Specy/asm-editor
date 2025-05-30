<script lang="ts">
    import type { TestcaseResult } from '$lib/Project.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import { RegisterSize, toHexString } from '$lib/languages/commonLanguageFeatures.svelte'
    import ExpandableContainer from '$cmp/shared/layout/ExpandableContainer.svelte'
    import Testcase from '$cmp/specific/project/testcases/Testcase.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'

    interface Props {
        testcaseResult: TestcaseResult
        registerNames: string[]
        hiddenRegistersNames?: string[]
        systemSize: RegisterSize
    }

    let {
        testcaseResult = $bindable(),
        registerNames,
        hiddenRegistersNames,
        systemSize
    }: Props = $props()
</script>

<Card border={testcaseResult.passed ? 'background' : 'red'}>
    <Column padding="0.5rem 0.8rem">
        {#each testcaseResult.errors as err}
            {#if err.type === 'wrong-register'}
                <div class="testcase-error">
                    Wrong register "{err.register}" value, expected
                    <b>${toHexString(err.expected, systemSize)}</b>
                    but got
                    <b>${toHexString(err.got, systemSize)}</b>
                </div>
            {:else if err.type === 'wrong-output'}
                <div class="testcase-error">
                    Wrong output value, expected "{err.expected}" but got "{err.got}"
                </div>
            {:else if err.type === 'wrong-memory-string'}
                <div class="testcase-error">
                    Wrong string at address <b>${toHexString(err.address, systemSize)}</b>, expected
                    "<b>{err.expected}</b>" but got
                    <b>{err.got}</b>
                </div>
            {:else if err.type === 'wrong-memory-number'}
                <div class="testcase-error">
                    Wrong number at address <b>${toHexString(err.address, systemSize)}</b>, expected
                    <b>${toHexString(err.expected, err.bytes)}</b>
                    ({err.bytes} bytes) but got
                    <b>${toHexString(err.got, err.bytes)}</b>
                </div>
            {:else if err.type === 'wrong-memory-chunk'}
                <div class="testcase-error">
                    Wrong memory chunk at address <b>${toHexString(err.address, systemSize)}</b>,
                    expected
                    <b
                        >[{err.expected
                            .map((v) => `0x${toHexString(v, RegisterSize.Byte)}`)
                            .join(', ')}]
                    </b>
                    but got
                    <b
                        >[{err.got.map((v) => `0x${toHexString(v, RegisterSize.Byte)}`).join(', ')}]
                    </b>
                </div>
            {/if}
        {/each}
    </Column>

    <ExpandableContainer
        style="border-top: solid 0.1rem var(--red); border-top-right-radius: 0; border-top-left-radius: 0"
    >
        {#snippet title()}
            <Header type="h3" noMargin>Show testcase</Header>
        {/snippet}
        <Testcase
            {systemSize}
            bind:testcase={testcaseResult.testcase}
            {registerNames}
            {hiddenRegistersNames}
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
