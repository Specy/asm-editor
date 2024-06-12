<script lang="ts">

    import MemoryTestcaseValue from '$cmp/specific/project/testcases/MemoryTestcaseValue.svelte'
    import type { MemoryValue } from '$lib/Project'
    import Row from '$cmp/shared/layout/Row.svelte'
    import { createEventDispatcher } from 'svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'

    const dispatcher = createEventDispatcher<{
        create: { value: MemoryValue }
    }>()

    function makeEmptyMemoryValue(kind: MemoryValue['type']): MemoryValue {
        if (kind === 'number-chunk') {
            return {
                type: 'number-chunk',
                address: 0,
                expected: []
            }
        } else if (kind === 'string-chunk') {
            return {
                type: 'string-chunk',
                address: 0,
                expected: ''
            }
        } else {
            return {
                type: 'number',
                address: 0,
                expected: 0,
                bytes: 1
            }
        }
    }

    let memoryValue = makeEmptyMemoryValue('number')
    let type: MemoryValue['type'] = 'number'
    $: {
        if (type !== memoryValue.type) {
            memoryValue = makeEmptyMemoryValue(type)
        }
    }

</script>

<Card border="secondary" padding="0.5rem" gap="0.5rem">
	<Row align="center" gap="0.5rem">
		<div>Type</div>
		<select bind:value={type}>
			<option value="number">Number</option>
			<option value="number-chunk">Number Chunk</option>
			<option value="string-chunk">String Chunk</option>
		</select>
	</Row>
	<MemoryTestcaseValue
		bind:value={memoryValue}
		canRemove={false}
	/>
	<Button
		cssVar="accent2"
		on:click={() => {
			dispatcher('create', { value: memoryValue })
			memoryValue = makeEmptyMemoryValue(type)
		}}
	>
		<Icon>
			<FaPlus /> Add
		</Icon>
	</Button>
</Card>

<style>
    select {
        background-color: var(--secondary);
        padding: 0.3rem 0.4rem;
        border-radius: 0.3rem;
        color: var(--secondary-text);
    }
</style>
