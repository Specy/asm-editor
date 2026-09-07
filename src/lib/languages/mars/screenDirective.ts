import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import {
    MARS_DISPLAY_SIZE_CHOICES,
    MARS_UNIT_SIZE_CHOICES,
    type MarsDisplayConfiguration,
    normalizeMarsDisplay,
    type ProjectDisplay
} from './marsDisplay'

/**
 * The `@screen` comment directive: how a MIPS or RISC-V program states the bitmap display it wants,
 * so that opening an example and pressing Build configures the Screen with no manual step.
 *
 * ```asm
 * # @screen width=256 height=256 unit=1 base=display
 * ```
 *
 * It is a comment, so the same file still assembles in real MARS and RARS, where the user sets the
 * five parameters in the tool's own window; and it is read at Build, so the Screen is configured
 * before the first instruction runs and during a Testcase run, rather than part way through.
 *
 * Plain TypeScript, no runes and no Core: the label a `base=` may name is resolved by the caller,
 * which is the only part that needs an assembler.
 */

/** What `base=` asked for: an address the source spelled out, or a label to resolve. */
export type ScreenDirectiveBase =
    { kind: 'address'; address: number } | { kind: 'label'; label: string }

/** One parsed directive: where it is, and the parameters it names. Anything absent stays as it was. */
export type ScreenDirective = {
    /** 0 based, the editor's own line numbering, which is what a `Diagnostic` carries. */
    lineIndex: number
    /** 1 based, monaco's column of the `@`. */
    column: number
    /** The whole source line, for the `Diagnostic`'s `line` field. */
    lineText: string
    unitWidth?: number
    unitHeight?: number
    width?: number
    height?: number
    base?: ScreenDirectiveBase
}

export type ScreenDirectiveParse = {
    /** `null` when the source names no directive at all: the user's configuration stands. */
    directive: ScreenDirective | null
    diagnostics: Diagnostic[]
}

/** Answers the address a label assembles to, or `null` when there is no such label. */
export type ScreenDirectiveLabelResolver = (label: string) => number | null

export type ScreenDirectiveApplication = MarsDisplayConfiguration & {
    /** Everything the directive got wrong, on its own line. Never `error`: see `directiveWarning`. */
    diagnostics: Diagnostic[]
}

/**
 * Where the label probe of `screenLabelProbeSource` parks the address it resolves: MARS's and
 * RARS's heap base, which nothing else is assembled at, in a throwaway Core the program never runs.
 */
export const SCREEN_LABEL_PROBE_ADDRESS = 0x10040000

/** `#` before the keyword so the line is a comment in both assemblers; `##` and `#@screen` too. */
const DIRECTIVE_PATTERN = /#+[ \t]*@screen\b/i
/** One `name=value`, with any amount of space around the `=` and commas allowed as separators. */
const ENTRY_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)[ \t]*=[ \t]*([^\s,]+)/
/** MARS's and RARS's label charset, which is what tells a label apart from a mistyped number. */
const LABEL_PATTERN = /^[A-Za-z_.$][A-Za-z0-9_.$]*$/

/**
 * Reads the first `@screen` line of a program. A second one is reported and ignored, so that the
 * configuration a program applies is always the one a reader sees first.
 */
export function parseScreenDirective(code: string): ScreenDirectiveParse {
    const diagnostics: Diagnostic[] = []
    let directive: ScreenDirective | null = null
    const lines = code.split('\n')
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineText = lines[lineIndex] ?? ''
        const match = DIRECTIVE_PATTERN.exec(lineText)
        if (!match) continue
        const column = match.index + match[0].indexOf('@') + 1
        if (directive) {
            diagnostics.push(
                makeWarning(
                    lineIndex,
                    column,
                    lineText,
                    `A program has one @screen directive; this one is ignored, the one on line ${directive.lineIndex + 1} is used.`
                )
            )
            continue
        }
        directive = { lineIndex, column, lineText }
        readEntries(directive, lineText.slice(match.index + match[0].length), diagnostics)
    }
    return { directive, diagnostics }
}

