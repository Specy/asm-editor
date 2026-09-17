import { tool, type RegisteredTool } from '@discerns/sdk'
import { z } from 'zod'
import type { Emulator } from '$lib/languages/Emulator'
import {
    InterpreterStatus,
    type RegisterFile,
    type RegisterSize
} from '$lib/languages/commonLanguageFeatures.svelte'
import { CPU_REGISTER_FILE_ID } from '$lib/languages/GenericEmulator.svelte'
import { delay } from '$lib/utils'
import { defaultEntryPath } from '$lib/Project.svelte'
import { fileText, type ProjectFile } from '$lib/projectFiles'
import {
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
    type FormatEmulatorStateOptions,
    formatHexBytes,
    formatSourceLine,
    formatNumber
} from './formatting'
import { runAgentTool, stringifyToolError, type ToolRunContext } from './toolResults'

type ExecutionBlocker = {
    error: string
    retryable: boolean
    nextAction: string
}

function statusName(status: InterpreterStatus) {
    return InterpreterStatus[status] ?? String(status)
}

function parseHexAddress(address: string) {
    const trimmedAddress = address.trim()
    if (!/^(0x)?[0-9a-f]+$/i.test(trimmedAddress)) return null
    return BigInt(trimmedAddress.startsWith('0x') ? trimmedAddress : `0x${trimmedAddress}`)
}

/**
 * The program counter as the languages spell it, for the refusal message only: the Emulator owns
 * the rule that a Poke never writes it ([the design record](../../../../../docs/design/pokes.md)),
 * this list is what lets the tool say which register the model reached for.
 */
const PROGRAM_COUNTER_NAMES = ['pc', 'rip']

function findRegisterFile(emulator: Emulator, fileId: string): RegisterFile | undefined {
    return (emulator.registerFiles ?? []).find((file) => file.id === fileId)
}

function registerRowIndex(file: RegisterFile, register: string): number {
    return file.layout.findIndex((row) => row.name === register)
}

/**
 * The register as the Register file spells it, so a model that writes `d0` where the 68000 panel
 * says `D0` still reaches the row it meant. Null when the file draws no such register.
 */
function resolveRegisterName(file: RegisterFile, register: string): string | null {
    const wanted = register.trim()
    if (registerRowIndex(file, wanted) !== -1) return wanted
    const lowered = wanted.toLowerCase()
    return file.layout.find((row) => row.name.toLowerCase() === lowered)?.name ?? null
}

/**
 * How wide that row is, in bits, which is the width a poked value has to fit. The CPU file is asked
 * for the width the register ended up with rather than the one the file declares, because an
 * adapter may narrow a register after the file is built (the Z80's byte wide `a`); this is the same
 * width `GenericEmulator.pokeRegisters` checks against.
 */
function registerBits(file: RegisterFile, index: number): bigint {
    const narrowed = file.id === CPU_REGISTER_FILE_ID ? file.registers[index]?.size : undefined
    return 8n * BigInt(narrowed ?? file.layout[index].size)
}

function registerSizeOf(file: RegisterFile, index: number): RegisterSize {
    return Number(file.registers[index]?.size ?? file.layout[index].size) as RegisterSize
}

/**
 * Why the Emulator will not take this register, in words the model can act on: the program counter
 * is not a value to change, a hidden register is one the Core cannot set, and an empty x87 stack
 * slot holds nothing to poke.
 */
function registerPokeRefusal(
    emulator: Emulator,
    file: RegisterFile,
    register: string
): string | null {
    if (emulator.canPokeRegister(file.id, register)) return null
    if (file.id === CPU_REGISTER_FILE_ID) {
        if (PROGRAM_COUNTER_NAMES.includes(register.toLowerCase())) {
            return `${register} is the program counter, which is never poked: moving it is a jump, not a value change.`
        }
        if ((emulator.hiddenRegisters ?? []).includes(register)) {
            return `${register} is hidden and cannot be poked; the emulator has no setter for it.`
        }
        if (!(emulator.startingRegisterNames ?? []).includes(register)) {
            return `${register} is read only: the emulator cannot set it.`
        }
    }
    const index = registerRowIndex(file, register)
    if (index !== -1 && file.blanks?.[index]) {
        return `${register} is an empty stack slot right now and holds no value to poke.`
    }
    return `${register} cannot be poked.`
}

