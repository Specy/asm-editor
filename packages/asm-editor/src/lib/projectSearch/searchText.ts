import { partitionPoint } from '#lib/sorted.ts'
import { isWholeWord, type Matcher } from './query.ts'

/**
 * Matching one text for the Search panel
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 26
 * and 27): every match counted, and the lines holding them as rows, up to a limit. What a text
 * needs for it, its line starts and its lower-case copy, is made on its first search and kept with
 * it, so that searching as one types pays for them once (the research's "Search cost").
 */

/** The longest row text: a longer line is cut to this much around its first match. */
export const ROW_TEXT_LIMIT = 1_000
/** How much of a cut line its row keeps before the line's first match. */
const ROW_CONTEXT = 100

const LF = 0x0a
const CR = 0x0d

/**
 * One match on a row's line. `start` and `end` are UTF-16 offsets into the line, end exclusive,
 * as `line.slice(start, end)` takes them (Monaco's columns are one more), and into the whole line
 * even when the row's text is cut ({@link SearchRow.textStart}). A zero-length match (`^`, `\b`)
 * has `start === end`.
 */
export type SearchRange = {
    start: number
    end: number
    /**
     * Only for a match that runs past its line, which a regular expression naming a line break
     * does: the 1-based line it ends on and the offset there; `end` is then the line's length.
     */
    endLine?: number
    endColumn?: number
}

/** One line holding a match. */
export type SearchRow = {
    /**
     * 1-based, as the panel shows it and Monaco numbers lines; `\n`, `\r\n` and a lone `\r` each
     * end one, as in Monaco. (A Listing's own line table is 0-based.)
     */
    line: number
    /**
     * The line without its line break; a line longer than {@link ROW_TEXT_LIMIT} is cut to that
     * many code units, from a little before its first match.
     */
    text: string
    /** Where `text` starts in the line: 0 unless the line was cut. */
    textStart: number
    /** Its matches, in order; on a cut line, only those starting inside `text`. */
    ranges: SearchRange[]
}

/** What one text holds of a query. */
export type TextMatches = {
    /** Every match. */
    matches: number
    /** Every line holding one: as many rows as there would be with no limit. */
    lines: number
    /** The first `lines`, at most as many as the limit given. */
    rows: SearchRow[]
}

/** A text as the search worker keeps it, with what searching it needs, made once when first needed. */
export class SearchText {
    readonly text: string
    private starts: Int32Array | undefined
    /** `null` once lowering is known to change the text's length. */
    private folded: string | null | undefined

    constructor(text: string) {
        this.text = text
    }

    /**
     * The text in lower case, for a query in any case, or `undefined` when lowering changes its
     * length (`İ` becomes two code units), so that an offset in it would not be one in the text.
     */
    get lowered(): string | undefined {
        if (this.folded === undefined) {
            const lowered = this.text.toLowerCase()
            this.folded = lowered.length === this.text.length ? lowered : null
        }
        return this.folded ?? undefined
    }

    /** Where each 0-based line starts: after `\n`, `\r\n` or a lone `\r`, as Monaco counts lines. */
    get lineStarts(): Int32Array {
        return (this.starts ??= lineStarts(this.text))
    }

    /** The 0-based line holding `offset`; `from`, a line at or before it when known, saves a search. */
    lineAt(offset: number, from = 0): number {
        const starts = this.lineStarts
        const low = from < starts.length && starts[from] <= offset ? from : 0
        if (low + 1 >= starts.length || offset < starts[low + 1]) return low
        return partitionPoint(starts.length, (line) => starts[line] <= offset) - 1
    }

    /** Where a 0-based line's text ends: at its line break, or at the text's end. */
    lineEnd(line: number): number {
        const starts = this.lineStarts
        if (line + 1 >= starts.length) return this.text.length
        const next = starts[line + 1]
        const crlf =
            next - 2 >= starts[line] &&
            this.text.charCodeAt(next - 1) === LF &&
            this.text.charCodeAt(next - 2) === CR
        return crlf ? next - 2 : next - 1
    }
}

function lineStarts(text: string): Int32Array {
    const starts = [0]
    if (text.indexOf('\r') < 0)
        for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1))
            starts.push(at + 1)
    else
        for (let at = 0; at < text.length; at++) {
            const code = text.charCodeAt(at)
            if (code === LF) starts.push(at + 1)
            else if (code === CR) {
                if (text.charCodeAt(at + 1) === LF) at++
                starts.push(at + 1)
            }
        }
    return Int32Array.from(starts)
}

/**
 * Every match of `matcher` in `text`, counted, and the lines holding them as rows, the first
 * `maxRows` of them; past the limit, matches and lines are only counted, which costs a third of
 * building their rows.
 */
export function searchText(text: SearchText, matcher: Matcher, maxRows: number): TextMatches {
    const rows: SearchRow[] = []
    const starts = text.lineStarts
    let matches = 0
    let lines = 0
    let line = -1
    let lineStart = 0
    let lineEnd = 0
    let nextStart = 0
    let row: SearchRow | undefined
    eachMatch(text, matcher, (start, end) => {
        matches++
        //a match starting in a line's break (one naming `\n`) is that line's
        if (line < 0 || start >= nextStart) {
            line = text.lineAt(start, Math.max(line, 0))
            lineStart = starts[line]
            lineEnd = text.lineEnd(line)
            nextStart = line + 1 < starts.length ? starts[line + 1] : Infinity
            lines++
            row = rows.length < maxRows ? newRow(text, line, lineStart, lineEnd, start) : undefined
            if (row) rows.push(row)
        }
        if (row) addRange(text, row, line, lineStart, lineEnd, start, end)
    })
    return { matches, lines, rows }
}

