import type { HelpLanguage } from './context'
import type { HelpEntry } from './types'
import type { ScannedSource, Token } from './scan'

type Scope = { start: number; end: number; depth: number }
export type SourceSymbol = {
    name: string
    kind: 'variable' | 'parameter' | 'function'
    declaration: string
    start: number
    availableFrom: number
    scope: Scope
    parameters?: HelpEntry['parameters']
    signatureKey?: string
    ambiguous?: boolean
}
type Parameter = { label: string; name?: Token; key: string }
type Declarator = { name: Token; end: number; pointer: boolean }
const qualifiers = new Set(
    'const volatile restrict static extern inline register constexpr thread_local _Noreturn'.split(
        ' '
    )
)
const primitives = new Set(
    'void char short int long float double signed unsigned bool _Bool auto _Complex'.split(' ')
)
const headerTypes = new Set(
    'size_t ptrdiff_t wchar_t nullptr_t FILE fpos_t time_t clock_t va_list div_t ldiv_t lldiv_t imaxdiv_t float_t double_t'.split(
        ' '
    )
)
const reserved = new Set(
    'return break continue goto if else for while do switch case default sizeof alignof _Alignof new delete throw try catch namespace class struct union enum typedef using template operator public private protected'.split(
        ' '
    )
)
const cppOnly = new Set(
    'constexpr thread_local bool alignof new delete throw try catch namespace class using template operator public private protected'.split(
        ' '
    )
)
const isHeaderType = (name: string) =>
    headerTypes.has(name) ||
    /^u?int(?:8|16|32|64|least(?:8|16|32|64)|fast(?:8|16|32|64)|ptr|max)_t$/.test(name)
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const indexes = new WeakMap<ScannedSource, Map<HelpLanguage, SourceSymbol[]>>()