/**
 * A poked value as the model writes it: hex with `0x`, or decimal, either one signed. A negative
 * number lands as the two's complement pattern of that register's width, which is the unsigned bit
 * pattern the panels and the Emulator work in.
 */
function parsePokeValue(
    raw: string,
    register: string,
    bits: bigint
): { value: bigint } | { error: string } {
    const trimmed = raw.trim()
    const negative = trimmed.startsWith('-')
    const magnitudeText = negative || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed
    const isHex = /^0x[0-9a-f]+$/i.test(magnitudeText)
    const isDecimal = /^[0-9]+$/.test(magnitudeText)
    if (!isHex && !isDecimal) {
        return {
            error: `Invalid value "${raw}". Write hex as 0x1f or decimal as 31, either one negative.`
        }
    }
    const magnitude = BigInt(magnitudeText)
    const limit = 1n << bits
    const tooWide = {
        error:
            `${trimmed} does not fit ${register}, which is ${bits} bits wide: ` +
            `it holds 0 to 0x${(limit - 1n).toString(16)} unsigned, ` +
            `${-(limit >> 1n)} to ${(limit >> 1n) - 1n} signed.`
    }
    if (!negative) return magnitude < limit ? { value: magnitude } : tooWide
    if (magnitude > limit >> 1n) return tooWide
    return { value: (limit - magnitude) & (limit - 1n) }
}

/** The bytes of a memory Poke: two hex digits a byte, spaces wherever the model likes them. */
function parsePokeBytes(raw: string): { bytes: Uint8Array } | { error: string } {
    const digits = raw.replace(/\s+/g, '')
    if (digits.length === 0) {
        return { error: 'No bytes to poke. Write them as hex digits, two per byte, like "de ad".' }
    }
    if (!/^[0-9a-f]+$/i.test(digits)) {
        return {
            error: `Invalid bytes "${raw}". Write hex digits only, two per byte, like "de ad".`
        }
    }
    if (digits.length % 2 !== 0) {
        return {
            error: `"${raw}" has ${digits.length} hex digits, an odd count: a byte is two digits.`
        }
    }
    const bytes = new Uint8Array(digits.length / 2)
    for (let index = 0; index < bytes.length; index++) {
        bytes[index] = Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16)
    }
    return { bytes }
}

/**
 * What a Poke result has to say beyond its numbers: a value that was already there is no change, so
 * nothing is recorded, and a Poke made with the history Setting at 0 applies but cannot be undone,
 * exactly as an instruction cannot ([ADR 0022](../../../../../docs/adr/0022-core-native-poke-records.md)).
 */
