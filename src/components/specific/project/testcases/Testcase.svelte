<script lang="ts">
    import type { Testcase } from '$lib/Project'
    import Header from '$cmp/shared/layout/Header.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import RegistersTestcaseEditor from '$cmp/specific/project/testcases/RegistersTestcaseEditor.svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import MemoryTestcaseEditor from '$cmp/specific/project/testcases/MemoryTestcaseEditor.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'

    export let testcase: Testcase
    let newInput = ''
    export let style = ''
    export let editable = false

</script>
<Card padding="0.8rem" gap="1rem" {style} radius="0.8rem">
	{#if editable}
		<Header type="h3">Starting registers values</Header>
		<RegistersTestcaseEditor
			bind:registers={testcase.startingRegisters}
			editable
		/>

		<Header type="h3">Expected registers values</Header>
		<RegistersTestcaseEditor
			bind:registers={testcase.expectedRegisters}
			editable
		/>
		<Header type="h3">Starting memory values</Header>
		<MemoryTestcaseEditor
			bind:memoryValues={testcase.startingMemory}
			editable
		/>
		<Header type="h3">Expected memory values</Header>
		<MemoryTestcaseEditor
			bind:memoryValues={testcase.expectedMemory}
			editable
		/>

		<Header type="h3">Inputs</Header>
		<Row gap="0.3rem" style="flex-wrap: wrap">
			{#each testcase.input as line}
			<textarea
				bind:value={line}
				class="input-textarea"
				style="border-radius: 0.3rem"
			/>
			{/each}
			<div class="add-input">
			<textarea
				bind:value={newInput}
				class="input-textarea"
			/>
				<button
					on:click={() => {
						testcase.input = [...testcase.input, newInput]
						newInput = ''
				}}
					class="add-input-btn"
				>
					<Icon>
						<FaPlus />
					</Icon>
				</button>
			</div>
		</Row>
		<Header type="h3">Expected Output</Header>
		<textarea
			bind:value={testcase.expectedOutput}
			class="input-textarea"
			style="width: 100%; border-radius: 0.3rem; padding: 0.5rem"
		/>
		<slot />

	{:else}
		<Row gap="1rem" justify="around">

			{#if Object.keys(testcase.startingRegisters).length !== 0}
				<Column gap="0.5rem">
					<Header type="h3">Starting registers</Header>
					<RegistersTestcaseEditor
						bind:registers={testcase.startingRegisters}
						editable={false}
					/>
				</Column>

			{/if}

			{#if Object.keys(testcase.expectedRegisters).length !== 0}
				<Column gap="0.5rem">
					<Header type="h3">Expected registers</Header>
					<RegistersTestcaseEditor
						bind:registers={testcase.expectedRegisters}
						editable={false}
					/>
				</Column>
			{/if}
		</Row>


		{#if testcase.startingMemory.length !== 0}
			<Header type="h3">Starting memory values</Header>
			<MemoryTestcaseEditor
				bind:memoryValues={testcase.startingMemory}
				editable={false}
			/>
		{/if}


		{#if testcase.expectedMemory.length !== 0}
			<Header type="h3">Expected memory values</Header>
			<MemoryTestcaseEditor
				bind:memoryValues={testcase.expectedMemory}
				editable={false}
			/>
		{/if}
		{#if testcase.expectedOutput.length > 0}
			<Header type="h3">Inputs</Header>
			<Row gap="0.3rem" style="flex-wrap: wrap">
				{#each testcase.input as line}
					<div class="result-text">
						{line}
					</div>
				{/each}
			</Row>
		{/if}
		{#if testcase.expectedOutput.length > 0}
			<Header type="h3">Expected Output</Header>
			<div
				class="result-text"
			>
				{testcase.expectedOutput}
			</div>
		{/if}
		<slot />
	{/if}
</Card>

<style>
		.result-text{
				        background-color: var(--secondary);
        color: var(--secondary-text);
				padding: 0.5rem;
				border-radius: 0.3rem;
				word-break: break-all;
		}
    .input-textarea {
        width: 3rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    .add-input {
        display: flex;
        border-radius: 0.4rem;
        border: solid 0.1rem var(--accent2);
        overflow: hidden;
    }

    .add-input-btn {
        background-color: var(--accent2);
        color: var(--accent2-text);
        padding: 0.2rem 0.5rem;
    }
</style>