/**
 * What a person's comment on an Executable may be
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 5):
 * text of at most 4,000 characters on at most 40 lines, which the Listing writes after a semicolon
 * and the Pseudocode in a C comment.
 */

/** The most characters a comment holds, counted as JavaScript counts a string's length. */
export const COMMENT_LENGTH_LIMIT = 4000
/** The most lines a comment holds. */
export const COMMENT_LINE_LIMIT = 40

/**
 * Whether `text` holds a character no comment holds, once {@link normalizeComment} has turned line
 * breaks into `\n` and tabs into spaces: a C0 or C1 control but the line feed, or Unicode's line or
 * paragraph separator, which would break a Listing line where Monaco does not.
 */
function holdsControl(text: string): boolean {
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index)
        if (
            (code <= 0x1f && code !== 0x0a) ||
            (code >= 0x7f && code <= 0x9f) ||
            code === 0x2028 ||
            code === 0x2029
        )
            return true
    }
    return false
}

/**
 * A comment as it is kept: every line break a `\n`, a tab four spaces, no blank at the end of a
 * line, and no empty line before the first or after the last. Empty when there is nothing to keep,
 * which deletes the comment.
 */
export function normalizeComment(text: string): string {
    return text
        .replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n')
        .replace(/\t/g, '    ')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/^\n+|\n+$/g, '')
}

const count = (value: number) => value.toLocaleString('en-US')

/**
 * Why a comment as {@link normalizeComment} leaves it cannot be kept, as a sentence for the prompt,
 * or undefined when it can. An empty comment can: saving one deletes the comment there.
 */
export function commentProblem(text: string): string | undefined {
    if (holdsControl(text)) return 'A comment cannot hold control characters'
    if (text.length > COMMENT_LENGTH_LIMIT)
        return `A comment has at most ${count(COMMENT_LENGTH_LIMIT)} characters, and this one has ${count(text.length)}`
    const lines = text ? text.split('\n').length : 0
    if (lines > COMMENT_LINE_LIMIT)
        return `A comment has at most ${COMMENT_LINE_LIMIT} lines, and this one has ${lines}`
    return undefined
}
