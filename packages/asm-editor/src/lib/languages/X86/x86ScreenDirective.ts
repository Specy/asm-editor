import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { clampSize, type MarsDisplayOrigin } from '#lib/languages/mars/marsDisplay.ts'
import { ENTRY_PATTERN, makeWarning, readNumber } from '#lib/languages/mars/screenDirective.ts'
import {
    normalizeX86Display,
    snapX86DisplayWidth,
    X86_DISPLAY_SIZE_MAX,
    X86_DISPLAY_SIZE_MIN,
    type X86Display
} from './x86Display'

/**
 * The `@screen` comment directive on x86: how a program states the size of its framebuffer, so that
 * opening an Example and pressing Build gives `/dev/fb0` that size with no manual step (decision 13
 * of [the plan](../../../../../../docs/design/x86-devices-plan.md)). The grammar is MIPS's and
 * RISC-V's (`../mars/screenDirective.ts`) with the two settings x86 has:
 *
 * ```asm
 * ; @screen width=320 height=240
 * ```
 *
 * ```c
 * // @screen width=320 height=240
 * ```
 *
 * It is read from the Entry file's source: a `;` comment of a NASM Entry file, or a `//` or
 * `/* *\/` comment of the C or C++ source a Generated assembly Entry was compiled from, since C
 * comments do not reach the Generated assembly. Anything it gets wrong is a warning on its own line
 * and never an error: a comment must not stop a program that builds.
 *
 * Plain TypeScript, no runes and no Core.
 */

/** Which comments a File's `@screen` is read from: NASM's `;`, or C's and C++'s `//` and `/* *\/`. */
export type X86CommentStyle = 'nasm' | 'c'

/** One parsed directive: where it is, and the sizes it names. Anything absent stays as it was. */
export type X86ScreenDirective = {
    /** 0 based, the editor's own line numbering, which is what a `Diagnostic` carries. */
    lineIndex: number
    /** 1 based, monaco's column of the `@`. */
    column: number
    width?: number
    height?: number
}

export type X86ScreenDirectiveParse = {
    /** `null` when the source names no directive at all: the user's configuration stands. */
    directive: X86ScreenDirective | null
    diagnostics: Diagnostic[]
}

/** x86's display together with where it came from, which is what the Display section shows. */
export type X86DisplayConfiguration = {
    display: X86Display
    origin: MarsDisplayOrigin
}

export type X86ScreenDirectiveApplication = X86DisplayConfiguration & {
    /** Everything the directive got wrong, on its own line, as warnings. */
    diagnostics: Diagnostic[]
}

/** The text of one comment on one line: `[start, end)` of the line, after the comment's opener. */
type CommentSegment = { lineIndex: number; start: number; end: number }

/** One `@screen` in a comment, with the part of its line that holds its settings. */
type DirectiveSite = { lineIndex: number; column: number; bodyStart: number; bodyEnd: number }

/**
 * What may come between a comment's opener and the keyword: more of the opener (`;;`, `///`,
 * `/**`), a block comment's leading `*` on a later line, and space.
 */
const DIRECTIVE_START: Record<X86CommentStyle, RegExp> = {
    nasm: /^;*[ \t]*@screen\b/i,
    c: /^[ \t*/!]*@screen\b/i
}

const EXAMPLE: Record<X86CommentStyle, string> = {
    nasm: '; @screen width=320 height=240',
    c: '// @screen width=320 height=240'
}

/** A raw string's opening quote, delimiter and parenthesis, which C++ limits to 16 characters. */
const RAW_STRING_OPEN = /^"[^\s()\\]{0,16}\(/

/** The C and C++ sources and headers, whose comments are C's; anything else is NASM. */
const C_FILE = /\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/i

export function x86CommentStyle(path: string): X86CommentStyle {
    return C_FILE.test(path) ? 'c' : 'nasm'
}

/**
 * The File an x86 Program's `@screen` comment is read from: the C or C++ source its Generated
 * assembly Entry was compiled from (`entrySource`), while that File is in the Project, and the
 * Entry itself otherwise.
 */
export function x86ScreenDirectiveFile(
    files: Readonly<Record<string, unknown>>,
    entry: string,
    entrySource: string | undefined
): string {
    return entrySource !== undefined && Object.hasOwn(files, entrySource) ? entrySource : entry
}

/**
 * The display a Build's `@screen` comment asks for, on top of `current`, with its warnings on the
 * File the comment is read from (`x86ScreenDirectiveFile`). An Entry that is no text, such as an
 * Executable, names none.
 */
export function readX86ScreenDirective(
    sources: Pick<BuildSources, 'files' | 'entry' | 'entrySource'>,
    current: X86Display
): X86ScreenDirectiveApplication {
    const path = x86ScreenDirectiveFile(sources.files, sources.entry, sources.entrySource)
    const file = sources.files[path]
    if (file?.encoding !== 'plain') return { display: current, origin: 'user', diagnostics: [] }
    const applied = applyX86ScreenDirective(file.content, x86CommentStyle(path), current)
    return {
        ...applied,
        diagnostics: applied.diagnostics.map((diagnostic) => ({ ...diagnostic, file: path }))
    }
}

