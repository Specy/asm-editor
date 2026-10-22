/**
 * The Search panel's query ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 24): one box with Match case, Match whole word and Use regular expression, and the
 * "Files to include" and "Files to exclude" patterns. Shared by the panel, which shows a regular
 * expression's syntax error as it is typed, the client, which picks the documents a search looks
 * through, and the search worker, which matches. Plain TypeScript with relative `.ts` imports and
 * no TypeScript-only syntax, so the worker's modules also run in a Node thread.
 */

export type SearchQuery = {
    /** The box's text, searched as it is, spaces included; an empty one searches nothing. */
    text: string
    /** "Match case": off, a query in any case finds a text in any case. */
    matchCase?: boolean
    /** "Match whole word": see {@link isWholeWord}. */
    wholeWord?: boolean
    /** "Use regular expression": `text` is a JavaScript regular expression. */
    regex?: boolean
    /** "Files to include": comma-separated patterns ({@link pathFilter}); empty, every File. */
    include?: string
    /** "Files to exclude": comma-separated patterns; empty, none. */
    exclude?: string
}

/**
 * A query ready to match, which `searchText` runs over a text:
 * - `plain`: `needle` found by `indexOf`, in the text's kept lower-case copy when `anyCase`, or
 *   through `fallback` (the query escaped, in any case) in a text whose lower-case copy is not as
 *   long as it, where offsets would not carry over;
 * - `regex`: `pattern` (flags `g`, `m`, `i` in any case, `u` when the pattern is valid with it),
 *   whose matches stay on one line unless `singleLine` is false, for a pattern that names a line
 *   break ({@link namesLineBreak}).
 */
export type Matcher =
    | {
          kind: 'plain'
          needle: string
          anyCase: boolean
          wholeWord: boolean
          fallback: RegExp | undefined
      }
    | { kind: 'regex'; pattern: RegExp; singleLine: boolean; wholeWord: boolean }

/** A query that cannot be searched: its message is the sentence the panel shows. */
export class SearchQueryError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SearchQueryError'
    }
}

/**
 * The query as a {@link Matcher}, or `undefined` for an empty one. Throws a
 * {@link SearchQueryError} for a regular expression JavaScript cannot compile.
 */
export function compileMatcher(query: SearchQuery): Matcher | undefined {
    const { text } = query
    if (!text) return undefined
    const anyCase = !query.matchCase
    const wholeWord = query.wholeWord === true
    if (!query.regex) {
        const needle = anyCase ? text.toLowerCase() : text
        const escaped = anyCase ? caseless(text) : undefined
        //a query that lowering lengthens (`İ`) cannot be found by offsets in a lowered copy
        if (needle.length === text.length)
            return { kind: 'plain', needle, anyCase, wholeWord, fallback: escaped }
        return { kind: 'regex', pattern: escaped!, singleLine: false, wholeWord }
    }
    const flags = anyCase ? 'gmi' : 'gm'
    let pattern: RegExp
    try {
        //with `u` where it compiles, for `\p{…}` and whole characters; without it otherwise, as a
        //pattern such as `a{2` or `\-` is valid only without it
        pattern = new RegExp(text, `${flags}u`)
    } catch {
        try {
            pattern = new RegExp(text, flags)
        } catch (error) {
            throw new SearchQueryError(regexProblem(error))
        }
    }
    return { kind: 'regex', pattern, singleLine: !namesLineBreak(text), wholeWord }
}

/** The sentence the panel shows under a query that cannot be searched, or `undefined`. */
export function queryProblem(query: SearchQuery): string | undefined {
    try {
        compileMatcher(query)
        return undefined
    } catch (error) {
        return error instanceof SearchQueryError ? error.message : String(error)
    }
}

/** The query in any case, its characters taken literally. */
function caseless(text: string): RegExp {
    try {
        return new RegExp(escapeRegExp(text), 'giu')
    } catch {
        return new RegExp(escapeRegExp(text), 'gi')
    }
}

