<script lang="ts" module>
    export {
        DEFAULT_CODING_AGENT_TOOL_NAMES,
        DEFAULT_CODING_AGENT_WORKFLOW_NAMES,
        SUPPORTED_LANGUAGES,
        DEFAULT_TAKE_LINES,
        MAX_TAKE_LINES
    } from './defaultCodingAgent/types'
    export { AssemblyCodingHarness } from './defaultCodingAgent/harness'
    export type {
        AgentToolAllowList,
        AgentWorkflow,
        AgentWorkflowAllowList,
        DefaultCodingAgentToolName,
        DefaultCodingAgentWorkflowName,
        DefaultCodingAgentToolContext,
        SupportedLanguage
    } from './defaultCodingAgent/types'
</script>

<script lang="ts">
    import AiAgent from '$cmp/shared/agent/AiAgent.svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
    import { fileText, type ProjectFiles } from '$lib/projectFiles'
    import { defaultEntryPath } from '$lib/Project.svelte'
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
        editorCode?: string
        files?: ProjectFiles
        entry?: string
        fileSystem?: FileSystem
        activePath?: string
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
        editorCode = $bindable(''),
        files = $bindable(undefined),
        entry = $bindable(undefined),
        fileSystem,
        activePath = $bindable(undefined),
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

    const effectiveEntry = $derived(
        entry ?? (editorLanguage ? defaultEntryPath(editorLanguage) : 'main.s')
    )

    let internalFiles = $state<Record<string, string>>({})

    $effect(() => {
        if (!fileSystem && !files && editorCode !== undefined) {
            const current = internalFiles[effectiveEntry]
            if (current !== editorCode) {
                internalFiles[effectiveEntry] = editorCode
            }
        }
    })

    const defaultToolFactories = $derived.by(() => {
        return createDefaultCodingAgentTools({
            canUpdateLanguage,
            canEditCode:
                allowListAllows(allowToolList, 'replace_file_content') ||
                allowListAllows(allowToolList, 'write_to_file'),
            getEditorLanguage: () => editorLanguage,
            setEditorLanguage: (language) => (editorLanguage = language),
            getEmulator: () => emulatorInstance,

            getFiles: () => {
                if (fileSystem) return fileSystem.files
                if (files) return files
                if (Object.keys(internalFiles).length > 0) return internalFiles
                return { [effectiveEntry]: editorCode ?? '' }
            },
            getFile: (path) => {
                const target = path || activePath || effectiveEntry
                if (fileSystem) {
                    try {
                        return fileSystem.readText(target)
                    } catch {
                        return null
                    }
                }
                if (files && target in files) {
                    return fileText(files[target])
                }
                if (target in internalFiles) {
                    return internalFiles[target]
                }
                if (target === effectiveEntry) {
                    return editorCode ?? ''
                }
                return null
            },
            setFile: (path, nextCode) => {
                const target = path || activePath || effectiveEntry
                if (fileSystem) {
                    fileSystem.writeText(target, nextCode)
                }
                if (files) {
                    files = { ...files, [target]: { encoding: 'plain', content: nextCode } }
                }
                internalFiles[target] = nextCode
                if (target === effectiveEntry || (!files && !fileSystem)) {
                    editorCode = nextCode
                }
            },
            deleteFile: (path) => {
                if (fileSystem) {
                    try {
                        fileSystem.remove(path)
                    } catch {
                        // ignore
                    }
                }
                if (files) {
                    const next = { ...files }
                    delete next[path]
                    files = next
                }
                delete internalFiles[path]
                if (activePath === path) {
                    activePath = effectiveEntry
                }
            },
            getEntryPath: () => effectiveEntry,
            getActivePath: () => activePath ?? effectiveEntry,
            setActivePath: (path) => (activePath = path),

            getEditorCode: () => {
                if (fileSystem) {
                    try {
                        return fileSystem.readText(effectiveEntry)
                    } catch {
                        // ignore
                    }
                }
                if (files && effectiveEntry in files) {
                    return fileText(files[effectiveEntry])
                }
                return internalFiles[effectiveEntry] ?? editorCode ?? ''
            },
            setEditorCode: (code) => {
                if (fileSystem) {
                    fileSystem.writeText(effectiveEntry, code)
                }
                if (files) {
                    files = { ...files, [effectiveEntry]: { encoding: 'plain', content: code } }
                }
                internalFiles[effectiveEntry] = code
                editorCode = code
            }
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
