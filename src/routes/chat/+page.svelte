<script lang="ts">
    import DefaultCodingAgent, {
        type SupportedLanguage
    } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'

    let editorLanguage: SupportedLanguage | null = $state(null)
    let editorCode = $state('')
    let emulatorInstance: Emulator | null = $state(null)
    let editorSidebarOpen = $state(false)
    let latestExampleSignature = $state<string | null>(null)

    $effect(() => {
        if (!editorLanguage) {
            editorSidebarOpen = false
            latestExampleSignature = null
            return
        }

        const nextSignature = `${editorLanguage}::${editorCode}`
        if (nextSignature !== latestExampleSignature) {
            latestExampleSignature = nextSignature
            editorSidebarOpen = true
        }
    })
</script>

<svelte:head>
    <title>AI Chat</title>
    <meta name="description" content="Chat with the AI assistant" />
</svelte:head>

<DefaultNavbar />
<Page hasNavbar>
    <div class="chat-layout" class:editor-open={editorLanguage && editorSidebarOpen}>
        <div class="agent-wrapper">
            <DefaultCodingAgent bind:editorLanguage bind:editorCode {emulatorInstance} />
        </div>

        {#if editorLanguage && editorSidebarOpen}
            <aside class="editor-panel" aria-label="Example code sidebar">
                <div class="editor-panel-header">
                    <h2>Example code</h2>
                    <button
                        type="button"
                        class="close-editor-button"
                        aria-label="Close example code sidebar"
                        onclick={() => (editorSidebarOpen = false)}
                    >
                        <FaTimes />
                    </button>
                </div>
                <div class="editor-content">
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
            </aside>
        {/if}
    </div>
    {#if editorLanguage && !editorSidebarOpen}
        <button
            type="button"
            class="open-editor-button"
            aria-label="Open example code sidebar"
            onclick={() => (editorSidebarOpen = true)}
        >
            Show example code
        </button>
    {/if}
</Page>

<style lang="scss">
    .chat-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        max-height: 100dvh;
        width: 100%;
        flex: 1;
        overflow: hidden;
        gap: 0.5rem;
    }

    .agent-wrapper {
        padding: 0.5rem;
        min-height: calc(var(--screen-height) * 0.65);
        min-width: 0;
        height: 100%;
    }

    .editor-open {
        grid-template-columns: minmax(0, 1fr) minmax(30rem, min(48vw, 46rem));
    }

    .editor-panel {
        min-width: 0;
        overflow: hidden;
        background: color-mix(in srgb, var(--secondary) 80%, var(--background));
        border: solid 0.1rem var(--tertiary);
        border-radius: 0.8rem;
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .editor-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .editor-panel-header h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text);
    }

    .editor-content {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    .close-editor-button,
    .open-editor-button {
        border: none;
        cursor: pointer;
        font-family: Rubik, sans-serif;
        font-weight: 700;
        background: var(--accent);
        color: var(--accent-text);
        transition: background 0.2s ease;
    }

    .close-editor-button {
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 0.6rem;
        display: grid;
        place-items: center;
        flex-shrink: 0;
    }

    .open-editor-button {
        position: fixed;
        top: 3.8rem;
        right: 0.5rem;
        padding: 0.65rem 1rem;
        z-index: 101;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .close-editor-button:hover,
    .open-editor-button:hover {
        background: color-mix(in srgb, var(--accent) 80%, var(--background));
    }

    @media (max-width: 900px) {
        .chat-layout {
            min-height: 100%;
            max-height: unset;
        }
        .editor-open {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr) minmax(24rem, 75dvh);
        }
    }
</style>