/**
 * The configuration a program's source asks for, on top of the one the user already has: a
 * directive names only what it cares about, and what it leaves out keeps its value.
 *
 * `resolveLabel` is called at most once, and only for a `base=` that names a label.
 */
export function applyScreenDirective(
    code: string,
    current: ProjectDisplay,
    resolveLabel: ScreenDirectiveLabelResolver
): ScreenDirectiveApplication {
    const { directive, diagnostics } = parseScreenDirective(code)
    if (!directive) return { display: current, origin: 'user', diagnostics }
    const display = { ...current }
    if (directive.unitWidth !== undefined) display.unitWidth = directive.unitWidth
    if (directive.unitHeight !== undefined) display.unitHeight = directive.unitHeight
    if (directive.width !== undefined) display.width = directive.width
    if (directive.height !== undefined) display.height = directive.height
    let baseLabel: string | undefined
    const base = directive.base
    if (base?.kind === 'address') {
        display.baseAddress = base.address
    } else if (base?.kind === 'label') {
        const address = resolveLabel(base.label)
        if (address === null) {
            diagnostics.push(
                warnOn(
                    directive,
                    `No label named "${base.label}", so the screen keeps the base address it had. Name a label the program defines, or an address such as base=0x10010000.`
                )
            )
        } else {
            baseLabel = base.label
            display.baseAddress = address >>> 0
            if (address % 4 !== 0) {
                diagnostics.push(
                    warnOn(
                        directive,
                        `Label "${base.label}" is at ${hex(address)}, which is not a word boundary; the screen starts at ${hex(alignDown(address))} instead. Put an .align 2 before it.`
                    )
                )
            }
        }
    }
    return {
        display: normalizeMarsDisplay(display),
        origin: 'directive',
        baseLabel,
        diagnostics
    }
}

/**
 * The program, plus one `.word <label>` at a fixed address, for the caller to assemble in a
 * throwaway Core and read back: neither Core can look a label up by name — `getLabelAtAddress` only
 * goes the other way — but both assemblers resolve one in a `.word`, `.eqv` names and forward
 * references included.
 */
export function screenLabelProbeSource(code: string, label: string): string {
    return `${code}\n.data ${hex(SCREEN_LABEL_PROBE_ADDRESS)}\n.word ${label}\n`
}

/** The probe's word, which both Cores hold little endian, or `null` when it was not written. */
export function readScreenLabelProbe(bytes: ArrayLike<number>): number | null {
    if (bytes.length < 4) return null
    let value = 0
    for (let i = 3; i >= 0; i--) value = value * 256 + ((bytes[i] ?? 0) & 0xff)
    return value >>> 0
}

function readEntries(directive: ScreenDirective, body: string, diagnostics: Diagnostic[]): void {
    let rest = body
    for (;;) {
        rest = rest.replace(/^[\s,]+/, '')
        if (rest.length === 0) return
        const entry = ENTRY_PATTERN.exec(rest)
        if (!entry) {
            const stray = rest.split(/[\s,]/)[0] ?? rest
            diagnostics.push(
                warnOn(
                    directive,
                    `"${stray}" is not a name=value setting. Write the directive as # @screen width=256 height=256 unit=1 base=display.`
                )
            )
            return
        }
        rest = rest.slice(entry[0].length)
        readEntry(directive, entry[1] ?? '', entry[2] ?? '', diagnostics)
    }
}

