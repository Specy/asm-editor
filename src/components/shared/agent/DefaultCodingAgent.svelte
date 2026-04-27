<script lang="ts" module>
    export {
        DEFAULT_CODING_AGENT_TOOL_NAMES,
        DEFAULT_CODING_AGENT_WORKFLOW_NAMES,
        SUPPORTED_LANGUAGES
    } from './defaultCodingAgent/types'
    export type {
        AgentToolAllowList,
        AgentWorkflow,
        AgentWorkflowAllowList,
        DefaultCodingAgentToolName,
        DefaultCodingAgentWorkflowName,
        SupportedLanguage
    } from './defaultCodingAgent/types'
</script>

<script lang="ts">
    import AiAgent from '$cmp/shared/agent/AiAgent.svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { RegisteredTool } from '@discerns/sdk'
    import {
        DEFAULT_CODING_AGENT_TOOL_NAMES,
        DEFAULT_CODING_AGENT_WORKFLOW_NAMES,
        allowListAllows,
        type AgentToolAllowList,
        type AgentWorkflow,
        type AgentWorkflowAllowList,
        type SupportedLanguage
    } from './defaultCodingAgent/types'
    import { createDefaultCodingAgentTools } from './defaultCodingAgent/tools'
    import {
        DEFAULT_CODING_AGENT_WORKFLOW_DEFINITIONS,
        buildDefaultCodingAgentPrompt
    } from './defaultCodingAgent/prompts'

    interface Props {
        editorLanguage: SupportedLanguage | null
        editorCode: string
        emulatorInstance: Emulator | null
        style?: string
        canUpdateLanguage?: boolean
        additionalInstructions?: string
        tools?: RegisteredTool[]
        workflows?: AgentWorkflow[]
        allowToolList?: AgentToolAllowList
        allowWorkflowList?: AgentWorkflowAllowList
    }

    let {
        editorLanguage = $bindable(),
        editorCode = $bindable(),
        emulatorInstance,
        style,
        canUpdateLanguage = true,
        additionalInstructions = '',
        tools: externalTools = [],
        workflows = [],
        allowToolList = 'all',
        allowWorkflowList = 'all'
    }: Props = $props()

    let accent = $derived(ThemeStore.get('accent').color)

    const defaultToolFactories = $derived.by(() => {
        return createDefaultCodingAgentTools({
            canUpdateLanguage,
            canUseSetCode: allowListAllows(allowToolList, 'set_code'),
            getEditorLanguage: () => editorLanguage,
            setEditorLanguage: (language) => (editorLanguage = language),
            getEditorCode: () => editorCode,
            setEditorCode: (code) => (editorCode = code),
            getEmulator: () => emulatorInstance
        })
    })

    const enabledDefaultToolNames = $derived.by(() =>
        DEFAULT_CODING_AGENT_TOOL_NAMES.filter((name) => allowListAllows(allowToolList, name))
    )
    const allTools = $derived([
        ...enabledDefaultToolNames.map((name) => defaultToolFactories[name]),
        ...externalTools
    ])
    const enabledWorkflows = $derived.by(() => [
        ...DEFAULT_CODING_AGENT_WORKFLOW_NAMES.filter((name) =>
            allowListAllows(allowWorkflowList, name)
        ).map((name) => DEFAULT_CODING_AGENT_WORKFLOW_DEFINITIONS[name]),
        ...workflows
    ])

    let avatarInstructions = $derived(
        buildDefaultCodingAgentPrompt({
            enabledToolNames: enabledDefaultToolNames,
            enabledWorkflows,
            additionalInstructions
        })
    )
</script>

<AiAgent
    tools={allTools}
    theme="dark"
    {accent}
    avatarContext={avatarInstructions}
    style={`width: 100%;
            border-radius: 1.2rem;
            border: solid 1px var(--tertiary);
            height: 100%; 
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            ${style}
    `}
/>
