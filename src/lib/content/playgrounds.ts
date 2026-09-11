import type { AvailableLanguages, MemoryValue, Testcase } from '$lib/Project.svelte'

/**
 * The playground fence of a course page, parsed once for the two places that read it: the renderer,
 * which turns a fence into an embed iframe, and the verification test, which builds and runs every
 * fence in `src/content`. Both used to be free to disagree about what a flag means; now a flag is
 * spelled once, here.
 *
 * The renderer walks the hast tree Carta hands it and this module walks the markdown source, because
 * a test has no hast tree and the renderer has no source by the time the transformer runs. What the
 * two share is everything that decides meaning: the fence info string, the flags, and the JSON of an
 * attached `testcase` fence.
 *
 * Plain TypeScript, no runes and no DOM, so the test can import it under node.
 */

/** The panels and buttons a fence can ask the embed for. */
export type PlaygroundSettings = {
    showMemory: boolean
    language: AvailableLanguages
    showConsole: boolean
    showTests: boolean
    showPc: boolean
    showRegisters: boolean
    showFlags: boolean
    showScreen: boolean
    /** Whether the Screen panel starts unfolded instead of behind its "Show screen" bar. */
    openScreen: boolean
    openButton: boolean
}

export type PlaygroundFence = {
    settings: PlaygroundSettings
    /** Layout only, not part of the embed URL: a wide iframe and a tall one. */
    large: boolean
    tall: boolean
    /**
     * A skeleton the reader fills in. It implies `tests`, since the reader needs the testcase panel
     * to check the answer, and the verification test holds it to the exercise rules: a testcase, a
     * solution that passes it, and a skeleton that does not.
     */
    isExercise: boolean
    /** The worked answer of the exercise above it. It renders as an ordinary playground. */
    isSolution: boolean
}

/**
 * The extra keys a `testcase` fence may carry for the verification test alone. They are stripped
 * before the Testcase is built, so the renderer never puts them in the embed URL.
 */
export type PlaygroundTestcase = {
    testcase: Testcase
    /**
     * How many instructions to run a program that never ends for. Set on the animated Examples,
     * which loop until the reader presses Stop.
     */
    runFor?: number
}

export function parsePlaygroundLanguage(
    language: string | undefined
): AvailableLanguages | undefined {
    const normalized = language?.trim().toLowerCase().replace(/[-_]/g, '')
    switch (normalized) {
        case 'm68k':
            return 'M68K'
        case 'mips':
            return 'MIPS'
        case 'x86':
            return 'X86'
        case 'riscv':
        case 'riscv32':
            return 'RISC-V'
        case 'riscv64':
            return 'RISC-V-64'
        case 'z80':
            return 'Z80'
        default:
            return undefined
    }
}

/**
 * Reads a fence info string such as `m68k|playground|memory|console`. Anything that is not a
 * playground, or names a language the editor does not have, answers undefined and is left alone as
 * an ordinary highlighted code block.
 */
export function parsePlaygroundFence(info: string): PlaygroundFence | undefined {
    const entries = info
        .split('|')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    if (!entries.includes('playground')) return undefined
    const language = parsePlaygroundLanguage(entries[0])
    if (!language) return undefined
    const showMemory = entries.includes('memory')
    //a fence that asks for the Screen open has one, so `open-screen` on its own is enough
    const openScreen = entries.includes('open-screen')
    const showScreen = openScreen || entries.includes('screen')
    const isExercise = entries.includes('exercise')
    return {
        settings: {
            language,
            showMemory,
            showConsole: entries.includes('console'),
            //an exercise is checked by its testcase, so the panel that runs it is always there
            showTests: entries.includes('tests') || isExercise,
            showPc: entries.includes('pc'),
            showRegisters: !entries.includes('no-registers'),
            showFlags: !entries.includes('no-flags'),
            showScreen,
            openScreen,
            openButton: entries.includes('allow-open')
        },
        large: entries.includes('large') || showMemory || showScreen,
        tall: entries.includes('tall'),
        isExercise,
        isSolution: entries.includes('solution')
    }
}

/** The fence language of a testcase block, the one that attaches to the playground above it. */
export const TESTCASE_FENCE = 'testcase'

export function isTestcaseFence(info: string): boolean {
    return info.trim().toLowerCase() === TESTCASE_FENCE
}

