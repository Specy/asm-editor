export const SUPPORTED_LANGUAGES = ['M68K', 'MIPS', 'X86', 'RISC-V', 'RISC-V-64'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_CODING_AGENT_TOOL_NAMES = [
    'set_code',
    'get_code',
    'get_emulator_state',
    'step',
    'run_to_completion',
    'undo',
    'update_breakpoints',
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

export function allowListAllows<T extends string>(allowList: 'all' | T[], name: T) {
    return allowList === 'all' || allowList.includes(name)
}