/**
 * Reads the first `@screen` comment of a File. A second one is reported and ignored, so the size a
 * program asks for is always the one a reader sees first.
 */
export function parseX86ScreenDirective(
    code: string,
    style: X86CommentStyle
): X86ScreenDirectiveParse {
    const diagnostics: Diagnostic[] = []
    let directive: X86ScreenDirective | null = null
    const lines = code.split('\n')
    for (const site of directiveSites(code, lines, style)) {
        if (directive) {
            diagnostics.push(
                makeWarning(
                    site.lineIndex,
                    site.column,
                    `Only the first @screen directive is used (line ${directive.lineIndex + 1}). This directive is ignored.`
                )
            )
            continue
        }
        directive = { lineIndex: site.lineIndex, column: site.column }
        const body = (lines[site.lineIndex] ?? '').slice(site.bodyStart, site.bodyEnd)
        readEntries(directive, body, style, diagnostics)
    }
    return { directive, diagnostics }
}

/**
 * The display a File's source asks for, on top of the one the Program already has: a directive
 * names only what it cares about, and what it leaves out keeps its value.
 */
export function applyX86ScreenDirective(
    code: string,
    style: X86CommentStyle,
    current: X86Display
): X86ScreenDirectiveApplication {
    const { directive, diagnostics } = parseX86ScreenDirective(code, style)
    if (!directive) return { display: current, origin: 'user', diagnostics }
    return {
        display: normalizeX86Display({
            width: directive.width ?? current.width,
            height: directive.height ?? current.height
        }),
        origin: 'directive',
        diagnostics
    }
}

/**
 * The source with its `@screen` comment rewritten to say what the user chose in the Display
 * section, so the code and the section agree and the next Build reads the choice back, as
 * `rewriteScreenDirective` does for MIPS and RISC-V: only a size that changed is touched, under its
 * own spelling, one the comment lacks is appended, and what follows the settings on the line, a
 * block comment's `*\/` say, is kept.
 *
 * `null` when the File has no directive: the choice is then the Program's alone.
 */
export function rewriteX86ScreenDirective(
    code: string,
    style: X86CommentStyle,
    before: X86Display,
    after: X86Display
): string | null {
    const lines = code.split('\n')
    const site = directiveSites(code, lines, style)[0]
    if (!site) return null
    const changed = { width: after.width !== before.width, height: after.height !== before.height }
    if (!changed.width && !changed.height) return code
    const line = lines[site.lineIndex] ?? ''
    const tokens: string[] = []
    const written = { width: false, height: false }
    let rest = line.slice(site.bodyStart, site.bodyEnd)
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
        const key = name.toLowerCase()
        if (key === 'width' || key === 'height') {
            tokens.push(`${name}=${changed[key] ? after[key] : value}`)
            written[key] = true
        } else {
            tokens.push(`${name}=${value}`)
        }
    }
    if (!written.width && changed.width) tokens.push(`width=${after.width}`)
    if (!written.height && changed.height) tokens.push(`height=${after.height}`)
    //a block comment's close, or a line's carriage return, stays after the settings
    const following = line.slice(site.bodyEnd).replace(/^[ \t]+/, '')
    const tail = following === '' || following === '\r' ? following : ` ${following}`
    lines[site.lineIndex] = `${line.slice(0, site.bodyStart)} ${tokens.join(' ')}${tail}`
    return lines.join('\n')
}

function readEntries(
    directive: X86ScreenDirective,
    body: string,
    style: X86CommentStyle,
    diagnostics: Diagnostic[]
): void {
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
                    `"${stray}" must be written as name=value. For example: ${EXAMPLE[style]}.`
                )
            )
            return
        }
        rest = rest.slice(entry[0].length)
        readEntry(directive, entry[1] ?? '', entry[2] ?? '', diagnostics)
    }
}

function readEntry(
    directive: X86ScreenDirective,
    name: string,
    value: string,
    diagnostics: Diagnostic[]
): void {
    const key = name.toLowerCase().replace(/[-_]/g, '')
    if (key === 'unit' || key === 'unitwidth' || key === 'unitheight') {
        diagnostics.push(
            warnOn(
                directive,
                `"${name}" is not an x86 screen setting. Use the Screen's zoom to enlarge pixels. The settings are width and height.`
            )
        )
        return
    }
    if (key === 'base' || key === 'baseaddress') {
        diagnostics.push(
            warnOn(
                directive,
                `"${name}" is not an x86 screen setting. Use mmap to map /dev/fb0 into the program. The settings are width and height.`
            )
        )
        return
    }
    if (key !== 'width' && key !== 'height') {
        diagnostics.push(
            warnOn(directive, `"${name}" is not an x86 screen setting. Use width or height.`)
        )
        return
    }
    const parsed = readNumber(value)
    if (parsed === null) {
        diagnostics.push(
            warnOn(
                directive,
                `"${value}" is not a valid number for ${name}. The previous value is kept.`
            )
        )
        return
    }
    const clamped = clampSize(parsed, X86_DISPLAY_SIZE_MIN, X86_DISPLAY_SIZE_MAX, parsed)
    if (clamped !== parsed) {
        //the nearest size the display takes keeps the program running and the picture close
        diagnostics.push(
            warnOn(
                directive,
                `${name} must be between ${X86_DISPLAY_SIZE_MIN} and ${X86_DISPLAY_SIZE_MAX} pixels. Using ${clamped} instead of ${parsed}.`
            )
        )
    }
    if (key === 'height') {
        directive.height = clamped
        return
    }
    const snapped = snapX86DisplayWidth(clamped, clamped)
    if (snapped !== clamped) {
        diagnostics.push(
            warnOn(
                directive,
                `The screen width must be a multiple of 8 pixels. Using ${snapped} instead of ${parsed}.`
            )
        )
    }
    directive.width = snapped
}

