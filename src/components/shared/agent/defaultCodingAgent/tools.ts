import { tool, type RegisteredTool } from '@discerns/sdk'
import { z } from 'zod'
import type { Emulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { delay } from '$lib/utils'
import {
    DEFAULT_CODING_AGENT_TOOL_NAMES,
    SUPPORTED_LANGUAGES,
    type SupportedLanguage
} from './types'
import {
    collectEmulatorErrors,
    formatEmulatorState,
    formatSourceLine,
    formatNumber
} from './formatting'
import { runAgentTool, stringifyToolError } from './toolResults'

type DefaultCodingAgentToolContext = {
    canUpdateLanguage: boolean
    canUseSetCode: boolean
    getEditorLanguage: () => SupportedLanguage | null
    setEditorLanguage: (language: SupportedLanguage) => void
    getEditorCode: () => string
    setEditorCode: (code: string) => void
    getEmulator: () => Emulator | null
}

type ExecutionBlocker = {
    error: string
    retryable: boolean
    nextAction: string
}

function getLineCount(code: string) {
    return code.length === 0 ? 1 : code.split('\n').length
}

function getBreakpointLines(emulator: Emulator) {
    return emulator.breakpoints.map((breakpoint: number) => breakpoint + 1)
}

function statusName(status: InterpreterStatus) {
    return InterpreterStatus[status] ?? String(status)
}

function parseHexAddress(address: string) {
    const trimmedAddress = address.trim()
    if (!/^(0x)?[0-9a-f]+$/i.test(trimmedAddress)) return null
    return BigInt(trimmedAddress.startsWith('0x') ? trimmedAddress : `0x${trimmedAddress}`)
}

async function waitForReplacementEmulator(
    context: DefaultCodingAgentToolContext,
    previousEmulator: Emulator | null,
    timeoutMs = 3000
) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const emulator = context.getEmulator()
        if (emulator && emulator !== previousEmulator) {
            return { loaded: true, waitMs: Date.now() - startedAt }
        }
        await delay(100)
    }
    return { loaded: false, waitMs: Date.now() - startedAt }
}

function executionBlocker(emulator: Emulator, action: 'execute' | 'undo'): ExecutionBlocker | null {
    if (!emulator.canExecute) {
        return {
            error:
                action === 'undo'
                    ? 'Cannot undo. Code is not compiled.'
                    : 'Cannot execute. Code is not compiled or the current program state is invalid.',
            retryable: true,
            nextAction:
                'Call compile first. If compile reports errors, fix them with set_code before trying again.'
        }
    }

    if (emulator.terminated) {
        return {
            error:
                action === 'undo'
                    ? 'Program has terminated. Recompile to restart before undoing.'
                    : 'Program has already terminated.',
            retryable: true,
            nextAction: 'Call compile to reset execution state, then run or step again.'
        }
    }

    if (emulator.interrupt !== undefined) {
        return {
            error: 'Emulator is paused on an interrupt.',
            retryable: false,
            nextAction:
                'Use get_emulator_state to inspect currentInterrupt and explain what input or condition is needed.'
        }
    }

    if (action === 'undo' && !emulator.canUndo) {
        return {
            error: 'No execution history is available to undo.',
            retryable: false,
            nextAction:
                'Use step or run_to_completion first, then undo if you need to re-observe a mutation.'
        }
    }

    return null
}

function executionDetails(editorCode: string, emulator: Emulator) {
    return {
        errors: collectEmulatorErrors(emulator),
        state: formatEmulatorState(editorCode, emulator)
    }
}

