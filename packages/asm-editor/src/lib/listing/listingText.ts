import type { DemangledName } from '#lib/languages/demangle/demangledNames.ts'

/**
 * How a Listing writes an instruction line and its comments, shared by the generator and by the
 * lines a patch rewrites, so a patched line reads like every other.
 */

/** The column a comment starts at, counted from 1: the code is padded to the column before it. */
export const COMMENT_COLUMN = 40
/** How much of a string a comment quotes before `...`. */
export const COMMENT_STRING = 40

/** Text as a C string literal's contents: `\n`, `\t`, `\"`, `\\` and `\xNN` escapes. */
export function cEscape(text: string): string {
    let out = ''
    for (const char of text) {
        const code = char.charCodeAt(0)
        if (char === '\n') out += '\\n'
        else if (char === '\t') out += '\\t'
        else if (char === '"' || char === '\\') out += `\\${char}`
        else if (code < 0x20 || code > 0x7e) out += `\\x${code.toString(16).padStart(2, '0')}`
        else out += char
    }
    return out
}

/** A string quoted in a comment, `"Enter password: "`, cut at {@link COMMENT_STRING} characters. */
export function quotedString(text: string): string {
    const shown = text.length > COMMENT_STRING ? `${text.slice(0, COMMENT_STRING)}...` : text
    return `"${cEscape(shown)}"`
}

/** A line's code with its comments, if any, from {@link COMMENT_COLUMN}. */
export function commentedLine(code: string, comments: readonly string[]): string {
    return comments.length ? `${code.padEnd(COMMENT_COLUMN - 1)} ; ${comments.join(', ')}` : code
}

/** An instruction line: indented, with its comments, if any, from {@link COMMENT_COLUMN}. */
export function instructionLineText(instruction: string, comments: readonly string[]): string {
    return commentedLine(`    ${instruction}`, comments)
}

/**
 * What a comment says for a label with a demangled name
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision 9): its comment
 * form, then the offset an operand adds (`vtable for game::Boss+0x10`), with `"` escaped as `\"`,
 * so a template argument's string (`g<Fixed{"hello"}>()`) never reads as a string's quote.
 */
export function demangledComment(demangled: Pick<DemangledName, 'comment'>, offset = ''): string {
    return `${demangled.comment}${offset}`.replaceAll('"', '\\"')
}

/** Where a line's comment starts: its first `;` outside a string, or the line's length. */
export function commentStart(line: string): number {
    let inside = false
    for (let i = 0; i < line.length; ++i) {
        if (line[i] === '"' && line[i - 1] !== '\\') inside = !inside
        else if (line[i] === ';' && !inside) return i
    }
    return line.length
}

/**
 * The longest comment of a person's written at the end of its line
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 11); a longer one, or one of several lines, goes above the line.
 */
export const END_OF_LINE_COMMENT = 60
/** The column a person's comment written above a line is wrapped at. */
export const COMMENT_LINE_WIDTH = 100

/** What breaks a person's comment into lines: a line feed, and whatever else a text may hold. */
const LINE_BREAK = /\r\n?|\n|\u2028|\u2029/

/** Whether a person's comment is written at the end of its line: one line of at most 60 characters. */
export function endOfLineComment(comment: string): boolean {
    return comment.length <= END_OF_LINE_COMMENT && !LINE_BREAK.test(comment)
}

/**
 * A line with a person's comment at its end: after the comments the Listing writes itself, with a
 * second semicolon between them (`lea rdi, [rel s_hunter2]  ; "hunter2" ; the password`), else from
 * {@link COMMENT_COLUMN}. Either way the line ends with `; ` and the comment.
 */
export function withPersonComment(line: string, comment: string): string {
    return commentStart(line) < line.length
        ? `${line} ; ${comment}`
        : commentedLine(line, [comment])
}

/**
 * A person's comment as lines of their own, each `indent`, a semicolon and a space, then the text
 * wrapped at word boundaries to {@link COMMENT_LINE_WIDTH} columns (a word longer than a line
 * broken where it fills one), its own line breaks kept, an empty line of it a bare semicolon.
 */
export function commentLines(comment: string, indent: string): string[] {
    const prefix = `${indent};`
    const width = Math.max(1, COMMENT_LINE_WIDTH - prefix.length - 1)
    const lines: string[] = []
    for (const paragraph of comment.split(LINE_BREAK)) {
        let rest = paragraph.trimEnd()
        while (rest.length > width) {
            let cut = rest.lastIndexOf(' ', width)
            let piece = cut > 0 ? rest.slice(0, cut).trimEnd() : ''
            if (!piece) {
                cut = width
                piece = rest.slice(0, width)
            }
            lines.push(`${prefix} ${piece}`)
            rest = rest.slice(cut).replace(/^ +/, '')
        }
        lines.push(rest ? `${prefix} ${rest}` : prefix)
    }
    return lines
}

/**
 * The comment for a name an operand or a pointer is written with, `name` or `name+0x10`, when the
 * label it names has a demangled name, else undefined: blocks, numbers and raw names get none.
 */
export function nameComment(
    written: string,
    demangledOf: (name: string) => DemangledName | undefined
): string | undefined {
    const match = /^([^+-]+)([+-]0x[\da-f]+)?$/.exec(written)
    const demangled = match ? demangledOf(match[1]) : undefined
    return demangled && demangledComment(demangled, match![2])
}
