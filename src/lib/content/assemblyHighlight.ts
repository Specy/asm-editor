import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * The assembly highlighter for the code block a prerendered lecture carries in place of a
 * playground, before the client swaps the embed in
 * ([the renderer](../../components/shared/markdown/MarkdownRenderer.svelte)).
 *
 * Monaco does the real highlighting once the editor is there, and shiki does it for the ordinary
 * fences around it, but neither can run here: Monaco is the editor being replaced, and shiki's
 * highlighter is asynchronous, while this block is built in Carta's synchronous pass. Pulling
 * shiki's grammars and themes in synchronously would move ~128KB of them onto the critical path of
 * every lecture to colour a block that is about to be thrown away, so this reads the structure
 * instead of the language: what a line is made of, not which mnemonics an architecture has.
 *
 * That is enough for the six languages, because they differ mostly in what a comment starts with
 * and what a `$` means, and because a reader is looking at shapes here rather than reading closely.
 * Anything it is unsure of stays plain, which is the honest answer for a placeholder.
 *
 * Plain TypeScript, no runes and no DOM, so the renderer builds the spans and a test can read the
 * tokens directly.
 */

export type AssemblyTokenKind =
    'comment' | 'string' | 'label' | 'directive' | 'mnemonic' | 'number' | 'plain'

export type AssemblyToken = {
    kind: AssemblyTokenKind
    text: string
}

type Syntax = {
    /** What starts a comment that runs to the end of the line. */
    lineComment: string[]
    /** `*` in the first column, which the M68K assemblers read as a whole-line comment. */
    starComment: boolean
    /**
     * Whether `$` introduces a hex literal, as it does for the two 8/16-bit-era assemblers, or
     * belongs to a name, as MIPS's `$t0` does.
     */
    dollarIsHex: boolean
    /** Whether `%` introduces a binary literal, as M68K's `%1010` does. */
    percentIsBinary: boolean
}

const SYNTAX: Record<AvailableLanguages, Syntax> = {
    M68K: { lineComment: [';'], starComment: true, dollarIsHex: true, percentIsBinary: true },
    Z80: { lineComment: [';'], starComment: false, dollarIsHex: true, percentIsBinary: false },
    X86: { lineComment: [';'], starComment: false, dollarIsHex: false, percentIsBinary: false },
    MIPS: { lineComment: ['#'], starComment: false, dollarIsHex: false, percentIsBinary: false },
    'RISC-V': {
        lineComment: ['#'],
        starComment: false,
        dollarIsHex: false,
        percentIsBinary: false
    },
    'RISC-V-64': {
        lineComment: ['#'],
        starComment: false,
        dollarIsHex: false,
        percentIsBinary: false
    }
}

const isDigit = (c: string) => c >= '0' && c <= '9'
const isHex = (c: string) => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
const isNameStart = (c: string) => /[A-Za-z_]/.test(c)
const isNameBody = (c: string) => /[A-Za-z0-9_.]/.test(c)

/**
 * What turns the name before it into a label rather than an instruction. `count equ 12` names a
 * constant, and all six assemblers spell that as a bare name followed by one of these, with no
 * colon to give it away. It is the one shape the positional rule below reads backwards, and the
 * courses open with hundreds of them.
 */
const ASSIGNMENT = /^[ \t]*(equ|eqv|set|=)\b/i

/**
 * The tokens of one line. Statement position decides what a name is: the first one is the
 * instruction unless it is a label, in which case the one after it is. Everything that is not a
 * comment, a string, a name or a number - separators, registers, the operands themselves - stays
 * plain, because telling a register from any other name needs the word lists this deliberately
 * does without.
 */
