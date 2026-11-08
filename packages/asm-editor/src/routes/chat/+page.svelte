<script lang="ts">
    import { browser } from '$app/env'
    import DefaultCodingAgent, {
        type SupportedLanguage
    } from '#cmp/shared/agent/DefaultCodingAgent.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import SparklesIcon from '#cmp/shared/agent/SparklesIcon.svelte'
    import AgentSidebarFrame from '#cmp/shared/agent/AgentSidebarFrame.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import InteractiveInstructionEditor from '#cmp/shared/InteractiveInstructionEditor.svelte'
    import { defaultEntryPath, makeProject, type AvailableLanguages } from '#lib/Project.svelte.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'

    const MOBILE_LAYOUT_QUERY = '(max-width: 900px)'
    let editorLanguage: SupportedLanguage | null = $state(null)
    let editorCode = $state('')
    const project = $derived.by(() =>
        makeProject({ language: editorLanguage ?? 'RISC-V', code: '' })
    )
    let activePath = $state<string | undefined>(undefined)
    let emulatorInstance: Emulator | null = $state(null)
    let agentOpen = $state(true)
    let isMobile = $state(false)
    let latestExampleSignature = $state<string | null>(null)
    let agentVisible = $derived(!editorLanguage || agentOpen || isMobile)

    //alone on the page the chat keeps a hairline edge and a shadow, square-cornered
    let agentStyle = $derived(
        editorLanguage
            ? isMobile
                ? ''
                : 'opacity: 0.82;'
            : 'min-height: 100%; border: solid 1px var(--wb-line, var(--tertiary)); box-shadow: var(--shadow-2);'
    )

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
    <title>AI Chat - ASM Editor</title>
    <meta name="description" content="Chat with the AI assistant" />
</svelte:head>

<div class="chat-page fills-screen" class:has-example={!!editorLanguage}>
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
                    <SparklesIcon style="font-size: 1rem;" /> Ask AI
                {/if}
            </button>
        {/if}
    </DefaultNavbar>

    <!-- the page's whole width until an example opens, then floating over it from the right, and
         on a phone above the example -->
    <AgentSidebarFrame
        open={agentVisible}
        floating={!!editorLanguage}
        stackOnPhones
        verticalOffset="var(--nav-height)"
    >
        <DefaultCodingAgent
            {project}
            newProgram="move"
            bind:activePath
            bind:editorLanguage
            bind:editorCode
            {emulatorInstance}
            style={agentStyle}
        />
    </AgentSidebarFrame>

    {#if editorLanguage}
        <div class="emulator-stage">
            {#key editorLanguage}
                <EmulatorLoader
                    language={editorLanguage}
                    code={project.code}
                    source={{
                        files: project.files,
                        //the Project is made with its one Program, `main.<ext>`, read once here
                        entry: project.selectedProgram ?? defaultEntryPath(project.language)
                    }}
                    bind:emulator={emulatorInstance}
                    settings={{
                        globalPageElementsPerRow: 16,
                        globalPageSize: 16 * 16
                    }}
                >
                    {#snippet children(emulator)}
                        <InteractiveInstructionEditor
                            {project}
                            bind:activePath
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
        --agent-phone-height: min(75dvh, calc(100dvh - var(--nav-height)));
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

    .nav-agent-toggle {
        height: 2.2rem;
        padding: 0.3rem 0.8rem;
        font-family: var(--font-ui);
        border-radius: 1.5rem;
        border-bottom-right-radius: 0.4rem;
        font-weight: 700;
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

        .nav-agent-toggle {
            display: none;
        }
    }
</style>