function pokeNote(changed: boolean, recorded: boolean): string | undefined {
    if (!changed) return 'That value was already there, so nothing was poked and nothing recorded.'
    if (!recorded) {
        return 'The Poke was applied, but this emulator keeps no history, so it cannot be undone.'
    }
    return undefined
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

/**
 * What stops a Poke: everything that stops a Step, plus the Core being busy. A Poke is a
 * synchronous Core operation like Undo, so a Run, Step or input handler that still owns the Core
 * refuses it ([the design record](../../../../../docs/design/pokes.md)).
 */
function pokeBlocker(emulator: Emulator): ExecutionBlocker | null {
    const blocker = executionBlocker(emulator, 'execute')
    if (blocker) return blocker
    if (!emulator.canPoke) {
        return {
            error: 'Cannot poke. The emulator is busy running, stepping, or waiting on the core.',
            retryable: true,
            nextAction:
                'Let the current run or step finish, or pause it, then poke and step from there.'
        }
    }
    return null
}

/**
 * The Emulator's state as the tools report it: the project's files resolve through the context, and
 * the editor's Target comes along so that a reported width is named the way that architecture names
 * it rather than the way the 68000 does.
 */
function emulatorState(
    context: DefaultCodingAgentToolContext,
    emulator: Emulator,
    options: FormatEmulatorStateOptions = {}
) {
    return formatEmulatorState((file) => getFile(context, file)?.content ?? '', emulator, {
        language: context.getEditorLanguage(),
        ...options
    })
}

function executionDetails(context: DefaultCodingAgentToolContext, emulator: Emulator) {
    return {
        errors: collectEmulatorErrors(emulator),
        diagnostics: collectEmulatorDiagnostics(emulator),
        state: emulatorState(context, emulator)
    }
}

async function handleCodeWrite(
    context: DefaultCodingAgentToolContext,
    targetPath: string,
    newContent: string,
    languageChanged: boolean,
    previousLanguage: string | null,
    previewLine = 1,
    toolRun: ToolRunContext,
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

                    const snippetInfo = formatBreakpointSnippet(lines, lineNum)
                    return {
                        file: bpFile,
                        line: lineNum,
                        isOutOfBounds: snippetInfo.isOutOfBounds,
                        snippet: snippetInfo.snippet,
                        context: snippetInfo.context
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

function formatBreakpointSnippet(
    lines: string[],
    lineNum: number
): {
    snippet: string
    context: Array<{ line: number; text: string; isBreakpoint: boolean }>
    isOutOfBounds: boolean
} {
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
        snippet: snippetLines.join('\n'),
        context: contextLines,
        isOutOfBounds: lineNum > totalLines || lineNum < 1
    }
}

function resolveBreakpointLocation(
    context: DefaultCodingAgentToolContext,
    emulator: Emulator,
    params: {
        path?: string
        instruction?: string
        address?: string
        line?: number
    }
):
    | {
          success: true
          targetPath: string
          lineNum: number
          lines: string[]
      }
    | {
          success: false
          error: string
      } {
    const { path, instruction, address, line } = params

    if (!instruction && !address && line === undefined) {
        return {
            success: false,
            error: 'Must specify at least one locator: "instruction", "address", or "line".'
        }
    }

    // 1. Address resolution
    if (address !== undefined) {
        const parsedAddress = parseHexAddress(address)
        if (parsedAddress === null) {
            return {
                success: false,
                error: `Invalid address format: "${address}". Expected hex string like "0x1000".`
            }
        }

        const sourceLoc = emulator.getSourceLocationFromAddress
            ? emulator.getSourceLocationFromAddress(parsedAddress)
            : null

        const entry = getEffectiveEntry(context)
        let resolvedFile = path ?? sourceLoc?.file ?? emulator.currentFile ?? entry
        let resolvedLine: number | null = null

        if (sourceLoc && sourceLoc.line >= 0) {
            resolvedLine = sourceLoc.line + 1
            if (sourceLoc.file) resolvedFile = sourceLoc.file
        } else if (emulator.getLineFromAddress) {
            const l = emulator.getLineFromAddress(parsedAddress)
            if (l >= 0) resolvedLine = l + 1
        }

        if (resolvedLine === null) {
            return {
                success: false,
                error: `Could not resolve address "${address}" to a source line in the program.`
            }
        }

        const fileObj = getFile(context, resolvedFile)
        if (!fileObj) {
            return {
                success: false,
                error: `File "${resolvedFile}" not found in project.`
            }
        }

        const lines = fileObj.content.length === 0 ? [''] : fileObj.content.split('\n')
        return {
            success: true,
            targetPath: resolvedFile,
            lineNum: resolvedLine,
            lines
        }
    }

    // Determine target file
    const allFiles = getAllProjectFiles(context)
    const targetPath =
        path ?? context.getActivePath?.() ?? emulator.currentFile ?? getEffectiveEntry(context)
    const fileObj = getFile(context, targetPath)
    if (!fileObj) {
        return {
            success: false,
            error: `File "${targetPath}" not found in project. Available files: ${Object.keys(allFiles).join(', ')}`
        }
    }

    const lines = fileObj.content.length === 0 ? [''] : fileObj.content.split('\n')

    // 2. Instruction matching
    if (instruction !== undefined) {
        const needle = instruction.trim()
        if (needle.length === 0) {
            return {
                success: false,
                error: 'instruction cannot be empty.'
            }
        }

        // Substring occurrences in content
        const occurrences: number[] = []
        let pos = fileObj.content.indexOf(needle)
        while (pos !== -1) {
            const lineNum = fileObj.content.slice(0, pos).split('\n').length
            occurrences.push(lineNum)
            pos = fileObj.content.indexOf(needle, pos + 1)
        }

        if (occurrences.length === 1) {
            return {
                success: true,
                targetPath,
                lineNum: occurrences[0],
                lines
            }
        }

        if (occurrences.length > 1) {
            return {
                success: false,
                error: `instruction "${needle}" matches ${occurrences.length} times in "${targetPath}" at line(s): ${occurrences.join(', ')}. Please provide more surrounding text or specify "line" to disambiguate.`
            }
        }

        // Fallback: check trimmed line matching
        const trimmedMatches: number[] = []
        lines.forEach((l, idx) => {
            const trimmed = l.trim()
            if (trimmed === needle || trimmed.startsWith(needle)) {
                trimmedMatches.push(idx + 1)
            }
        })

        if (trimmedMatches.length === 1) {
            return {
                success: true,
                targetPath,
                lineNum: trimmedMatches[0],
                lines
            }
        }

        if (trimmedMatches.length > 1) {
            return {
                success: false,
                error: `instruction "${needle}" matches ${trimmedMatches.length} lines in "${targetPath}" at line(s): ${trimmedMatches.join(', ')}. Please provide more surrounding text or specify "line" to disambiguate.`
            }
        }

        return {
            success: false,
            error: `instruction "${needle}" was not found in file "${targetPath}".`
        }
    }

    // 3. Line number validation
    if (line !== undefined) {
        if (line < 1 || line > lines.length) {
            return {
                success: false,
                error: `Line ${line} is out of bounds for "${targetPath}" (${lines.length} lines).`
            }
        }
        return {
            success: true,
            targetPath,
            lineNum: line,
            lines
        }
    }

    return {
        success: false,
        error: 'Must specify at least one locator: "instruction", "address", or "line".'
    }
}

function createSetBreakpointTool(context: DefaultCodingAgentToolContext) {
    return tool({
        name: 'set_breakpoint',
        description:
            'Sets an active breakpoint by instruction text, address, or 1-based line number. The emulator stops before executing that instruction. Returns the resolved location and a snippet of surrounding code.',
        schema: z.object({
            path: z
                .string()
                .optional()
                .describe(
                    'The file path to set the breakpoint in (e.g. "main.s"). Defaults to active or entry file.'
                ),
            instruction: z
                .string()
                .optional()
                .describe(
                    'Instruction text or code snippet to break at (e.g. "bne $t1, $t2, loop", "syscall", "rts").'
                ),
            address: z
                .string()
                .optional()
                .describe('Hex address to break at (e.g. "0x1000", "0x00400020").'),
            line: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe('1-based line number to break at (optional fallback).')
        }),
        execute: async ({ path, instruction, address, line }) =>
            runAgentTool(async (toolRun) => {
                const emulator = context.getEmulator()
                if (!emulator) {
                    return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                        retryable: true,
                        nextAction:
                            'Wait for the editor language to load before setting breakpoints.'
                    })
                }

                const resolution = resolveBreakpointLocation(context, emulator, {
                    path,
                    instruction,
                    address,
                    line
                })
                if (!resolution.success) {
                    return toolRun.failure('invalid_input', resolution.error, {
                        retryable: true,
                        nextAction:
                            'Call view_file or list_breakpoints to check the instructions and file names.'
                    })
                }

                const { targetPath, lineNum, lines } = resolution
                const lineIndex = lineNum - 1

                const alreadySet = (emulator.breakpoints ?? []).some(
                    (b) =>
                        (b.file ?? getEffectiveEntry(context)) === targetPath &&
                        b.line === lineIndex
                )

                if (!alreadySet) {
                    emulator.toggleBreakpoint(lineIndex, targetPath)
                }

                const snippetInfo = formatBreakpointSnippet(lines, lineNum)

                return toolRun.success({
                    file: targetPath,
                    line: lineNum,
                    alreadySet,
                    snippet: snippetInfo.snippet,
                    context: snippetInfo.context,
                    totalBreakpoints: emulator.breakpoints.length
                })
            })
    })
}