function warnOn(directive: X86ScreenDirective, message: string): Diagnostic {
    return makeWarning(directive.lineIndex, directive.column, message)
}

/** Every `@screen` in the File's comments, in order, at most one in each comment line. */
function directiveSites(code: string, lines: string[], style: X86CommentStyle): DirectiveSite[] {
    const segments = style === 'nasm' ? nasmComments(lines) : cComments(code)
    const sites: DirectiveSite[] = []
    for (const segment of segments) {
        const text = (lines[segment.lineIndex] ?? '').slice(segment.start, segment.end)
        const match = DIRECTIVE_START[style].exec(text)
        if (!match) continue
        const bodyStart = segment.start + match[0].length
        sites.push({
            lineIndex: segment.lineIndex,
            column: bodyStart - '@screen'.length + 1,
            bodyStart,
            bodyEnd: segment.end
        })
    }
    return sites
}

/** A line's end, before the carriage return of a CRLF File, which a rewrite keeps where it was. */
function contentEnd(line: string): number {
    return line.endsWith('\r') ? line.length - 1 : line.length
}

/** Each line's comment: from its first `;` outside NASM's three kinds of quotes to the end. */
function nasmComments(lines: string[]): CommentSegment[] {
    const segments: CommentSegment[] = []
    lines.forEach((line, lineIndex) => {
        let quote: string | null = null
        for (let i = 0; i < line.length; i++) {
            const character = line[i]
            if (quote !== null) {
                //only backquoted strings take backslash escapes
                if (quote === '`' && character === '\\') i++
                else if (character === quote) quote = null
            } else if (character === '"' || character === "'" || character === '`') {
                quote = character
            } else if (character === ';') {
                segments.push({ lineIndex, start: i + 1, end: contentEnd(line) })
                return
            }
        }
    })
    return segments
}

/**
 * The text of every C or C++ comment, line by line: a `//` comment's rest of the line, and each line
 * of a `/* *\/` comment up to its close. Strings, character literals and raw strings are skipped, so
 * a `"// @screen"` in a string is no directive.
 */
function cComments(code: string): CommentSegment[] {
    const segments: CommentSegment[] = []
    let lineIndex = 0
    let lineStart = 0
    let i = 0
    const length = code.length
    /** Moves past one character, counting the line it ends. */
    const step = () => {
        if (code[i] === '\n') {
            lineIndex++
            lineStart = i + 1
        }
        i++
    }
    const lineEnd = (at: number) => (at > lineStart && code[at - 1] === '\r' ? at - 1 : at)
    while (i < length) {
        const character = code[i]
        const next = code[i + 1]
        if (character === '/' && next === '/') {
            let end = code.indexOf('\n', i)
            if (end < 0) end = length
            segments.push({ lineIndex, start: i + 2 - lineStart, end: lineEnd(end) - lineStart })
            i = end
        } else if (character === '/' && next === '*') {
            i += 2
            let start = i
            while (i < length && !(code[i] === '*' && code[i + 1] === '/')) {
                if (code[i] === '\n') {
                    segments.push({
                        lineIndex,
                        start: start - lineStart,
                        end: lineEnd(i) - lineStart
                    })
                    step()
                    start = i
                } else {
                    step()
                }
            }
            segments.push({ lineIndex, start: start - lineStart, end: lineEnd(i) - lineStart })
            i += 2
        } else if (
            character === '"' &&
            code[i - 1] === 'R' &&
            RAW_STRING_OPEN.test(code.slice(i, i + 19))
        ) {
            //a C++ raw string, R"delimiter( ... )delimiter", which may hold anything, newlines too
            const delimiter = code.slice(i + 1, code.indexOf('(', i))
            const close = code.indexOf(`)${delimiter}"`, i)
            const end = close < 0 ? length : close + delimiter.length + 2
            while (i < end) step()
        } else if (character === '"' || (character === "'" && !/[0-9]/.test(code[i - 1] ?? ''))) {
            //a string or a character literal, which ends at its quote or, unterminated, at the line
            step()
            while (i < length && code[i] !== character && code[i] !== '\n') {
                if (code[i] === '\\') step()
                step()
            }
            if (code[i] === character) step()
        } else {
            step()
        }
    }
    return segments
}
