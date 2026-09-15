import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'

/**
 * The Z80's `@screen` comment directive: how a program states which Screen mode it wants, so that
 * opening a source and pressing Build puts the Screen in it with no manual step.
 *
 * ```asm
 * ; @screen trs80
 * ```
 *
 * It is a comment, so the same file still assembles anywhere else — which is the point: a program
 * written for the machine elsewhere needs this one line added and nothing else. And it is read at
 * Build, so the mode is right before the first instruction and during a testcase run rather than
 * part way through. The same shape as the MIPS and RISC-V `@screen` directive of
 * `src/lib/languages/mars/screenDirective.ts`, which this follows deliberately.
 *
 * Anything it gets wrong is a warning on its own line and never an error: a comment must not stop a
 * program that assembles.
 *
 * Plain TypeScript, no runes and no Core.
 */

/** Which Screen the program wants: the drawing commands of ADR 0011, or the TRS-80's memory. */
export type Z80ScreenMode = 'drawing' | 'cells'

export type Z80ScreenDirectiveParse = {
    /** `null` when the source names no directive at all, which leaves the default mode. */
    mode: Z80ScreenMode | null
    diagnostics: Diagnostic[]
}

/** `;` before the keyword so the line is a comment in every Z80 assembler; `;;` and `;@screen` too. */
const DIRECTIVE_PATTERN = /;+[ \t]*@screen\b/i

/** What a program may write, including the `mode=` form the MARS directive's parameters look like. */
const MODES: Readonly<Record<string, Z80ScreenMode>> = {
    trs80: 'cells',
    'trs-80': 'cells',
    cells: 'cells',
    drawing: 'drawing',
    ports: 'drawing'
}

const KNOWN_MODES = 'trs80, drawing'

export function parseZ80ScreenDirective(code: string): Z80ScreenDirectiveParse {
    const diagnostics: Diagnostic[] = []
    let mode: Z80ScreenMode | null = null
    let firstLine = 0
    const lines = code.split('\n')
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineText = lines[lineIndex] ?? ''
        const match = DIRECTIVE_PATTERN.exec(lineText)
        if (!match) continue
        const column = match.index + match[0].indexOf('@') + 1
        if (mode !== null) {
            diagnostics.push(
                warning(
                    lineIndex,
                    column,
                    lineText,
                    `A program has one @screen directive; this one is ignored, the one on line ${firstLine + 1} is used.`
                )
            )
            continue
        }
        const rest = lineText.slice(match.index + match[0].length).trim()
        //`mode=trs80` and a bare `trs80` both read, since the MIPS directive spells its parameters
        //with an `=` and a reader moving between the two should not have to remember which is which
        const word = rest.replace(/^mode[ \t]*=[ \t]*/i, '').split(/[\s,]+/)[0] ?? ''
        if (word.length === 0) {
            diagnostics.push(
                warning(lineIndex, column, lineText, `@screen needs a mode: ${KNOWN_MODES}.`)
            )
            continue
        }
        const named = MODES[word.toLowerCase()]
        if (named === undefined) {
            diagnostics.push(
                warning(
                    lineIndex,
                    column,
                    lineText,
                    `Unknown @screen mode "${word}"; the modes are ${KNOWN_MODES}.`
                )
            )
            continue
        }
        mode = named
        firstLine = lineIndex
    }
    return { mode, diagnostics }
}

function warning(lineIndex: number, column: number, lineText: string, message: string): Diagnostic {
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
