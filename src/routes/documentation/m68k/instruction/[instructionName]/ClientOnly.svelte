<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import FloatingAgentSidebar from '$cmp/shared/agent/FloatingAgentSidebar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import type { InstructionDocumentation } from '$lib/languages/M68K/M68K-documentation'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'

    interface Props {
        code?: string
        instructionKey: string
        description: string
        arguments: string[]
        language: AvailableLanguages
    }

    let {
        code = $bindable(''),
        instructionKey,
        description,
        arguments: args,
        language
    }: Props = $props()
    let agentOpen = $state(false)
</script>

{#key instructionKey}
    <EmulatorLoader
        bind:code
        {language}
        settings={{
            globalPageElementsPerRow: 4,
            globalPageSize: 4 * 8
        }}
    >
        {#snippet children(emulator)}
            <InteractiveEditor bind:code {language} {emulator} forceMemoryRight />
            <FloatingAgentSidebar
                bind:open={agentOpen}
                openSize="28rem"
                verticalOffset="0px"
                editorLanguage="M68K"
                bind:editorCode={code}
                emulatorInstance={emulator}
                canUpdateLanguage={false}
                additionalInstructions={`
                The user is currently looking at the documentation for the instruction: ${instructionKey} in the ${language} assembly language.
                Description: ${description}
                Arguments: ${args.join(', ')}
                They are using the interactive editor to experiment with this instruction and see how it works in real time on an emulator. They might ask you questions about how to use this instruction, what it does, or how it interacts with other instructions. 
                Provide clear and concise explanations, and if necessary, provide example code snippets to illustrate your points.
                `}
            />
            <button
                class="agent-toggle"
                class:agent-open={agentOpen}
                onclick={() => (agentOpen = !agentOpen)}
            >
                {#if agentOpen}
                    <div style={'width: 1.2em; height: 1.2em;'}>
                        <FaTimes />
                    </div>
                    Close
                {:else}
                    <SparklesIcon style={'font-size: 1rem;'} /> Ask AI
                {/if}
            </button>
        {/snippet}
        {#snippet loading()}
            <Header>Loading emulator...</Header>
        {/snippet}
    </EmulatorLoader>
{/key}

<style>
    .agent-toggle {
        position: fixed;
        top: 3.8rem;
        right: 0.5rem;
        padding: 0.65rem 1rem;
        z-index: 101;
        font-family: Rubik, sans-serif;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        font-weight: bold;
        border: none;
        gap: 0.5rem;
        min-width: 7rem;
        background: var(--accent);
        color: var(--accent-text);
        cursor: pointer;
        display: flex;
        font-size: 1rem;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        opacity: 1;
        transition: all 0.3s ease;
    }

    .agent-open {
        top: 0.3rem;
        right: min(calc(min(28rem, 100vw) + 0.3rem), calc(50vw - 3.5rem));
    }
    .agent-toggle:hover {
        background-color: color-mix(in srgb, var(--accent) 80%, var(--background));
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    @media (max-width: 1100px) {
        .agent-open {
            top: 0.5rem;
            right: 3.5rem;
            padding: 0.8rem 1rem;
        }
    }
</style>
