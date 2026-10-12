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

/** An instruction line: indented, with its comments, if any, from {@link COMMENT_COLUMN}. */
export function instructionLineText(instruction: string, comments: readonly string[]): string {
    const text = `    ${instruction}`
    return comments.length ? `${text.padEnd(COMMENT_COLUMN - 1)} ; ${comments.join(', ')}` : text
}