function newRow(
    text: SearchText,
    line: number,
    lineStart: number,
    lineEnd: number,
    first: number
): SearchRow {
    const length = lineEnd - lineStart
    if (length <= ROW_TEXT_LIMIT)
        return {
            line: line + 1,
            text: text.text.slice(lineStart, lineEnd),
            textStart: 0,
            ranges: []
        }
    let from = Math.max(0, Math.min(first - lineStart - ROW_CONTEXT, length - ROW_TEXT_LIMIT))
    //never half of a surrogate pair at either end
    if (from > 0 && isLowSurrogate(text.text.charCodeAt(lineStart + from))) from--
    let to = from + ROW_TEXT_LIMIT
    if (to < length && isLowSurrogate(text.text.charCodeAt(lineStart + to))) to--
    return {
        line: line + 1,
        text: text.text.slice(lineStart + from, lineStart + to),
        textStart: from,
        ranges: []
    }
}

function addRange(
    text: SearchText,
    row: SearchRow,
    line: number,
    lineStart: number,
    lineEnd: number,
    start: number,
    end: number
) {
    const from = Math.min(start, lineEnd) - lineStart
    if (from < row.textStart || from > row.textStart + row.text.length) return
    if (end <= lineEnd) return void row.ranges.push({ start: from, end: end - lineStart })
    const length = lineEnd - lineStart
    const last = text.lineAt(end, line)
    if (last === line) return void row.ranges.push({ start: from, end: length })
    const lastStart = text.lineStarts[last]
    row.ranges.push({
        start: from,
        end: length,
        endLine: last + 1,
        endColumn: Math.min(end, text.lineEnd(last)) - lastStart
    })
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/**
 * Calls `found` with each match's start and end offsets in the text, in order, matches not
 * overlapping, as `String.prototype.matchAll` finds them: after a zero-length match the search
 * moves on a character. A match "Match whole word" refuses is skipped, and the search goes on
 * from its next character, so `a a` is found in `ba a a`.
 */
export function eachMatch(
    text: SearchText,
    matcher: Matcher,
    found: (start: number, end: number) => void
): void {
    if (matcher.kind === 'regex')
        return eachRegexMatch(text, matcher.pattern, matcher.wholeWord, matcher.singleLine, found)
    let haystack = text.text
    if (matcher.anyCase) {
        const lowered = text.lowered
        if (lowered === undefined)
            return eachRegexMatch(text, matcher.fallback!, matcher.wholeWord, false, found)
        haystack = lowered
    }
    const { needle, wholeWord } = matcher
    const length = needle.length
    for (let at = haystack.indexOf(needle); at >= 0;) {
        if (wholeWord && !isWholeWord(text.text, at, at + length)) {
            at = haystack.indexOf(needle, at + 1)
            continue
        }
        found(at, at + length)
        at = haystack.indexOf(needle, at + length)
    }
}

/**
 * The matches of a regular expression, with `m` so `^` and `$` are a line's. With `singleLine`,
 * each line is searched as if it were the whole text, so no match runs past its line's end (`\s+`
 * at the end of a line) or starts in a line break (`^` between `\r` and `\n`), and no attempt
 * reads past it either: over the whole text, `call[\s\S]*ret` would read to the text's end from
 * every `call`, past the search's time limit on a static program's 150,000-line Listing. A pattern
 * that names a line break is matched over the whole text.
 */
function eachRegexMatch(
    text: SearchText,
    pattern: RegExp,
    wholeWord: boolean,
    singleLine: boolean,
    found: (start: number, end: number) => void
) {
    if (singleLine) {
        const starts = text.lineStarts
        for (let line = 0; line < starts.length; line++)
            eachLineMatch(text, pattern, wholeWord, line, starts[line], text.lineEnd(line), found)
        return
    }
    const subject = text.text
    const unicode = pattern.unicode
    let from = 0
    while (from <= subject.length) {
        pattern.lastIndex = from
        const match = pattern.exec(subject)
        if (!match) return
        const start = match.index
        const end = start + match[0].length
        if (wholeWord && !isWholeWord(subject, start, end)) {
            from = advance(subject, start, unicode)
            continue
        }
        found(start, end)
        from = end > start ? end : advance(subject, end, unicode)
    }
}

/** The matches from `from` to the end of one line, searched as if the line were the whole text. */
function eachLineMatch(
    text: SearchText,
    pattern: RegExp,
    wholeWord: boolean,
    line: number,
    from: number,
    lineEnd: number,
    found: (start: number, end: number) => void
) {
    const lineStart = text.lineStarts[line]
    const subject = text.text.slice(lineStart, lineEnd)
    const unicode = pattern.unicode
    let at = from - lineStart
    while (at <= subject.length) {
        pattern.lastIndex = at
        const match = pattern.exec(subject)
        if (!match) return
        const start = match.index
        const end = start + match[0].length
        if (wholeWord && !isWholeWord(subject, start, end)) {
            at = advance(subject, start, unicode)
            continue
        }
        found(lineStart + start, lineStart + end)
        at = end > start ? end : advance(subject, end, unicode)
    }
}

/** The offset a character after `index`: a surrogate pair is one character to a `u` pattern. */
function advance(subject: string, index: number, unicode: boolean): number {
    if (unicode && index + 1 < subject.length) {
        const code = subject.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(subject.charCodeAt(index + 1)))
            return index + 2
    }
    return index + 1
}
