import type monaco from 'monaco-editor'
import type { BuildArtifact } from '$lib/languages/commonLanguageFeatures.svelte'
import type { MonacoType } from './Monaco'

export type AssemblyInsightOptions = {
    bits: 16 | 32 | 64
    comment: '#' | ';'
    dialect: 'm68k' | 'mips' | 'risc-v' | 'x86' | 'z80'
}

export type OperationSpan = { start: number; end: number }

const buildArtifacts = new Map<string, readonly BuildArtifact[]>()

/** Makes Build output available to hover providers for one immutable source model. */
export function setModelBuildArtifacts(
    uri: string,
    artifacts: readonly BuildArtifact[]
): () => void {
    const registered = [...artifacts]
    if (registered.length > 0) buildArtifacts.set(uri, registered)
    else buildArtifacts.delete(uri)
    return () => {
        if (buildArtifacts.get(uri) === registered) buildArtifacts.delete(uri)
    }
}

export function createBuildArtifactHoverProvider(
    monacoInstance: MonacoType,
    operationSpan: (line: string) => OperationSpan | undefined
): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const artifacts = (buildArtifacts.get(model.uri.toString()) ?? []).filter(
                (artifact) => artifact.line === position.lineNumber - 1
            )
            if (artifacts.length === 0) return null

            const line = model.getLineContent(position.lineNumber)
            const operation = operationSpan(line)
            const offset = position.column - 1
            if (!operation || offset < operation.start || offset >= operation.end) return null

            return {
                range: new monacoInstance.Range(
                    position.lineNumber,
                    operation.start + 1,
                    position.lineNumber,
                    operation.end + 1
                ),
                contents: [{ value: buildArtifactMarkdown(artifacts) }]
            }
        }
    }
}

export function createNumericHoverProvider(
    monacoInstance: MonacoType,
    options: AssemblyInsightOptions
): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const line = model.getLineContent(position.lineNumber)
            const offset = position.column - 1
            const literal = numericLiterals(line, options).find(
                (candidate) => offset >= candidate.start && offset < candidate.end
            )
            if (!literal) return null
            const markdown = numericLiteralMarkdown(literal, options.bits)
            if (!markdown) return null

            return {
                range: new monacoInstance.Range(
                    position.lineNumber,
                    literal.start + 1,
                    position.lineNumber,
                    literal.end + 1
                ),
                contents: [{ value: markdown }]
            }
        }
    }
}

type NumericLiteral = {
    start: number
    end: number
    value: bigint
}

const COMMON_NUMBER =
    /(?<![\w.$%@])-?(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|[0-9](?:_?[0-9])*)(?![\w.])/g
const DOLLAR_NUMBER = /(?<![\w.])-?\$[0-9a-fA-F](?:_?[0-9a-fA-F])*(?![\w.])/g
const PERCENT_NUMBER = /(?<![\w.])-?%[01](?:_?[01])*(?![\w.])/g
const AT_NUMBER = /(?<![\w.])-?@[0-7](?:_?[0-7])*(?![\w.])/g
const SUFFIX_NUMBER =
    /(?<![\w.])-?(?:[0-9][0-9a-fA-F_]*[hH]|[01][01_]*[bB]|[0-7][0-7_]*[oOqQ])(?![\w.])/g

function numericLiterals(line: string, options: AssemblyInsightOptions): NumericLiteral[] {
    const patterns = [COMMON_NUMBER]
    if (options.dialect === 'm68k' || options.dialect === 'z80') {
        patterns.push(DOLLAR_NUMBER, PERCENT_NUMBER)
    }
    if (options.dialect === 'm68k') patterns.push(AT_NUMBER)
    if (options.dialect === 'z80' || options.dialect === 'x86') patterns.push(SUFFIX_NUMBER)

    const found = new Map<string, NumericLiteral>()
    for (const pattern of patterns) {
        pattern.lastIndex = 0
        for (const match of line.matchAll(pattern)) {
            const start = match.index
            const text = match[0]
            if (insideStringOrComment(line, start, options)) continue
            const value = parseNumericLiteral(text, options.dialect)
            if (value === null) continue
            found.set(`${start}:${text.length}`, {
                start,
                end: start + text.length,
                value
            })
        }
    }
    return [...found.values()].sort((left, right) => left.start - right.start)
}

