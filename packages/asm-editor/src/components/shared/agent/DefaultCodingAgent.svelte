<script lang="ts" module>
    export {
        DEFAULT_CODING_AGENT_TOOL_NAMES,
        DEFAULT_CODING_AGENT_WORKFLOW_NAMES,
        SUPPORTED_LANGUAGES,
        DEFAULT_TAKE_LINES,
        MAX_TAKE_LINES
    } from './defaultCodingAgent/types'
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
    import AiAgent from '#cmp/shared/agent/AiAgent.svelte'
    import { ThemeStore } from '#stores/themeStore.svelte.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import type { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
    import { fileText, type ProjectFiles } from '#lib/projectFiles.ts'
    import { Prompt } from '#stores/promptStore.svelte.ts'
    import { defaultEntryPath, type Project } from '#lib/Project.svelte.ts'
    import type { NewProgram } from '#lib/sourceCompilation/compileProjectSource.ts'
    import type { RegisteredTool } from '@discerns/sdk'
    import {
        DEFAULT_CODING_AGENT_TOOL_NAMES,
        DEFAULT_CODING_AGENT_WORKFLOW_NAMES,
        DEFAULT_NO_PROGRAM_MESSAGE,
        allowListAllows,
        type AgentToolAllowList,
        type AgentWorkflow,
        type AgentWorkflowAllowList,
        type SupportedLanguage
    } from './defaultCodingAgent/types'
    import {
        createDefaultCodingAgentTools,
        projectAgentBuildSources,
        projectFilesAdded
    } from './defaultCodingAgent/tools'
    import { searchForAgent } from './defaultCodingAgent/documentationSearch'
    import type { AgentSearchPlace } from '#lib/search/scope.ts'
    import {
        DEFAULT_CODING_AGENT_WORKFLOW_DEFINITIONS,
        buildDefaultCodingAgentPrompt
    } from './defaultCodingAgent/prompts'

    /**
     * A Workbench session's host hooks, which the agent's writes and deletions go through, as they
     * are host actions ([programs-plan.md](../../../../../../docs/design/programs-plan.md), decision
     * 13): a File it adds may make the Project's first Program, an Entry file it deletes takes its
     * Program with it.
     */
    type AgentFileHost = {
        filesAdded: (paths: readonly string[]) => void
        fileDeleted: (path: string) => void
    }

    interface Props {
        editorLanguage: SupportedLanguage | null
        project?: Project
        /** Without one, as on the chat page, the agent applies the same rules to `project` itself. */
        host?: AgentFileHost
        /** What the tools say while `project` has no Program. */
        noProgramMessage?: string
        /**
         * What a Compile of a source defining `main` does to `project`'s Programs: `move` for a host
         * with exactly one Program, as the chat page is, which moves it there rather than make a
         * second ([programs.md](../../../../../../docs/design/programs.md), decision 12).
         */
        newProgram?: NewProgram
        onOpenFile?: (path: string) => void
        editorCode?: string
        files?: ProjectFiles
        /** The single file's path in a host with no `project`, whose Selected program's it is. */
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
        host,
        noProgramMessage = DEFAULT_NO_PROGRAM_MESSAGE,
        newProgram = 'create',
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

    //a Project's Entry is its Selected program's, and there is none while it has no Program
    //(programs.md, decision 7): the tools say so rather than make up a `main.<ext>`
    const effectiveEntry = $derived(
        project
            ? project.selectedProgram
            : (entry ?? (editorLanguage ? defaultEntryPath(editorLanguage) : 'main.s'))
    )

    const effectiveFileSystem = $derived(project?.fileSystem ?? fileSystem)

    let internalFiles = $state<Record<string, string>>({})

    $effect(() => {
        if (
            !effectiveFileSystem &&
            !files &&
            editorCode !== undefined &&
            effectiveEntry !== undefined
        ) {
            const current = internalFiles[effectiveEntry]
            if (current !== editorCode) {
                internalFiles[effectiveEntry] = editorCode
            }
        }
    })

    //the host's bookkeeping for the agent's writes and deletions, or without a host the same rules
    //applied to the Project here
    function filesAdded(paths: string[]) {
        if (host) host.filesAdded(paths)
        else if (project) projectFilesAdded(project, paths)
    }

    //an Entry file takes its Program with it (programs.md, decision 7)
    function fileDeleted(path: string) {
        if (host) host.fileDeleted(path)
        else project?.removeProgram(path)
    }

    const defaultToolFactories = $derived.by(() => {
        return createDefaultCodingAgentTools({
            canUpdateLanguage,
            getProject: () => project,
            getBuildSources: project
                ? () => projectAgentBuildSources(project!, noProgramMessage)
                : undefined,
            noProgramMessage,
            newProgram,
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
                return effectiveEntry === undefined ? {} : { [effectiveEntry]: editorCode ?? '' }
            },
            getFile: (path) => {
                const target = path || activePath || effectiveEntry
                if (!target) return null
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
            //with a FileSystem, the Project's, the write goes through it alone, so the host's
            //bookkeeping happens once, after it: `files` is then the same Files
            setFile: (path, nextCode) => {
                const target = path || activePath || effectiveEntry
                if (!target) return
                if (effectiveFileSystem) {
                    const before = effectiveFileSystem.files
                    effectiveFileSystem.writeText(target, nextCode)
                    const added = Object.keys(effectiveFileSystem.files).filter(
                        (file) => !Object.hasOwn(before, file)
                    )
                    if (added.length) filesAdded(added)
                } else if (files) {
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
                        return
                    }
                    fileDeleted(path)
                } else if (files) {
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
                if (effectiveEntry === undefined) return ''
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
                if (effectiveEntry === undefined) return
                if (effectiveFileSystem) {
                    effectiveFileSystem.writeText(effectiveEntry, code)
                } else if (files) {
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
