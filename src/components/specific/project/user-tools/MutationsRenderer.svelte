<script lang="ts">
    import type { ExecutionStep } from '@specy/s68k'
    import { createEventDispatcher } from 'svelte'
    import MutationStep from './MutationStep.svelte'
    interface Props {
        steps: ExecutionStep[]
    }

    let { steps }: Props = $props()

    const dispatch = createEventDispatcher<{ undo: number }>()
</script>

<div class="column tab">
    {#if steps.length === 0}
        <div class="row" style="justify-content: center; padding: 0.4rem">No mutations</div>
    {/if}
    {#each steps as step, i}
        <MutationStep
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
</style>
