<script lang="ts">
    import type { MemoryValue } from '$lib/Project.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { createEventDispatcher } from 'svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import { toHexString } from '$lib/languages/M68kUtils'

    const dispatcher = createEventDispatcher<{
        remove: void
    }>()
    interface Props {
        value: MemoryValue
        editable?: boolean
        canRemove?: boolean
    }

    let { value = $bindable(), editable = true, canRemove = true }: Props = $props()
</script>

<div class="memory-testcase">
    {#if canRemove}
        <Button
            style="padding: 0.4rem"
            hasIcon
            on:click={() => dispatcher('remove')}
            cssVar="secondary"
        >
            <Icon>
                <FaTimes />
            </Icon>
        </Button>
    {/if}
    {#if editable}
        {#if value.type === 'number'}
            <Row align="center" gap="0.5rem" style="flex-wrap: wrap">
                <div>Address</div>
                <input type="number" class="input" bind:value={value.address} />
                <div>Bytes</div>
                <select bind:value={value.bytes} class="select">
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                </select>
                <div>Expected</div>
                <input type="number" class="input" bind:value={value.expected} />
            </Row>
        {:else if value.type === 'string-chunk'}
            <Column gap="0.5rem" flex1>
                <div>Address</div>
                <input type="number" class="input" bind:value={value.address} />
                <div>Expected</div>
                <textarea
                    class="input"
                    style="width: 100%;"
                    onchange={(e) => {
                        value.expected = e.target.value
                    }}>{value.expected}</textarea
                >
            </Column>
        {:else if value.type === 'number-chunk'}
            <Column gap="0.5rem" flex1>
                <div>Address</div>
                <input type="number" class="input" bind:value={value.address} />
                <div>Expected (comma separated)</div>
                <textarea
                    class="input"
                    style="width: 100%;"
                    onchange={(e) => {
                        value.expected = e.target.value.split(',').map((v) => Number(v.trim()))
                    }}>{value.expected.join(', ')}</textarea
                >
            </Column>
        {/if}
    {:else}
        {#if value.type === 'number'}
            <div style="word-break: break-all;">
                At address <b>${toHexString(value.address)}</b>, expect
                <b>${toHexString(value.expected, value.bytes * 2)}</b>
                (of <b>{value.bytes}</b> bytes)
            </div>
        {/if}
        {#if value.type === 'string-chunk'}
            <div style="word-break: break-all;">
                At address <b>${toHexString(value.address)}</b>, expect "<b>{value.expected}</b>"
            </div>
        {/if}
        {#if value.type === 'number-chunk'}
            <div style="word-break: break-all;">
                At address <b>${toHexString(value.address)}</b>, expect
                <b>[{value.expected.map((v) => `0x${toHexString(v, 2)}`).join(', ')}]</b>
            </div>
        {/if}
    {/if}
</div>

<style>
    .memory-testcase {
        position: relative;
        display: flex;
        gap: 0.4rem;
    }

    .input,
    .select {
        width: 4.5rem;
        padding: 0.3rem 0.5rem;
        border-radius: 0.3rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    /* Firefox */
    input[type='number'] {
        -moz-appearance: textfield;
    }
</style>
