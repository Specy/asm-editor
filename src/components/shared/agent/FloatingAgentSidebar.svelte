<script lang="ts">
    import DefaultCodingAgent from './DefaultCodingAgent.svelte'
    import type {
        SupportedLanguage,
        AgentWorkflow,
        AgentToolAllowList,
        AgentWorkflowAllowList
    } from './DefaultCodingAgent.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { RegisteredTool } from '@discerns/sdk'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        editorLanguage: SupportedLanguage | null
        editorCode: string
        emulatorInstance: Emulator | null
        canUpdateLanguage?: boolean
        additionalInstructions?: string
        tools?: RegisteredTool[]
        workflows?: AgentWorkflow[]
        allowToolList?: AgentToolAllowList
        allowWorkflowList?: AgentWorkflowAllowList
    }

    let {
        open = $bindable(),
        openSize,
        verticalOffset = '0px',
        editorLanguage = $bindable(),
        editorCode = $bindable(),
        emulatorInstance,
        canUpdateLanguage,
        additionalInstructions,
        tools,
        workflows,
        allowToolList,
        allowWorkflowList
    }: Props = $props()

    let hasBeenOpened = $state(false)
    let showOpen = $state(false)

    $effect(() => {
        if (open) {
            if (!hasBeenOpened) {
                hasBeenOpened = true
            } else {
                showOpen = true
            }
        } else {
            showOpen = false
        }
    })

    function animateIn(node: HTMLElement) {
        // Force the browser to compute layout with the closed state
        node.getBoundingClientRect()
        showOpen = true
    }
</script>

{#if hasBeenOpened}
    <div
        use:animateIn
        class="floating-sidebar"
        style:--open-size={openSize ?? '28rem'}
        class:open={showOpen}
        style:top={verticalOffset}
        style:height="calc(100% - {verticalOffset})"
    >
        <DefaultCodingAgent
            bind:editorLanguage
            bind:editorCode
            {emulatorInstance}
            {canUpdateLanguage}
            {additionalInstructions}
            {tools}
            {workflows}
            {allowToolList}
            {allowWorkflowList}
            style="border-radius: 0; border: none; box-shadow: none; opacity: 0.82;"
        />
    </div>
{/if}

<style>
    .floating-sidebar {
        position: fixed;
        right: 0;
        top: 0;
        width: min(var(--open-size), 100vw);
        background-color: color-mix(in srgb, var(--tertiary) 20%, transparent);
        backdrop-filter: blur(0.7rem);
        height: 100dvh;
        z-index: 100;
        border: solid 0.1rem var(--tertiary);
        border-right: none;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        box-shadow: none;
        display: flex;
        flex-direction: column;
        border-top-left-radius: 1rem;
        border-bottom-left-radius: 1rem;
        overflow: hidden;
    }

    .floating-sidebar.open {
        transform: translateX(0);
        box-shadow: -4px 0 3rem 2rem rgba(0, 0, 0, 0.3);
    }
</style>