/** Escapes the characters a regular expression gives a meaning to, as `u` mode allows. */
export function escapeRegExp(text: string): string {
    return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

/**
 * Turns the engine's message (V8: "Invalid regular expression: /(/gmu: Unterminated group") into
 * a sentence: "Not a valid regular expression: unterminated group."
 */
function regexProblem(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    const reason = (
        /^Invalid regular expression: \/.*\/[a-z]*: (.+)$/s.exec(message)?.[1] ??
        message.replace(/^(?:SyntaxError: )?(?:Invalid regular expression:?\s*)?/i, '')
    ).trim()
    if (!reason) return 'Not a valid regular expression.'
    const sentence = reason[0].toLowerCase() + reason.slice(1)
    return `Not a valid regular expression: ${sentence}${/[.!?]$/.test(sentence) ? '' : '.'}`
}

/**
 * Whether a regular expression's source names a line break (`\n`, `\r`, `\x0a`, `\u000d`, `\cJ`,
 * or the character itself), so that its matches may run from one line onto the next, as Visual
 * Studio Code's search allows only then. Any other pattern finds what one line holds: `\s+` at
 * the end of a line stops there.
 */
export function namesLineBreak(source: string): boolean {
    for (let index = 0; index < source.length; index++) {
        const character = source[index]
        if (character === '\n' || character === '\r') return true
        if (character !== '\\') continue
        const escape = source.slice(index + 1, index + 9)
        if (/^(?:[nr]|x0[ad]|u000[ad]|u\{0*[ad]\}|c[jm])/i.test(escape)) return true
        index++
    }
    return false
}

const NON_ASCII_WORD = /[\p{L}\p{N}\p{M}\p{Pc}]/u

/**
 * Whether a code point is part of a word: an ASCII letter, digit or `_`, or any other letter,
 * digit, combining mark or connector, so a word in any script is one word (`café`, `число`).
 * Everything else bounds one: spaces, line breaks, and the punctuation of a Listing's names, `@`
 * (`puts@plt`), `.` (`.LAB_3`), `$`, `#`, `~`, `?`, `:`.
 */
export function isWordCharacter(code: number): boolean {
    if (code < 0x80)
        return (
            (code >= 0x30 && code <= 0x39) ||
            (code >= 0x41 && code <= 0x5a) ||
            (code >= 0x61 && code <= 0x7a) ||
            code === 0x5f
        )
    return NON_ASCII_WORD.test(String.fromCodePoint(code))
}

/** The code point ending just before `offset`, a surrogate pair taken whole. */
function codePointBefore(text: string, offset: number): number {
    const low = text.charCodeAt(offset - 1)
    if (low >= 0xdc00 && low <= 0xdfff && offset >= 2) {
        const high = text.charCodeAt(offset - 2)
        if (high >= 0xd800 && high <= 0xdbff)
            return (high - 0xd800) * 0x400 + low - 0xdc00 + 0x10000
    }
    return low
}

/**
 * Whether the match from `start` to `end` is a whole word, as "Match whole word" keeps it, the
 * rule of Visual Studio Code's: each end is the text's end, or a character that is not part of a
 * word ({@link isWordCharacter}), or the match's own first or last character is not one. So
 * `printf` is a whole word in `printf@plt` and `call printf`, and not in `printf_chk` or
 * `_printf`; `@plt` is one in `puts@plt`.
 */
export function isWholeWord(text: string, start: number, end: number): boolean {
    const left =
        start === 0 ||
        !isWordCharacter(codePointBefore(text, start)) ||
        (end > start && !isWordCharacter(text.codePointAt(start)!))
    if (!left) return false
    return (
        end >= text.length ||
        !isWordCharacter(text.codePointAt(end)!) ||
        (end > start && !isWordCharacter(codePointBefore(text, end)))
    )
}

/** Whether a path is searched: by the include and exclude patterns of a query. */
export type PathFilter = (path: string) => boolean

/** The most patterns braces expand one pattern into; past it, the rest are dropped. */
const BRACE_EXPANSION_LIMIT = 256

/**
 * The "Files to include" and "Files to exclude" boxes as one test of a File's path (a Project
 * path: `/`-separated, no leading slash). Each box is a comma-separated list of patterns; a path
 * is searched when it matches an include pattern, or there are none, and no exclude pattern.
 *
 * A pattern, in any case (`*.s` also takes `start.S`):
 * - `*` is any characters but `/`, `?` one, `[abc]`, `[a-z]` and `[!abc]` (or `[^abc]`) one of a
 *   set, `{c,cpp}` either word, and `\` takes the next character as it is;
 * - without a `/`, it matches a name in any folder: `*.c` takes `main.c` and `src/main.c`, `build`
 *   takes the File `build` and everything in any folder named `build`;
 * - with one, it matches from the Project's root (a leading `/` or `./` is dropped): `src/*.c`
 *   takes `src/main.c` only; `**` is any number of folders (`src/**`, `**\/test/*.c`);
 * - it also takes everything in the folders it matches: `src/lib` takes `src/lib/a.c`; one ending
 *   in `/` (`build/`) takes only folders.
 */
export function pathFilter(include = '', exclude = ''): PathFilter {
    const includes = pathPatterns(include)
    const excludes = pathPatterns(exclude)
    return (path) =>
        (!includes.length || includes.some((pattern) => pattern.test(path))) &&
        !excludes.some((pattern) => pattern.test(path))
}

/** A box's patterns, each compiled to a regular expression over a whole path. */
export function pathPatterns(list: string): RegExp[] {
    const patterns: RegExp[] = []
    for (const item of splitPatterns(list))
        for (const pattern of expandBraces(item)) {
            const compiled = compilePathPattern(pattern)
            if (compiled) patterns.push(compiled)
        }
    return patterns
}

/** Splits a box's text at its commas, but those inside braces, trimming each pattern. */
function splitPatterns(list: string): string[] {
    const patterns: string[] = []
    let depth = 0
    let start = 0
    for (let index = 0; index < list.length; index++) {
        const character = list[index]
        if (character === '\\') index++
        else if (character === '{') depth++
        else if (character === '}' && depth > 0) depth--
        else if (character === ',' && depth === 0) {
            patterns.push(list.slice(start, index))
            start = index + 1
        }
    }
    patterns.push(list.slice(start))
    return patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern !== '')
}

