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
        /**
         * The one file of a host with no `project`, as a lecture's or an Exam's editor holds it;
         * with one, the text the agent last wrote to its Entry file.
         */
        editorCode?: string
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
    //(programs.md, decision 7): the tools say so rather than make up a `main.<ext>`. A host with no
    //Project holds one file, which goes by the language's default name
    const effectiveEntry = $derived(
        project
            ? project.selectedProgram
            : editorLanguage
              ? defaultEntryPath(editorLanguage)
              : 'main.s'
    )

    //with no Project, the files the agent wrote beside the host's one, which follows `editorCode`
    let internalFiles = $state<Record<string, string>>({})

    $effect(() => {
        if (!project && editorCode !== undefined && effectiveEntry !== undefined) {
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

            //a Project's Files are its FileSystem's, which every write and deletion goes through
            //before the host's bookkeeping: a change it refuses, as it refuses every change while a
            //Debug session holds the Files, throws, and the tool reports it
            getFiles: () => {
                if (project) return project.fileSystem.files
                if (Object.keys(internalFiles).length > 0) return internalFiles
                return effectiveEntry === undefined ? {} : { [effectiveEntry]: editorCode ?? '' }
            },
            getFile: (path) => {
                if (project) {
                    //null for no File, and for a binary one, which is not UTF-8 text
                    try {
                        return project.fileSystem.readText(path)
                    } catch {
                        return null
                    }
                }
                if (path in internalFiles) return internalFiles[path]
                return path === effectiveEntry ? (editorCode ?? '') : null
            },
            setFile: (path, nextCode) => {
                if (project) {
                    const before = project.fileSystem.files
                    project.fileSystem.writeText(path, nextCode)
                    const added = Object.keys(project.fileSystem.files).filter(
                        (file) => !Object.hasOwn(before, file)
                    )
                    if (added.length) filesAdded(added)
                } else {
                    internalFiles[path] = nextCode
                }
                //without a Project, the host's one file is what the agent wrote last, whatever its
                //path; with one, the Entry file's text
                if (path === effectiveEntry || !project) editorCode = nextCode
            },
            deleteFile: (path) => {
                if (project) {
                    project.fileSystem.remove(path)
                    fileDeleted(path)
                } else {
                    delete internalFiles[path]
                }
                if (activePath === path) {
                    activePath = effectiveEntry
                }
            },
            getEntryPath: () => effectiveEntry,
            getActivePath: () => activePath ?? effectiveEntry,
            setActivePath: (path) => {
                activePath = path
                onOpenFile?.(path)
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
