import type { AvailableLanguages, MemoryValue, Testcase, TestcaseResult } from '$lib/Project.svelte'

/**
 * What the Testcases panel needs beyond the **Testcase** record itself: reading the numbers a person
 * types in hex or decimal, writing them back the way the Target writes hex, and telling which result
 * of the last test run still describes a Testcase that may have been edited since. Pure, so that it
 * is tested without mounting the panel.
 */

/** How the Target writes a hexadecimal number: `$` for the 68000, `0x` everywhere else. */
export function hexPrefix(language: AvailableLanguages): string {
    return language === 'M68K' ? '$' : '0x'
}

export type NumberParse = { ok: true; value: bigint } | { ok: false; reason: string }

export type NumberParseOptions = {
    /**
     * The width the number has to fit, read either way: unsigned up to its top, or two's complement
     * down to its bottom, so `$FF` and `-1` are both a byte.
     */
    bytes?: number
    /** Whether a negative number is allowed; an address never is. */
    signed?: boolean
    /** The Target's hex prefix, named in the message for hex digits written without one. */
    prefix?: string
}

const HEX_DIGITS = /^[0-9a-f]+$/i
const BINARY_DIGITS = /^[01]+$/
const DECIMAL_DIGITS = /^[0-9]+$/

/** Splits a typed number into its sign and the rest, dropping a 68000 immediate's `#`. */
function splitSign(text: string): { negative: boolean; body: string } {
    let body = text.trim()
    if (body.startsWith('#')) body = body.slice(1).trimStart()
    const negative = body.startsWith('-')
    if (negative || body.startsWith('+')) body = body.slice(1).trimStart()
    return { negative, body }
}

/**
 * A number as a person types it into a Testcase: `$1F` or `0x1F` in hex, `%101` or `0b101` in
 * binary, and anything else in decimal, with an optional sign. A bare `1F` is refused rather than
 * guessed at, since `10` would read differently in the two bases.
 */
export function parseNumber(text: string, options: NumberParseOptions = {}): NumberParse {
    const { bytes, signed = true, prefix = '0x' } = options
    const typed = text.trim()
    if (typed === '') return { ok: false, reason: 'a number is needed' }
    const { negative, body } = splitSign(typed)
    const lower = body.toLowerCase()
    let value: bigint
    if (lower.startsWith('$') || lower.startsWith('0x')) {
        const digits = body.slice(lower.startsWith('$') ? 1 : 2)
        if (!HEX_DIGITS.test(digits)) {
            return { ok: false, reason: `${typed} is not a hexadecimal number` }
        }
        value = BigInt(`0x${digits}`)
    } else if (lower.startsWith('%') || lower.startsWith('0b')) {
        const digits = body.slice(lower.startsWith('%') ? 1 : 2)
        if (!BINARY_DIGITS.test(digits)) {
            return { ok: false, reason: `${typed} is not a binary number` }
        }
        value = BigInt(`0b${digits}`)
    } else if (DECIMAL_DIGITS.test(body)) {
        value = BigInt(body)
    } else if (HEX_DIGITS.test(body)) {
        return { ok: false, reason: `write ${prefix}${body} for a hexadecimal number` }
    } else {
        return { ok: false, reason: `${typed} is not a number` }
    }
    if (negative) value = -value
    if (value < 0n && !signed) return { ok: false, reason: `${typed} is negative` }
    if (bytes !== undefined) {
        const bits = BigInt(bytes * 8)
        if (value >= 1n << bits || value < -(1n << (bits - 1n))) {
            return {
                ok: false,
                reason: `${typed} does not fit ${bytes} byte${bytes === 1 ? '' : 's'}`
            }
        }
    }
    return { ok: true, value }
}

/** Whether a typed number was written in decimal, which decides the base its echo is shown in. */
export function isDecimalText(text: string): boolean {
    return DECIMAL_DIGITS.test(splitSign(text).body)
}

export type HexOptions = {
    prefix: string
    /** The width the value is read at: a negative number becomes its two's complement. */
    bytes?: number
    /** Fewer digits are padded with zeros; more are rounded up to whole bytes. */
    minDigits?: number
}

/** A value in the Target's hex, upper case and in whole bytes: `$001E`, `0xC8`. */
export function formatHex(value: bigint, { prefix, bytes, minDigits = 2 }: HexOptions): string {
    const unsigned = bytes === undefined ? value : BigInt.asUintN(bytes * 8, value)
    const negative = unsigned < 0n
    const digits = (negative ? -unsigned : unsigned).toString(16).toUpperCase()
    const width = Math.max(minDigits, digits.length + (digits.length % 2))
    return `${negative ? '-' : ''}${prefix}${digits.padStart(width, '0')}`
}

export type NumberListParse = { ok: true; values: bigint[] } | { ok: false; reason: string }

/** The values of a chunk, separated by spaces or commas, each read like `parseNumber` reads one. */
export function parseNumberList(text: string, options: NumberParseOptions = {}): NumberListParse {
    const parts = text.split(/[\s,]+/).filter((part) => part !== '')
    if (parts.length === 0) return { ok: false, reason: 'at least one number is needed' }
    const values: bigint[] = []
    for (const part of parts) {
        const parsed = parseNumber(part, options)
        if (!parsed.ok) return parsed
        values.push(parsed.value)
    }
    return { ok: true, values }
}

const ESCAPES: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    '0': '\0',
    '\\': '\\'
}

/**
 * A string as it is shown and typed on one line: the control characters a memory string is likely
 * to hold become `\n`, `\t`, `\r` and `\0`, any other one `\xHH`, and a backslash doubles.
 */