function tokenizeLine(line: string, syntax: Syntax): AssemblyToken[] {
    const tokens: AssemblyToken[] = []
    //`*` is only a comment where the M68K assemblers read one: the very start of a line
    if (syntax.starComment && line.startsWith('*')) return [{ kind: 'comment', text: line }]

    let cursor = 0
    let seenInstruction = false
    const push = (kind: AssemblyTokenKind, text: string) => {
        if (text.length === 0) return
        const last = tokens[tokens.length - 1]
        if (last?.kind === kind && kind === 'plain') last.text += text
        else tokens.push({ kind, text })
    }

    while (cursor < line.length) {
        const char = line[cursor]

        if (syntax.lineComment.includes(char)) {
            push('comment', line.slice(cursor))
            break
        }

        if (char === '"' || char === "'") {
            let end = cursor + 1
            while (end < line.length && line[end] !== char) {
                //a backslash takes the character after it with it, so an escaped quote does not
                //close the string
                end += line[end] === '\\' ? 2 : 1
            }
            //an unterminated string runs to the end of the line rather than swallowing the next one
            const close = Math.min(end + 1, line.length)
            push('string', line.slice(cursor, close))
            cursor = close
            continue
        }

        //a directive carries its dot: `.text`, `.globl`. A mnemonic's own dot does not start one,
        //because `move.l` begins with a letter
        if (char === '.' && cursor + 1 < line.length && isNameStart(line[cursor + 1])) {
            let end = cursor + 1
            while (end < line.length && isNameBody(line[end])) end += 1
            push('directive', line.slice(cursor, end))
            //a statement that opens with a directive has no instruction, so the names after it are
            //its operands: `.eqv COUNT 12` names a constant, it does not call `COUNT`
            seenInstruction = true
            cursor = end
            continue
        }

        if (isNameStart(char) || (char === '$' && !syntax.dollarIsHex)) {
            let end = cursor + 1
            while (end < line.length && isNameBody(line[end])) end += 1
            const name = line.slice(cursor, end)
            if (line[end] === ':') {
                push('label', name)
                push('plain', ':')
                cursor = end + 1
                continue
            }
            if (!seenInstruction && char !== '$') {
                //the name being assigned to is a label; the word doing the assigning reads as the
                //operation of the line, which is what it is
                if (ASSIGNMENT.test(line.slice(end))) push('label', name)
                else {
                    seenInstruction = true
                    push('mnemonic', name)
                }
            } else {
                push('plain', name)
            }
            cursor = end
            continue
        }

        //`#` is the immediate marker everywhere it is not a comment, and it reads as part of the
        //literal it introduces: `#$FF`, `#10`
        const numberStart = char === '#' ? cursor + 1 : cursor
        const lead = line[numberStart]
        const isNumber =
            (lead !== undefined && isDigit(lead)) ||
            (lead === '$' && syntax.dollarIsHex && isHex(line[numberStart + 1] ?? '')) ||
            (lead === '%' && syntax.percentIsBinary && /[01]/.test(line[numberStart + 1] ?? ''))
        if (isNumber) {
            let end = numberStart + (isDigit(lead) ? 0 : 1)
            //`0x`/`0b` prefixes, a Z80 `0FFh` suffix and plain digits all read as one run
            if (line[end] === '0' && /[xXbB]/.test(line[end + 1] ?? '')) end += 2
            while (end < line.length && (isHex(line[end]) || line[end] === '_')) end += 1
            if (/[hH]/.test(line[end] ?? '') && !isNameBody(line[end + 1] ?? '')) end += 1
            push('number', line.slice(cursor, end))
            cursor = end
            continue
        }

        push('plain', char)
        cursor += 1
    }
    return tokens
}

/**
 * The tokens of a whole program, one array per line, with the newlines left out: the renderer puts
 * them back between the lines it builds. A language the highlighter has no syntax for renders
 * plain, which is what it did before there was one.
 */
export function tokenizeAssembly(code: string, language: AvailableLanguages): AssemblyToken[][] {
    const syntax = SYNTAX[language]
    return code
        .split('\n')
        .map((line) =>
            syntax ? tokenizeLine(line, syntax) : [{ kind: 'plain' as const, text: line }]
        )
}