/** Best-effort declaration indexing, not a C/C++ parser or binding/type checker. */
export function indexSourceSymbols(source: ScannedSource, language: HelpLanguage): SourceSymbol[] {
    let cached = indexes.get(source)
    if (cached?.has(language)) return cached.get(language)!
    const isQualifier = (name: string) =>
        qualifiers.has(name) &&
        !(language === 'c' && cppOnly.has(name)) &&
        !(language === 'cpp' && name === 'restrict')
    const isPrimitive = (name: string) =>
        primitives.has(name) && !(language === 'c' && cppOnly.has(name))
    const isReserved = (name: string) =>
        reserved.has(name) && !(language === 'c' && cppOnly.has(name))
    const tokens = withoutDirectives(source)
    const pairs = new Map<number, number>()
    const stack: number[] = []
    for (let i = 0; i < tokens.length; i++) {
        const text = tokens[i].text
        if (['(', '[', '{'].includes(text)) stack.push(i)
        else if ([')', ']', '}'].includes(text)) {
            const opening = stack[stack.length - 1]
            if (
                tokens[opening]?.text !==
                ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[text]
            )
                continue
            stack.pop()
            pairs.set(opening, i)
        }
    }
    const symbols: SourceSymbol[] = []
    const types = new Map<string, { from: number; scope: Scope }[]>()
    const addType = (name: string, from: number, scope: Scope) => {
        const entries = types.get(name) ?? []
        entries.push({ from, scope })
        types.set(name, entries)
    }
    const knownType = (token: Token, scope: Scope) => {
        if (isHeaderType(token.text) || (language === 'c' && token.text === 'bool')) return true
        const entries = types.get(token.text) ?? []
        for (let i = entries.length - 1; i >= 0; i--) {
            const type = entries[i]
            if (
                type.from <= token.start &&
                type.scope.start <= scope.start &&
                type.scope.end >= scope.end
            )
                return true
        }
        return false
    }
    const child = (start: number, end: number, parent: Scope): Scope => ({
        start,
        end,
        depth: parent.depth + 1
    })
    const endOffset = (index: number) => tokens[index]?.end ?? source.text.length + 1
    function statementEnd(at: number, limit: number): number {
        // Bound recursion for pathological nested unbraced control statements.
        const descend = (index: number, depth: number): number => {
            if (depth > 64) return limit
            if (tokens[index]?.text === '{')
                return Math.min((pairs.get(index) ?? limit - 1) + 1, limit)
            if (['if', 'for', 'while', 'switch'].includes(tokens[index]?.text)) {
                const close = pairs.get(index + 1)
                if (close === undefined || close >= limit) return limit
                let end = descend(close + 1, depth + 1)
                if (tokens[index].text === 'if' && tokens[end]?.text === 'else')
                    end = descend(end + 1, depth + 1)
                return end
            }
            if (tokens[index]?.text === 'do') {
                const end = descend(index + 1, depth + 1)
                const close = tokens[end]?.text === 'while' ? pairs.get(end + 1) : undefined
                return close === undefined
                    ? end
                    : Math.min(close + (tokens[close + 1]?.text === ';' ? 2 : 1), limit)
            }
            for (let i = index; i < limit; i++) {
                if (tokens[i].text === ';') return i + 1
                if (tokens[i].text === '}') return i
                if (['(', '[', '{'].includes(tokens[i].text)) {
                    const close = pairs.get(i)
                    if (close === undefined) return limit
                    i = close
                }
            }
            return limit
        }
        return descend(at, 0)
    }
    const typeText = (start: number, end: number) =>
        tokens
            .slice(start, end)
            .map((token) => token.text)
            .join(' ')
            .replace(/\s*::\s*/g, '::')
    function prefix(
        at: number,
        limit: number,
        scope: Scope
    ): { end: number; display: string; typedef: boolean } | undefined {
        let i = at,
            hasType = false,
            alias = false
        while (i < limit) {
            const token = tokens[i]
            if (token.text === 'typedef') {
                alias = true
                i++
                continue
            }
            if (isQualifier(token.text)) {
                i++
                continue
            }
            if (isPrimitive(token.text)) {
                hasType = true
                i++
                continue
            }
            if (
                ['struct', 'union', 'enum'].includes(token.text) ||
                (language !== 'c' && token.text === 'class')
            ) {
                const tag = tokens[i + 1]?.kind === 'word' ? tokens[i + 1] : undefined
                if (tag && isReserved(tag.text)) return undefined
                i += tag ? 2 : 1
                hasType = true
                if (tokens[i]?.text === '{') {
                    const close = pairs.get(i)
                    if (close === undefined || close >= limit) return undefined
                    if (tag && language !== 'c') addType(tag.text, tag.end, scope)
                    // Fields and methods are not unqualified local declarations.
                    const display = typeText(at, i)
                    return { end: close + 1, display, typedef: alias }
                }
                if (!tag) return undefined
                continue
            }
            if (
                !hasType &&
                token.text === 'std' &&
                tokens[i + 1]?.text === '::' &&
                tokens[i + 2]?.kind === 'word' &&
                isHeaderType(tokens[i + 2].text)
            ) {
                hasType = true
                i += 3
                continue
            }
            if (!hasType && token.kind === 'word' && knownType(token, scope)) {
                hasType = true
                i++
                continue
            }
            break
        }
        if (!hasType) return undefined
        return {
            end: i,
            display: typeText(at, i),
            typedef: alias
        }
    }
    function declarator(at: number, limit: number): Declarator | undefined {
        let i = at,
            pointer = false
        while (
            i < limit &&
            (['*', '&', '&&'].includes(tokens[i].text) || isQualifier(tokens[i].text))
        )
            i++
        let name = tokens[i]
        if (name?.text === '(') {
            const close = pairs.get(i)
            if (close === undefined || close >= limit || !['*', '&'].includes(tokens[i + 1]?.text))
                return undefined
            i++
            while (
                i < close &&
                (['*', '&', '&&'].includes(tokens[i].text) || isQualifier(tokens[i].text))
            )
                i++
            name = tokens[i]
            if (i + 1 !== close) return undefined
            i = close + 1
            pointer = true
        } else i++
        if (
            !name ||
            name.kind !== 'word' ||
            isReserved(name.text) ||
            isPrimitive(name.text) ||
            isQualifier(name.text)
        )
            return undefined
        while (i < limit && (tokens[i].text === '[' || (pointer && tokens[i].text === '('))) {
            const close = pairs.get(i)
            if (close === undefined || close >= limit) return undefined
            i = close + 1
        }
        return { name, end: i, pointer }
    }
    function parameterList(open: number, close: number, scope: Scope): Parameter[] | undefined {
        if (open + 1 === close) return []
        if (open + 2 === close && tokens[open + 1].text === 'void') return []
        const result: Parameter[] = []
        let start = open + 1
        for (let i = start; i <= close; i++) {
            if (i < close && ['(', '[', '{'].includes(tokens[i].text)) {
                const end = pairs.get(i)
                if (end === undefined || end >= close) return undefined
                i = end
                continue
            }
            if (i !== close && tokens[i].text !== ',') continue
            if (start === i) return undefined
            if (tokens[start].text === '...' && start + 1 === i) {
                if (i !== close) return undefined
                result.push({ label: '...', key: '...' })
                start = i + 1
                continue
            }
            const type = prefix(start, i, scope)
            if (!type || type.typedef) return undefined
            const item = type.end < i ? declarator(type.end, i) : undefined
            const end = item?.end ?? type.end
            // Unnamed pointer/reference parameters are valid prototypes too.
            const unnamed =
                !item &&
                tokens
                    .slice(type.end, i)
                    .every(
                        (token) => ['*', '&', '&&'].includes(token.text) || isQualifier(token.text)
                    )
            if (!unnamed && (!item || (end < i && tokens[end].text !== '='))) return undefined
            const label = normalize(source.text.slice(tokens[start].start, tokens[i - 1].end))
            const key = tokens
                .slice(start, item?.end ?? i)
                .filter((token) => token !== item?.name)
                .map((token) => token.text)
                .join(' ')
            result.push({ label, name: item?.name, key })
            start = i + 1
        }
        return result
    }
    function declaration(at: number, limit: number, scope: Scope): number | undefined {
        const type = prefix(at, limit, scope)
        if (!type) return undefined
        let i = type.end
        if (tokens[i]?.text === ';') return i + 1
        for (;;) {
            const start = i,
                item = declarator(i, limit)
            if (!item) return undefined
            i = item.end
            if (!item.pointer && tokens[i]?.text === '(') {
                const close = pairs.get(i)
                if (close === undefined || close >= limit) return undefined
                const params = parameterList(i, close, scope)
                if (params) {
                    let next = close + 1
                    if (tokens[next]?.text === 'noexcept') next++
                    if (![';', '{'].includes(tokens[next]?.text)) return undefined
                    const declarationStart = `${type.display} ${normalize(source.text.slice(tokens[start].start, item.name.end))}`
                    const empty = params.length
                        ? params.map((param) => param.label).join(', ')
                        : tokens[i + 1]?.text === 'void'
                          ? 'void'
                          : ''
                    const signature = `${declarationStart}(${empty})`
                    let offset = declarationStart.length + 1
                    const parameters = params.map((param) => {
                        const range: [number, number] = [offset, offset + param.label.length]
                        offset += param.label.length + 2
                        return { label: param.label, range }
                    })
                    if (type.typedef) addType(item.name.text, endOffset(next), scope)
                    else
                        symbols.push({
                            name: item.name.text,
                            kind: 'function',
                            declaration: signature,
                            start: item.name.start,
                            availableFrom: item.name.end,
                            scope,
                            parameters:
                                params.length || empty === 'void' || language === 'cpp'
                                    ? parameters
                                    : undefined,
                            signatureKey: params.map((param) => param.key).join(',')
                        })
                    if (tokens[next].text === '{') {
                        const end = pairs.get(next) ?? limit
                        const body = child(tokens[next].start, endOffset(end), scope)
                        if (!type.typedef)
                            for (const param of params)
                                if (param.name)
                                    symbols.push({
                                        name: param.name.text,
                                        kind: 'parameter',
                                        declaration: param.label,
                                        start: param.name.start,
                                        availableFrom: tokens[next].end,
                                        scope: body
                                    })
                        walk(next + 1, end, body)
                        return Math.min(end + 1, limit)
                    }
                    return next + 1
                } else {
                    // Ordinary C++ direct initialization is a variable, not a guessed prototype.
                    if (
                        language !== 'cpp' ||
                        type.typedef ||
                        ![',', ';'].includes(tokens[close + 1]?.text)
                    )
                        return undefined
                    i = close + 1
                }
            }
            if (!['=', '{', ',', ';', ':', ')'].includes(tokens[i]?.text)) return undefined
            if (type.typedef) addType(item.name.text, item.name.end, scope)
            else
                symbols.push({
                    name: item.name.text,
                    kind: 'variable',
                    declaration: `${type.display} ${normalize(source.text.slice(tokens[start].start, endOffset(item.end - 1)))}`,
                    start: item.name.start,
                    availableFrom: item.name.end,
                    scope
                })
            // Skip initializer expressions, including lambda/compound-literal bodies.
            if (tokens[i]?.text === '=' || tokens[i]?.text === '{') {
                if (tokens[i].text === '=') i++
                while (i < limit && ![',', ';', ')'].includes(tokens[i].text)) {
                    if (['(', '[', '{'].includes(tokens[i].text)) {
                        const end = pairs.get(i)
                        if (end === undefined) return limit
                        i = end + 1
                    } else i++
                }
            }
            if (tokens[i]?.text !== ',') return Math.min(i + 1, limit)
            i++
        }
    }
    const controlEnd = (end: number) =>
        end >= tokens.length && ![';', '}'].includes(tokens[end - 1]?.text)
            ? source.text.length + 1
            : endOffset(end - 1)
    function walk(at: number, limit: number, scope: Scope): void {
        if (scope.depth > 64) return
        let i = at
        while (i < limit) {
            const token = tokens[i]
            if (token.text === ';' || token.text === '}') {
                i++
                continue
            }
            if (token.text === '{') {
                const end = pairs.get(i) ?? limit
                walk(i + 1, end, child(token.start, endOffset(end), scope))
                i = Math.min(end + 1, limit)
                continue
            }
            if (
                language !== 'c' &&
                token.text === 'using' &&
                tokens[i + 1]?.kind === 'word' &&
                tokens[i + 2]?.text === '='
            ) {
                const end = statementEnd(i, limit)
                addType(tokens[i + 1].text, endOffset(end - 1), scope)
                i = end
                continue
            }
            if (language !== 'c' && (token.text === 'namespace' || token.text === 'template')) {
                // Do not export namespace/class/template members as unqualified file names.
                let end = i
                while (end < limit && !['{', ';'].includes(tokens[end].text)) end++
                i =
                    tokens[end]?.text === '{'
                        ? Math.min((pairs.get(end) ?? limit - 1) + 1, limit)
                        : end + 1
                continue
            }
            if (
                ['for', 'if', 'while', 'switch'].includes(token.text) &&
                tokens[i + 1]?.text === '('
            ) {
                const close = pairs.get(i + 1)
                if (close === undefined) {
                    // Preserve initializer declarations while the control header is still being typed.
                    declaration(i + 2, limit, child(token.start, source.text.length + 1, scope))
                    return
                }
                const end = statementEnd(i, limit)
                const control = child(token.start, controlEnd(end), scope)
                const declared = declaration(i + 2, close, control)
                if (
                    declared !== undefined &&
                    declared < close &&
                    tokens[declared - 1]?.text === ';'
                )
                    declaration(declared, close, control)
                const bodyEnd = statementEnd(close + 1, limit)
                walk(close + 1, bodyEnd, control)
                if (tokens[bodyEnd]?.text === 'else') walk(bodyEnd + 1, end, control)
                i = end
                continue
            }
            if (token.text === 'do') {
                const bodyEnd = statementEnd(i + 1, limit)
                walk(i + 1, bodyEnd, child(token.start, controlEnd(bodyEnd), scope))
                i = statementEnd(i, limit)
                continue
            }
            if (
                token.text === 'case' ||
                token.text === 'default' ||
                (token.kind === 'word' && tokens[i + 1]?.text === ':')
            ) {
                while (i < limit && tokens[i].text !== ':') i++
                i++
                continue
            }
            const end = declaration(i, limit, scope) ?? statementEnd(i, limit)
            if (end <= i) return
            i = end
        }
    }
    walk(0, tokens.length, { start: 0, end: source.text.length + 1, depth: 0 })
    cached ??= new Map()
    cached.set(language, symbols)
    indexes.set(source, cached)
    return symbols
}

