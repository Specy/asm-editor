<script lang="ts">
    import { browser } from '$app/environment'
    import DefaultCodingAgent, {
        type SupportedLanguage
    } from '$cmp/shared/agent/DefaultCodingAgent.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'

    const MOBILE_LAYOUT_QUERY = '(max-width: 900px)'

    let editorLanguage: SupportedLanguage | null = $state(null)
    let editorCode = $state('')
    let emulatorInstance: Emulator | null = $state(null)
    let agentOpen = $state(true)
    let isMobile = $state(false)
    let latestExampleSignature = $state<string | null>(null)
    let agentVisible = $derived(!editorLanguage || agentOpen || isMobile)
    let agentStyle = $derived(
        editorLanguage
            ? isMobile
                ? 'border-radius: 0; border: none; box-shadow: none;'
                : 'border-radius: 0; border: none; box-shadow: none; opacity: 0.82;'
            : 'min-height: 100%; border-radius: 0'
    )

        $effect(() => {
            console.log(agentStyle)
        })

    $effect(() => {
        if (!browser) return

        const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY)
        const updateMobileLayout = () => {
            isMobile = mediaQuery.matches

            if (isMobile) {
                agentOpen = true
            }
        }

        updateMobileLayout()
        mediaQuery.addEventListener('change', updateMobileLayout)

        return () => mediaQuery.removeEventListener('change', updateMobileLayout)
    })

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

<div class="chat-page" class:has-example={!!editorLanguage}>
    <DefaultNavbar exclude={['ai-chat']}>
        {#if editorLanguage && !isMobile}
            <button
                style="min-width: 10ch;"
                type="button"
                class="nav-agent-toggle"
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
    </DefaultNavbar>

    <div
        class="agent-shell"
        class:floating={editorLanguage}
        class:open={agentVisible}
        aria-hidden={!agentVisible}
    >
        <DefaultCodingAgent
            bind:editorLanguage
            bind:editorCode
            {emulatorInstance}
            style={agentStyle}
        />
    </div>

    {#if editorLanguage}
        <div class="emulator-stage">
            {#key editorLanguage}
                <EmulatorLoader
                    language={editorLanguage}
                    code={editorCode}
                    bind:emulator={emulatorInstance}
                    settings={{
                        globalPageElementsPerRow: 16,
                        globalPageSize: 16 * 16
                    }}
                >
                    {#snippet children(emulator)}
                        <InteractiveInstructionEditor
                            bind:code={editorCode}
                            layout="fullscreen"
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
</div>

<style lang="scss">
    .chat-page {
        --nav-height: 3.2rem;
        --agent-sidebar-width: 28rem;
        --mobile-agent-height: min(75dvh, calc(100dvh - var(--nav-height)));
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
        background: var(--background);
        overflow: hidden;
        z-index: 20;
        padding: calc(var(--nav-height) + 0.5rem) 0 0 0;
        display: flex;
    }

    .emulator-stage {
        position: absolute;
        top: var(--nav-height);
        right: 0;
        bottom: 0;
        left: 0;
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
        top: var(--nav-height);
        right: 0;
        width: min(var(--agent-sidebar-width), 100vw);
        height: calc(100dvh - var(--nav-height));
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

    .nav-agent-toggle {
        height: 2.2rem;
        padding: 0.3rem 0.8rem;
        font-family: Rubik, sans-serif;
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        font-weight: bold;
        border: none;
        gap: 0.5rem;
        background-color: var(--accent);
        color: var(--accent-text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .toggle-icon {
        width: 1.2em;
        height: 1.2em;
        display: flex;
    }

    @media (max-width: 900px) {
        .chat-page {
            gap: 2rem;
            padding: var(--nav-height) 0 0 0;
            overflow-x: hidden;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        .chat-page.has-example {
            flex-direction: column;
        }

        .chat-page.has-example .emulator-stage {
            position: relative;
            top: auto;
            right: auto;
            bottom: auto;
            left: auto;
            height: calc(100dvh - var(--nav-height) + 30.5rem);
            flex: 0 0 calc(100dvh - var(--nav-height) + 30.5rem);
            min-height: 0;
        }

        .agent-shell.floating {
            position: relative;
            top: auto;
            right: auto;
            bottom: auto;
            left: auto;
            width: 100vw;
            height: var(--mobile-agent-height);
            flex: 0 0 var(--mobile-agent-height);
            background-color: var(--background);
            backdrop-filter: none;
            border: none;
            border-bottom: solid 0.1rem var(--tertiary);
            border-radius: 0;
            transform: none;
        }

        .agent-shell.floating.open {
            transform: none;
            box-shadow: none;
        }

        .nav-agent-toggle {
            display: none;
        }
    }
</style>
