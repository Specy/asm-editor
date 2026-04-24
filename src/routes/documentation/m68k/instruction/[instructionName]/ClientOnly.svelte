<script lang="ts">
    import InteractiveEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import { type AvailableLanguages } from '$lib/Project.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import FloatingAgentSidebar from '$cmp/shared/agent/FloatingAgentSidebar.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'

    interface Props {
        code?: string
        instructionKey: string
        description: string
        arguments: string[]
        language: AvailableLanguages
        showPc?: boolean
        showFlags?: boolean
        showConsole?: boolean
    }

    let {
        code = $bindable(''),
        instructionKey,
        description,
        arguments: args,
        language,
        showFlags,
        showPc,
        showConsole
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
            <InteractiveEditor 
                bind:code 
                {language} 
                {emulator} 
                {showFlags}
                {showPc}
                {showConsole}

                forceMemoryRight 
                
            />
            <FloatingAgentSidebar
                bind:open={agentOpen}
                openSize="28rem"
                verticalOffset="0px"
                editorLanguage={language}
                bind:editorCode={code}
                emulatorInstance={emulator}
                canUpdateLanguage={false}
                additionalInstructions={`
                The user is viewing the documentation for the ${language} instruction \`${instructionKey}\`. The editor language is locked to ${language}.
                Description: ${description}
                Arguments: ${args.join(', ')}

                This context is primarily the *Explain an instruction (interactive docs)* workflow focused on this single instruction. The editor exists specifically for demonstrating it, so you are free to overwrite its contents with examples.
                - Stay focused on \`${instructionKey}\`. Use other instructions only when they are necessary context (setting up operands, showing a branch target, calling a subroutine, handling side effects on other registers, etc.).
                - If the user asks how \`${instructionKey}\` interacts with another instruction, show a short sequence that includes both and step through it.
                `}
                workflows={[
                    {
                        name: 'Explain an instruction (interactive docs)',
                        description: `
When the user asks how a specific instruction behaves, how its operands work, or how it interacts with other instructions.
1. set_code with a short, focused program that exercises the instruction. It is fine — and often necessary — to include more than one instruction: set up operands, provide a branch/jump target, demonstrate side effects on flags/other registers, or call and return from a subroutine.
2. Keep the example as small as possible while still being runnable end-to-end.
3. step 1-few instructions at a time through the example and describe the concrete mutations (registers, flags, memory) from the step's return value.
4. If a follow-up question needs a variation, modify the example via set_code and step again rather than speculating.
`
                    }
                ]}
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
