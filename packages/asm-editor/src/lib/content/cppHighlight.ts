import { language } from 'monaco-editor/languages/definitions/cpp/cpp.js'

/**
 * The C/C++ highlighter for code blocks, beside the assembly one (`./assemblyHighlight.ts`): a
 * page's `c` and `cpp` fences, coloured as the editor colours a `.c` or `.cpp` File.
 *
 * Monaco colours both with one Monarch grammar (`monaco-editor/languages/definitions/cpp/cpp.js`),
 * and running that takes Monaco's tokenizer, which is the editor itself: far too much to load on
 * every lecture page for a few listings, and asynchronous, where code blocks are built in one
 * synchronous pass, in the server render as in the browser. So this follows the grammar by hand,
 * rule by rule and in its order, down to the places where it reads C loosely: `->` and `::` are
 * none of its operators, a string inside an attribute is not one, and `R"a.b(` ends at `)a"`. What
 * the grammar carries from one line to the next, this carries too: a block comment, a raw string,
 * an attribute, a `//` comment or a string continued with a backslash, an `#include` still looking
 * for its path. The keyword and operator lists are the grammar's own, imported, so they cannot
 * drift from it.
 *
 * The editor also colours brackets by how deeply they nest, through the whole File, wherever the
 * grammar's token is not a string or a comment, an attribute's `[[` included; so does this.
 *
 * Plain TypeScript, no runes and no DOM, so the renderer builds the spans and a test can read the
 * tokens directly.
 */

/**
 * What a piece of the source is, by the grammar's token for it: `string` also stands for a raw
 * string, a character literal and an included path (`string.raw…`, `string.include.identifier`),
 * `directive` for a preprocessor line's `#name` and an include's `<` `>` or quotes
 * (`keyword.directive…`), `delimiter` for the grammar's operators, `;`, `,`, `.` and the `<` `>` it
 * does not pair, and `plain` for whitespace and what it gives no token at all (`->`, `::`, a stray
 * `#`). A `bracket` is `{}`, `[]` or `()`, coloured by its nesting rather than its token.
 */
export type CppTokenKind =
    | 'comment'
    | 'doc-comment'
    | 'string'
    | 'escape'
    | 'invalid-escape'
    | 'invalid-string'
    | 'keyword'
    | 'identifier'
    | 'directive'
    | 'annotation'
    | 'number'
    | 'float'
    | 'hex'
    | 'octal'
    | 'binary'
    | 'delimiter'
    | 'bracket'
    | 'plain'

export type CppToken = {
    kind: CppTokenKind
    text: string
    /**
     * How deeply a bracket is nested, counted across the whole program as the editor counts it,
     * from 0; none for a bracket the editor paints as unexpected.
     */
    level?: number
}

/**
 * Where the grammar is when a line ends, which the next line starts from: Monarch's state stack,
 * since an attribute can hold a comment. A raw string keeps what ends it.
 */
type State =
    | {
          name:
              | 'root'
              | 'comment'
              | 'doc-comment'
              | 'line-comment'
              | 'string'
              | 'annotation'
              | 'include'
      }
    | { name: 'raw'; end: string }

type Push = (kind: CppTokenKind, text: string) => void
/** Reads what the state's rules make of the line at `at`, and returns where it stopped. */
type Step = (line: string, at: number, stack: State[], push: Push) => number

const KEYWORDS: ReadonlySet<string> = new Set(language.keywords)
const OPERATORS: ReadonlySet<string> = new Set(language.operators)

