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
    {#if memoryValues.length > 0}
        <div class="values">
            {#each memoryValues as memoryValue, i}
                <div class="value">
                    <MemoryTestcaseValue
                        bind:value={memoryValues[i]}
                        canRemove={editable}
                        editable={false}
                        on:remove={() =>
                            (memoryValues = memoryValues.filter((mv) => mv !== memoryValue))}
                    />
                </div>
            {/each}
        </div>
    {/if}

    {#if editable}
        <NewMemoryTestcase on:create={(e) => (memoryValues = [...memoryValues, e.detail.value])} />
    {/if}
</Column>

<style>
    .values{
        border-radius: 0.5rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    .value {
        padding: 0.5rem;
        padding-left: 1rem;
        background-color: var(--secondary);
    }

</style>