function readEntry(
    directive: ScreenDirective,
    name: string,
    value: string,
    diagnostics: Diagnostic[]
): void {
    //`unitWidth`, `unit-width` and `unitwidth` are the same setting: the directive is a comment
    //people type by hand, and the spelling of a name is not worth a diagnostic
    const key = name.toLowerCase().replace(/[-_]/g, '')
    if (key === 'base' || key === 'baseaddress') {
        directive.base = readBase(directive, value, diagnostics)
        return
    }
    const sizes: Record<string, readonly number[]> = {
        unit: MARS_UNIT_SIZE_CHOICES,
        unitwidth: MARS_UNIT_SIZE_CHOICES,
        unitheight: MARS_UNIT_SIZE_CHOICES,
        width: MARS_DISPLAY_SIZE_CHOICES,
        height: MARS_DISPLAY_SIZE_CHOICES
    }
    const choices = sizes[key]
    if (!choices) {
        diagnostics.push(
            warnOn(
                directive,
                `"${name}" is not a screen setting. The settings are width, height, unit (or unitWidth and unitHeight) and base.`
            )
        )
        return
    }
    const parsed = readNumber(value)
    if (parsed === null) {
        diagnostics.push(
            warnOn(directive, `"${value}" is not a number, so ${name} is left as it was.`)
        )
        return
    }
    const snapped = nearestChoice(parsed, choices)
    if (snapped !== parsed) {
        //MARS offers these as a combo box, so a value it has no entry for cannot be reproduced
        //there; the nearest one it does offer keeps the program running and the picture close
        diagnostics.push(
            warnOn(
                directive,
                `${name}=${parsed} is not one of ${choices.join(', ')}, the values ${
                    choices === MARS_UNIT_SIZE_CHOICES
                        ? 'MARS offers for a unit size'
                        : 'MARS offers for a display size'
                }; using ${snapped}.`
            )
        )
    }
    if (key === 'unit' || key === 'unitwidth') directive.unitWidth = snapped
    if (key === 'unit' || key === 'unitheight') directive.unitHeight = snapped
    if (key === 'width') directive.width = snapped
    if (key === 'height') directive.height = snapped
}

function readBase(
    directive: ScreenDirective,
    value: string,
    diagnostics: Diagnostic[]
): ScreenDirectiveBase | undefined {
    const address = readNumber(value)
    if (address !== null) {
        if (address > 0xffffffff) {
            diagnostics.push(
                warnOn(
                    directive,
                    `base=${value} is past the top of memory, so the screen keeps the base address it had.`
                )
            )
            return undefined
        }
        return { kind: 'address', address: address >>> 0 }
    }
    if (LABEL_PATTERN.test(value)) return { kind: 'label', label: value }
    diagnostics.push(
        warnOn(
            directive,
            `base=${value} is neither an address nor a label name, so the screen keeps the base address it had.`
        )
    )
    return undefined
}

/** Decimal or `0x` hexadecimal, the two spellings both assemblers take for an address. */
function readNumber(value: string): number | null {
    if (/^0[xX][0-9a-fA-F]+$/.test(value)) return Number.parseInt(value.slice(2), 16)
    if (/^\d+$/.test(value)) return Number.parseInt(value, 10)
    return null
}

function nearestChoice(value: number, choices: readonly number[]): number {
    let best = choices[0] ?? 1
    let bestDistance = Number.POSITIVE_INFINITY
    for (const choice of choices) {
        const distance = Math.abs(choice - value)
        if (distance < bestDistance) {
            best = choice
            bestDistance = distance
        }
    }
    return best
}

function alignDown(address: number): number {
    return (address & ~3) >>> 0
}

function hex(address: number): string {
    return `0x${(address >>> 0).toString(16).padStart(8, '0')}`
}

function warnOn(directive: ScreenDirective, message: string): Diagnostic {
    return makeWarning(directive.lineIndex, directive.column, directive.lineText, message)
}

/**
 * Every complaint about the directive is a warning, never an error: it is a comment, and a comment
 * must not stop a program from assembling here when it assembles in MARS and RARS. What could not
 * be understood is left at the configuration the Screen already had.
 */
function makeWarning(
    lineIndex: number,
    column: number,
    lineText: string,
    message: string
): Diagnostic {
    return {
        severity: 'warning',
        lineIndex,
        column,
        line: {
            line: lineText,
            line_index: lineIndex + 1
        },
        message,
        formatted: message
    }
}

