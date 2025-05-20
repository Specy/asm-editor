<script lang="ts">
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import { createEventDispatcher } from 'svelte'
    import FaCircle from 'svelte-icons/fa/FaCircle.svelte'
    import FaLongArrowAltUp from 'svelte-icons/fa/FaLongArrowAltUp.svelte'
    import type { StackFrame } from '$lib/languages/commonLanguageFeatures.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    interface Props {
        stack: StackFrame[]
        onGoToLabel: (label: StackFrame) => void
        onGoToInstruction: (address: number)=> void
    }

    let { stack, onGoToInstruction, onGoToLabel }: Props = $props()
</script>

<div class="call-stack-wrapper">
    <div class="call-stack">
        {#if stack.length === 0}
            <div class="row" style="justify-content: center; padding: 0.4rem">Call stack empty</div>
        {/if}
        {#each [...stack].reverse() as label, i}
            <Row gap="0.1rem">
                <button
                    class:noHover={label.name === ''}
                    class="label-name row"
                    onclick={() => {
                        onGoToLabel(label)
                    }}
                >
                    <Icon
                      size={0.8}
                      style="margin-left: 0.1rem; color: {label.color}"
                    >
                        <FaCircle />
                    </Icon>
                    <div class="ellipsis">
                        {label.name || `0x${label.address.toString(16).toUpperCase()}`}
                    </div>
                </button>
                <button
                    onclick={() => {
                        onGoToInstruction(label.destination)
                    }}
                    class="return-address row"
                >
                    0x{label.destination.toString(16).toUpperCase()}
                </button>
            </Row>

            {#if i < stack.length - 1}
                <div class="separator">
                    <FaLongArrowAltUp />
                </div>
            {/if}
        {/each}
    </div>
</div>

<style lang="scss">
    .call-stack,
    .call-stack-wrapper {
        display: flex;
        flex-direction: column;
    }
    .call-stack-wrapper {
        background-color: var(--primary);
        border-radius: 0.7rem;
        max-height: 20rem;
        padding: 0.4rem;
        max-width: 12rem;
        overflow-y: auto;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
    .return-address{
        background: var(--secondary);
        color: var(--primary-text);
        border-radius: 0.3rem;
        padding: 0.4rem;
        font-size: 0.8rem;
        cursor: pointer;
        background-color: transparent;
    }
    .return-address:hover{
        background-color: var(--tertiary);
    }
    .label-name {
        gap: 0.4rem;
        padding: 0.2rem;
        flex:1;
        align-items: center;
        background-color: transparent;
        color: var(--primary-text);
        font-family: Rubik;
        font-size: 0.9rem;
        border-radius: 0.3rem;
        cursor: pointer;
        transition: all 0.1s;
        &:hover {
            background-color: var(--tertiary);
        }
    }
    .noHover {
        cursor: default;
        &:hover {
            background-color: transparent;
        }
    }
    .separator {
        height: 1rem;
        margin-left: 0.2rem;
        width: 1rem;
        color: var(--secondary-text);
    }
</style>