/** `src/{a,b}/*.{c,h}` as the four patterns it stands for, at most {@link BRACE_EXPANSION_LIMIT}. */
function expandBraces(pattern: string): string[] {
    const open = braceAt(pattern)
    if (!open) return [pattern]
    const [start, end, alternatives] = open
    const head = pattern.slice(0, start)
    const tails = expandBraces(pattern.slice(end + 1))
    const expanded: string[] = []
    for (const alternative of alternatives)
        for (const middle of expandBraces(alternative))
            for (const tail of tails) {
                if (expanded.length >= BRACE_EXPANSION_LIMIT) return expanded
                expanded.push(head + middle + tail)
            }
    return expanded
}

/** The first balanced `{…}` of a pattern: where it starts and ends, and its alternatives. */
function braceAt(pattern: string): [number, number, string[]] | undefined {
    for (let start = 0; start < pattern.length; start++) {
        if (pattern[start] === '\\') {
            start++
            continue
        }
        if (pattern[start] !== '{') continue
        const alternatives: string[] = []
        let depth = 0
        let from = start + 1
        for (let index = start + 1; index < pattern.length; index++) {
            const character = pattern[index]
            if (character === '\\') index++
            else if (character === '{') depth++
            else if (character === '}' && depth > 0) depth--
            else if (character === ',' && depth === 0) {
                alternatives.push(pattern.slice(from, index))
                from = index + 1
            } else if (character === '}') {
                alternatives.push(pattern.slice(from, index))
                return [start, index, alternatives]
            }
        }
        //unbalanced: the brace is a character like any other
        return undefined
    }
    return undefined
}

