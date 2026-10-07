export type Token = {
    text: string
    start: number
    end: number
    kind: 'word' | 'punct' | 'literal' | 'number'
}
type Ignored = { start: number; end: number; kind: 'comment' | 'literal'; closed: boolean }
export type ScannedSource = { text: string; tokens: Token[]; ignored: Ignored[] }
export type IdentifierContext = {
    name: string
    prefix: string
    start: number
    end: number
    qualified: boolean
}
export type IncludeContext = {
    kind: 'quoted' | 'system'
    prefix: string
    start: number
    end: number
}
export type CallContext = { name: string; argument: number }
const wordStart = (code: number) =>
    code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
const wordPart = (code: number) => wordStart(code) || (code >= 48 && code <= 57)

function spliceLength(text: string, index: number): number {
    return text[index] === '\\'
        ? text[index + 1] === '\n'
            ? 2
            : text[index + 1] === '\r' && text[index + 2] === '\n'
              ? 3
              : 0
        : 0
}

/** A tolerant lexical pass: no preprocessor evaluation, symbol resolution or type inference. */
export function scanSource(text: string): ScannedSource {
    const tokens: Token[] = []
    const ignored: Ignored[] = []
    let index = 0
    while (index < text.length) {
        const start = index
        const char = text[index]
        const splice = spliceLength(text, index)
        if (splice) {
            index += splice
            continue
        }
        if (char.charCodeAt(0) <= 32) {
            index++
            continue
        }
        let next = index + 1
        while (spliceLength(text, next)) next += spliceLength(text, next)
        if (char === '/' && text[next] === '/') {
            index = next + 1
            while (index < text.length && text[index] !== '\n')
                index += spliceLength(text, index) || 1
            ignored.push({
                start,
                end: index < text.length ? index + 1 : index,
                kind: 'comment',
                closed: index < text.length
            })
            continue
        }
        if (char === '/' && text[next] === '*') {
            index = next + 1
            let closed = false
            while (index < text.length) {
                if (text[index] === '*') {
                    let end = index + 1
                    while (spliceLength(text, end)) end += spliceLength(text, end)
                    if (text[end] === '/') {
                        index = end + 1
                        closed = true
                        break
                    }
                }
                index++
            }
            ignored.push({ start, end: index, kind: 'comment', closed })
            continue
        }
        const couldPrefix = char === 'R' || char === 'u' || char === 'U' || char === 'L'
        const raw = couldPrefix
            ? /^(?:u8|u|U|L)?R"([^ ()\\\t\r\n]{0,16})\(/.exec(text.slice(index, index + 22))
            : null
        if (raw) {
            const ending = `)${raw[1]}"`
            const end = text.indexOf(ending, index + raw[0].length)
            index = end < 0 ? text.length : end + ending.length
            ignored.push({ start, end: index, kind: 'literal', closed: end >= 0 })
            tokens.push({ text: '', start, end: index, kind: 'literal' })
            continue
        }
        const literal =
            char === '"' || char === "'"
                ? [char, char]
                : couldPrefix
                  ? /^(?:u8|u|U|L)?(["'])/.exec(text.slice(index, index + 4))
                  : null
        if (literal) {
            const quote = literal[1]
            index += literal[0].length
            let closed = false
            while (index < text.length) {
                if (text[index] === '\\') {
                    index += spliceLength(text, index) || Math.min(2, text.length - index)
                    continue
                }
                if (text[index++] === quote) {
                    closed = true
                    break
                }
            }
            ignored.push({ start, end: index, kind: 'literal', closed })
            tokens.push({ text: '', start, end: index, kind: 'literal' })
            continue
        }
        if (wordStart(char.charCodeAt(0))) {
            index++
            while (index < text.length && wordPart(text.charCodeAt(index))) index++
            // A spliced identifier has no single-line Monaco range: decline it conservatively.
            if (spliceLength(text, index)) {
                while (spliceLength(text, index)) {
                    index += spliceLength(text, index)
                    while (index < text.length && wordPart(text.charCodeAt(index))) index++
                }
                ignored.push({ start, end: index, kind: 'literal', closed: false })
                tokens.push({ text: '', start, end: index, kind: 'literal' })
            } else tokens.push({ text: text.slice(start, index), start, end: index, kind: 'word' })
            continue
        }
        if (char >= '0' && char <= '9') {
            index++
            while (
                index < text.length &&
                (wordPart(text.charCodeAt(index)) || text[index] === '.' || text[index] === "'")
            )
                index++
            tokens.push({ text: text.slice(start, index), start, end: index, kind: 'number' })
            continue
        }
        const punct =
            ['::', '->', '>>', '<<', '...'].find((candidate) =>
                text.startsWith(candidate, index)
            ) ?? char
        index += punct.length
        tokens.push({ text: punct, start, end: index, kind: 'punct' })
    }
    return { text, tokens, ignored }
}

function ignoredAt(source: ScannedSource, offset: number): Ignored | undefined {
    return source.ignored.find(
        (span) =>
            offset >= span.start && (offset < span.end || (offset === span.end && !span.closed))
    )
}

export function includeAt(source: ScannedSource, offset: number): IncludeContext | undefined {
    const ignored = ignoredAt(source, offset)
    if (ignored?.kind === 'comment') return undefined
    let start = source.text.lastIndexOf('\n', offset - 1) + 1
    while (start > 0) {
        const previous = start - (source.text[start - 2] === '\r' ? 3 : 2)
        if (source.text[previous] !== '\\') break
        start = source.text.lastIndexOf('\n', previous - 1) + 1
    }
    const raw = source.text.slice(start, offset)
    const directive = start + raw.indexOf('#')
    if (ignoredAt(source, directive)) return undefined
    // Path completion on a continued directive is supported, but not in a spliced path itself.
    const match = /^\s*#\s*include\s*(?:\\\r?\n\s*)*([<"])([^>"\r\n]*)$/.exec(raw)
    if (!match) return undefined
    const prefix = match[2]
    const from = offset - prefix.length
    if (ignored && ignored.start !== from - 1) return undefined
    let end = offset
    while (end < source.text.length && !/[>"\r\n]/.test(source.text[end])) end++
    return { kind: match[1] === '<' ? 'system' : 'quoted', prefix, start: from, end }
}

function qualifiedName(
    tokens: Token[],
    index: number,
    cpp: boolean
): { name: string; qualified: boolean; start: number } | undefined {
    const token = tokens[index]
    if (!token || token.kind !== 'word') return undefined
    const previous = tokens[index - 1]
    if (previous?.text === '.' || previous?.text === '->') return undefined
    if (previous?.text === '::') {
        const namespace = tokens[index - 2]
        const before = tokens[index - 3]
        if (
            !cpp ||
            namespace?.text !== 'std' ||
            before?.text === '::' ||
            before?.text === '.' ||
            before?.text === '->'
        )
            return undefined
        return { name: `std::${token.text}`, qualified: true, start: namespace.start }
    }
    return { name: token.text, qualified: false, start: token.start }
}

export function identifierAt(
    source: ScannedSource,
    offset: number,
    cpp: boolean,
    completion = false
): IdentifierContext | undefined {
    if (ignoredAt(source, offset)) return undefined
    const index = source.tokens.findIndex(
        (token) => token.kind === 'word' && token.start <= offset && token.end >= offset
    )
    if (index >= 0) {
        const token = source.tokens[index]
        const name = qualifiedName(source.tokens, index, cpp)
        if (!name) return undefined
        return {
            name: name.name,
            qualified: name.qualified,
            prefix: source.text.slice(token.start, offset),
            start: completion ? token.start : name.start,
            end: token.end
        }
    }
    if (!completion) return undefined
    let previousIndex = source.tokens.length - 1
    while (previousIndex >= 0 && source.tokens[previousIndex].end > offset) previousIndex--
    const previous = source.tokens[previousIndex]
    if (previous?.text === '.' || previous?.text === '->') return undefined
    if (previous?.text === '::') {
        if (
            !cpp ||
            source.tokens[previousIndex - 1]?.text !== 'std' ||
            ['::', '.', '->'].includes(source.tokens[previousIndex - 2]?.text ?? '')
        )
            return undefined
        return { name: 'std::', prefix: '', qualified: true, start: offset, end: offset }
    }
    return { name: '', prefix: '', qualified: false, start: offset, end: offset }
}

export function callAt(
    source: ScannedSource,
    offset: number,
    cpp: boolean
): CallContext | undefined {
    if (ignoredAt(source, offset) || includeAt(source, offset)) return undefined
    type Frame = {
        delimiter: string
        name?: string
        argument: number
        ambiguous: boolean
        blocksCall?: boolean
    }
    const stack: Frame[] = []
    for (
        let index = 0;
        index < source.tokens.length && source.tokens[index].start < offset;
        index++
    ) {
        const token = source.tokens[index]
        if (token.kind !== 'punct') continue
        if (token.text === '(' || token.text === '[' || token.text === '{') {
            const name =
                token.text === '(' ? qualifiedName(source.tokens, index - 1, cpp) : undefined
            const prior = source.tokens[index - 1]
            const beforeName = source.tokens[index - (name?.qualified ? 4 : 2)]
            const declaration =
                name &&
                ((beforeName?.kind === 'word' &&
                    !['return', 'co_return'].includes(beforeName.text)) ||
                    ['*', '&', '&&'].includes(beforeName?.text ?? ''))
            const cast =
                cpp &&
                token.text === '(' &&
                !name &&
                source.tokens[index + 1]?.kind === 'word' &&
                /^(?:void|bool|char|short|int|long|float|double|signed|unsigned|const|volatile|size_t|ptrdiff_t|u?int(?:8|16|32|64|max|ptr)_t)$/.test(
                    source.tokens[index + 1].text
                )
            stack.push({
                delimiter: token.text,
                name: declaration ? undefined : name?.name,
                argument: 0,
                ambiguous: Boolean(declaration || cast),
                blocksCall:
                    token.text === '(' &&
                    (prior?.kind === 'word' ||
                        [')', '>', '>>', '::'].includes(prior?.text ?? '')) &&
                    !name
            })
        } else if (token.text === ')' || token.text === ']' || token.text === '}') {
            const expected = token.text === ')' ? '(' : token.text === ']' ? '[' : '{'
            if (stack[stack.length - 1]?.delimiter !== expected) return undefined
            stack.pop()
        } else if (token.text === ',') {
            const frame = stack[stack.length - 1]
            if (frame?.delimiter === '(') frame.argument++
        } else if (cpp && ['<', '>', '>>', '<<'].includes(token.text)) {
            // Without a C++ parser, template arguments and relational expressions are ambiguous.
            for (const frame of stack) if (frame.delimiter === '(') frame.ambiguous = true
        }
    }
    for (let index = stack.length - 1; index >= 0; index--) {
        const frame = stack[index]
        if (frame.blocksCall || frame.ambiguous) return undefined
        if (frame.name) return { name: frame.name, argument: frame.argument }
    }
    return undefined
}
