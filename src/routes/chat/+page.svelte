<script lang="ts">
    import DefaultCodingAgent, {
        type SupportedLanguage
    } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'

    let editorLanguage: SupportedLanguage | null = $state(null)
    let editorCode = $state('')
    let emulatorInstance: Emulator | null = $state(null)
    let agentOpen = $state(true)
    let latestExampleSignature = $state<string | null>(null)
    let agentStyle = $derived(
        editorLanguage
            ? 'border-radius: 0; border: none; box-shadow: none; opacity: 0.82;'
            : 'min-height: 100%;'
    )

    $effect(() => {
        if (!editorLanguage) {
            agentOpen = true
            latestExampleSignature = null
            return
        }

        const nextSignature = `${editorLanguage}::${editorCode}`
        if (nextSignature !== latestExampleSignature) {
            latestExampleSignature = nextSignature
            agentOpen = true
        }
    })
</script>

<svelte:head>
    <title>AI Chat</title>
    <meta name="description" content="Chat with the AI assistant" />
</svelte:head>

<div class="chat-page">
    {#if editorLanguage}
        <div class="emulator-stage">
            {#key editorLanguage}
                <EmulatorLoader
                    language={editorLanguage}
                    code={editorCode}
                    bind:emulator={emulatorInstance}
                    settings={{
                        globalPageElementsPerRow: 4,
                        globalPageSize: 4 * 8
                    }}
                >
                    {#snippet children(emulator)}
                        <InteractiveInstructionEditor
                            bind:code={editorCode}
                            language={editorLanguage as AvailableLanguages}
                            {emulator}
                            embedded={true}
                            showConsole={true}
                            showRegisters={true}
                            showMemory={true}
                            showFlags={true}
                            forceMemoryRight={true}
                        />
                    {/snippet}
                </EmulatorLoader>
            {/key}
        </div>
    {/if}

    <div
        class="agent-shell"
        class:floating={editorLanguage}
        class:open={!editorLanguage || agentOpen}
        aria-hidden={editorLanguage && !agentOpen}
    >
        <DefaultCodingAgent
            bind:editorLanguage
            bind:editorCode
            {emulatorInstance}
            style={agentStyle}
        />
    </div>

    {#if editorLanguage}
        <button
            type="button"
            class="agent-toggle"
            class:agent-open={agentOpen}
            onclick={() => (agentOpen = !agentOpen)}
        >
            {#if agentOpen}
                <span class="toggle-icon">
                    <FaTimes />
                </span>
                Close
            {:else}
                <SparklesIcon style={'font-size: 1rem;'} /> Ask AI
            {/if}
        </button>
    {/if}
</div>

<style lang="scss">
    .chat-page {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
        background: var(--background);
        overflow: hidden;
        z-index: 20;
        padding: 0.5rem;
        display: flex;
    }

    .emulator-stage {
        position: absolute;
        inset: 0;
        display: flex;
        overflow: hidden;
        padding: 0.5rem;
    }

    .agent-shell {
        position: relative;
        flex: 1;
        min-width: 0;
        height: 100%;
        transition:
            transform 0.3s ease,
            box-shadow 0.3s ease;
    }

    .agent-shell.floating {
        position: fixed;
        top: 0;
        right: 0;
        width: min(36rem, 100vw);
        height: 100dvh;
        z-index: 100;
        background-color: color-mix(in srgb, var(--tertiary) 20%, transparent);
        backdrop-filter: blur(0.7rem);
        border: solid 0.1rem var(--tertiary);
        border-right: none;
        border-top-left-radius: 1rem;
        border-bottom-left-radius: 1rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 0;
        transform: translateX(100%);
    }

    .agent-shell.floating.open {
        transform: translateX(0);
        box-shadow: -4px 0 3rem 2rem rgba(0, 0, 0, 0.3);
    }

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
        background-color: var(--accent);
        color: var(--accent-text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .agent-toggle.agent-open {
        right: min(36rem, 100vw);
        transform: translateX(calc(100% + 0.5rem));
        border-radius: 1.5rem;
        border-bottom-left-radius: 0.4rem;
    }

    .toggle-icon {
        width: 1.2em;
        height: 1.2em;
        display: flex;
    }

    @media (max-width: 900px) {
        .agent-shell.floating {
            width: 100vw;
        }

        .agent-toggle.agent-open {
            right: 0.5rem;
            transform: none;
        }
    }
</style>