/** One brace-free pattern over a whole path, or `undefined` for one naming nothing (`/`). */
function compilePathPattern(pattern: string): RegExp | undefined {
    let rest = pattern
    let anchored = false
    if (rest.startsWith('./')) {
        rest = rest.slice(2)
        anchored = true
    } else if (rest.startsWith('/')) {
        rest = rest.replace(/^\/+/, '')
        anchored = true
    }
    let foldersOnly = false
    if (rest.endsWith('/')) {
        rest = rest.replace(/\/+$/, '')
        foldersOnly = true
    }
    if (rest.includes('/')) anchored = true
    const segments = rest.split('/').filter((segment) => segment !== '')
    if (!segments.length) return undefined
    if (segments.length === 1 && segments[0] === '**') return /^/
    //`src/**` is everything in `src`
    if (segments.length > 1 && segments[segments.length - 1] === '**') {
        segments.pop()
        foldersOnly = true
    }
    let source = anchored ? '^' : '(?:^|/)'
    segments.forEach((segment, index) => {
        const last = index === segments.length - 1
        if (segment === '**') source += '(?:[^/]+/)*'
        else source += segmentSource(segment) + (last ? '' : '/')
    })
    source += foldersOnly ? '/' : '(?:/|$)'
    try {
        return new RegExp(source, 'iu')
    } catch {
        //a set such as `[z-a]` that no character is in: the pattern taken literally
        return new RegExp(
            (anchored ? '^' : '(?:^|/)') +
                escapeRegExp(segments.join('/')) +
                (foldersOnly ? '/' : '(?:/|$)'),
            'iu'
        )
    }
}

/** One segment of a path pattern, between its slashes, as a regular expression's source. */
function segmentSource(segment: string): string {
    let source = ''
    for (let index = 0; index < segment.length; index++) {
        const character = segment[index]
        if (character === '*') {
            while (segment[index + 1] === '*') index++
            source += '[^/]*'
        } else if (character === '?') source += '[^/]'
        else if (character === '[') {
            const end = setEnd(segment, index)
            if (end < 0) source += '\\['
            else {
                source += setSource(segment.slice(index + 1, end))
                index = end
            }
        } else if (character === '\\' && index + 1 < segment.length) {
            const next = segment.codePointAt(index + 1)!
            const escaped = String.fromCodePoint(next)
            source += escapeRegExp(escaped)
            index += escaped.length
        } else source += escapeRegExp(character)
    }
    return source
}

/** Where the set opened at `start` closes, or -1: a `]` first in the set is one of its characters. */
function setEnd(segment: string, start: number): number {
    let index = start + 1
    if (segment[index] === '!' || segment[index] === '^') index++
    if (segment[index] === ']') index++
    for (; index < segment.length; index++) {
        if (segment[index] === '\\') index++
        else if (segment[index] === ']') return index
    }
    return -1
}

/** A set's contents (`!a-z`) as a regular expression's class, never taking a `/`. */
function setSource(body: string): string {
    let negated = false
    let rest = body
    if (rest[0] === '!' || rest[0] === '^') {
        negated = true
        rest = rest.slice(1)
    }
    let source = ''
    for (let index = 0; index < rest.length; index++) {
        const character = rest[index]
        if (character === '\\' && index + 1 < rest.length) {
            index++
            source += /[\\\]^[-]/.test(rest[index]) ? `\\${rest[index]}` : rest[index]
        } else if (
            character === '\\' ||
            character === ']' ||
            character === '[' ||
            character === '^'
        )
            source += `\\${character}`
        else source += character
    }
    return negated ? `[^/${source}]` : `[${source}]`
}
