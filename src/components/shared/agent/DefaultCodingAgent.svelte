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
    import { projectBuildSources } from '$lib/buildSources'
    import { Prompt } from '$stores/promptStore.svelte'
    import { defaultEntryPath, type Project } from '$lib/Project.svelte'
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
    import { searchForAgent } from './defaultCodingAgent/documentationSearch'
    import type { AgentSearchPlace } from '$lib/search/scope'
    import {
        DEFAULT_CODING_AGENT_WORKFLOW_DEFINITIONS,
        buildDefaultCodingAgentPrompt
    } from './defaultCodingAgent/prompts'

    interface Props {
        editorLanguage: SupportedLanguage | null
        project?: Project
        onOpenFile?: (path: string) => void
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
        /**
         * Where the agent runs, for its documentation search: the language the place fixes, if
         * any, and whether the Lectures are in scope (not in an Exam). Nowhere in particular by
         * default, as on the chat page: the agent then names the language itself.
         */
        searchPlace?: AgentSearchPlace
    }

    let {
        editorLanguage = $bindable(),
        project,
        onOpenFile,
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
        allowWorkflowList = 'all',
        searchPlace = { language: null, lectures: true }
    }: Props = $props()

    let accent = $derived(ThemeStore.get('accent').color)

    const effectiveEntry = $derived(
        project?.entry ?? entry ?? (editorLanguage ? defaultEntryPath(editorLanguage) : 'main.s')
    )

    const effectiveFileSystem = $derived(project?.fileSystem ?? fileSystem)

    let internalFiles = $state<Record<string, string>>({})

    $effect(() => {
        if (!effectiveFileSystem && !files && editorCode !== undefined) {
            const current = internalFiles[effectiveEntry]
            if (current !== editorCode) {
                internalFiles[effectiveEntry] = editorCode
            }
        }
    })

    const defaultToolFactories = $derived.by(() => {
        return createDefaultCodingAgentTools({
            canUpdateLanguage,
            getProject: () => project,
            getBuildSources: project ? () => projectBuildSources(project!) : undefined,
            confirmSourceOverwrite: (question) => Prompt.confirm(question),
            canEditCode:
                allowListAllows(allowToolList, 'replace_file_content') ||
                allowListAllows(allowToolList, 'write_to_file'),
            getEditorLanguage: () => editorLanguage,
            setEditorLanguage: (language) => (editorLanguage = language),
            getEmulator: () => emulatorInstance,
            // read when the tool runs: the agent registers its tools once, by name
            searchDocumentation: (query, language, limit) =>
                searchForAgent(searchPlace, query, language, editorLanguage, limit),

            getFiles: () => {
                if (effectiveFileSystem) return effectiveFileSystem.files
                if (files) return files
                if (Object.keys(internalFiles).length > 0) return internalFiles
                return { [effectiveEntry]: editorCode ?? '' }
            },
            getFile: (path) => {
                const target = path || activePath || effectiveEntry
                if (effectiveFileSystem) {
                    try {
                        return effectiveFileSystem.readText(target)
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
                if (effectiveFileSystem) {
                    effectiveFileSystem.writeText(target, nextCode)
                }
                if (files) {
                    files = { ...files, [target]: { encoding: 'plain', content: nextCode } }
                }
                internalFiles[target] = nextCode
                if (target === effectiveEntry || (!files && !effectiveFileSystem)) {
                    editorCode = nextCode
                }
            },
            deleteFile: (path) => {
                if (effectiveFileSystem) {
                    try {
                        effectiveFileSystem.remove(path)
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
            setActivePath: (path) => {
                activePath = path
                onOpenFile?.(path)
            },

            getEditorCode: () => {
                if (effectiveFileSystem) {
                    try {
                        return effectiveFileSystem.readText(effectiveEntry)
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
                if (effectiveFileSystem) {
                    effectiveFileSystem.writeText(effectiveEntry, code)
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
            additionalInstructions,
            sourceCompilationAvailable: !!project
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
            border: solid 1px var(--wb-line, var(--tertiary));
            height: 100%; 
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            ${style}
    `}
/>
