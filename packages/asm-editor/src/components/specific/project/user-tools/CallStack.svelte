<script lang="ts">
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaCircle from '~icons/fa-solid/circle'
    import FaLongArrowAltUp from '~icons/fa-solid/long-arrow-alt-up'
    import type { StackFrame } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    interface Props {
        stack: StackFrame[]
        /**
         * How many frames the Call stack holds in all, when that can be more than `stack` lists: a
         * routine that calls itself without end holds far more than are worth drawing, and the
         * panel says how many it left out.
         */
        depth?: number
        onGoToLabel: (label: StackFrame) => void
        onGoToInstruction: (address: bigint) => void
        /**
         * Fill a section on its surface, with contrasting frames and height left to the section.
         */
        docked?: boolean
    }

    let { stack, depth, onGoToInstruction, onGoToLabel, docked = false }: Props = $props()

    /** The frames below the ones listed, the oldest, which the panel does not draw. */
    const unlisted = $derived(Math.max(0, (depth ?? 0) - stack.length))
</script>

<div class="call-stack-wrapper" class:docked>
    <div class="call-stack">
        {#if stack.length === 0}
            <div
                class="row"
                style="justify-content: center; padding: {docked ? '0.3rem' : '0.4rem'}"
            >
                Call stack empty
            </div>
        {/if}
        {#each [...stack].reverse() as label, i (stack.length - 1 - i)}
            <div class="frame row">
                <button
                    class:noHover={label.name === ''}
                    class="label-name row"
                    title={label.detail}
                    onclick={() => {
                        onGoToLabel(label)
                    }}
                >
                    <Icon size="small" style="margin-left: 0.1rem; color: {label.color}">
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
            </div>

            {#if i < stack.length - 1}
                <div class="separator">
                    <FaLongArrowAltUp />
                </div>
            {/if}
        {/each}
        {#if unlisted > 0}
            <div class="row unlisted">{unlisted.toLocaleString()} older calls are not shown</div>
        {/if}
    </div>
</div>

<style lang="scss">
    .call-stack,
    .call-stack-wrapper {
        display: flex;
        flex-direction: column;
    }
    /* on the floating window's own tray, which tints and blurs what is beneath, as the Stack
       pointer is (S3-12): no fill, corner or shadow of its own, the window's body clipping it */
    .call-stack-wrapper {
        /* the floating window's bottom edge sets it, when it has been dragged */
        max-height: var(--floating-body-max-height, 20rem);
        padding: 0.4rem;
        max-width: 12rem;
        overflow-y: auto;
    }
    .call-stack-wrapper.docked {
        padding: 0.3rem;
        max-width: none;
        max-height: none;
        background-color: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
    }
    .frame {
        gap: 0.1rem;
    }
    .docked .frame {
        padding: 0.15rem;
        border-radius: 0.3rem;
        border: 1px solid var(--wb-line, var(--tertiary));
        background-color: var(--primary);
        color: var(--primary-text);
    }
    .docked .label-name {
        gap: 0.3rem;
        min-width: 0;
    }
    .docked .return-address {
        padding: 0.3rem;
        flex-shrink: 0;
    }
    .return-address {
        background: var(--secondary);
        color: var(--primary-text);
        border-radius: 0.3rem;
        padding: 0.4rem;
        font-size: var(--fs-small);
        cursor: pointer;
        background-color: transparent;
    }
    .return-address:hover {
        background-color: var(--hover-bg);
    }
    .label-name {
        gap: 0.4rem;
        padding: 0.2rem;
        flex: 1;
        align-items: center;
        background-color: transparent;
        color: var(--primary-text);
        font-family: var(--font-ui);
        font-size: var(--fs-small);
        border-radius: 0.3rem;
        cursor: pointer;
        transition: background-color var(--dur-fast);
        &:hover {
            background-color: var(--hover-bg);
        }
    }
    .noHover {
        cursor: default;
        &:hover {
            background-color: transparent;
        }
    }
    .unlisted {
        justify-content: center;
        padding: 0.3rem;
        color: var(--secondary-text);
    }
    .separator {
        height: 1rem;
        margin-left: 0.2rem;
        width: 1rem;
        color: var(--secondary-text);
    }
</style>