function createRemoveBreakpointTool(context: DefaultCodingAgentToolContext) {
    return tool({
        name: 'remove_breakpoint',
        description:
            'Removes an active breakpoint by instruction text, address, line number, or removes all breakpoints if all: true.',
        schema: z.object({
            path: z
                .string()
                .optional()
                .describe(
                    'The file path to remove breakpoints from. If omitted and all: true, clears all breakpoints in the project.'
                ),
            instruction: z
                .string()
                .optional()
                .describe(
                    'Instruction text or code snippet of the breakpoint to remove (e.g. "bne $t1, $t2, loop").'
                ),
            address: z
                .string()
                .optional()
                .describe('Hex address of the breakpoint to remove (e.g. "0x1000").'),
            line: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe('1-based line number of the breakpoint to remove.'),
            all: z
                .boolean()
                .optional()
                .describe(
                    'If true, removes all breakpoints in the file (or across all files if path is omitted).'
                )
        }),
        execute: async ({ path, instruction, address, line, all }) =>
            runAgentTool(async (toolRun) => {
                const emulator = context.getEmulator()
                if (!emulator) {
                    return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                        retryable: true,
                        nextAction:
                            'Wait for the editor language to load before removing breakpoints.'
                    })
                }

                const entry = getEffectiveEntry(context)

                if (all) {
                    const toRemove = [...emulator.breakpoints].filter((b) => {
                        if (!path) return true
                        const bFile = b.file ?? entry
                        return bFile === path
                    })

                    for (const b of toRemove) {
                        emulator.toggleBreakpoint(b.line, b.file ?? entry)
                    }

                    return toolRun.success({
                        all: true,
                        path: path ?? null,
                        removedCount: toRemove.length,
                        remainingBreakpoints: emulator.breakpoints.length
                    })
                }

                const resolution = resolveBreakpointLocation(context, emulator, {
                    path,
                    instruction,
                    address,
                    line
                })
                if (!resolution.success) {
                    return toolRun.failure('invalid_input', resolution.error, {
                        retryable: true,
                        nextAction: 'Call list_breakpoints to see active breakpoints.'
                    })
                }

                const { targetPath, lineNum } = resolution
                const lineIndex = lineNum - 1

                const isSet = (emulator.breakpoints ?? []).some(
                    (b) => (b.file ?? entry) === targetPath && b.line === lineIndex
                )

                if (isSet) {
                    emulator.toggleBreakpoint(lineIndex, targetPath)
                }

                return toolRun.success({
                    file: targetPath,
                    line: lineNum,
                    removed: isSet,
                    remainingBreakpoints: emulator.breakpoints.length
                })
            })
    })
}

