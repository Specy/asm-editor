<script lang="ts">
    import type { MemoryValue } from '$lib/Project.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MemoryTestcaseValue from '$cmp/specific/project/testcases/MemoryTestcaseValue.svelte'
    import NewMemoryTestcase from '$cmp/specific/project/testcases/NewMemoryTestcase.svelte'

    interface Props {
        memoryValues: MemoryValue[]
        editable?: boolean
    }

    let { memoryValues = $bindable(), editable = true }: Props = $props()
</script>

<Column gap="0.5rem">
    <Column>
        {#each memoryValues as memoryValue, i}
            <div class="value">
                <MemoryTestcaseValue
                    bind:value={memoryValues[i]}
                    canRemove={editable}
                    {editable}
                    on:remove={() =>
                        (memoryValues = memoryValues.filter((mv) => mv !== memoryValue))}
                />
            </div>
        {/each}
    </Column>

    {#if editable}
        <NewMemoryTestcase on:create={(e) => (memoryValues = [...memoryValues, e.detail.value])} />
    {/if}
</Column>

<style>
    .value {
        padding: 0.5rem;
    }

    .value:not(:last-child) {
        border-bottom: 0.1rem solid var(--secondary);
    }
</style>
