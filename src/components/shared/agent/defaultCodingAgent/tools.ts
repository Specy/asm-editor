import { tool, type RegisteredTool } from '@discerns/sdk'
import { z } from 'zod'
import type { Emulator } from '$lib/languages/Emulator'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { delay } from '$lib/utils'
import { defaultEntryPath } from '$lib/Project.svelte'
import { fileText, type ProjectFile } from '$lib/projectFiles'
import {
    DEFAULT_CODING_AGENT_TOOL_NAMES,
    DEFAULT_TAKE_LINES,
    MAX_TAKE_LINES,
    SUPPORTED_LANGUAGES,
    type DefaultCodingAgentToolContext,
    type DefaultCodingAgentToolName
} from './types'
import {
    collectEmulatorDiagnostics,
    collectEmulatorErrors,
    formatEmulatorState,
    formatSourceLine,
    formatNumber
} from './formatting'
import { runAgentTool, stringifyToolError } from './toolResults'

type ExecutionBlocker = {
    error: string
    retryable: boolean
    nextAction: string
}

function getLineCount(code: string) {
    return code.length === 0 ? 1 : code.split('\n').length
}

function statusName(status: InterpreterStatus) {
    return InterpreterStatus[status] ?? String(status)
}

function parseHexAddress(address: string) {
    const trimmedAddress = address.trim()
    if (!/^(0x)?[0-9a-f]+$/i.test(trimmedAddress)) return null
    return BigInt(trimmedAddress.startsWith('0x') ? trimmedAddress : `0x${trimmedAddress}`)
}

export function getEffectiveEntry(context: DefaultCodingAgentToolContext): string {
    const lang = context.getEditorLanguage()
    return context.getEntryPath?.() ?? (lang ? defaultEntryPath(lang) : 'main.s')
}

export function getAllProjectFiles(context: DefaultCodingAgentToolContext): Record<string, string> {
    if (context.getFiles) {
        const raw = context.getFiles()
        const result: Record<string, string> = {}
        for (const [path, fileOrContent] of Object.entries(raw)) {
            if (typeof fileOrContent === 'string') {
                result[path] = fileOrContent
            } else if (
                fileOrContent &&
                typeof fileOrContent === 'object' &&
                'content' in fileOrContent
            ) {
                result[path] = fileText(fileOrContent as ProjectFile)
            }
        }
        if (Object.keys(result).length > 0) {
            return result
        }
    }
    const entry = getEffectiveEntry(context)
    const code = context.getEditorCode?.() ?? ''
    return { [entry]: code }
}

export function getFile(
    context: DefaultCodingAgentToolContext,
    path?: string
): { path: string; content: string } | null {
    const entry = getEffectiveEntry(context)
    const targetPath = path ?? context.getActivePath?.() ?? entry
    if (context.getFile) {
        const content = context.getFile(targetPath)
        if (content !== null && content !== undefined) {
            return { path: targetPath, content }
        }
    }
    const all = getAllProjectFiles(context)
    if (targetPath in all) {
        return { path: targetPath, content: all[targetPath] }
    }
    if (!path && context.getEditorCode) {
        return { path: entry, content: context.getEditorCode() }
    }
    return null
}

export function setFile(context: DefaultCodingAgentToolContext, path: string, content: string) {
    if (context.setFile) {
        context.setFile(path, content)
    } else if (context.setEditorCode) {
        context.setEditorCode(content)
    }
}

export function deleteFile(context: DefaultCodingAgentToolContext, path: string): boolean {
    if (context.deleteFile) {
        context.deleteFile(path)
        return true
    }
    return false
}

export function syncEmulator(context: DefaultCodingAgentToolContext, emulator: Emulator) {
    const all = getAllProjectFiles(context)
    const entry = getEffectiveEntry(context)
    const projectFiles: Record<string, ProjectFile> = {}
    for (const [p, c] of Object.entries(all)) {
        projectFiles[p] = { encoding: 'plain', content: c }
    }
    emulator.setSources({
        files: projectFiles,
        entry
    })
}

/**
 * Slices lines using standard 1-indexed line numbers [startLine, endLine], clamped to maxLines.
 * Returns clean, unformatted raw source lines matching standard coding harness read tools.
 */
