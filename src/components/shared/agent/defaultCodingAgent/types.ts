import type { Emulator } from '$lib/languages/Emulator'
import type { ProjectFiles } from '$lib/projectFiles'

export const SUPPORTED_LANGUAGES = ['M68K', 'MIPS', 'X86', 'RISC-V', 'RISC-V-64', 'Z80'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_TAKE_LINES = 100
export const MAX_TAKE_LINES = 150

export const DEFAULT_CODING_AGENT_TOOL_NAMES = [
    'view_file',
    'replace_file_content',
    'write_to_file',
    'list_files',
    'delete_file',
    'list_breakpoints',
    'update_breakpoints',
    'get_emulator_state',
    'step',
    'run_to_completion',
    'undo',
    'get_line_from_address',
    'compile',
    'read_memory'
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

export type DefaultCodingAgentToolContext = {
    canUpdateLanguage: boolean
    canEditCode: boolean
    getEditorLanguage: () => SupportedLanguage | null
    setEditorLanguage: (language: SupportedLanguage) => void
    getEmulator: () => Emulator | null

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
}

export function allowListAllows<T extends string>(allowList: 'all' | T[], name: T) {
    return allowList === 'all' || allowList.includes(name)
}
