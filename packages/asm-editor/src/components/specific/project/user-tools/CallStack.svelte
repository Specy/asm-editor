<script lang="ts">
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaCircle from '~icons/fa-solid/circle'
    import FaLongArrowAltUp from '~icons/fa-solid/long-arrow-alt-up'
    import type { StackFrame } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    interface Props {
        stack: StackFrame[]
        onGoToLabel: (label: StackFrame) => void
        onGoToInstruction: (address: bigint) => void
        /**
         * Fill a section on its surface, with contrasting frames and height left to the section.
         */
        docked?: boolean
    }

    let { stack, onGoToInstruction, onGoToLabel, docked = false }: Props = $props()
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
                    <Icon size={0.8} style="margin-left: 0.1rem; color: {label.color}">
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
    .call-stack-wrapper.docked {
        padding: 0.3rem;
        max-width: none;
        max-height: none;
        border-radius: 0;
        background-color: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
        box-shadow: none;
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
        font-size: 0.8rem;
        cursor: pointer;
        background-color: transparent;
    }
    .return-address:hover {
        background-color: var(--tertiary);
    }
    .label-name {
        gap: 0.4rem;
        padding: 0.2rem;
        flex: 1;
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
