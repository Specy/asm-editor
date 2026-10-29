import type monaco from 'monaco-editor'
import type { BuildArtifact } from '#lib/languages/commonLanguageFeatures.svelte.ts'
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
            const markdown = numberMarkdown(literal.value, options.bits, byteOrder(options.dialect))
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
    } else if (/h$/i.test(unsignedText)) {
        //before the 0b prefix: x86 and Z80 assemblers read 0B800h and 0Bh as hexadecimal
        radix = 16
        digits = unsignedText.slice(0, -1)
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

/** The order a Target keeps a number's bytes in memory: the 68000's is big-endian, the rest little. */
function byteOrder(dialect: AssemblyInsightOptions['dialect']): 'little' | 'big' {
    return dialect === 'm68k' ? 'big' : 'little'
}

/**
 * The card a number shows on hover, at a width of `bits`: its decimal value (signed and unsigned
 * when they differ), hexadecimal and binary, and, when its bytes in memory read as text, that text
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision 5).
 * A Listing's and a Pseudocode's numbers show the same card. Null for a value the width cannot hold.
 */
export function numberMarkdown(
    value: bigint,
    bits: AssemblyInsightOptions['bits'],
    order: 'little' | 'big' = 'little'
): string | null {
    const modulus = 1n << BigInt(bits)
    const signedMinimum = -(1n << BigInt(bits - 1))
    if (value < signedMinimum || value >= modulus) return null

    const unsigned = value < 0n ? value + modulus : value
    const signed = unsigned >= modulus / 2n ? unsigned - modulus : unsigned
    const differs = signed !== unsigned
    const fullHex = unsigned.toString(16).padStart(differs ? bits / 4 : 1, '0')
    const fullBinary = unsigned.toString(2).padStart(differs ? bits : 1, '0')
    const decimalRows = differs
        ? [`- Signed: \`${signed}\``, `- Unsigned: \`${unsigned}\``]
        : [`- Decimal: \`${unsigned}\``]
    const text = bytesAsText(unsigned, order)

    return [
        `**${bits}-bit value**`,
        '',
        ...decimalRows,
        `- Hexadecimal: \`0x${fullHex}\``,
        `- Binary: \`0b${groupBinary(fullBinary)}\``,
        ...(text === undefined ? [] : [`- Text: ${inlineCode(text)}`])
    ].join('\n')
}

/**
 * A value's bytes as text, when they are at least two printable ASCII characters: as many bytes as
 * the value needs (`0x4142` is two, wherever it is stored), in the order the Target keeps them in
 * memory, so `0x4c75257240343a41` reads `A:4@r%uL` on a little-endian Target, as a string the
 * program builds from it does. A value of spaces alone says nothing as text, and has none.
 */
function bytesAsText(value: bigint, order: 'little' | 'big'): string | undefined {
    const bytes: number[] = []
    for (let rest = value; rest > 0n; rest >>= 8n) bytes.push(Number(rest & 0xffn))
    if (bytes.length < 2 || !bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) return undefined
    if (order === 'big') bytes.reverse()
    const text = String.fromCharCode(...bytes)
    return text.trim() ? text : undefined
}

/**
 * Markdown code that shows `text` as it is: fenced by more backticks than it holds in a row, and
 * padded where it starts or ends with a backtick or a space, which the fence would otherwise eat.
 */
function inlineCode(text: string): string {
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
    const fence = '`'.repeat(longest + 1)
    const pad = /^[ `]|[ `]$/.test(text) ? ' ' : ''
    return `${fence}${pad}${text}${pad}${fence}`
}

/**
 * The Build hover's rows, one per address the line was placed at: the address and machine code,
 * what the line assembled as where that is not what it says, and what runs there now where the
 * program or a Poke changed those bytes since
 * ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decisions 26 and 27).
 */
function buildArtifactMarkdown(artifacts: readonly BuildArtifact[]): string {
    const visible = artifacts.slice(0, 32)
    const rows = visible.map((artifact) => {
        const address = formattedAddress(artifact.address)
        const placed = artifact.opcode
            ? `- Address \`${address}\` Machine code \`${artifact.opcode}\``
            : `- Address \`${address}\``
        const assembledAs = artifact.assembledAs
            ? `, assembled as ${inlineCode(artifact.assembledAs)}`
            : ''
        const runsNow = artifact.runsNow
            ? `\n- Code changed after Build. Current instruction: ${inlineCode(artifact.runsNow)}`
            : ''
        return `${placed}${assembledAs}${runsNow}`
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