/**
 * Turns the JSON of a `testcase` fence into a Testcase. Numbers may be written as JSON numbers or
 * as strings (`"0x10"`, `"-12"`), because an address reads better in hex than as a decimal literal.
 * Throws with a message that names the offending field; callers decide whether that is a failed
 * test or a console error.
 */
export function parseTestcaseFence(raw: string): PlaygroundTestcase {
    const read = readJson(raw)
    if ('error' in read) throw new Error(`the testcase is not valid JSON: ${read.error}`)
    const parsed = read.value
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('the testcase must be a JSON object')
    }
    const value = parsed as Record<string, unknown>
    const runFor = value.runFor === undefined ? undefined : Number(value.runFor)
    if (runFor !== undefined && (!Number.isFinite(runFor) || runFor <= 0)) {
        throw new Error(`"runFor" must be a positive number of instructions, got ${value.runFor}`)
    }
    return {
        runFor,
        testcase: {
            input: parseInput(value.input),
            expectedOutput: parseExpectedOutput(value.expectedOutput),
            startingRegisters: parseRegisters(value.startingRegisters, 'startingRegisters'),
            expectedRegisters: parseRegisters(value.expectedRegisters, 'expectedRegisters'),
            startingMemory: parseMemory(value.startingMemory, 'startingMemory'),
            expectedMemory: parseMemory(value.expectedMemory, 'expectedMemory')
        }
    }
}

/** `JSON.parse` with its failure handed back rather than thrown, so the caller words the message. */
function readJson(raw: string): { value: unknown } | { error: string } {
    try {
        return { value: JSON.parse(raw) }
    } catch (e) {
        return { error: (e as Error).message }
    }
}

function parseInput(value: unknown): string[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        throw new Error('"input" must be an array of strings')
    }
    return value as string[]
}

function parseExpectedOutput(value: unknown): string {
    if (value === undefined || value === null) return ''
    if (typeof value !== 'string') throw new Error('"expectedOutput" must be a string')
    return value
}

function parseRegisters(value: unknown, field: string): Record<string, bigint> {
    if (value === undefined || value === null) return {}
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`"${field}" must be an object of register names to values`)
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([register, entry]) => [
            register,
            parseNumber(entry, `${field}.${register}`)
        ])
    )
}

function parseMemory(value: unknown, field: string): MemoryValue[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) throw new Error(`"${field}" must be an array`)
    return value.map((entry, index) => parseMemoryValue(entry, `${field}[${index}]`))
}