function createSetCodeTool(context: DefaultCodingAgentToolContext) {
    const sharedDescription = `Creates or updates the code editor. Use this whenever the user asks you to write, fix, modify, or demonstrate runnable assembly code.
- This is the only way to update the editor; markdown code blocks do not change it.
- For existing user code, call get_code first and preserve unrelated labels, comments, and structure.
- The result reports whether assembler checks passed. If it returns compile_error, fix the reported errors before claiming success.`

    if (context.canUpdateLanguage) {
        return tool({
            name: 'set_code',
            description: `${sharedDescription}
- Always choose the assembly language that matches the code you are writing.
- If the language changes, the tool waits briefly for the matching emulator before checking the code.`,
            schema: z.object({
                language: z
                    .enum(SUPPORTED_LANGUAGES)
                    .describe('The assembly language for the editor'),
                code: z.string().describe('The full code to set in the editor')
            }),
            execute: async ({ language, code }) =>
                runAgentTool(async (toolRun) => {
                    const previousLanguage = context.getEditorLanguage()
                    const previousCode = context.getEditorCode()
                    const previousEmulator = context.getEmulator()
                    const languageChanged = previousLanguage !== language

                    context.setEditorCode(code)
                    context.setEditorLanguage(language)

                    const waitResult = languageChanged
                        ? await waitForReplacementEmulator(context, previousEmulator)
                        : { loaded: true, waitMs: 0 }
                    const emulator = context.getEmulator()

                    if (!emulator) {
                        return toolRun.success({
                            language,
                            previousLanguage,
                            languageChanged,
                            codeLength: code.length,
                            lineCount: getLineCount(code),
                            editorChanged: previousCode !== code || languageChanged,
                            emulatorSynchronized: false,
                            warning:
                                'The editor was updated, but the emulator is still loading. Call compile after it loads.'
                        })
                    }

                    emulator.clear()
                    emulator.setCode(code)
                    const checkErrors = await emulator.check()
                    const errors = collectEmulatorErrors(emulator, checkErrors)
                    if (errors.length > 0) {
                        return toolRun.failure(
                            'compile_error',
                            'Code was placed in the editor, but assembler checks found errors.',
                            {
                                retryable: false,
                                nextAction:
                                    'Fix the reported assembler errors with set_code, preserving the user request.',
                                details: {
                                    language,
                                    previousLanguage,
                                    languageChanged,
                                    codeLength: code.length,
                                    lineCount: getLineCount(code),
                                    editorChanged: previousCode !== code || languageChanged,
                                    emulatorSynchronized: waitResult.loaded,
                                    emulatorWaitMs: waitResult.waitMs,
                                    errors
                                }
                            }
                        )
                    }

                    return toolRun.success({
                        language,
                        previousLanguage,
                        languageChanged,
                        codeLength: code.length,
                        lineCount: getLineCount(code),
                        editorChanged: previousCode !== code || languageChanged,
                        emulatorSynchronized: waitResult.loaded,
                        emulatorWaitMs: waitResult.waitMs,
                        canExecute: emulator.canExecute,
                        errors: []
                    })
                })
        })
    }

    return tool({
        name: 'set_code',
        description: `${sharedDescription}
- The editor language is locked in this context, so update only the code.`,
        schema: z.object({
            code: z.string().describe('The full code to set in the editor')
        }),
        execute: async ({ code }) =>
            runAgentTool(async (toolRun) => {
                const previousCode = context.getEditorCode()
                context.setEditorCode(code)
                const emulator = context.getEmulator()

                if (!emulator) {
                    return toolRun.success({
                        language: context.getEditorLanguage(),
                        codeLength: code.length,
                        lineCount: getLineCount(code),
                        editorChanged: previousCode !== code,
                        emulatorSynchronized: false,
                        warning:
                            'The editor was updated, but the emulator is not loaded. Call compile after it loads.'
                    })
                }

                emulator.clear()
                emulator.setCode(code)
                const checkErrors = await emulator.check()
                const errors = collectEmulatorErrors(emulator, checkErrors)
                if (errors.length > 0) {
                    return toolRun.failure(
                        'compile_error',
                        'Code was placed in the editor, but assembler checks found errors.',
                        {
                            retryable: false,
                            nextAction:
                                'Fix the reported assembler errors with set_code, preserving the user request.',
                            details: {
                                language: context.getEditorLanguage(),
                                codeLength: code.length,
                                lineCount: getLineCount(code),
                                editorChanged: previousCode !== code,
                                errors
                            }
                        }
                    )
                }

                return toolRun.success({
                    language: context.getEditorLanguage(),
                    codeLength: code.length,
                    lineCount: getLineCount(code),
                    editorChanged: previousCode !== code,
                    emulatorSynchronized: true,
                    canExecute: emulator.canExecute,
                    errors: []
                })
            })
    })
}

