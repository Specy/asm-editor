import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'

export type AssemblyTextOptions = {
    comment: '#' | ';'
    /** Operations that introduce a named source block. */
    blockPairs?: ReadonlyArray<{ start: RegExp; end: RegExp }>
    /** Section directives which bound label-owned folds. */
    sectionPattern?: RegExp
    /** Z80 accepts an unindented label without a colon. */
    bareLabels?: boolean
    knownOperations?: ReadonlySet<string>
    /** NASM preprocessor directives conventionally stay at column zero. */
    columnZeroPattern?: RegExp
}

export type AssemblySpan = { text: string; start: number; end: number }

export type ParsedAssemblyLine = {
    code: string
    comment?: AssemblySpan
    label?: AssemblySpan & { colon: boolean }
    operation?: AssemblySpan
    operands: AssemblySpan[]
}

/** Finds a comment delimiter without treating one inside a quoted string as a comment. */
export function splitAssemblyComment(
    line: string,
    delimiter: '#' | ';'
): { code: string; comment?: AssemblySpan } {
    let quote = ''
    let escaped = false
    for (let index = 0; index < line.length; index++) {
        const character = line[index]!
        if (escaped) {
            escaped = false
            continue
        }
        if (quote && character === '\\') {
            escaped = true
            continue
        }
        if (character === '"' || character === "'") {
            if (!quote) quote = character
            else if (quote === character) quote = ''
            continue
        }
        if (!quote && character === delimiter) {
            return {
                code: line.slice(0, index),
                comment: { text: line.slice(index), start: index, end: line.length }
            }
        }
    }
    return { code: line }
}

/** Splits operands only at top-level commas; commas in strings and address expressions stay put. */
export function splitAssemblyOperands(text: string, absoluteStart = 0): AssemblySpan[] {
    const result: AssemblySpan[] = []
    const stack: string[] = []
    let quote = ''
    let escaped = false
    let start = 0
    const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
    const push = (end: number) => {
        let from = start
        let to = end
        while (from < to && /\s/.test(text[from]!)) from++
        while (to > from && /\s/.test(text[to - 1]!)) to--
        if (from < to || result.length > 0) {
            result.push({
                text: text.slice(from, to),
                start: absoluteStart + from,
                end: absoluteStart + to
            })
        }
    }
    for (let index = 0; index < text.length; index++) {
        const character = text[index]!
        if (escaped) {
            escaped = false
            continue
        }
        if (quote && character === '\\') {
            escaped = true
            continue
        }
        if (character === '"' || character === "'") {
            if (!quote) quote = character
            else if (quote === character) quote = ''
            continue
        }
        if (quote) continue
        if (closing[character]) stack.push(closing[character]!)
        else if (stack[stack.length - 1] === character) stack.pop()
        else if (character === ',' && stack.length === 0) {
            push(index)
            start = index + 1
        }
    }
    push(text.length)
    return result
}

