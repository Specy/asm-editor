<script lang="ts">
    import { onMount } from 'svelte'
    import type { InstructionExample } from '$lib/documentation/instructions/content'
    import InstructionPreview from './InstructionPreview.svelte'
    import './instructionExample.css'

    interface Props {
        instructionKey: string
        example?: InstructionExample
    }

    let { instructionKey, example }: Props = $props()
    let code = $derived(example?.code ?? '')
    let Component: typeof import('./ClientOnly.svelte').default | undefined = $state.raw()
    onMount(async () => {
        Component = (await import('./ClientOnly.svelte')).default
    })
</script>

{#if example}
    {#if example.target === 'RISC-V-64'}
        <p class="target">This example runs on RV64.</p>
    {/if}
    <div class="instruction-example playground">
        {#if Component}
            <Component
                bind:code
                {instructionKey}
                language={example.target}
                {...example.presentation}
                showMemory={example.presentation?.showMemory ?? false}
            />
        {:else}
            <InstructionPreview {code} language={example.target} />
        {/if}
    </div>
{:else}
    <p>No runnable example is available for this instruction yet.</p>
{/if}

<style>
    .target {
        margin: 0;
        color: var(--background-text-muted);
        font-size: 0.9rem;
    }
</style>