export function createDefaultCodingAgentTools(context: DefaultCodingAgentToolContext) {
    return {
        set_code: createSetCodeTool(context),
        get_code: tool({
            name: 'get_code',
            description: `Returns the current editor language and source code with line numbers.
Use this before modifying existing code or when the user says "this code", "my program", or asks about code already in the editor.
Each line is prefixed with its 1-based line number and a "B" marker when a breakpoint is set on that line.`,
            schema: z.object({}),
            execute: async () =>
                runAgentTool(async (toolRun) => {
                    const editorCode = context.getEditorCode()
                    const breakpoints = new Set(context.getEmulator()?.breakpoints ?? [])
                    const lines = editorCode.split('\n').map((text, index) => {
                        const breakpointMarker = breakpoints.has(index) ? ' B' : '  '
                        return `${String(index + 1).padStart(4)}${breakpointMarker} | ${text}`
                    })

                    return toolRun.success({
                        language: context.getEditorLanguage(),
                        code: lines.join('\n'),
                        codeLength: editorCode.length,
                        lineCount: lines.length,
                        breakpoints: Array.from(breakpoints).map((breakpoint) => breakpoint + 1)
                    })
                })
        }),
        get_emulator_state: tool({
            name: 'get_emulator_state',
            description: `Returns the full emulator execution state.
Use this to inspect registers, flags, call stack, breakpoints, errors, execution status, stdout, and latest mutations. Call it after stepping or running only when you need fields not already returned by step or run_to_completion.`,
            schema: z.object({}),
            execute: async () =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait until the editor language has loaded, then call get_emulator_state again.'
                        })
                    }

                    const checkErrors = await emulator.check()
                    return toolRun.success({
                        errors: collectEmulatorErrors(emulator, checkErrors),
                        ...formatEmulatorState(context.getEditorCode(), emulator)
                    })
                })
        }),
        step: tool({
            name: 'step',
            description:
                'Steps the emulator forward by a given number of instructions. You MUST compile first before calling this tool. Use this for single-stepping or executing a few instructions at a time. Returns registers, pc, sp, status registers, stdout, current line, and latest mutations after stepping.',
            schema: z.object({
                steps: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe('Number of steps to execute. Defaults to 1.')
            }),
            execute: async ({ steps = 1 }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load, then compile and step again.'
                        })
                    }
                    const blocker = executionBlocker(emulator, 'execute')
                    if (blocker) {
                        return toolRun.failure('execution_state', blocker.error, {
                            retryable: blocker.retryable,
                            nextAction: blocker.nextAction,
                            details: executionDetails(context.getEditorCode(), emulator)
                        })
                    }

                    try {
                        let terminated = false
                        let stepsExecuted = 0
                        for (let stepIndex = 0; stepIndex < steps && !terminated; stepIndex++) {
                            terminated = await emulator.step()
                            stepsExecuted++
                        }
                        return toolRun.success({
                            stepsRequested: steps,
                            stepsExecuted,
                            ...formatEmulatorState(context.getEditorCode(), emulator)
                        })
                    } catch (error) {
                        return toolRun.failure('runtime_error', error, {
                            retryable: false,
                            nextAction:
                                'Use get_emulator_state and latestSteps to locate the failing instruction before editing.',
                            details: executionDetails(context.getEditorCode(), emulator)
                        })
                    }
                })
        }),
        run_to_completion: tool({
            name: 'run_to_completion',
            description:
                'Runs the program until it terminates, hits a breakpoint, reaches the instruction limit, or raises a runtime error. You MUST compile first before calling this tool. Returns final registers, pc, sp, status registers, stdout, current line, and latest mutations.',
            schema: z.object({}),
            execute: async () =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load, then compile and run again.'
                        })
                    }
                    const blocker = executionBlocker(emulator, 'execute')
                    if (blocker) {
                        return toolRun.failure('execution_state', blocker.error, {
                            retryable: blocker.retryable,
                            nextAction: blocker.nextAction,
                            details: executionDetails(context.getEditorCode(), emulator)
                        })
                    }

                    const status = await emulator.run(1000000)
                    const errors = collectEmulatorErrors(emulator)
                    if (status === InterpreterStatus.TerminatedWithException || errors.length > 0) {
                        return toolRun.failure(
                            'runtime_error',
                            errors[0] ?? `Run ended with status ${statusName(status)}.`,
                            {
                                retryable: false,
                                nextAction:
                                    'Inspect currentLine, latestSteps, stdout, and registers before changing the code.',
                                details: {
                                    status: statusName(status),
                                    errors,
                                    ...formatEmulatorState(context.getEditorCode(), emulator)
                                }
                            }
                        )
                    }

                    return toolRun.success({
                        status: statusName(status),
                        ...formatEmulatorState(context.getEditorCode(), emulator)
                    })
                })
        }),
        undo: tool({
            name: 'undo',
            description:
                'Undoes the latest execution step or steps, up to the emulator history limit. Use undo plus step 1 when you need to re-observe a mutation you missed.',
            schema: z.object({
                steps: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe('Number of steps to undo. Defaults to 1.')
            }),
            execute: async ({ steps = 1 }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load before undoing execution.'
                        })
                    }
                    const blocker = executionBlocker(emulator, 'undo')
                    if (blocker) {
                        return toolRun.failure('execution_state', blocker.error, {
                            retryable: blocker.retryable,
                            nextAction: blocker.nextAction,
                            details: executionDetails(context.getEditorCode(), emulator)
                        })
                    }

                    try {
                        emulator.undo(steps)
                        return toolRun.success({
                            stepsRequested: steps,
                            ...formatEmulatorState(context.getEditorCode(), emulator)
                        })
                    } catch (error) {
                        return toolRun.failure('runtime_error', error, {
                            retryable: false,
                            nextAction:
                                'Use get_emulator_state to inspect whether undo history is still available.',
                            details: executionDetails(context.getEditorCode(), emulator)
                        })
                    }
                })
        }),
        update_breakpoints: tool({
            name: 'update_breakpoints',
            description:
                'Adds and/or removes breakpoints on 1-based source line numbers. The emulator stops on the breakpoint line before executing that instruction. Breakpoints are effective only on lines that contain executable instructions; comments, empty lines, and other non-instruction lines will not stop execution.',
            schema: z.object({
                add: z
                    .array(z.number().int().min(1))
                    .optional()
                    .describe('1-based line numbers to add breakpoints on'),
                remove: z
                    .array(z.number().int().min(1))
                    .optional()
                    .describe('1-based line numbers to remove breakpoints from')
            }),
            execute: async ({ add = [], remove = [] }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load before changing breakpoints.'
                        })
                    }

                    const lineCount = getLineCount(context.getEditorCode())
                    const current = new Set(emulator.breakpoints)
                    const added: number[] = []
                    const removed: number[] = []
                    const ignored: number[] = []

                    for (const line of add) {
                        const lineIndex = line - 1
                        if (line > lineCount) {
                            ignored.push(line)
                            continue
                        }
                        if (!current.has(lineIndex)) {
                            emulator.toggleBreakpoint(lineIndex)
                            current.add(lineIndex)
                            added.push(line)
                        }
                    }

                    for (const line of remove) {
                        const lineIndex = line - 1
                        if (line > lineCount) {
                            ignored.push(line)
                            continue
                        }
                        if (current.has(lineIndex)) {
                            emulator.toggleBreakpoint(lineIndex)
                            current.delete(lineIndex)
                            removed.push(line)
                        }
                    }

                    return toolRun.success({
                        breakpoints: getBreakpointLines(emulator),
                        added,
                        removed,
                        ignored,
                        lineCount
                    })
                })
        }),
        get_line_from_address: tool({
            name: 'get_line_from_address',
            description:
                'Returns the source line number corresponding to a memory address. Use this to map pc values or call stack addresses back to source code.',
            schema: z.object({
                address: z
                    .string()
                    .describe('Hex string of the address, for example "0x1000" or "1000"')
            }),
            execute: async ({ address }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load before mapping addresses.'
                        })
                    }
                    const parsedAddress = parseHexAddress(address)
                    if (parsedAddress === null) {
                        return toolRun.failure('invalid_input', `Invalid hex address: ${address}`, {
                            retryable: true,
                            nextAction:
                                'Call get_line_from_address again with a hex string such as 0x1000.'
                        })
                    }

                    const lineIndex = emulator.getLineFromAddress(parsedAddress)
                    const line =
                        lineIndex != null && lineIndex >= 0
                            ? formatSourceLine(context.getEditorCode(), lineIndex)
                            : null
                    return toolRun.success({
                        address: formatNumber(parsedAddress),
                        line
                    })
                })
        }),
        compile: tool({
            name: 'compile',
            description: context.canUseSetCode
                ? 'Compiles the current editor code and resets execution state. Use this before stepping/running when canExecute is false, or after a set_code result that did not synchronize with the emulator. Returns assembler errors and whether execution can start.'
                : 'Compiles the current editor code and resets execution state. Use this to check assembler errors before running. Returns assembler errors and whether execution can start.',
            schema: z.object({}),
            execute: async () =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction: 'Wait for the editor language to load, then compile again.'
                        })
                    }

                    let thrownError: unknown = null
                    try {
                        await emulator.compile(100)
                    } catch (error) {
                        thrownError = error
                    }

                    const errors = collectEmulatorErrors(emulator)
                    if (errors.length > 0) {
                        return toolRun.failure('compile_error', errors[0], {
                            retryable: false,
                            nextAction: context.canUseSetCode
                                ? 'Fix the assembler errors with set_code, then compile or run again.'
                                : 'Report the assembler errors. Editing is not available in this context.',
                            details: {
                                errors,
                                canExecute: emulator.canExecute,
                                currentLine: formatSourceLine(
                                    context.getEditorCode(),
                                    emulator.line
                                ).line
                            }
                        })
                    }

                    if (thrownError) {
                        return toolRun.failure('runtime_error', stringifyToolError(thrownError), {
                            retryable: false,
                            nextAction:
                                'Report the compiler failure and inspect get_emulator_state for any remaining details.',
                            details: {
                                canExecute: emulator.canExecute,
                                currentLine: formatSourceLine(
                                    context.getEditorCode(),
                                    emulator.line
                                ).line
                            }
                        })
                    }

                    return toolRun.success({
                        errors: [],
                        canExecute: emulator.canExecute,
                        currentLine: formatSourceLine(context.getEditorCode(), emulator.line).line,
                        programCounter: formatNumber(emulator.pc),
                        stackPointer: formatNumber(emulator.sp)
                    })
                })
        }),
        read_memory: tool({
            name: 'read_memory',
            description:
                'Reads a region of memory from a hex address for up to 1024 bytes. Use this when registers and stdout do not explain stack, array, data-section, or memory-mapped state.',
            schema: z.object({
                address: z
                    .string()
                    .describe('Hex string of the start address, for example "0x1000" or "1000"'),
                length: z.number().int().min(1).max(1024).describe('Number of bytes to read')
            }),
            execute: async ({ address, length }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load before reading memory.'
                        })
                    }
                    const parsedAddress = parseHexAddress(address)
                    if (parsedAddress === null) {
                        return toolRun.failure('invalid_input', `Invalid hex address: ${address}`, {
                            retryable: true,
                            nextAction: 'Call read_memory again with a hex address such as 0x1000.'
                        })
                    }

                    try {
                        const bytes = emulator.readMemoryBytes(parsedAddress, length)
                        const hex = Array.from(bytes)
                            .map((byte) => byte.toString(16).padStart(2, '0'))
                            .join(' ')
                        return toolRun.success({
                            address: formatNumber(parsedAddress),
                            length,
                            hex,
                            bytes: Array.from(bytes)
                        })
                    } catch (error) {
                        return toolRun.failure('runtime_error', error, {
                            retryable: false,
                            nextAction:
                                'Check that the address belongs to a valid memory region for the active emulator.',
                            details: {
                                address,
                                length,
                                errors: collectEmulatorErrors(emulator)
                            }
                        })
                    }
                })
        })
    } satisfies Record<(typeof DEFAULT_CODING_AGENT_TOOL_NAMES)[number], RegisteredTool>
}
