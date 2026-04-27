export type AgentToolErrorKind =
    | 'emulator_unavailable'
    | 'compile_error'
    | 'execution_state'
    | 'runtime_error'
    | 'invalid_input'
    | 'unknown'

import { snapshotToolResult } from './snapshot.svelte'

type ToolPayload = Record<string, unknown>

type ToolRunContext = {
    success: <T extends ToolPayload>(payload: T) => T & { success: true }
    failure: <T extends ToolPayload>(
        errorKind: AgentToolErrorKind,
        error: unknown,
        options?: {
            retryable?: boolean
            nextAction?: string
            details?: T
        }
    ) => {
        success: false
        errorKind: AgentToolErrorKind
        error: string
        retryable: boolean
        nextAction?: string
        details?: T
    }
}

export function stringifyToolError(error: unknown) {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    try {
        return JSON.stringify(error)
    } catch {
        return String(error)
    }
}

export async function runAgentTool<T extends ToolPayload>(
    action: (toolRun: ToolRunContext) => Promise<T> | T
) {
    const toolRun: ToolRunContext = {
        success: (payload) => snapshotToolResult({ ...payload, success: true }),
        failure: (errorKind, error, options) => {
            return snapshotToolResult({
                success: false,
                errorKind,
                error: stringifyToolError(error),
                retryable: options?.retryable ?? false,
                nextAction: options?.nextAction,
                details: options?.details
            })
        }
    }

    try {
        return snapshotToolResult(await action(toolRun))
    } catch (error) {
        return toolRun.failure('unknown', error, {
            retryable: false,
            nextAction: 'Report the tool failure and try a smaller, more specific action.'
        })
    }
}
