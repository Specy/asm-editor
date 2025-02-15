<script lang="ts">
    import { run } from 'svelte/legacy'

    import MemoryTestcaseValue from '$cmp/specific/project/testcases/MemoryTestcaseValue.svelte'
    import type { MemoryValue } from '$lib/Project.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import { createEventDispatcher } from 'svelte'
    import Card from '$cmp/shared/layout/Card.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'

    const dispatcher = createEventDispatcher<{
        create: { value: MemoryValue }
    }>()

    function makeEmptyMemoryValue(kind: MemoryValue['type']): MemoryValue {
        if (kind === 'number-chunk') {
            return {
                type: 'number-chunk',
                address: 0,
                bytes: 1,
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

    let type: MemoryValue['type'] = $state('number')
    let memoryValue = $state(makeEmptyMemoryValue(type))
    $effect(() => {
        if (type !== memoryValue.type) {
            memoryValue = makeEmptyMemoryValue(type)
        }
    })
</script>

<Card border="tertiary" gap="0.5rem">
    <Row
        align="center"
        padding="0.5rem 1rem"
        gap="0.5rem"
        style="border-bottom: 0.1rem solid var(--tertiary); padding-bottom: 0.5rem"
    >
        <div>Type</div>
        <select bind:value={type}>
            <option value="number">Number</option>
            <option value="number-chunk">Number Chunk</option>
            <option value="string-chunk">String Chunk</option>
        </select>
    </Row>
    <Column padding="0.5rem 1rem">
        <MemoryTestcaseValue bind:value={memoryValue} canRemove={false} />
    </Column>
    <Row justify="end" padding="0.5rem">
        <Button
            cssVar="accent2"
            style='padding: 0.5rem 0.6rem'
            onClick={() => {
                dispatcher('create', { value: memoryValue })
                memoryValue = makeEmptyMemoryValue(type)
            }}
        >
            <Icon size={1} style="margin-right: 0.4rem">
                <FaPlus />
            </Icon>
            Add
        </Button>
    </Row>
</Card>

<style>
    select {
        background-color: var(--secondary);
        padding: 0.5rem;
        border-radius: 0.3rem;
        color: var(--secondary-text);
    }
</style>