function parseMemoryValue(value: unknown, field: string): MemoryValue {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${field} must be an object`)
    }
    const entry = value as Record<string, unknown>
    const address = parseNumber(entry.address, `${field}.address`)
    if (entry.type === 'string-chunk') {
        if (typeof entry.expected !== 'string') {
            throw new Error(`${field}.expected must be a string`)
        }
        return { type: 'string-chunk', address, expected: entry.expected }
    }
    const bytes = Number(entry.bytes)
    if (!Number.isFinite(bytes) || bytes <= 0) {
        throw new Error(`${field}.bytes must be a positive number of bytes`)
    }
    if (entry.type === 'number') {
        return { type: 'number', address, bytes, expected: parseNumber(entry.expected, field) }
    }
    if (entry.type === 'number-chunk') {
        if (!Array.isArray(entry.expected)) {
            throw new Error(`${field}.expected must be an array of numbers`)
        }
        return {
            type: 'number-chunk',
            address,
            bytes,
            expected: entry.expected.map((item, index) =>
                parseNumber(item, `${field}.expected[${index}]`)
            )
        }
    }
    throw new Error(
        `${field}.type must be "number", "number-chunk" or "string-chunk", got ${JSON.stringify(entry.type)}`
    )
}

function parseNumber(value: unknown, field: string): bigint {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number') {
        if (!Number.isInteger(value)) throw new Error(`${field} must be a whole number`)
        return BigInt(value)
    }
    if (typeof value === 'string') {
        const trimmed = value.trim()
        const negative = trimmed.startsWith('-')
        const digits = negative ? trimmed.slice(1).trim() : trimmed
        try {
            //BigInt reads the 0x, 0o and 0b prefixes as well as plain decimal, which is every way a
            //page is likely to write an address or a register value
            const parsed = BigInt(digits)
            return negative ? -parsed : parsed
        } catch {
            throw new Error(`${field} is not a number: ${JSON.stringify(value)}`)
        }
    }
    throw new Error(`${field} must be a number or a string, got ${JSON.stringify(value)}`)
}

/** One fenced code block of a markdown page, with where it was found. */
export type MarkdownFence = {
    info: string
    code: string
    /** 1 based, the line the opening fence is on. */
    line: number
    /** Whether nothing but blank lines separates it from the fence before it. */
    followsPrevious: boolean
}

/**
 * Every fenced code block of a markdown source, in order. Written by hand rather than taken from a
 * markdown library because the test walks the source the author wrote, and a library would hand
 * back a tree the fences have already been interpreted into.
 */
export function parseMarkdownFences(markdown: string): MarkdownFence[] {
    const lines = markdown.split('\n')
    const fences: MarkdownFence[] = []
    let previousEnd = -1
    for (let index = 0; index < lines.length; index++) {
        const opening = matchFence(lines[index])
        if (!opening) continue
        const body: string[] = []
        let closed = index
        for (let cursor = index + 1; cursor < lines.length; cursor++) {
            const closing = matchFence(lines[cursor])
            if (
                closing &&
                closing.info.length === 0 &&
                closing.marker[0] === opening.marker[0] &&
                closing.marker.length >= opening.marker.length
            ) {
                closed = cursor
                break
            }
            body.push(stripIndent(lines[cursor], opening.indent))
            closed = cursor
        }
        const blankBetween = lines
            .slice(previousEnd + 1, index)
            .every((line) => line.trim().length === 0)
        fences.push({
            info: opening.info,
            code: body.join('\n'),
            line: index + 1,
            followsPrevious: fences.length > 0 && blankBetween
        })
        previousEnd = closed
        index = closed
    }
    return fences
}

function matchFence(line: string): { indent: number; marker: string; info: string } | undefined {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line)
    if (!match) return undefined
    //a backtick fence's info string cannot contain a backtick, which is what keeps inline code in a
    //paragraph from opening a block
    if (match[2][0] === '`' && match[3].includes('`')) return undefined
    return { indent: match[1].length, marker: match[2], info: match[3].trim() }
}

function stripIndent(line: string, indent: number): string {
    let removed = 0
    let cursor = 0
    while (cursor < line.length && removed < indent && line[cursor] === ' ') {
        cursor++
        removed++
    }
    return line.slice(cursor)
}

/** A playground of a course page, with whatever the page attached to it. */
export type ContentPlayground = PlaygroundFence & {
    /** Its position among the playgrounds of the page, which is how a failure names it. */
    index: number
    line: number
    info: string
    code: string
    testcase?: Testcase
    runFor?: number
    /** For an exercise, the `solution` playground that follows it. */
    solution?: ContentPlayground
}

/**
 * Every playground of a page, with the `testcase` fence that directly follows it and, for an
 * exercise, the next `solution` playground. A malformed testcase throws, naming the fence: a page
 * whose testcase does not parse is a page whose exercise is not checked.
 */
export function extractPlaygrounds(markdown: string): ContentPlayground[] {
    const fences = parseMarkdownFences(markdown)
    const playgrounds: ContentPlayground[] = []
    for (let index = 0; index < fences.length; index++) {
        const fence = fences[index]
        const parsed = parsePlaygroundFence(fence.info)
        if (!parsed) continue
        const playground: ContentPlayground = {
            ...parsed,
            index: playgrounds.length,
            line: fence.line,
            info: fence.info,
            code: fence.code
        }
        const next = fences[index + 1]
        if (next && next.followsPrevious && isTestcaseFence(next.info)) {
            let failure: string | undefined
            try {
                const attached = parseTestcaseFence(next.code)
                playground.testcase = attached.testcase
                playground.runFor = attached.runFor
            } catch (e) {
                failure = (e as Error).message
            }
            if (failure !== undefined) {
                throw new Error(`playground ${playground.index} (line ${fence.line}): ${failure}`)
            }
        }
        playgrounds.push(playground)
    }
    for (const playground of playgrounds) {
        if (!playground.isExercise) continue
        playground.solution = playgrounds.find(
            (candidate) => candidate.isSolution && candidate.index > playground.index
        )
    }
    return playgrounds
}