export function parseAssemblyLine(line: string, options: AssemblyTextOptions): ParsedAssemblyLine {
    const split = splitAssemblyComment(line, options.comment)
    const code = split.code
    let cursor = /^\s*/.exec(code)?.[0].length ?? 0
    let label: ParsedAssemblyLine['label']
    const first = /^[A-Za-z_@.$?][\w@.$?]*/.exec(code.slice(cursor))
    if (first) {
        const firstStart = cursor
        cursor += first[0].length
        const afterWord = cursor
        while (cursor < code.length && /\s/.test(code[cursor]!)) cursor++
        if (code[cursor] === ':') {
            label = { text: first[0], start: firstStart, end: afterWord, colon: true }
            cursor++
        } else if (
            options.bareLabels &&
            firstStart === 0 &&
            !options.knownOperations?.has(first[0].toLowerCase())
        ) {
            label = { text: first[0], start: firstStart, end: afterWord, colon: false }
        } else {
            cursor = firstStart
        }
    }
    while (cursor < code.length && /\s/.test(code[cursor]!)) cursor++
    const operationMatch = /^[#.%]?[A-Za-z_][\w.]*/.exec(code.slice(cursor))
    if (!operationMatch) return { code, comment: split.comment, label, operands: [] }
    const operation = {
        text: operationMatch[0],
        start: cursor,
        end: cursor + operationMatch[0].length
    }
    cursor = operation.end
    const operands = splitAssemblyOperands(code.slice(cursor), cursor)
    return { code, comment: split.comment, label, operation, operands }
}

/** The active logical operand at a cursor in a line prefix. */
export function assemblyOperandContext(
    linePrefix: string,
    options: AssemblyTextOptions
): { operation: string; activeOperand: number; parsed: ParsedAssemblyLine } | null {
    const parsed = parseAssemblyLine(linePrefix, options)
    if (!parsed.operation || parsed.comment) return null
    return {
        operation: parsed.operation.text.replace(/^\./, '').toLowerCase(),
        activeOperand: Math.max(0, parsed.operands.length - 1),
        parsed
    }
}

function formatParsedLine(line: string, options: AssemblyTextOptions): string {
    const parsed = parseAssemblyLine(line, options)
    if (!parsed.operation) return line.replace(/[ \t]+$/, '')
    const operation = parsed.operation.text
    const keepAtColumnZero = options.columnZeroPattern?.test(operation) ?? false
    const prefix = parsed.label
        ? `${parsed.label.text}${parsed.label.colon ? ':' : ''} `
        : keepAtColumnZero
          ? ''
          : '    '
    const operands = parsed.operands.map((operand) => operand.text.trim()).join(', ')
    const statement = `${prefix}${operation}${operands ? ` ${operands}` : ''}`
    return parsed.comment ? `${statement}  ${parsed.comment.text.trimStart()}` : statement
}

/** Conservative statement formatting which preserves spelling, expressions, comments and EOLs. */
export function formatAssemblySource(source: string, options: AssemblyTextOptions): string {
    const eol = source.includes('\r\n') ? '\r\n' : '\n'
    const hasFinalEol = /\r?\n$/.test(source)
    const lines = source.split(/\r?\n/)
    if (hasFinalEol) lines.pop()
    const formatted = lines.map((line) => formatParsedLine(line, options)).join(eol)
    return formatted + (hasFinalEol ? eol : '')
}

export function createAssemblyFormattingProvider(
    monacoInstance: MonacoType,
    options: AssemblyTextOptions
): monaco.languages.DocumentFormattingEditProvider {
    return {
        provideDocumentFormattingEdits(model) {
            const formatted = formatAssemblySource(model.getValue(), options)
            if (formatted === model.getValue()) return []
            return [
                {
                    range: model.getFullModelRange(),
                    text: formatted
                }
            ]
        }
    }
}

export function createAssemblyRangeFormattingProvider(
    monacoInstance: MonacoType,
    options: AssemblyTextOptions
): monaco.languages.DocumentRangeFormattingEditProvider {
    return {
        provideDocumentRangeFormattingEdits(model, range) {
            const fullLines = new monacoInstance.Range(
                range.startLineNumber,
                1,
                range.endLineNumber,
                model.getLineMaxColumn(range.endLineNumber)
            )
            const original = model.getValueInRange(fullLines)
            const formatted = formatAssemblySource(original, options)
            return formatted === original ? [] : [{ range: fullLines, text: formatted }]
        }
    }
}

type Fold = { start: number; end: number; kind?: monaco.languages.FoldingRangeKind }

/** Regions, macro/conditional blocks, sections and label-owned routines. */
export function createAssemblyFoldingProvider(
    monacoInstance: MonacoType,
    options: AssemblyTextOptions
): monaco.languages.FoldingRangeProvider {
    return {
        provideFoldingRanges(model) {
            const lines = Array.from({ length: model.getLineCount() }, (_, index) =>
                model.getLineContent(index + 1)
            )
            const folds: Fold[] = []
            const boundaries = new Set<number>()
            const regionKind = monacoInstance.languages.FoldingRangeKind?.Region

            const pairs = [
                {
                    start: /^\s*(?:[#;]|\/\/)?\s*#?region\b/i,
                    end: /^\s*(?:[#;]|\/\/)?\s*#?endregion\b/i
                },
                ...(options.blockPairs ?? [])
            ]
            for (const pair of pairs) {
                const stack: number[] = []
                lines.forEach((line, index) => {
                    pair.start.lastIndex = 0
                    pair.end.lastIndex = 0
                    if (pair.start.test(line)) {
                        stack.push(index)
                        boundaries.add(index)
                    } else if (pair.end.test(line)) {
                        boundaries.add(index)
                        const start = stack.pop()
                        if (start !== undefined && index > start) {
                            folds.push({ start: start + 1, end: index + 1, kind: regionKind })
                        }
                    }
                })
            }

            const sectionLines: number[] = []
            const labelLines: number[] = []
            lines.forEach((line, index) => {
                const parsed = parseAssemblyLine(line, options)
                if (parsed.label) labelLines.push(index)
                if (options.sectionPattern && parsed.operation) {
                    options.sectionPattern.lastIndex = 0
                    if (options.sectionPattern.test(parsed.operation.text)) sectionLines.push(index)
                }
            })
            for (let index = 0; index < sectionLines.length; index++) {
                const start = sectionLines[index]!
                const end = (sectionLines[index + 1] ?? lines.length) - 1
                if (end > start) folds.push({ start: start + 1, end: end + 1, kind: regionKind })
            }
            const hardBoundaries = [...new Set([...sectionLines, ...boundaries])].sort(
                (a, b) => a - b
            )
            for (let index = 0; index < labelLines.length; index++) {
                const start = labelLines[index]!
                const nextLabel = labelLines[index + 1] ?? lines.length
                const nextBoundary = hardBoundaries.find((line) => line > start) ?? lines.length
                const end = Math.min(nextLabel, nextBoundary) - 1
                if (end > start) folds.push({ start: start + 1, end: end + 1 })
            }

            const unique = new Map<string, Fold>()
            for (const fold of folds) unique.set(`${fold.start}:${fold.end}`, fold)
            return [...unique.values()].sort((a, b) => a.start - b.start || b.end - a.end)
        }
    }
}

/** Escapes a placeholder default for Monaco's snippet grammar. */
export function snippetDefault(value: string): string {
    return value.replace(/([\\$}])/g, '\\$1')
}

export function instructionSnippet(name: string, operands: readonly string[]): string {
    if (operands.length === 0) return name
    return `${name} ${operands.map((operand, index) => `\${${index + 1}:${snippetDefault(operand)}}`).join(', ')}`
}