function insideStringOrComment(
    line: string,
    offset: number,
    options: Pick<AssemblyInsightOptions, 'comment' | 'dialect'>
): boolean {
    if (options.dialect === 'm68k' && /^\s*\*/.test(line) && offset >= line.indexOf('*')) {
        return true
    }
    let quote: '"' | "'" | null = null
    for (let index = 0; index < offset; index++) {
        const character = line[index]
        if (quote) {
            if (character === quote && line[index - 1] !== '\\') quote = null
            continue
        }
        if (character === '"' || character === "'") quote = character
        else if (character === options.comment) return true
    }
    return quote !== null
}

function parseNumericLiteral(
    text: string,
    dialect: AssemblyInsightOptions['dialect']
): bigint | null {
    const negative = text.startsWith('-')
    const unsignedText = (negative ? text.slice(1) : text).replace(/_/g, '')
    let radix: 2 | 8 | 10 | 16 = 10
    let digits = unsignedText

    if (/^0x/i.test(unsignedText)) {
        radix = 16
        digits = unsignedText.slice(2)
    } else if (/^0b/i.test(unsignedText)) {
        radix = 2
        digits = unsignedText.slice(2)
    } else if (/^0o/i.test(unsignedText)) {
        radix = 8
        digits = unsignedText.slice(2)
    } else if (unsignedText.startsWith('$')) {
        radix = 16
        digits = unsignedText.slice(1)
    } else if (unsignedText.startsWith('%')) {
        radix = 2
        digits = unsignedText.slice(1)
    } else if (unsignedText.startsWith('@')) {
        radix = 8
        digits = unsignedText.slice(1)
    } else if (/h$/i.test(unsignedText)) {
        radix = 16
        digits = unsignedText.slice(0, -1)
    } else if (/b$/i.test(unsignedText)) {
        radix = 2
        digits = unsignedText.slice(0, -1)
    } else if (/[oq]$/i.test(unsignedText)) {
        radix = 8
        digits = unsignedText.slice(0, -1)
    } else if ((dialect === 'mips' || dialect === 'risc-v') && /^0[0-7]+$/.test(unsignedText)) {
        radix = 8
    }

    try {
        const prefix = radix === 10 ? '' : radix === 16 ? '0x' : radix === 8 ? '0o' : '0b'
        const value = BigInt(`${prefix}${digits}`)
        return negative ? -value : value
    } catch {
        return null
    }
}

function numericLiteralMarkdown(
    literal: NumericLiteral,
    bits: AssemblyInsightOptions['bits']
): string | null {
    const modulus = 1n << BigInt(bits)
    const signedMinimum = -(1n << BigInt(bits - 1))
    if (literal.value < signedMinimum || literal.value >= modulus) return null

    const unsigned = literal.value < 0n ? literal.value + modulus : literal.value
    const signed = unsigned >= modulus / 2n ? unsigned - modulus : unsigned
    const differs = signed !== unsigned
    const fullHex = unsigned.toString(16).padStart(differs ? bits / 4 : 1, '0')
    const fullBinary = unsigned.toString(2).padStart(differs ? bits : 1, '0')
    const decimalRows = differs
        ? [`- Signed: \`${signed}\``, `- Unsigned: \`${unsigned}\``]
        : [`- Decimal: \`${unsigned}\``]

    return [
        `**${bits}-bit value**`,
        '',
        ...decimalRows,
        `- Hexadecimal: \`0x${fullHex}\``,
        `- Binary: \`0b${groupBinary(fullBinary)}\``
    ].join('\n')
}

function buildArtifactMarkdown(artifacts: readonly BuildArtifact[]): string {
    const visible = artifacts.slice(0, 32)
    const rows = visible.map((artifact) => {
        const address = formattedAddress(artifact.address)
        return artifact.opcode
            ? `- Address \`${address}\` — machine code \`${artifact.opcode}\``
            : `- Address \`${address}\``
    })
    if (visible.length < artifacts.length) {
        rows.push(`- …and ${artifacts.length - visible.length} more`)
    }
    return ['**Current Build**', '', ...rows].join('\n')
}

function formattedAddress(value: bigint): string {
    const address = value.toString(16)
    return `0x${address.padStart(address.length <= 4 ? 4 : address.length <= 8 ? 8 : 16, '0')}`
}

function groupBinary(binary: string): string {
    const first = binary.length % 4 || 4
    const groups = [binary.slice(0, first)]
    for (let index = first; index < binary.length; index += 4) {
        groups.push(binary.slice(index, index + 4))
    }
    return groups.join('_')
}
