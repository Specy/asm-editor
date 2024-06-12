<script lang="ts">
    import type { MemoryValue } from '$lib/Project'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MemoryTestcaseValue from '$cmp/specific/project/testcases/MemoryTestcaseValue.svelte'
    import NewMemoryTestcase from '$cmp/specific/project/testcases/NewMemoryTestcase.svelte'

    export let memoryValues: MemoryValue[]
    export let editable: boolean = true
</script>


<Column gap="0.5rem">
	<Column>
		{#each memoryValues as memoryValue}
			<div class="value">
				<MemoryTestcaseValue
					bind:value={memoryValue}
					canRemove={editable}
					editable={editable}
					on:remove={() => memoryValues = memoryValues.filter(mv => mv !== memoryValue)}
				/>
			</div>
		{/each}
	</Column>

	{#if editable}
		<NewMemoryTestcase
			on:create={(e) => memoryValues = [...memoryValues, e.detail.value]}
		/>
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