/** Nearest declaration wins; differing overloads are kept ambiguous for parameter hints. */
export function visibleSourceSymbols(
    source: ScannedSource,
    language: HelpLanguage,
    offset: number
): SourceSymbol[] {
    const eligible = indexSourceSymbols(source, language)
        .filter(
            (item) =>
                item.availableFrom <= offset &&
                item.scope.start <= offset &&
                offset < item.scope.end
        )
        .sort((a, b) => b.scope.depth - a.scope.depth || b.start - a.start)
    const result = new Map<string, SourceSymbol>()
    for (const item of eligible) {
        const previous = result.get(item.name)
        if (!previous) result.set(item.name, { ...item })
        else if (
            previous.kind === 'function' &&
            item.kind === 'function' &&
            previous.scope === item.scope &&
            previous.signatureKey !== item.signatureKey
        )
            previous.ambiguous = true
    }
    return [...result.values()]
}

function withoutDirectives(source: ScannedSource): Token[] {
    const tokens: Token[] = []
    let end = -1
    for (const token of source.tokens) {
        if (token.start < end) continue
        if (token.text === '#') {
            end = source.text.indexOf('\n', token.end)
            while (end >= 0 && source.text[end - (source.text[end - 1] === '\r' ? 2 : 1)] === '\\')
                end = source.text.indexOf('\n', end + 1)
            if (end < 0) end = source.text.length
            continue
        }
        tokens.push(token)
    }
    return tokens
}
