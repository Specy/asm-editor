<script lang="ts">
    import DefaultCodingAgent, {
        type SupportedLanguage
    } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'

    let editorLanguage: SupportedLanguage | null = $state(null)
    let editorCode = $state('')
    let emulatorInstance: Emulator | null = $state(null)
</script>

<svelte:head>
    <title>AI Chat</title>
    <meta name="description" content="Chat with the AI assistant" />
</svelte:head>

<DefaultNavbar />
<Page hasNavbar>
    <div class="chat-layout" class:editor-open={editorLanguage}>
        <div class="agent-wrapper">
            <DefaultCodingAgent bind:editorLanguage bind:editorCode {emulatorInstance} />
        </div>

        <div class="editor-panel">
            <div class="editor-content">
                {#if editorLanguage}
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
                                />
                            {/snippet}
                        </EmulatorLoader>
                    {/key}
                {/if}
            </div>
        </div>
    </div>
</Page>

<style lang="scss">
    .chat-layout {
        display: flex;
        max-height: 100dvh;
        width: 100%;
        flex: 1;
        overflow: hidden;
    }

    .agent-wrapper {
        padding: 0.5rem;
        min-height: calc(var(--screen-height) * 0.65);
        min-width: min(55ch, calc(100vw - 1rem));
        flex: 1;
        height: 100%;
    }

    .editor-panel {
        position: relative;
        overflow: hidden;
        flex: 0 0 0%;
        max-width: 0;
        opacity: 0;
        transition:
            opacity 0.6s,
            flex 0.5s ease,
            max-width 0.5s ease;
    }

    .editor-open .editor-panel {
        flex: 2 1 0%;
        opacity: 1;
        max-width: 100vw;
    }
    .editor-open .agent-wrapper {
        padding-right: 0;
    }

    .editor-content {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        min-width: calc(100vw - 1rem - min(55ch, calc(100vw - 1rem)));
        padding: 0.5rem;
        display: flex;
        overflow: auto;
    }

    @media (max-width: 900px) {
        .editor-panel {
            margin-right: unset;
            max-height: 0;
            max-width: unset;
            overflow: unset;
        }
        .editor-open .editor-panel {
            max-height: 80dvh;
        }
        .editor-open .agent-wrapper {
            padding-right: 0.5rem;
        }
        .editor-content {
            position: relative;
            min-width: unset;
            width: 100%;
            min-height: 80dvh;
        }
        .chat-layout {
            max-height: unset;
            overflow: unset;
        }
        .chat-layout {
            flex-direction: column;
        }
    }
</style>
