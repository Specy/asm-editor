<script lang="ts">
    import ValueDiff from '$cmp/specific/project/user-tools/ValueDiffer.svelte'
    import {
        RegisterSize,
        type Register,
        type RegisterChunk
    } from '$lib/languages/commonLanguageFeatures.svelte'
    import { settingsStore } from '$stores/settingsStore.svelte'
    import { createEventDispatcher } from 'svelte'
    const dispatcher = createEventDispatcher<{
        registerClick: Register
    }>()
    interface Props {
        registers: Register[]
        hiddenRegistersNames?: string[]
        withoutHeader?: boolean
        size?: RegisterSize
        style?: string
        gridStyle?: string
    }

    let {
        registers: _registers,
        withoutHeader = false,
        size = RegisterSize.Word,
        style = '',
        gridStyle = '',
        hiddenRegistersNames = []
    }: Props = $props()
    let registers = $derived(_registers.filter(r => !hiddenRegistersNames.includes(r.name)))
    let usesHex = $derived(!settingsStore.values.useDecimalAsDefault.value)
    let chunks: RegisterChunk[][] = $derived(registers.map((r) => r.toSizedGroups(size)))
</script>

<div class="registers-wrapper" class:withoutHeader {style}>
    {#if !withoutHeader}
        <div class="registers-header">Registers</div>
    {/if}
    <div class="registers" style={gridStyle}>
        {#each registers as register, i (register.name)}
            <div class="register-wrapper">
                <div class="hover-register-value">
                    {#if usesHex}
                        {register.value}
                    {:else}
                        {register.value.toString(16).padStart(8, '0')}
                    {/if}
                </div>
                <button class="register-name" onclick={() => dispatcher('registerClick', register)}>
                    {register.name}
                </button>
            </div>
            <div class="register-hex">
                {#each chunks[i] as chunk}
                    <ValueDiff
                        monospaced
                        hoverElementStyle="left: 50%; transform: translateX(-50%);"
                        style="padding: 0.1rem"
                        value={usesHex
                            ? chunk.hex
                            : `${chunk.value}`.padStart(chunk.groupSize, '0')}
                        diff={usesHex
                            ? chunk.prev.hex
                            : `${chunk.prev.value}`.padStart(chunk.groupSize, '0')}
                        hoverElementOffset={chunk.value !== chunk.valueSigned
                            ? '-2.5rem'
                            : '-1.25rem'}
                    >
                        {#snippet hoverValue()}
                            <div class="column">
                                {#if chunk.value !== chunk.valueSigned}
                                    <div style="user-select: all;">
                                        {chunk.valueSigned}
                                    </div>
                                {/if}
                                <div style="user-select: all;">
                                    {usesHex
                                        ? `${chunk.value}`.padStart(chunk.groupSize, '0')
                                        : chunk.hex}
                                </div>
                            </div>
                        {/snippet}
                    </ValueDiff>
                {/each}
            </div>
        {/each}
    </div>
</div>

<style lang="scss">
    .registers-wrapper {
        display: flex;
        flex-direction: column;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.5rem;
        min-width: 8.6rem;
        position: relative;
        flex: 1;
        max-height: calc(100vh - 11.8rem); //HOTFIX
        overflow-y: auto;

        @media screen and (max-width: 1000px) {
            max-height: 33.7rem; //HOTFIX
        }
    }

    ::-webkit-scrollbar {
        background-color: transparent !important;
    }

    .registers {
        display: grid;
        grid-template-columns: min-content 1fr;
        grid-template-rows: auto;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.7rem;
        font-size: 1rem;
        flex: 1;
        @media screen and (max-width: 1000px) {
            width: unset;
        }
    }

    .registers-header {
        display: flex;
        position: sticky;
        top: 0;
        z-index: 2;
        align-items: center;
        justify-content: center;
        background-color: var(--tertiary);
        height: 2rem;
        min-height: 2rem;
    }
    .withoutHeader {
        padding-top: 0.3rem;
    }
    .hover-register-value {
        display: none;
        min-width: 100%;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border-radius: 0.2rem;
        position: absolute;
        cursor: text;
        user-select: all;
        font-family: monospace;
        font-size: 1rem;
        box-shadow: rgba(0, 0, 0, 0.4) 0px 0px 6px;
        left: 100%;
        z-index: 3;
        top: 0;
        height: 100%;
        padding: 0 0.3rem;
        align-items: center;
        font-weight: normal;
    }
    .register-wrapper {
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        &:hover .hover-register-value {
            display: flex;
        }
    }
    .register-name {
        font-weight: bold;
        padding: 0.2rem;
        border-radius: 0.2rem;
        border: none;
        min-width: 1.6rem;
        background: transparent;
        color: var(--secondary-text);
        cursor: pointer;
        &:hover {
            background-color: var(--accent2);
            color: var(--accent2-text);
        }
    }
    .register-hex {
        display: flex;
        justify-content: space-around;
        padding-left: 0.2rem;
        gap: 0.1rem;
        flex: 1;
        height: 100%;
        border-left: solid 0.1rem var(--tertiary);
    }
</style>