export function sliceLinesRange(
    content: string,
    startLine = 1,
    endLine?: number,
    maxLines = MAX_TAKE_LINES
) {
    const lines = content.length === 0 ? [''] : content.split('\n')
    const lineCount = lines.length
    const clampedStart = Math.max(1, Math.min(startLine, lineCount))
    const defaultEnd = Math.min(clampedStart + DEFAULT_TAKE_LINES - 1, lineCount)
    const requestedEnd = endLine !== undefined ? Math.min(endLine, lineCount) : defaultEnd
    const clampedEnd = Math.min(requestedEnd, clampedStart + maxLines - 1)

    const sliced = lines.slice(clampedStart - 1, clampedEnd)
    const returnedLines = sliced.length
    const hasMore = clampedEnd < lineCount
    const nextStartLine = hasMore ? clampedEnd + 1 : null

    return {
        code: sliced.join('\n'),
        lineCount,
        startLine: clampedStart,
        endLine: clampedEnd,
        returnedLines,
        hasMore,
        nextStartLine
    }
}

/**
 * Performs exact string replacement in file content with optional start_line and end_line bounds.
 */
export function replaceFileContent(
    existingContent: string,
    targetContent: string,
    replacementContent: string,
    startLine?: number,
    endLine?: number
):
    | { success: true; newContent: string; lineIndex: number }
    | { success: false; error: string; occurrences?: number[] } {
    if (targetContent.length === 0) {
        return { success: false, error: 'target_content cannot be empty.' }
    }

    const lines = existingContent.split('\n')

    let searchStartIndex = 0
    let searchEndIndex = existingContent.length

    if (startLine !== undefined && startLine >= 1) {
        let charIndex = 0
        for (let i = 0; i < startLine - 1 && i < lines.length; i++) {
            charIndex += lines[i].length + 1
        }
        searchStartIndex = charIndex
    }

    if (endLine !== undefined && endLine >= 1) {
        let charIndex = 0
        for (let i = 0; i < endLine && i < lines.length; i++) {
            charIndex += lines[i].length + 1
        }
        searchEndIndex = Math.min(charIndex, existingContent.length)
    }

    const searchSubstring = existingContent.slice(searchStartIndex, searchEndIndex)

    const occurrences: number[] = []
    let pos = searchSubstring.indexOf(targetContent)
    while (pos !== -1) {
        const absolutePos = searchStartIndex + pos
        const lineNum = existingContent.slice(0, absolutePos).split('\n').length
        occurrences.push(lineNum)
        pos = searchSubstring.indexOf(targetContent, pos + 1)
    }

    if (occurrences.length === 0) {
        // Check if targetContent exists outside the window
        const globalOccurrences: number[] = []
        let gPos = existingContent.indexOf(targetContent)
        while (gPos !== -1) {
            globalOccurrences.push(existingContent.slice(0, gPos).split('\n').length)
            gPos = existingContent.indexOf(targetContent, gPos + 1)
        }

        if (globalOccurrences.length > 0) {
            return {
                success: false,
                error: `target_content was not found between lines ${startLine ?? 1} and ${endLine ?? lines.length}, but was found at line(s): ${globalOccurrences.join(', ')}. Expand or remove start_line/end_line.`,
                occurrences: globalOccurrences
            }
        }

        return {
            success: false,
            error: `target_content was not found in the file. Ensure the snippet matches exact text, comments, indentation, and newlines.`
        }
    }

    if (occurrences.length > 1) {
        return {
            success: false,
            error: `target_content matches ${occurrences.length} times in the file at lines ${occurrences.join(', ')}. Please provide more surrounding context or specify start_line and end_line bounds to make the match unique.`,
            occurrences
        }
    }

    const matchCharIndex = searchStartIndex + searchSubstring.indexOf(targetContent)
    const newContent =
        existingContent.slice(0, matchCharIndex) +
        replacementContent +
        existingContent.slice(matchCharIndex + targetContent.length)

    const matchedLineNumber = occurrences[0]
    return { success: true, newContent, lineIndex: matchedLineNumber - 1 }
}