export function escapeText(text: string): string {
    let escaped = ''
    for (const char of text) {
        if (char === '\\') escaped += '\\\\'
        else if (char === '\n') escaped += '\\n'
        else if (char === '\t') escaped += '\\t'
        else if (char === '\r') escaped += '\\r'
        else if (char === '\0') escaped += '\\0'
        else if (char.charCodeAt(0) < 0x20 || char === '\x7f') {
            escaped += `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`
        } else escaped += char
    }
    return escaped
}

export type TextParse = { ok: true; value: string } | { ok: false; reason: string }

/** The counterpart of `escapeText`, refusing an escape it does not know rather than guessing. */
export function unescapeText(text: string): TextParse {
    let value = ''
    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (char !== '\\') {
            value += char
            continue
        }
        const next = text[i + 1]
        if (next === undefined) return { ok: false, reason: 'a lone \\ ends the text, write \\\\' }
        if (next === 'x') {
            const digits = text.slice(i + 2, i + 4)
            if (!/^[0-9a-f]{2}$/i.test(digits)) {
                return { ok: false, reason: `\\x${digits} needs two hex digits` }
            }
            value += String.fromCharCode(parseInt(digits, 16))
            i += 3
            continue
        }
        const escaped = ESCAPES[next]
        if (escaped === undefined) {
            return { ok: false, reason: `\\${next} is not an escape, write \\\\ for a backslash` }
        }
        value += escaped
        i++
    }
    return { ok: true, value }
}

/** How many bytes of memory a value covers: a string counts its UTF-8 bytes. */
export function memoryValueLength(value: MemoryValue): number {
    if (value.type === 'number') return value.bytes
    if (value.type === 'number-chunk') return value.bytes * value.expected.length
    return new TextEncoder().encode(value.expected).length
}

/** What the Testcase calls itself, or its place in the list when it has no name. */
export function testcaseLabel(testcase: Testcase, index: number): string {
    return testcase.name?.trim() || `Testcase ${index + 1}`
}

export function makeEmptyTestcase(): Testcase {
    return {
        input: [],
        expectedOutput: '',
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: []
    }
}

/** How many things a run of the Testcase checks: each expected register and memory value, and
 * the output, which is checked even when nothing is expected of it. */
export function checkCount(testcase: Testcase): number {
    return Object.keys(testcase.expectedRegisters).length + testcase.expectedMemory.length + 1
}

function sortedEntries(registers: Record<string, bigint>) {
    return Object.entries(registers).sort(([a], [b]) => a.localeCompare(b))
}

/**
 * What a run of the Testcase depends on, as a string two equal Testcases share. The name is left
 * out, since renaming a Testcase does not change what its last result says about it.
 */
export function testcaseContentKey(testcase: Testcase): string {
    return JSON.stringify(
        [
            testcase.input,
            testcase.expectedOutput,
            sortedEntries(testcase.startingRegisters),
            sortedEntries(testcase.expectedRegisters),
            testcase.startingMemory,
            testcase.expectedMemory
        ],
        (_, value) => (typeof value === 'bigint' ? `${value}n` : value)
    )
}

/**
 * The result of the last test run that still describes each Testcase: the one run on exactly its
 * content. A Testcase edited since, or added after the run, has none and reads as not run. Matching
 * by content rather than position also survives Testcases deleted or reordered since.
 */
export function matchResults(
    testcases: readonly Testcase[],
    results: readonly TestcaseResult[]
): (TestcaseResult | undefined)[] {
    const byContent = new Map<string, TestcaseResult>()
    for (const result of results) {
        const key = testcaseContentKey(result.testcase)
        if (!byContent.has(key)) byContent.set(key, result)
    }
    return testcases.map((testcase) => byContent.get(testcaseContentKey(testcase)))
}

export type ByteDifference = {
    /** The offset of the first byte that differs from the start of the value. */
    offset: number
    /** What was there instead, or undefined when memory ended first. */
    got: number | undefined
    /** How many bytes differ in all. */
    count: number
}

/** Where a memory chunk first differs from what was expected. */
export function firstByteDifference(
    expected: readonly number[],
    got: readonly number[]
): ByteDifference | undefined {
    let first: ByteDifference | undefined
    let count = 0
    for (let i = 0; i < expected.length; i++) {
        if (expected[i] === got[i]) continue
        count++
        first ??= { offset: i, got: got[i], count: 0 }
    }
    return first && { ...first, count }
}

/** The index of the first character two texts disagree on, or -1 when they are equal. */
export function firstTextDifference(expected: string, got: string): number {
    if (expected === got) return -1
    const length = Math.min(expected.length, got.length)
    for (let i = 0; i < length; i++) {
        if (expected[i] !== got[i]) return i
    }
    return length
}

/** One character of an output for a sentence about it, invisible ones made visible. */
export function describeCharacter(text: string, index: number): string {
    const char = text[index]
    return char === undefined ? 'the end' : `"${escapeText(char)}"`
}

/** The name a register has in the Target, whatever case the Testcase spelled it in. */
export function canonicalRegister(name: string, registerNames: readonly string[]): string {
    const upper = name.toUpperCase()
    return registerNames.find((candidate) => candidate.toUpperCase() === upper) ?? name
}

/** Registers in the order the Target lists them, any it does not know at the end. */
export function sortRegisters(
    names: readonly string[],
    registerNames: readonly string[]
): string[] {
    const position = (name: string) => {
        const index = registerNames.findIndex(
            (candidate) => candidate.toUpperCase() === name.toUpperCase()
        )
        return index === -1 ? registerNames.length : index
    }
    return [...names].sort((a, b) => position(a) - position(b) || a.localeCompare(b))
}