//the grammar's patterns, sticky so each is tried exactly where the line has got to
const RAW_STRING = /(?:u|u8|U|L)?R"([^ ()\\\t]*)\(/y
const WORD = /[a-zA-Z_]\w*/y
const INCLUDE = /\s*#\s*include/y
const DIRECTIVE = /\s*#\s*\w+/y
const WHITESPACE = /[ \t\r\n]+/y
const DOC_COMMENT = /\/\*\*(?!\/)/y
const BLOCK_COMMENT = /\/\*/y
const CONTINUED_LINE_COMMENT = /\/\/.*\\$/y
const LINE_COMMENT = /\/\/.*$/y
const ATTRIBUTE = /\[\s*\[/y
const SYMBOLS = /[=><!~?:&|+\-*/^%]+/y
const INTEGER_SUFFIX = '(?:[uU](?:ll|LL|l|L)|(?:ll|LL|l|L)?[uU]?)'
/** In the grammar's order, which decides: `1e5` is a float before `1` is a number. */
const NUMBERS: [RegExp, CppTokenKind][] = [
    [/\d*\d+[eE](?:[-+]?\d+)?[fFlL]?/y, 'float'],
    [/\d*\.\d+(?:[eE][-+]?\d+)?[fFlL]?/y, 'float'],
    [new RegExp(`0[xX][0-9a-fA-F']*[0-9a-fA-F]${INTEGER_SUFFIX}`, 'y'), 'hex'],
    [new RegExp(`0[0-7']*[0-7]${INTEGER_SUFFIX}`, 'y'), 'octal'],
    [new RegExp(`0[bB][01']*[01]${INTEGER_SUFFIX}`, 'y'), 'binary'],
    [new RegExp(`\\d[\\d']*\\d${INTEGER_SUFFIX}`, 'y'), 'number'],
    [new RegExp(`\\d${INTEGER_SUFFIX}`, 'y'), 'number']
]
const UNTERMINATED_STRING = /"(?:[^"\\]|\\.)*$/y
const CHARACTER = /'[^\\']'/y
const ESCAPE = /\\(?:[0abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/y
const ESCAPED_CHARACTER = new RegExp(`'${ESCAPE.source}'`, 'y')
const STRING_TEXT = /[^\\"]+/y
const INVALID_ESCAPE = /\\./y
const COMMENT_TEXT = /[^/*]+/y
const LINE_COMMENT_END = /.*[^\\]$/y
const RAW_TEXT = /[^)]+/y
//an attribute's keywords are matched as the grammar matches them, without a word boundary
const ATTRIBUTE_KEYWORD = /using|alignas/y
const ATTRIBUTE_NAME = /[a-zA-Z0-9_]+/y
const ATTRIBUTE_END = /\]\s*\]/y
const ANGLE_INCLUDE = /(\s*)(<)([^<>]*)(>)/y
const QUOTED_INCLUDE = /(\s*)(")([^"]*)(")/y

/** The kinds of a string or a comment, the only tokens a bracket is not one in. */
const QUOTED: ReadonlySet<CppTokenKind> = new Set([
    'comment',
    'doc-comment',
    'string',
    'escape',
    'invalid-escape',
    'invalid-string'
])
/** The bracket pairs the editor colours, each opener before its closer; `<>` is not one. */
const BRACKETS = '()[]{}'
const HAS_BRACKET = /[()[\]{}]/

function matchAt(pattern: RegExp, line: string, at: number): RegExpExecArray | null {
    pattern.lastIndex = at
    return pattern.exec(line)
}

/** Whitespace and comments, which the grammar reads alike between tokens and in an attribute. */
function whitespace(line: string, at: number, stack: State[], push: Push): number | undefined {
    let match: RegExpExecArray | null
    if ((match = matchAt(WHITESPACE, line, at))) {
        push('plain', match[0])
    } else if ((match = matchAt(DOC_COMMENT, line, at))) {
        //`/**/` is not one: it is an ordinary comment, opened and closed
        push('doc-comment', match[0])
        stack.push({ name: 'doc-comment' })
    } else if ((match = matchAt(BLOCK_COMMENT, line, at))) {
        push('comment', match[0])
        stack.push({ name: 'comment' })
    } else if ((match = matchAt(CONTINUED_LINE_COMMENT, line, at))) {
        push('comment', match[0])
        stack.push({ name: 'line-comment' })
    } else if ((match = matchAt(LINE_COMMENT, line, at))) {
        push('comment', match[0])
    } else {
        return undefined
    }
    return at + match[0].length
}

const root: Step = (line, at, stack, push) => {
    let match: RegExpExecArray | null
    const char = line[at]
    if ((match = matchAt(RAW_STRING, line, at))) {
        push('string', match[0])
        //Monarch keeps the delimiter in its state's name, split at dots, and ends the string with
        //the first part of it
        stack.push({ name: 'raw', end: `)${match[1].split('.')[0]}"` })
        return at + match[0].length
    }
    if ((match = matchAt(WORD, line, at))) {
        push(KEYWORDS.has(match[0]) ? 'keyword' : 'identifier', match[0])
        return at + match[0].length
    }
    //a preprocessor line is one from its first column, its indentation included
    if (at === 0 && (match = matchAt(INCLUDE, line, at))) {
        push('directive', match[0])
        stack.push({ name: 'include' })
        return match[0].length
    }
    if (at === 0 && (match = matchAt(DIRECTIVE, line, at))) {
        push('directive', match[0])
        return match[0].length
    }
    const afterWhitespace = whitespace(line, at, stack, push)
    if (afterWhitespace !== undefined) return afterWhitespace
    if ((match = matchAt(ATTRIBUTE, line, at))) {
        push('annotation', match[0])
        stack.push({ name: 'annotation' })
        return at + match[0].length
    }
    //`<` and `>` are among the grammar's brackets, but the editor colours only the language's
    if (BRACKETS.includes(char) || char === '<' || char === '>') {
        push(BRACKETS.includes(char) ? 'bracket' : 'delimiter', char)
        return at + 1
    }
    //a run of symbols is one operator or none: `->` and `=-` are not the grammar's
    if ((match = matchAt(SYMBOLS, line, at))) {
        push(OPERATORS.has(match[0]) ? 'delimiter' : 'plain', match[0])
        return at + match[0].length
    }
    for (const [pattern, kind] of NUMBERS) {
        if ((match = matchAt(pattern, line, at))) {
            push(kind, match[0])
            return at + match[0].length
        }
    }
    if (char === ';' || char === ',' || char === '.') {
        push('delimiter', char)
        return at + 1
    }
    //a string the line ends inside is invalid to the end of it
    if ((match = matchAt(UNTERMINATED_STRING, line, at))) {
        push('invalid-string', match[0])
        return line.length
    }
    if (char === '"') {
        push('string', char)
        stack.push({ name: 'string' })
        return at + 1
    }
    if ((match = matchAt(CHARACTER, line, at))) {
        push('string', match[0])
        return at + match[0].length
    }
    if ((match = matchAt(ESCAPED_CHARACTER, line, at))) {
        push('string', "'")
        push('escape', match[0].slice(1, -1))
        push('string', "'")
        return at + match[0].length
    }
    //a quote that opens no character literal is invalid, alone: `'ab'` is two around a name
    push(char === "'" ? 'invalid-string' : 'plain', char)
    return at + 1
}

/** A block comment, ordinary or documentation, which runs until a `*\/` on whichever line. */
const blockComment =
    (kind: 'comment' | 'doc-comment'): Step =>
    (line, at, stack, push) => {
        const match = matchAt(COMMENT_TEXT, line, at)
        if (match) {
            push(kind, match[0])
            return at + match[0].length
        }
        if (line.startsWith('*/', at)) {
            push(kind, '*/')
            stack.pop()
            return at + 2
        }
        push(kind, line[at])
        return at + 1
    }

/** The line after a `//` comment ending in a backslash, a comment too, and so on while they do. */
const lineComment: Step = (line, at, stack, push) => {
    if (matchAt(LINE_COMMENT_END, line, at)) stack.pop()
    push('comment', line.slice(at))
    return line.length
}

const string: Step = (line, at, stack, push) => {
    if (line[at] === '"') {
        push('string', '"')
        stack.pop()
        return at + 1
    }
    let match: RegExpExecArray | null
    if ((match = matchAt(STRING_TEXT, line, at))) push('string', match[0])
    else if ((match = matchAt(ESCAPE, line, at))) push('escape', match[0])
    else if ((match = matchAt(INVALID_ESCAPE, line, at))) push('invalid-escape', match[0])
    else {
        //a backslash ending the line, which the grammar gives no token, and which carries the
        //string on to the next
        push('plain', line[at])
        return at + 1
    }
    return at + match[0].length
}

const raw: Step = (line, at, stack, push) => {
    const { end } = stack[stack.length - 1] as Extract<State, { name: 'raw' }>
    const match = matchAt(RAW_TEXT, line, at)
    if (match) {
        push('string', match[0])
        return at + match[0].length
    }
    if (line.startsWith(end, at)) {
        push('string', end)
        stack.pop()
        return at + end.length
    }
    push('string', ')')
    return at + 1
}

/** Inside `[[…]]`: names, `using` and `alignas`, `,` `:` and parentheses, and nothing else. */
const annotation: Step = (line, at, stack, push) => {
    const afterWhitespace = whitespace(line, at, stack, push)
    if (afterWhitespace !== undefined) return afterWhitespace
    const char = line[at]
    let match: RegExpExecArray | null
    if ((match = matchAt(ATTRIBUTE_KEYWORD, line, at))) push('keyword', match[0])
    else if ((match = matchAt(ATTRIBUTE_NAME, line, at))) push('annotation', match[0])
    else if ((match = matchAt(ATTRIBUTE_END, line, at))) {
        push('annotation', match[0])
        stack.pop()
    } else {
        if (char === ',' || char === ':') push('delimiter', char)
        else push(char === '(' || char === ')' ? 'bracket' : 'plain', char)
        return at + 1
    }
    return at + match[0].length
}

/**
 * After `#include`, the path in `<…>` or `"…"`. Until one comes, character by character and from
 * line to line, nothing else is read: `#include HEADER` leaves the grammar waiting.
 */
const include: Step = (line, at, stack, push) => {
    const match = matchAt(ANGLE_INCLUDE, line, at) ?? matchAt(QUOTED_INCLUDE, line, at)
    if (!match) {
        push('plain', line[at])
        return at + 1
    }
    const [whole, space, open, path, close] = match
    push('plain', space)
    push('directive', open)
    push('string', path)
    push('directive', close)
    stack.pop()
    return at + whole.length
}

const STEPS: Record<State['name'], Step> = {
    root,
    comment: blockComment('comment'),
    'doc-comment': blockComment('doc-comment'),
    'line-comment': lineComment,
    string,
    raw,
    annotation,
    include
}

/** The tokens of one line, reading on from the state the line before left in `stack`. */
function tokenizeLine(source: string, stack: State[]): CppToken[] {
    //the editor splits lines at `\r\n` as at `\n`, so its grammar never reads a carriage return
    const line = source.endsWith('\r') ? source.slice(0, -1) : source
    const tokens: CppToken[] = []
    const push: Push = (kind, text) => {
        if (text.length === 0) return
        //a bracket is one wherever the token around it is not a string or a comment: an
        //attribute's `[[` is two brackets, and a `(` the grammar gives no token is one
        if (kind !== 'bracket' && !QUOTED.has(kind) && HAS_BRACKET.test(text)) {
            for (const piece of text.split(/([()[\]{}])/)) {
                push(piece.length === 1 && BRACKETS.includes(piece) ? 'bracket' : kind, piece)
            }
            return
        }
        const last = tokens[tokens.length - 1]
        if (last?.kind === kind && kind !== 'bracket') last.text += text
        else tokens.push({ kind, text })
    }
    let at = 0
    while (at < line.length) at = STEPS[stack[stack.length - 1].name](line, at, stack, push)
    if (line !== source) push('plain', '\r')
    return tokens
}

/**
 * Each bracket's nesting level, as the editor's bracket pair colouring finds it through the whole
 * program: a closer closes the innermost open bracket of its kind, and any opened inside that one
 * stay unclosed; a pair's two brackets take the depth it opens at. An opener nothing closes, and a
 * closer with nothing of its kind open, are unexpected and get none.
 */
function levelBrackets(lines: CppToken[][]): CppToken[][] {
    const open: CppToken[] = []
    for (const token of lines.flat()) {
        if (token.kind !== 'bracket') continue
        const at = BRACKETS.indexOf(token.text)
        if (at % 2 === 0) {
            token.level = open.length
            open.push(token)
            continue
        }
        const opener = BRACKETS[at - 1]
        let index = open.length - 1
        while (index >= 0 && open[index].text !== opener) index -= 1
        if (index < 0) continue
        const [pair, ...unclosed] = open.splice(index)
        for (const bracket of unclosed) delete bracket.level
        token.level = pair.level
    }
    for (const bracket of open) delete bracket.level
    return lines
}

/**
 * The tokens of a whole program, one array per line, with the newlines left out: the renderer puts
 * them back between the lines it builds.
 */
export function tokenizeCpp(source: string): CppToken[][] {
    const stack: State[] = [{ name: 'root' }]
    return levelBrackets(source.split('\n').map((line) => tokenizeLine(line, stack)))
}