async function waitForReplacementEmulator(
    context: DefaultCodingAgentToolContext,
    previousEmulator: Emulator | null,
    timeoutMs = 3000
) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const emulator = context.getEmulator()
        if (emulator && (previousEmulator === null || emulator !== previousEmulator)) {
            return { loaded: true, waitMs: Date.now() - startedAt }
        }
        await delay(50)
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
                'Call compile first. If compile reports errors, fix them with replace_file_content or write_to_file before trying again.'
        }
    }

    if (emulator.terminated && action === 'execute') {
        return {
            error: 'Program has already terminated.',
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

function executionDetails(context: DefaultCodingAgentToolContext, emulator: Emulator) {
    return {
        errors: collectEmulatorErrors(emulator),
        diagnostics: collectEmulatorDiagnostics(emulator),
        state: formatEmulatorState((file) => getFile(context, file)?.content ?? '', emulator)
    }
}

async function handleCodeWrite(
    context: DefaultCodingAgentToolContext,
    targetPath: string,
    newContent: string,
    languageChanged: boolean,
    previousLanguage: string | null,
    previewLine = 1,
    toolRun: any,
    previousEmulator: Emulator | null = null
) {
    setFile(context, targetPath, newContent)

    const waitResult = languageChanged
        ? await waitForReplacementEmulator(context, previousEmulator)
        : { loaded: true, waitMs: 0 }
    const emulator = context.getEmulator()

    const allFiles = getAllProjectFiles(context)
    const preview = sliceLinesRange(newContent, Math.max(1, previewLine), undefined, MAX_TAKE_LINES)

    if (!emulator) {
        return toolRun.success({
            path: targetPath,
            language: context.getEditorLanguage(),
            previousLanguage,
            languageChanged,
            code: preview.code,
            lineCount: preview.lineCount,
            startLine: preview.startLine,
            endLine: preview.endLine,
            returnedLines: preview.returnedLines,
            hasMore: preview.hasMore,
            nextStartLine: preview.nextStartLine,
            files: Object.keys(allFiles),
            emulatorSynchronized: false,
            warning:
                'The file was updated, but the emulator is still loading. Call compile after it loads.'
        })
    }

    emulator.clear()
    syncEmulator(context, emulator)
    const checkDiagnostics = await emulator.check()
    const diagnostics = collectEmulatorDiagnostics(emulator, checkDiagnostics)
    const errors = collectEmulatorErrors(emulator, checkDiagnostics)

    if (errors.length > 0) {
        return toolRun.failure(
            'compile_error',
            'Code was placed in the file, but assembler checks found errors.',
            {
                retryable: false,
                nextAction:
                    'Fix the reported assembler errors with replace_file_content, preserving the user request.',
                details: {
                    path: targetPath,
                    language: context.getEditorLanguage(),
                    previousLanguage,
                    languageChanged,
                    code: preview.code,
                    lineCount: preview.lineCount,
                    startLine: preview.startLine,
                    endLine: preview.endLine,
                    returnedLines: preview.returnedLines,
                    hasMore: preview.hasMore,
                    nextStartLine: preview.nextStartLine,
                    files: Object.keys(allFiles),
                    emulatorSynchronized: waitResult.loaded,
                    emulatorWaitMs: waitResult.waitMs,
                    errors,
                    diagnostics
                }
            }
        )
    }

    return toolRun.success({
        path: targetPath,
        language: context.getEditorLanguage(),
        previousLanguage,
        languageChanged,
        code: preview.code,
        lineCount: preview.lineCount,
        startLine: preview.startLine,
        endLine: preview.endLine,
        returnedLines: preview.returnedLines,
        hasMore: preview.hasMore,
        nextStartLine: preview.nextStartLine,
        files: Object.keys(allFiles),
        emulatorSynchronized: waitResult.loaded,
        emulatorWaitMs: waitResult.waitMs,
        canExecute: emulator.canExecute,
        errors: [],
        diagnostics
    })
}

function createViewFileTool(context: DefaultCodingAgentToolContext) {
    return tool({
        name: 'view_file',
        description: `Views source code of a file in the project.
- Specify "path" to inspect a specific file (e.g. "main.s", "sub.s"). If omitted, reads the active or entry file.
- Specify "start_line" (1-indexed) and "end_line" (inclusive) to read a specific line range.
- Returns at most ${MAX_TAKE_LINES} lines per call. Returns raw source lines. Use list_breakpoints to inspect active breakpoints.`,
        schema: z.object({
            path: z
                .string()
                .optional()
                .describe('File path to view (e.g. "main.s"). Defaults to active or entry file.'),
            start_line: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe('1-indexed starting line number. Defaults to 1.'),
            end_line: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                    `1-indexed ending line number (inclusive). Returns at most ${MAX_TAKE_LINES} lines.`
                )
        }),
        execute: async ({ path, start_line, end_line }) =>
            runAgentTool(async (toolRun) => {
                const allFiles = getAllProjectFiles(context)
                const entryPath = getEffectiveEntry(context)
                const targetPath = path ?? context.getActivePath?.() ?? entryPath

                const fileEntry = getFile(context, targetPath)
                if (!fileEntry) {
                    return toolRun.failure(
                        'invalid_input',
                        `File "${targetPath}" not found in project. Available files: ${Object.keys(allFiles).join(', ')}`,
                        {
                            retryable: false,
                            nextAction: `Call view_file with one of the available files: ${Object.keys(allFiles).join(', ')}`
                        }
                    )
                }

                const preview = sliceLinesRange(
                    fileEntry.content,
                    start_line ?? 1,
                    end_line,
                    MAX_TAKE_LINES
                )

                return toolRun.success({
                    path: targetPath,
                    language: context.getEditorLanguage(),
                    code: preview.code,
                    lineCount: preview.lineCount,
                    startLine: preview.startLine,
                    endLine: preview.endLine,
                    returnedLines: preview.returnedLines,
                    hasMore: preview.hasMore,
                    nextStartLine: preview.nextStartLine,
                    files: Object.keys(allFiles),
                    entry: entryPath
                })
            })
    })
}

function createReplaceFileContentTool(context: DefaultCodingAgentToolContext) {
    return tool({
        name: 'replace_file_content',
        description: `Edits an existing file by replacing an exact snippet of code with new code.
- "target_content" must match exact existing text, including whitespace, comments, and indentation.
- If target_content appears multiple times, provide "start_line" and "end_line" bounds to disambiguate.
- Immediately runs assembler checks and returns errors or diagnostics.`,
        schema: z.object({
            path: z
                .string()
                .optional()
                .describe(
                    'File path to edit (e.g. "main.s", "sub.s"). Defaults to active or entry file.'
                ),
            target_content: z
                .string()
                .describe(
                    'The exact string to be replaced. Must match exactly including whitespace.'
                ),
            replacement_content: z
                .string()
                .describe('The new content to replace target_content with.'),
            start_line: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe('Optional 1-indexed line number to restrict search start.'),
            end_line: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe('Optional 1-indexed line number to restrict search end.')
        }),
        execute: async ({ path, target_content, replacement_content, start_line, end_line }) =>
            runAgentTool(async (toolRun) => {
                const targetPath = path ?? context.getActivePath?.() ?? getEffectiveEntry(context)
                const existing = getFile(context, targetPath)
                if (!existing) {
                    const allFiles = getAllProjectFiles(context)
                    return toolRun.failure(
                        'invalid_input',
                        `File "${targetPath}" does not exist. Use write_to_file to create new files. Available files: ${Object.keys(allFiles).join(', ')}`,
                        {
                            retryable: false,
                            nextAction: 'Use write_to_file if you intend to create a new file.'
                        }
                    )
                }

                const replaceResult = replaceFileContent(
                    existing.content,
                    target_content,
                    replacement_content,
                    start_line,
                    end_line
                )
                if (!replaceResult.success) {
                    return toolRun.failure('invalid_input', replaceResult.error, {
                        retryable: true,
                        nextAction:
                            'Call view_file to inspect the exact lines and whitespace, then retry replace_file_content.'
                    })
                }

                return handleCodeWrite(
                    context,
                    targetPath,
                    replaceResult.newContent,
                    false,
                    context.getEditorLanguage(),
                    replaceResult.lineIndex + 1,
                    toolRun
                )
            })
    })
}

function createWriteToFileTool(context: DefaultCodingAgentToolContext) {
    const schema = z.object({
        path: z
            .string()
            .optional()
            .describe(
                'File path to write (e.g. "main.s", "sub.s"). Defaults to active or entry file.'
            ),
        code: z.string().describe('The full code to write to the file.'),
        language: z
            .enum(SUPPORTED_LANGUAGES)
            .optional()
            .describe('The assembly language for the editor (when language can be updated)')
    })

    return tool({
        name: 'write_to_file',
        description: `Creates a new file or completely writes an existing file.
- Use this when creating fresh files or when rewriting an entire file.
- For targeted modifications to existing code, prefer replace_file_content.
- Immediately runs assembler checks and reports compile errors if any.`,
        schema,
        execute: async (args) =>
            runAgentTool(async (toolRun) => {
                const { path, code } = args as { path?: string; code: string }
                const requestedLanguage = (
                    args as { language?: (typeof SUPPORTED_LANGUAGES)[number] }
                ).language
                const targetPath = path ?? context.getActivePath?.() ?? getEffectiveEntry(context)

                const previousLanguage = context.getEditorLanguage()
                const previousEmulator = context.getEmulator()
                const languageChanged =
                    context.canUpdateLanguage &&
                    requestedLanguage !== undefined &&
                    previousLanguage !== requestedLanguage

                if (languageChanged && requestedLanguage) {
                    context.setEditorLanguage(requestedLanguage)
                }

                return handleCodeWrite(
                    context,
                    targetPath,
                    code,
                    languageChanged,
                    previousLanguage,
                    1,
                    toolRun,
                    previousEmulator
                )
            })
    })
}

function createListBreakpointsTool(context: DefaultCodingAgentToolContext) {
    return tool({
        name: 'list_breakpoints',
        description:
            'Lists active breakpoints with surrounding code (previous and next 3 instructions/lines) for each breakpoint, explicitly marking which line has the breakpoint.',
        schema: z.object({
            path: z
                .string()
                .optional()
                .describe(
                    'Optional file path to filter breakpoints for (e.g. "main.s"). If omitted, returns breakpoints across all files.'
                )
        }),
        execute: async ({ path }) =>
            runAgentTool(async (toolRun) => {
                const emulator = context.getEmulator()
                if (!emulator) {
                    return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                        retryable: true,
                        nextAction:
                            'Wait for the editor language to load before inspecting breakpoints.'
                    })
                }

                const entry = getEffectiveEntry(context)
                const filteredBreakpoints = (emulator.breakpoints ?? []).filter((breakpoint) => {
                    if (!path) return true
                    const bpFile = breakpoint.file ?? entry
                    return bpFile === path
                })

                const items = filteredBreakpoints.map((breakpoint) => {
                    const bpFile = breakpoint.file ?? entry
                    const fileObj = getFile(context, bpFile)
                    const content = fileObj?.content ?? ''
                    const lines = content.length === 0 ? [''] : content.split('\n')
                    const lineNum = breakpoint.line + 1
                    const totalLines = lines.length

                    const startContextLine = Math.max(1, lineNum - 3)
                    const endContextLine = Math.min(totalLines, lineNum + 3)

                    const contextLines: Array<{
                        line: number
                        text: string
                        isBreakpoint: boolean
                    }> = []
                    const snippetLines: string[] = []

                    for (let l = startContextLine; l <= endContextLine; l++) {
                        const text = lines[l - 1] ?? ''
                        const isBp = l === lineNum
                        contextLines.push({
                            line: l,
                            text,
                            isBreakpoint: isBp
                        })
                        const prefix = isBp ? '=> ' : '   '
                        const suffix = isBp ? '  <-- [BREAKPOINT]' : ''
                        snippetLines.push(`${prefix}${String(l).padStart(4)} | ${text}${suffix}`)
                    }

                    return {
                        file: bpFile,
                        line: lineNum,
                        isOutOfBounds: lineNum > totalLines || lineNum < 1,
                        snippet: snippetLines.join('\n'),
                        context: contextLines
                    }
                })

                return toolRun.success({
                    path: path ?? null,
                    count: items.length,
                    breakpoints: items
                })
            })
    })
}

