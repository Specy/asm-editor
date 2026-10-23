/**
 * Where the global names are in a function's Pseudocode text, so that a global rename can rewrite
 * a text the search cache keeps without decompiling it again
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 28,
 * and "The cached text with a new name"). Lines may then break where a fresh decompilation would
 * break them; a result's click finds its match again in the text the pane shows.
 */

/** A name in a text: `text.slice(start, end)`, naming the link-time address `target`. */
export type NameSpan = Readonly<{ start: number; end: number; target: number }>

/** What `pseudocodeNameSpans` reads of a decompiled line (`DecompiledLine`). */
export type NamedLine = {
    text: string
    tokens: readonly {
        start: number
        end: number
        kind: string
        target?: number
        variable?: string
    }[]
}

/**
 * The function and global names of a function's decompiled lines, by their offsets in its text
 * (the lines joined with `\n`, as `DecompiledFunction.text` is): each `function` or `variable`
 * token naming a `target` that is not a local variable. A string literal (`constant`) names its
 * string's address too but is the string's text, and a `goto`'s label (`syntax`) is Ghidra's
 * `code_r0x…`, which a jump target's rename does not reach (open question 6): neither is one.
 */
export function pseudocodeNameSpans(lines: readonly NamedLine[]): NameSpan[] {
    const spans: NameSpan[] = []
    let offset = 0
    for (const line of lines) {
        for (const token of line.tokens) {
            const named = token.kind === 'function' || token.kind === 'variable'
            if (named && token.target !== undefined && token.variable === undefined)
                spans.push({
                    start: offset + token.start,
                    end: offset + token.end,
                    target: token.target
                })
        }
        offset += line.text.length + 1
    }
    return spans
}

/**
 * The global names a function's decompiled lines print widened, which name no `target`: Ghidra
 * writes a global read at a size its symbol does not have with an underscore before its name
 * (`PrintC::pushMismatchSymbol`: `___dso_handle` for `__dso_handle`, `_DAT_epic_cicada`), as a
 * `variable` token of no variable. Each is given without that underscore, as the symbol's name, so
 * that a rename of the symbol can tell the text names it, which it then cannot rewrite.
 */
export function pseudocodeWidenedNames(lines: readonly NamedLine[]): string[] {
    const names = new Set<string>()
    for (const line of lines)
        for (const token of line.tokens)
            if (
                token.kind === 'variable' &&
                token.target === undefined &&
                token.variable === undefined &&
                line.text[token.start] === '_'
            )
                names.add(line.text.slice(token.start + 1, token.end))
    return [...names]
}

/**
 * The text with each span's name replaced by `nameOf(target)`, where that gives one, and the
 * spans where they then are; `spans` in text order, not overlapping. A name `nameOf` leaves
 * `undefined` stays as it is, so a rename and a Reset name are both one call.
 */
export function rewriteNames(
    text: string,
    spans: readonly NameSpan[],
    nameOf: (target: number) => string | undefined
): { text: string; spans: NameSpan[] } {
    const moved: NameSpan[] = []
    let rewritten = ''
    let copied = 0
    let shift = 0
    let changed = false
    for (const span of spans) {
        const name = nameOf(span.target)
        if (name === undefined || name === text.slice(span.start, span.end)) {
            moved.push(
                shift
                    ? { start: span.start + shift, end: span.end + shift, target: span.target }
                    : span
            )
            continue
        }
        rewritten += text.slice(copied, span.start) + name
        copied = span.end
        changed = true
        moved.push({
            start: span.start + shift,
            end: span.start + shift + name.length,
            target: span.target
        })
        shift += name.length - (span.end - span.start)
    }
    if (!changed) return { text, spans: moved }
    return { text: rewritten + text.slice(copied), spans: moved }
}