/**
 * The source with its `@screen` line rewritten to say what the user chose beside the Screen, so the
 * code and the popover agree and the next Build reads the choice back (the display section of
 * `docs/design/project-format.md`). Only the parameters whose value changed between `before` and
 * `after` are touched: an entry the line already has is given the new value under its own spelling,
 * one it lacks is appended, and a `base=<label>` the user did not change stays a label. A `unit=`
 * entry becomes `unitWidth=` and `unitHeight=` when the two stop being equal.
 *
 * `null` when the program has no directive: then the choice is the Project's alone, and nothing is
 * inserted into anyone's program.
 */
export function rewriteScreenDirective(
    code: string,
    before: ProjectDisplay,
    after: ProjectDisplay
): string | null {
    const { directive } = parseScreenDirective(code)
    if (!directive) return null
    const changed = {
        unitWidth: after.unitWidth !== before.unitWidth,
        unitHeight: after.unitHeight !== before.unitHeight,
        width: after.width !== before.width,
        height: after.height !== before.height,
        base: after.baseAddress !== before.baseAddress
    }
    if (!Object.values(changed).some(Boolean)) return code

    const lines = code.split('\n')
    const line = lines[directive.lineIndex] ?? ''
    const match = DIRECTIVE_PATTERN.exec(line)
    if (!match) return null
    const head = line.slice(0, match.index + match[0].length)
    const tokens: string[] = []
    const written = {
        unitWidth: false,
        unitHeight: false,
        width: false,
        height: false,
        base: false
    }

    let rest = line.slice(head.length)
    for (;;) {
        rest = rest.replace(/^[\s,]+/, '')
        if (rest.length === 0) break
        const entry = ENTRY_PATTERN.exec(rest)
        if (!entry) {
            //not a name=value: kept where it was, the parser warns about it either way
            const stray = rest.split(/[\s,]/)[0] ?? rest
            tokens.push(stray)
            rest = rest.slice(stray.length)
            continue
        }
        rest = rest.slice(entry[0].length)
        const name = entry[1] ?? ''
        const value = entry[2] ?? ''
        const key = name.toLowerCase().replace(/[-_]/g, '')
        if (key === 'unit') {
            if (after.unitWidth === after.unitHeight) {
                tokens.push(
                    `${name}=${changed.unitWidth || changed.unitHeight ? after.unitWidth : value}`
                )
            } else {
                tokens.push(`unitWidth=${after.unitWidth}`, `unitHeight=${after.unitHeight}`)
            }
            written.unitWidth = written.unitHeight = true
        } else if (key === 'unitwidth') {
            tokens.push(`${name}=${changed.unitWidth ? after.unitWidth : value}`)
            written.unitWidth = true
        } else if (key === 'unitheight') {
            tokens.push(`${name}=${changed.unitHeight ? after.unitHeight : value}`)
            written.unitHeight = true
        } else if (key === 'width') {
            tokens.push(`${name}=${changed.width ? after.width : value}`)
            written.width = true
        } else if (key === 'height') {
            tokens.push(`${name}=${changed.height ? after.height : value}`)
            written.height = true
        } else if (key === 'base' || key === 'baseaddress') {
            tokens.push(`${name}=${changed.base ? hex(after.baseAddress) : value}`)
            written.base = true
        } else {
            tokens.push(`${name}=${value}`)
        }
    }
    if (!written.unitWidth && !written.unitHeight && (changed.unitWidth || changed.unitHeight)) {
        if (after.unitWidth === after.unitHeight) tokens.push(`unit=${after.unitWidth}`)
        else tokens.push(`unitWidth=${after.unitWidth}`, `unitHeight=${after.unitHeight}`)
    } else {
        if (!written.unitWidth && changed.unitWidth) tokens.push(`unitWidth=${after.unitWidth}`)
        if (!written.unitHeight && changed.unitHeight) tokens.push(`unitHeight=${after.unitHeight}`)
    }
    if (!written.width && changed.width) tokens.push(`width=${after.width}`)
    if (!written.height && changed.height) tokens.push(`height=${after.height}`)
    if (!written.base && changed.base) tokens.push(`base=${hex(after.baseAddress)}`)

    lines[directive.lineIndex] = `${head} ${tokens.join(' ')}`
    return lines.join('\n')
}
