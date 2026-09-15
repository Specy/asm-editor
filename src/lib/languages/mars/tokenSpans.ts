/**
 * MARS and RARS report a diagnostic at the *start* of the token that caused it and carry nothing
 * else: an `ErrorMessage` holds a line and a single column, so Monaco was left widening every
 * MIPS and RISC-V squiggle over one character. Their tokenizers do know each token's extent, and
 * both Cores already hand it out — `getTokenizedLines()` exposes the tokenizer's own one-based
 * `sourceColumn` and the token's `value` — so the span is recovered from that here rather than
 * threaded through the seventy-odd `ErrorMessage` constructions each assembler makes.
 */

/** A token as both Cores shape it, narrowed to the two fields a span is read from. */
type SpanToken = {
    /** One-based column in the processed source line, the coordinate a diagnostic also reports. */
    readonly sourceColumn: number
    readonly value: string
}

/** A tokenized line as both Cores shape it, narrowed to what the index keys and checks. */
type SpanLine = {
    readonly sourcePath: string
    /** One-based line in `sourcePath`. */
    readonly sourceLine: number
    /** Exact line supplied in the source set, which is what the editor's model shows. */
    readonly source: string
    readonly tokens: readonly SpanToken[]
}

/** The tokens of a build, keyed by the file and line a diagnostic names. */
export type TokenSpanIndex = ReadonlyMap<string, SpanLine>

//the line leads so that a path containing a colon cannot collide with another file's line
function spanKey(file: string, sourceLine: number): string {
    return `${sourceLine}:${file}`
}

export function makeTokenSpanIndex(lines: readonly SpanLine[]): TokenSpanIndex {
    const index = new Map<string, SpanLine>()
    for (const line of lines) index.set(spanKey(line.sourcePath, line.sourceLine), line)
    return index
}

/**
 * The exclusive end column of the token a diagnostic points at, or `undefined` when no token can be
 * confirmed there — a diagnostic with no source location, a line that never tokenized, a column in
 * the whitespace between tokens, or a token whose value is not the source text it came from. The
 * caller then leaves `endColumn` unset and the marker keeps its one-character fallback.
 *
 * A token's `value` is not always what was written: a character constant arrives as the number it
 * denotes (`'a'` tokenizes to `97`), and a line the assembler rewrote — `.eqv` substitution, whose
 * columns belong to the *processed* line — no longer lines up with the source at all. Both would
 * put the end of the span somewhere the user never typed, so the value is checked against the
 * source line before its length is trusted.
 */
export function tokenSpanEnd(
    index: TokenSpanIndex,
    file: string,
    sourceLine: number,
    column: number
): number | undefined {
    if (column < 1) return undefined
    const line = index.get(spanKey(file, sourceLine))
    if (!line) return undefined
    //an exact start is what a diagnostic normally carries; containment covers the few that point
    //into a token instead of at it
    const token = line.tokens.find(
        (candidate) =>
            candidate.sourceColumn === column ||
            (candidate.sourceColumn < column &&
                column < candidate.sourceColumn + candidate.value.length)
    )
    if (!token) return undefined
    const start = token.sourceColumn - 1
    if (line.source.slice(start, start + token.value.length) !== token.value) return undefined
    return token.sourceColumn + token.value.length
}