export function createDefaultCodingAgentTools(context: DefaultCodingAgentToolContext) {
    const viewFileTool = createViewFileTool(context)
    const replaceFileContentTool = createReplaceFileContentTool(context)
    const writeToFileTool = createWriteToFileTool(context)
    const listBreakpointsTool = createListBreakpointsTool(context)
    const setBreakpointTool = createSetBreakpointTool(context)
    const removeBreakpointTool = createRemoveBreakpointTool(context)

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
        set_breakpoint: setBreakpointTool,
        remove_breakpoint: removeBreakpointTool,
        get_emulator_state: tool({
            name: 'get_emulator_state',
            description: `Returns the full emulator execution state.
Use this to inspect registers, flags, call stack, breakpoints, errors, execution status, stdout, and latest mutations. This is the only tool that returns every Register file in full: registerFiles lists each floating-point, coprocessor and control/status register of the language, zero or not, with an empty x87 stack slot reading empty, so use it whenever you need floating-point, SSE, x87, CP0 or CSR state that step or run_to_completion did not list. Call it after stepping or running only when you need fields not already returned by them.`,
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
                        //the full refresh is where every Register file is reported whole; the
                        //execution tools report only what is not zero in them
                        ...emulatorState(context, emulator, { registerFiles: 'full' })
                    })
                })
        }),
        step: tool({
            name: 'step',
            description:
                'Steps the emulator forward by a given number of instructions. You MUST compile first before calling this tool. Use this for single-stepping or executing a few instructions at a time. Returns registers, pc, sp, status registers, stdout, current line, and latest mutations after stepping. Of the other Register files (registerFiles) it lists only the registers that are not zero and not an empty x87 stack slot, so call get_emulator_state when you need one of those files in full.',
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
                            ...emulatorState(context, emulator)
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
                'Runs the program until it terminates, hits a breakpoint, reaches the instruction limit, or raises a runtime error. You MUST compile first before calling this tool. Returns final registers, pc, sp, status registers, stdout, current line, and latest mutations. Of the other Register files (registerFiles) it lists only the registers that are not zero and not an empty x87 stack slot, so call get_emulator_state when you need one of those files in full.',
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
                                    ...emulatorState(context, emulator)
                                }
                            }
                        )
                    }

                    return toolRun.success({
                        status: statusName(status),
                        diagnostics,
                        ...emulatorState(context, emulator)
                    })
                })
        }),
        undo: tool({
            name: 'undo',
            description:
                'Undoes the latest execution step or steps, up to the emulator history limit. Use undo plus step 1 when you need to re-observe a mutation you missed. Like step, of the other Register files (registerFiles) it lists only the registers that are not zero and not an empty x87 stack slot, so call get_emulator_state when you need one of those files in full.',
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
                            ...emulatorState(context, emulator)
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
        }),
        poke_register: tool({
            name: 'poke_register',
            description: `Pokes a register of the paused program: it writes the value between two instructions and records it as one step of the execution history, which undo reverts like an instruction. You MUST compile first, and the program must not be terminated or waiting on an interrupt.
- Use it to try a fix without editing the code, to reach a branch the program never takes, or to set up a state that takes many instructions to reach.
- The program counter, the status flags, and registers the emulator cannot set (such as $zero) are never pokeable.
- Returns what step returns, plus recorded (whether the history kept an undoable entry) and, when the register already held the value, a note that nothing was poked.`,
            schema: z.object({
                file: z
                    .string()
                    .optional()
                    .describe(
                        `Register file id, as registerFiles reports it (fpu, cp0, csr, sse, x87). Defaults to "${CPU_REGISTER_FILE_ID}", the general registers.`
                    ),
                register: z
                    .string()
                    .describe(
                        'Register name as its Register file spells it, for example "D0", "$t0", "t0", "rax", "xmm3".'
                    ),
                value: z
                    .string()
                    .describe(
                        'The new value: hex such as "0x1f" or decimal such as "31", negative allowed within the width of the register.'
                    )
            }),
            execute: async ({ file, register, value }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load, then compile and poke again.'
                        })
                    }
                    const blocker = pokeBlocker(emulator)
                    if (blocker) {
                        return toolRun.failure('execution_state', blocker.error, {
                            retryable: blocker.retryable,
                            nextAction: blocker.nextAction,
                            details: executionDetails(context, emulator)
                        })
                    }

                    const fileId = file ?? CPU_REGISTER_FILE_ID
                    const registerFile = findRegisterFile(emulator, fileId)
                    if (!registerFile) {
                        const available = (emulator.registerFiles ?? [])
                            .map((candidate) => candidate.id)
                            .join(', ')
                        return toolRun.failure(
                            'invalid_input',
                            `No register file "${fileId}" in this language. Available files: ${available || 'none'}`,
                            {
                                retryable: true,
                                nextAction:
                                    'Call get_emulator_state to see the register files this language has.'
                            }
                        )
                    }

                    const name = resolveRegisterName(registerFile, register)
                    if (name === null) {
                        return toolRun.failure(
                            'invalid_input',
                            `No register "${register}" in the ${registerFile.label} file. Its registers are: ${registerFile.layout
                                .map((row) => row.name)
                                .join(', ')}`,
                            {
                                retryable: true,
                                nextAction:
                                    'Call poke_register again with a register name the file lists.'
                            }
                        )
                    }

                    const refusal = registerPokeRefusal(emulator, registerFile, name)
                    if (refusal) {
                        return toolRun.failure('invalid_input', refusal, {
                            retryable: false,
                            nextAction:
                                'Poke a register the program reads instead, or change the code that computes this value.'
                        })
                    }

                    const index = registerRowIndex(registerFile, name)
                    const bits = registerBits(registerFile, index)
                    const parsed = parsePokeValue(value, name, bits)
                    if ('error' in parsed) {
                        return toolRun.failure('invalid_input', parsed.error, {
                            retryable: true,
                            nextAction:
                                'Call poke_register again with a value that fits the register.'
                        })
                    }

                    const size = registerSizeOf(registerFile, index)
                    const previous = registerFile.registers[index]?.value ?? 0n
                    //the same masking `GenericEmulator.pokeRegisters` drops a no-op write by: MIPS
                    //and RISC-V report their CPU registers signed while a poked value is unsigned,
                    //so an unmasked comparison would report poking `0xffffffff` over `-1n` as a
                    //change the Emulator then refuses to record
                    const width = Number(bits)
                    const changed =
                        BigInt.asUintN(width, previous) !== BigInt.asUintN(width, parsed.value)
                    try {
                        const recorded = emulator.pokeRegisters(fileId, [
                            { register: name, value: parsed.value }
                        ])
                        return toolRun.success({
                            file: fileId,
                            register: name,
                            value: formatNumber(parsed.value, size),
                            previous: formatNumber(previous, size),
                            changed,
                            recorded,
                            note: pokeNote(changed, recorded),
                            ...emulatorState(context, emulator)
                        })
                    } catch (error) {
                        return toolRun.failure('invalid_input', error, {
                            retryable: true,
                            nextAction:
                                'Call poke_register again with a value the register can hold.',
                            details: executionDetails(context, emulator)
                        })
                    }
                })
        }),
        poke_memory: tool({
            name: 'poke_memory',
            description: `Pokes a run of memory of the paused program: it writes the bytes between two instructions and records them as one step of the execution history, however many bytes they are, which undo reverts like an instruction. You MUST compile first, and the program must not be terminated or waiting on an interrupt.
- Use it to seed a buffer, to correct a data value without editing the code, or to drive a memory-mapped display.
- Bytes are written in the order given, at ascending addresses; read them back with read_memory.
- Returns what step returns, plus recorded (whether the history kept an undoable entry) and, when memory already held those bytes, a note that nothing was poked.`,
            schema: z.object({
                address: z
                    .string()
                    .describe('Hex string of the start address, for example "0x1000" or "1000"'),
                bytes: z
                    .string()
                    .describe(
                        'The bytes as hex digits, two per byte, spaces allowed, for example "de ad be ef" or "deadbeef".'
                    )
            }),
            execute: async ({ address, bytes }) =>
                runAgentTool(async (toolRun) => {
                    const emulator = context.getEmulator()
                    if (!emulator) {
                        return toolRun.failure('emulator_unavailable', 'Emulator not loaded yet.', {
                            retryable: true,
                            nextAction:
                                'Wait for the editor language to load, then compile and poke again.'
                        })
                    }
                    const blocker = pokeBlocker(emulator)
                    if (blocker) {
                        return toolRun.failure('execution_state', blocker.error, {
                            retryable: blocker.retryable,
                            nextAction: blocker.nextAction,
                            details: executionDetails(context, emulator)
                        })
                    }

                    const parsedAddress = parseHexAddress(address)
                    if (parsedAddress === null) {
                        return toolRun.failure('invalid_input', `Invalid hex address: ${address}`, {
                            retryable: true,
                            nextAction: 'Call poke_memory again with a hex address such as 0x1000.'
                        })
                    }
                    const parsed = parsePokeBytes(bytes)
                    if ('error' in parsed) {
                        return toolRun.failure('invalid_input', parsed.error, {
                            retryable: true,
                            nextAction: 'Call poke_memory again with an even count of hex digits.'
                        })
                    }

                    try {
                        const previous = Array.from(
                            emulator.readMemoryBytes(parsedAddress, parsed.bytes.length)
                        )
                        const poked = Array.from(parsed.bytes)
                        const changed = poked.some((byte, index) => byte !== previous[index])
                        const recorded = emulator.pokeMemory(parsedAddress, parsed.bytes)
                        return toolRun.success({
                            address: formatNumber(parsedAddress),
                            length: poked.length,
                            hex: formatHexBytes(poked),
                            previousHex: formatHexBytes(previous),
                            changed,
                            recorded,
                            note: pokeNote(changed, recorded),
                            ...emulatorState(context, emulator)
                        })
                    } catch (error) {
                        return toolRun.failure('runtime_error', error, {
                            retryable: false,
                            nextAction:
                                'Check that the address belongs to a valid memory region for the active emulator.',
                            details: {
                                address,
                                length: parsed.bytes.length,
                                errors: collectEmulatorErrors(emulator)
                            }
                        })
                    }
                })
        })
    } satisfies Record<DefaultCodingAgentToolName, RegisteredTool>
}