export function createDefaultCodingAgentTools(context: DefaultCodingAgentToolContext) {
    const viewFileTool = createViewFileTool(context)
    const replaceFileContentTool = createReplaceFileContentTool(context)
    const writeToFileTool = createWriteToFileTool(context)
    const listBreakpointsTool = createListBreakpointsTool(context)

    return {
        view_file: viewFileTool,
        replace_file_content: replaceFileContentTool,
        write_to_file: writeToFileTool,
        list_files: tool({
            name: 'list_files',
            description:
                'Lists all files in the current assembly project with their line counts, sizes, and which file is the entry file.',
            schema: z.object({}),
            execute: async () =>
                runAgentTool(async (toolRun) => {
                    const allFiles = getAllProjectFiles(context)
                    const entry = getEffectiveEntry(context)
                    const files = Object.entries(allFiles).map(([p, text]) => ({
                        path: p,
                        lineCount: text.length === 0 ? 1 : text.split('\n').length,
                        size: text.length,
                        isEntry: p === entry
                    }))

                    return toolRun.success({
                        files,
                        entry,
                        language: context.getEditorLanguage()
                    })
                })
        }),
        delete_file: tool({
            name: 'delete_file',
            description:
                'Deletes a file from the project. Cannot delete the entry file if it is the only file.',
            schema: z.object({
                path: z.string().describe('The file path to delete.')
            }),
            execute: async ({ path }) =>
                runAgentTool(async (toolRun) => {
                    const allFiles = getAllProjectFiles(context)
                    const entry = getEffectiveEntry(context)

                    if (!(path in allFiles)) {
                        return toolRun.failure('invalid_input', `File "${path}" does not exist.`, {
                            retryable: false,
                            nextAction: `Available files: ${Object.keys(allFiles).join(', ')}`
                        })
                    }

                    if (path === entry && Object.keys(allFiles).length <= 1) {
                        return toolRun.failure(
                            'invalid_input',
                            `Cannot delete "${path}" because it is the sole entry file.`,
                            {
                                retryable: false,
                                nextAction:
                                    'Create another file or edit the existing file instead of deleting it.'
                            }
                        )
                    }

                    deleteFile(context, path)

                    const emulator = context.getEmulator()
                    if (emulator) {
                        syncEmulator(context, emulator)
                        const checkDiagnostics = await emulator.check()
                        const diagnostics = collectEmulatorDiagnostics(emulator, checkDiagnostics)
                        const errors = collectEmulatorErrors(emulator, checkDiagnostics)

                        return toolRun.success({
                            deleted: path,
                            remainingFiles: Object.keys(getAllProjectFiles(context)),
                            diagnostics,
                            errors
                        })
                    }

                    return toolRun.success({
                        deleted: path,
                        remainingFiles: Object.keys(getAllProjectFiles(context))
                    })
                })
        }),
        list_breakpoints: listBreakpointsTool,
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

                    const checkDiagnostics = await emulator.check()
                    return toolRun.success({
                        errors: collectEmulatorErrors(emulator, checkDiagnostics),
                        diagnostics: collectEmulatorDiagnostics(emulator, checkDiagnostics),
                        ...formatEmulatorState(
                            (file) => getFile(context, file)?.content ?? '',
                            emulator
                        )
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
                            details: executionDetails(context, emulator)
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
                            ...formatEmulatorState(
                                (file) => getFile(context, file)?.content ?? '',
                                emulator
                            )
                        })
                    } catch (error) {
                        return toolRun.failure('runtime_error', error, {
                            retryable: false,
                            nextAction:
                                'Use get_emulator_state and latestSteps to locate the failing instruction before editing.',
                            details: executionDetails(context, emulator)
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
                            details: executionDetails(context, emulator)
                        })
                    }

                    const status = await emulator.run(1000000)
                    const errors = collectEmulatorErrors(emulator)
                    const diagnostics = collectEmulatorDiagnostics(emulator)
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
                                    diagnostics,
                                    ...formatEmulatorState(
                                        (file) => getFile(context, file)?.content ?? '',
                                        emulator
                                    )
                                }
                            }
                        )
                    }

                    return toolRun.success({
                        status: statusName(status),
                        diagnostics,
                        ...formatEmulatorState(
                            (file) => getFile(context, file)?.content ?? '',
                            emulator
                        )
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
                            details: executionDetails(context, emulator)
                        })
                    }

                    try {
                        emulator.undo(steps)
                        return toolRun.success({
                            stepsRequested: steps,
                            ...formatEmulatorState(
                                (file) => getFile(context, file)?.content ?? '',
                                emulator
                            )
                        })
                    } catch (error) {
                        return toolRun.failure('runtime_error', error, {
                            retryable: false,
                            nextAction:
                                'Use get_emulator_state to inspect whether undo history is still available.',
                            details: executionDetails(context, emulator)
                        })
                    }
                })
        }),
        update_breakpoints: tool({
            name: 'update_breakpoints',
            description:
                'Adds and/or removes breakpoints on 1-based source line numbers in a specific file. The emulator stops on the breakpoint line before executing that instruction.',
            schema: z.object({
                path: z
                    .string()
                    .optional()
                    .describe(
                        'The file path to update breakpoints for. Defaults to current execution file or entry file.'
                    ),
                add: z
                    .array(z.number().int().min(1))
                    .optional()
                    .describe('1-based line numbers to add breakpoints on'),
                remove: z
                    .array(z.number().int().min(1))
                    .optional()
                    .describe('1-based line numbers to remove breakpoints from')
            }),
            execute: async ({ path, add = [], remove = [] }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load before changing breakpoints.'
                        })
                    }

                    const targetPath = path ?? emulator.currentFile ?? getEffectiveEntry(context)
                    const targetFile = getFile(context, targetPath)
                    const lineCount = targetFile ? getLineCount(targetFile.content) : 1000

                    const current = new Set(
                        emulator.breakpoints
                            .filter(
                                (breakpoint) => !breakpoint.file || breakpoint.file === targetPath
                            )
                            .map((breakpoint) => breakpoint.line)
                    )
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
                            emulator.toggleBreakpoint(lineIndex, targetPath)
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
                            emulator.toggleBreakpoint(lineIndex, targetPath)
                            current.delete(lineIndex)
                            removed.push(line)
                        }
                    }

                    const fileBreakpoints = emulator.breakpoints
                        .filter((breakpoint) => !breakpoint.file || breakpoint.file === targetPath)
                        .map((breakpoint) => breakpoint.line + 1)

                    return toolRun.success({
                        path: targetPath,
                        breakpoints: fileBreakpoints,
                        allBreakpoints: emulator.breakpoints.map((b) => ({
                            file: b.file,
                            line: b.line + 1
                        })),
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
                'Returns the source line number and file corresponding to a memory address. Use this to map pc values or call stack addresses back to source code.',
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

                    const location = emulator.getSourceLocationFromAddress?.(parsedAddress)
                    const targetFile =
                        location?.file ?? emulator.currentFile ?? getEffectiveEntry(context)
                    const lineIndex = location
                        ? location.line
                        : emulator.getLineFromAddress(parsedAddress)

                    const fileContent = getFile(context, targetFile)?.content ?? ''
                    const line =
                        lineIndex != null && lineIndex >= 0
                            ? formatSourceLine(fileContent, lineIndex, targetFile)
                            : null

                    return toolRun.success({
                        address: formatNumber(parsedAddress),
                        file: targetFile,
                        line: line?.line ?? null,
                        lineNumber: line?.lineNumber ?? null
                    })
                })
        }),
        compile: tool({
            name: 'compile',
            description: context.canEditCode
                ? 'Compiles all project files and resets execution state. Use this before stepping/running when canExecute is false, or after modifying files. Returns assembler errors, non-blocking diagnostics, and whether execution can start.'
                : 'Compiles all project files and resets execution state. Use this to check assembler errors before running. Returns assembler errors, non-blocking diagnostics, and whether execution can start.',
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

                    syncEmulator(context, emulator)

                    let thrownError: unknown = null
                    try {
                        const all = getAllProjectFiles(context)
                        const entry = getEffectiveEntry(context)
                        const projectFiles: Record<string, ProjectFile> = {}
                        for (const [p, c] of Object.entries(all)) {
                            projectFiles[p] = { encoding: 'plain', content: c }
                        }
                        await emulator.compile(100, { files: projectFiles, entry })
                    } catch (error) {
                        thrownError = error
                    }

                    const errors = collectEmulatorErrors(emulator)
                    const diagnostics = collectEmulatorDiagnostics(emulator)
                    const currentFile = emulator.currentFile ?? getEffectiveEntry(context)
                    const currentFileContent = getFile(context, currentFile)?.content ?? ''

                    if (errors.length > 0) {
                        return toolRun.failure('compile_error', errors[0], {
                            retryable: false,
                            nextAction: context.canEditCode
                                ? 'Fix the assembler errors with replace_file_content or write_to_file, then compile or run again.'
                                : 'Report the assembler errors. Editing is not available in this context.',
                            details: {
                                errors,
                                diagnostics,
                                canExecute: emulator.canExecute,
                                currentFile,
                                currentLine: formatSourceLine(
                                    currentFileContent,
                                    emulator.line,
                                    currentFile
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
                                currentFile,
                                currentLine: formatSourceLine(
                                    currentFileContent,
                                    emulator.line,
                                    currentFile
                                ).line
                            }
                        })
                    }

                    return toolRun.success({
                        errors: [],
                        diagnostics,
                        canExecute: emulator.canExecute,
                        currentFile,
                        currentLine: formatSourceLine(
                            currentFileContent,
                            emulator.line,
                            currentFile
                        ).line,
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
    } satisfies Record<DefaultCodingAgentToolName, RegisteredTool>
}
