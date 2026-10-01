import type { TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import { testcaseLabel } from '$lib/testcases'
import { formatTime } from '$lib/utils'

/**
 * The **Log** ([CONTEXT.md](../../../CONTEXT.md)): the Workbench's record of what it did for the
 * person. Each Build with its result, each test run with the outcome of every Testcase, each
 * program exit with its running time. What the program itself wrote is the Terminal's, and the
 * Diagnostics are listed on their own, so neither is repeated here.
 */

export type LogTone = 'info' | 'success' | 'warning' | 'error'

export type LogLine = {
    tone: LogTone
    text: string
}

export type LogEntry = LogLine & {
    id: number
    /** When it was recorded, as `Date.now()`. */
    time: number
    kind: 'build' | 'test' | 'exit'
    /** Lines under the entry: one per Testcase of a test run. */
    details: LogLine[]
}

export type LogDraft = Omit<LogEntry, 'id' | 'time'>

/** Entries kept; the oldest go first, so a long session does not grow without bound. */
export const LOG_LIMIT = 500

function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? '' : 's'}`
}

export type BuildReport = {
    ok: boolean
    errors: number
    warnings: number
    durationMs: number
    /** The Entry path the Build started from. */
    entry?: string
}

export function buildEntry(report: BuildReport): LogDraft {
    const from = report.entry ? ` ${report.entry}` : ''
    const took = ` in ${formatTime(Math.max(0, Math.round(report.durationMs)))}`
    if (!report.ok) {
        const counts = report.errors > 0 ? ` with ${plural(report.errors, 'error')}` : ''
        return {
            kind: 'build',
            tone: 'error',
            text: `Build of${from} failed${took}${counts}`,
            details: []
        }
    }
    const warnings = report.warnings > 0 ? ` with ${plural(report.warnings, 'warning')}` : ''
    return {
        kind: 'build',
        tone: report.warnings > 0 ? 'warning' : 'success',
        text: `Built${from}${took}${warnings}`,
        details: []
    }
}

function hex(value: bigint | number) {
    return `0x${BigInt(value).toString(16).toUpperCase()}`
}

/** One mismatch of a Testcase in a line, the way the Testcases panel says it at length. */
export function describeTestcaseError(error: TestcaseValidationError): string {
    switch (error.type) {
        case 'wrong-register':
            return `register ${error.register} is ${hex(error.got)}, expected ${hex(error.expected)}`
        case 'wrong-memory-number':
            return `${error.bytes} bytes at ${hex(error.address)} are ${hex(error.got)}, expected ${hex(error.expected)}`
        case 'wrong-memory-string':
            return `the string at ${hex(error.address)} is "${error.got}", expected "${error.expected}"`
        case 'wrong-memory-chunk':
            return `the bytes at ${hex(error.address)} differ from the expected ones`
        case 'wrong-output':
            return `the output is "${error.got}", expected "${error.expected}"`
    }
}

export function testRunEntry(results: readonly TestcaseResult[], durationMs: number): LogDraft {
    const passed = results.filter((result) => result.passed).length
    const details = results.map((result, index) => {
        //named as the Testcases panel names it
        const label = testcaseLabel(result.testcase, index)
        if (result.passed) return { tone: 'success' as const, text: `${label} passed` }
        const [first] = result.errors
        const more = result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : ''
        return {
            tone: 'error' as const,
            text: first
                ? `${label} failed: ${describeTestcaseError(first)}${more}`
                : `${label} failed`
        }
    })
    return {
        kind: 'test',
        tone: results.length > 0 && passed === results.length ? 'success' : 'error',
        text: `${passed} of ${plural(results.length, 'testcase')} passed in ${formatTime(Math.max(0, Math.round(durationMs)))}`,
        details
    }
}

export type ExitReport = {
    /** The Emulator's measured running time in milliseconds, negative when unknown. */
    executionTimeMs: number
    /** The Emulator's runtime errors, when the program stopped because of one. */
    errors: readonly string[]
}

export function exitEntry(report: ExitReport): LogDraft {
    const ran =
        report.executionTimeMs >= 0
            ? `Ran in ${formatTime(report.executionTimeMs)}`
            : 'Program ended'
    if (report.errors.length > 0) {
        return {
            kind: 'exit',
            tone: 'error',
            text: `${ran}, stopped by an error: ${report.errors[report.errors.length - 1]}`,
            details: []
        }
    }
    return { kind: 'exit', tone: 'info', text: ran, details: [] }
}

/** The log with one more entry, dropping the oldest past `limit`. */
export function appendLog(
    log: readonly LogEntry[],
    draft: LogDraft,
    id: number,
    time: number,
    limit = LOG_LIMIT
): LogEntry[] {
    const next = [...log, { ...draft, id, time }]
    return next.length > limit ? next.slice(next.length - limit) : next
}
