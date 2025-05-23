<script lang="ts">
    import type { MemoryValue } from '$lib/Project.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { createEventDispatcher } from 'svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import { RegisterSize, toHexString } from '$lib/languages/commonLanguageFeatures.svelte'

    const dispatcher = createEventDispatcher<{
        remove: void
    }>()

    interface Props {
        value: MemoryValue
        editable?: boolean
        canRemove?: boolean
        systemSize: RegisterSize
    }

    function parseNumber(value: string): bigint {
        if (!value) return 0n
        return BigInt(value)
    }

    let { value = $bindable(), editable = true, canRemove = true, systemSize }: Props = $props()
</script>

<div class="memory-testcase">
    {#if editable}
        {#if value.type === 'number'}
            <Row align="center" flex1 justify="between" gap="0.5rem" style="flex-wrap: wrap">
                <Row align="center" gap="0.5rem">
                    <div>At address</div>
                    <input
                        class="input"
                        bind:value={value.address}
                        onblur={(e) => {
                            value.address = parseNumber(
                                //@ts-expect-error .value
                                e.target.value
                            )
                        }}
                    />
                </Row>
                <Row align="center" gap="0.5rem">
                    <div>Of bytes</div>
                    <select bind:value={value.bytes} class="select">
                        {#each [1, 2, 4, 8, 16].filter((v) => v <= systemSize) as size}
                            <option value={size}>{size}</option>
                        {/each}
                    </select>
                </Row>
                <Row align="center" gap="0.5rem">
                    <div>Is expected</div>
                    <input
                        class="input"
                        bind:value={value.expected}
                        onblur={(e) => {
                            //@ts-expect-error .value
                            value.expected = parseNumber(e.target.value)
                        }}
                    />
                </Row>
            </Row>
        {:else if value.type === 'string-chunk'}
            <Column gap="0.5rem" flex1>
                <Row align="center" gap="0.5rem">
                    <div>At address</div>
                    <input
                        class="input"
                        bind:value={value.address}
                        onblur={(e) => {
                            //@ts-expect-error .value
                            value.address = parseNumber(e.target.value)
                        }}
                    />
                </Row>
                <div>Is expected string</div>
                <textarea
                    class="input"
                    style="width: 100%;"
                    onchange={(e) => {
                        //@ts-expect-error .value
                        value.expected = e.target.value
                    }}>{value.expected}</textarea
                >
            </Column>
        {:else if value.type === 'number-chunk'}
            <Column gap="0.5rem" flex1>
                <div>At address</div>
                <input
                    class="input"
                    bind:value={value.address}
                    onblur={(e) => {
                        //@ts-expect-error .value
                        value.address = parseNumber(e.target.value)
                    }}
                />
                <div>Is expected numbers (comma separated)</div>
                <textarea
                    class="input"
                    style="width: 100%;"
                    onchange={(e) => {
                        //@ts-expect-error .value
                        if (!e.target.value) return (value.expected = [])
                        //@ts-expect-error .value
                        value.expected = e.target.value.split(',').map((v) => parseNumber(v))
                    }}>{value.expected.join(', ')}</textarea
                >
                <div>Each of size</div>
                <select bind:value={value.bytes} class="select">
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                </select>
            </Column>
        {/if}
    {:else}
        {#if value.type === 'number'}
            <div style="word-break: break-all;">
                At address <b>${toHexString(value.address, systemSize)}</b>, expect
                <b>${toHexString(value.expected, value.bytes)}</b>
                (of <b>{value.bytes}</b> bytes)
            </div>
        {/if}
        {#if value.type === 'string-chunk'}
            <div style="word-break: break-all;">
                At address <b>${toHexString(value.address, systemSize)}</b>, expect "<b
                    >{value.expected}</b
                >"
            </div>
        {/if}
        {#if value.type === 'number-chunk'}
            <div style="word-break: break-all;">
                At address <b>${toHexString(value.address, systemSize)}</b>, expect
                <b
                    >[{value.expected
                        .map((v) => `0x${toHexString(v, RegisterSize.Byte)}`)
                        .join(', ')}]</b
                >
                each of <b>{value.bytes}</b> bytes
            </div>
        {/if}
    {/if}
    {#if canRemove}
        <Button
            style="padding: 0.4rem; margin-left: auto;"
            hasIcon
            onClick={() => dispatcher('remove')}
            cssVar="secondary"
        >
            <Icon>
                <FaTimes />
            </Icon>
        </Button>
    {/if}
</div>

<style>
    .memory-testcase {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .input,
    .select {
        width: 5.5rem;
        padding: 0.5rem 0.5rem;
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
