import type { Emulator } from '$lib/languages/Emulator'
import type { Project } from '$lib/Project.svelte'
import type { BuildSources, ProjectFiles } from '$lib/projectFiles'

export const SUPPORTED_LANGUAGES = ['M68K', 'MIPS', 'X86', 'RISC-V', 'RISC-V-64', 'Z80'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_TAKE_LINES = 400
export const MAX_TAKE_LINES = 800

export const DEFAULT_CODING_AGENT_TOOL_NAMES = [
    'view_file',
    'replace_file_content',
    'write_to_file',
    'list_files',
    'delete_file',
    'list_breakpoints',
    'set_breakpoint',
    'remove_breakpoint',
    'get_emulator_state',
    'step',
    'run_to_completion',
    'undo',
    'get_line_from_address',
    'compile',
    'compile_source',
    'read_memory',
    'poke_register',
    'poke_memory',
    'search_documentation'
] as const

export type DefaultCodingAgentToolName = (typeof DEFAULT_CODING_AGENT_TOOL_NAMES)[number]
export type AgentToolAllowList = 'all' | DefaultCodingAgentToolName[]

export const DEFAULT_CODING_AGENT_WORKFLOW_NAMES = [
    'debug_broken_code',
    'write_new_code_from_scratch',
    'modify_or_extend_existing_code',
    'diagnose_runtime_errors_or_interrupts'
] as const
export type DefaultCodingAgentWorkflowName = (typeof DEFAULT_CODING_AGENT_WORKFLOW_NAMES)[number]
export type AgentWorkflowAllowList = 'all' | DefaultCodingAgentWorkflowName[]

export type AgentWorkflow = {
    name: string
    description: string
    intentTriggers?: string[]
    requiredTools?: string[]
    verification?: string
}

/** One result of the `search_documentation` tool: a Documentation entry or a Lecture section. */
export type DocumentationSearchHit = {
    kind: 'documentation' | 'lecture'
    title: string
    /** Where it is: the Chapter, or the Course and the Lecture. */
    where: string
    summary: string
    /** The entry's text, or the section's markdown, cut to a budget. */
    text: string
    /** Its page on this site. */
    href: string
}

export type DocumentationSearchAnswer = {
    /** Whether the results are ranked by meaning too, or by words alone (the model is not loaded). */
    mode: 'text' | 'hybrid'
    /** What was searched, in words. */
    searched: string
    results: DocumentationSearchHit[]
}

export type DefaultCodingAgentToolContext = {
    canUpdateLanguage: boolean
    canEditCode: boolean
    getEditorLanguage: () => SupportedLanguage | null
    setEditorLanguage: (language: SupportedLanguage) => void
    getEmulator: () => Emulator | null

    /** Source compilation and build provenance for hosts backed by a Project. */
    getProject?: () => Project | undefined
    getBuildSources?: () => BuildSources
    confirmSourceOverwrite?: (question: string) => Promise<boolean | null>

    // Multi-file support
    getFiles?: () => Record<string, string> | ProjectFiles
    getFile?: (path: string) => string | null
    setFile?: (path: string, code: string) => void
    deleteFile?: (path: string) => void
    getEntryPath?: () => string
    getActivePath?: () => string
    setActivePath?: (path: string) => void

    // Single-file legacy fallbacks
    getEditorCode?: () => string
    setEditorCode?: (code: string) => void

    /**
     * Searches the Documentation and the Lectures in the Search scope of the place the agent runs
     * in; `language` is used only where the place has none of its own. Absent where there is no
     * search, which the tool reports.
     */
    searchDocumentation?: (
        query: string,
        language: SupportedLanguage | null,
        limit: number
    ) => Promise<DocumentationSearchAnswer>
}

export function allowListAllows<T extends string>(allowList: 'all' | T[], name: T) {
    return allowList === 'all' || allowList.includes(name)
}
