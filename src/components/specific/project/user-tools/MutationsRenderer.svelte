<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import MutationStep from './MutationStep.svelte'
    import type { ExecutionStep } from '$lib/languages/commonLanguageFeatures.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    interface Props {
        steps: ExecutionStep[]
        statusRegisterNames: string[]
        /** The Target, which names the widths a written mutation reports. */
        language: AvailableLanguages
        /**
         * In a section rather than hanging under a floating window's bar: as wide as the section,
         * with its height left to it, and rounded alike on every corner.
         */
        docked?: boolean
    }

    let { steps, statusRegisterNames, language, docked = false }: Props = $props()

    const dispatch = createEventDispatcher<{ undo: number }>()
</script>

<div class="column tab" class:docked>
    {#if steps.length === 0}
        <div class="row" style="justify-content: center; padding: 0.4rem">No mutations</div>
    {/if}
    {#each steps as step, i (i)}
        <MutationStep
            {language}
            flags={statusRegisterNames}
            {step}
            on:undo={() => {
                dispatch('undo', i)
            }}
            on:highlight
        />
    {/each}
</div>

<style lang="scss">
    .tab {
        background-color: var(--primary);
        color: var(--primary-text);
        padding: 0.4rem;
        border-radius: 0.7rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        gap: 0.4rem;
        max-height: 30rem;
        width: 12rem;
        overflow-y: auto;
    }
    .tab.docked {
        width: auto;
        max-height: none;
        border-radius: 0.2rem;
    }
</style>
