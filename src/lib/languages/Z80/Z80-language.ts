import type { MonacoType } from '$lib/monaco/Monaco'
import type monaco from 'monaco-editor'
import { AsmTokenizer, getAsmInstructionTrie, type AsmToken, type AsmTrieNode } from '@specy/z80'
import {
    formatZ80InstructionSummary,
    z80ConditionalMnemonics,
    z80ConditionCodes,
    z80Directives,
    z80InstructionMap,
    z80InstructionNames,
    z80Operands,
    z80Registers,
    type Z80InstructionVariant
} from './Z80-documentation'
import {
    assemblyOperandContext,
    instructionSnippet,
    splitAssemblyComment,
    type AssemblyTextOptions
} from '$lib/languages/service/assemblyText'

const registerMap = new Map(z80Registers.map((register) => [register.name, register]))
const conditionMap = new Map(z80ConditionCodes.map((condition) => [condition.name, condition]))
const operandMap = new Map(z80Operands.map((operand) => [operand.name, operand]))
/** Every spelling of every directive, `.org` and `org` alike, pointing at its documentation. */
const directiveMap = new Map(
    z80Directives.flatMap((directive) => directive.names.map((name) => [name, directive] as const))
)

export const Z80_TEXT_OPTIONS = {
    comment: ';',
    bareLabels: true,
    knownOperations: new Set([...z80InstructionNames, ...directiveMap.keys()]),
    sectionPattern: /^(?:#?code|#?data|\.?(?:text|data|bss|section))$/i,
    blockPairs: [
        {
            start: /^\s*(?:[A-Za-z_.][\w.]*\s+)?\.?macro\b/i,
            end: /^\s*\.?endm\b/i
        },
        { start: /^\s*\.?(?:if|ifdef|ifndef)\b/i, end: /^\s*\.?endif\b/i }
    ]
} satisfies AssemblyTextOptions

/** A hover on `ld` would otherwise print a 192 row table. */
const HOVER_VARIANT_LIMIT = 25

/**
 * The summary and the markdown table of a mnemonic. Completion rebuilds its whole list on every
 * keystroke and there are 68 mnemonics, so the markdown is built once and kept.
 */
const documentationCache = new Map<string, { summary: string; hover: string }>()
function instructionDocs(name: string): { summary: string; hover: string } {
    const cached = documentationCache.get(name)
    if (cached) return cached
    const variants = z80InstructionMap.get(name) ?? []
    const docs = {
        summary: formatZ80InstructionSummary(variants),
        hover: formatInstructionHover(name, variants)
    }
    documentationCache.set(name, docs)
    return docs
}

type DocumentSymbols = {
    labels: string[]
    /** Symbols defined with `equ`, `defl` or `=`: they stand for a value, not for an address. */
    constants: string[]
}

/**
 * Collects the symbols a program defines, for the completion of jump targets and operands. The
 * assembler is the authority on these, but completion runs on code that does not assemble yet, so
 * this reads the source line by line instead.
 */
function collectSymbols(text: string): DocumentSymbols {
    const labels: string[] = []
    const constants: string[] = []
    for (const rawLine of text.split('\n')) {
        const line = rawLine.split(';')[0]
        const constant = /^\s*([a-zA-Z_.][\w.]*)\s*:?\s*(?:(?:equ|\.equ|defl)\b|=)/i.exec(line)
        if (constant) {
            constants.push(constant[1])
            continue
        }
        const labelled = /^\s*([a-zA-Z_.][\w.]*)\s*:/.exec(line)
        if (labelled) {
            labels.push(labelled[1])
            continue
        }
        // A label may also be written without a colon, in which case it must start at column 0.
        const bare = /^([a-zA-Z_.][\w.]*)\b/.exec(line)?.[1]
        // Both tables are keyed by the assembler's lower case spellings, and Z80 source is case
        // insensitive: `ORG` is the directive, not a label named ORG.
        const lowered = bare?.toLowerCase() ?? ''
        if (bare && !z80InstructionMap.has(lowered) && !directiveMap.has(lowered)) {
            labels.push(bare)
        }
    }
    return { labels, constants }
}

/** Tokens of the line, without the comment: comments never take part in the parse. */
function tokenizeLine(line: string): AsmToken[] {
    try {
        return new AsmTokenizer(line).tokens.filter((token) => token.tag !== 'comment')
    } catch {
        // Completion runs on every keystroke, including on lines the tokenizer cannot read at all.
        return []
    }
}

type LineAnalysis =
    /** The cursor is where a mnemonic (or a directive, or a label) goes. */
    | { kind: 'mnemonic' }
    /** The cursor is inside the operands of `mnemonic`, at `node` in the assembler's parse trie. */
    | { kind: 'operands'; mnemonic: string; node: AsmTrieNode }
    /** The line does not parse (an unknown mnemonic, a half written expression). */
    | { kind: 'unknown' }

/**
 * Walks the assembler's own parse trie with the tokens that follow the mnemonic. Every node holds
 * the literal tokens that may come next (`a`, `,`, `(`, `nz`, …) and, when an operand expression is
 * allowed at that point, where to continue once the expression has been read.
 */
function walkTrie(start: AsmTrieNode, tokens: AsmToken[]): AsmTrieNode | null {
    let node = start
    let index = 0
    while (index < tokens.length) {
        const token = tokens[index]
        const literal = node.tokens.get(token.text.toLowerCase())
        if (literal) {
            node = literal
            index++
            continue
        }
        const expression = node.expression
        if (expression === undefined) return null
        if (expression instanceof Map) {
            // `rst` and `im` take one of a fixed set of values, each with its own branch.
            const branch = token.tag === 'number' ? expression.get(token.value) : undefined
            if (!branch) return null
            node = branch
            index++
            continue
        }
        const opened = node
        node = expression.trieNode
        index++
        // An operand can span several tokens (`label+1`, `ix+2`), and the trie has no rule for
        // them: skip ahead to the next literal the trie expects, which is the `)` or `,` that
        // closes the expression.
        const skipped = index
        while (index < tokens.length && !node.tokens.has(tokens[index].text.toLowerCase())) index++
        // Running out of line while skipping means the expression is still being written, so the
        // cursor belongs to the node that opened it: `ld bc,label+` offers the program's symbols
        // again, instead of the node after the expression, which allows nothing at all.
        if (index > skipped && index === tokens.length) return opened
    }
    return node
}

/**
 * Splits the line into "what has been typed and is final" and "where the cursor is", then locates
 * the cursor in the grammar.
 */
function analyzeLine(linePrefix: string): LineAnalysis {
    const tokens = tokenizeLine(linePrefix)
    const last = tokens[tokens.length - 1]
    // A word that touches the cursor is still being typed: it is what the completion replaces, so
    // it must not be fed to the trie.
    const isTyping =
        last !== undefined &&
        last.end >= linePrefix.length &&
        (last.tag === 'identifier' || last.tag === 'number')
    const complete = isTyping ? tokens.slice(0, -1) : tokens

    const root = getAsmInstructionTrie()
    let index = 0
    const first = complete[0]
    // A lone prefix is a directive that has just been started: `#` tokenizes as a symbol and `.`
    // does not tokenize at all, so neither reaches the mnemonic test below on its own.
    if (/^\s*[#.]$/.test(linePrefix)) return { kind: 'mnemonic' }
    // The `#` directives (`#include`, `#code`) tokenize as a symbol followed by a word.
    if (first?.tag === 'symbol' && first.text === '#') return { kind: 'mnemonic' }
    if (first?.tag === 'identifier' && !root.tokens.has(first.text.toLowerCase())) {
        // A leading label, with or without its colon.
        index = complete[1]?.text === ':' ? 2 : 1
    } else if (first?.tag === 'identifier' && complete[1]?.text === ':') {
        // A label that happens to be spelled like a mnemonic.
        index = 2
    }

    const mnemonicToken = complete[index]
    if (mnemonicToken === undefined) return { kind: 'mnemonic' }
    if (mnemonicToken.tag !== 'identifier') return { kind: 'unknown' }
    const mnemonic = mnemonicToken.text.toLowerCase()
    const start = root.tokens.get(mnemonic)
    if (!start) return { kind: 'unknown' }
    const node = walkTrie(start, complete.slice(index + 1))
    return node ? { kind: 'operands', mnemonic, node } : { kind: 'unknown' }
}

/** The variant a token leads to, when that token completes an instruction by itself. */
function variantOf(node: AsmTrieNode): Z80InstructionVariant | undefined {
    const variant = node.variant
    if (!variant) return undefined
    return z80InstructionMap
        .get(variant.mnemonic)
        ?.find((candidate) => candidate.instruction === variant.clr.instruction)
}

/**
 * `c` names both the register and the carry condition. After `jp`, `jr`, `call` and `ret` the
 * assembler only accepts a condition there, so those look the condition up first.
 */
function describeToken(token: string, preferCondition: boolean): string {
    const condition = conditionMap.get(token)
    if (condition && preferCondition) return condition.description
    const register = registerMap.get(token)
    if (register) return `${register.bits} bit register`
    return condition?.description ?? 'Operand'
}

/**
 * The `.` or `#` that sits right before the word being completed, when the word itself does not
 * carry it: typing the prefix alone leaves Monaco with an empty word starting after it.
 */
function prefixBefore(linePrefix: string, wordStartColumn: number): string {
    const character = linePrefix[wordStartColumn - 2] ?? ''
    return character === '.' || character === '#' ? character : ''
}

/**
 * The completion. Mnemonics and directives at the start of a line, and after a mnemonic whatever
 * the assembler's parse trie allows at that exact point.
 */
export function createZ80Completion(monaco: MonacoType): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['.', '#', ',', '(', ' '],
        provideCompletionItems: (model, position) => {
            const linePrefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            if (splitAssemblyComment(linePrefix, ';').comment) return { suggestions: [] }
            const word = model.getWordUntilPosition(position)
            const range = new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn
            )
            // The word pattern keeps the `.` of `.org` and the `#` of `#include` inside the word,
            // and Monaco filters every item against the text that its own range covers. A directive
            // therefore has to be offered under the spelling that carries the prefix the user typed,
            // over a range that covers that prefix, whether it is already part of the word (`.or|`)
            // or was just typed and left the word empty (`.|`).
            const prefix =
                /^[#.]/.exec(word.word)?.[0] ?? prefixBefore(linePrefix, word.startColumn)
            const directiveRange = new monaco.Range(
                position.lineNumber,
                prefix && !word.word.startsWith(prefix) ? word.startColumn - 1 : word.startColumn,
                position.lineNumber,
                word.endColumn
            )
            const symbols = collectSymbols(model.getValue())
            const suggestions: monaco.languages.CompletionItem[] = []

            // `hint` describes the operand the assembler expects here, when the caller knows it.
            const symbolSuggestions = (hint?: string) => [
                ...symbols.labels.map((label) => ({
                    label,
                    kind: monaco.languages.CompletionItemKind.Constant,
                    insertText: label,
                    detail: 'Label',
                    documentation: hint ? `Label **${label}**\n\n${hint}` : `Label **${label}**`,
                    sortText: '1000',
                    range
                })),
                ...symbols.constants.map((constant) => ({
                    label: constant,
                    kind: monaco.languages.CompletionItemKind.Constant,
                    insertText: constant,
                    detail: 'Constant',
                    documentation: hint
                        ? `Constant **${constant}**\n\n${hint}`
                        : `Constant **${constant}**`,
                    sortText: '1001',
                    range
                }))
            ]

            const analysis = analyzeLine(linePrefix)

            if (analysis.kind === 'mnemonic') {
                // A directive prefix is unambiguous, so those sort first when one is being typed.
                const directivesFirst = /^\s*[#.]/.test(linePrefix)
                suggestions.push(
                    ...z80InstructionNames.flatMap((name) => {
                        const plain: monaco.languages.CompletionItem = {
                            label: name,
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: name,
                            detail: instructionDocs(name).summary,
                            documentation: { value: instructionDocs(name).hover },
                            sortText: `${directivesFirst ? '0200' : '0100'}${name}`,
                            range
                        }
                        const variant = z80InstructionMap.get(name)?.[0]
                        if (!variant || variant.params.length === 0) return [plain]
                        return [
                            plain,
                            {
                                label: { label: name, description: variant.instruction },
                                kind: monaco.languages.CompletionItemKind.Snippet,
                                insertText: instructionSnippet(name, variant.params),
                                insertTextRules:
                                    monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet,
                                detail: 'Instruction snippet',
                                documentation: variant.description,
                                sortText: `${directivesFirst ? '0201' : '0101'}${name}`,
                                range
                            }
                        ]
                    }),
                    ...z80Directives.flatMap((directive) => {
                        // With a prefix typed, a directive that has no spelling starting with it
                        // cannot be written here at all (`equ` has no `.equ`), so it is left out.
                        const spelling = prefix
                            ? directive.names.find((name) => name.startsWith(prefix))
                            : directive.primary
                        if (!spelling) return []
                        return [
                            {
                                label: spelling,
                                kind: monaco.languages.CompletionItemKind.Keyword,
                                insertText: spelling,
                                detail: directive.names.join(', '),
                                documentation: directive.description,
                                sortText: `${directivesFirst ? '0100' : '0200'}${directive.primary}`,
                                range: directiveRange
                            }
                        ]
                    }),
                    ...symbolSuggestions()
                )
                return { suggestions }
            }

            if (analysis.kind === 'unknown') {
                // The line does not parse: there is nothing to be context aware about, so offer
                // the registers and the symbols, which is what an operand is made of.
                suggestions.push(
                    ...z80Registers.map((register) => ({
                        label: register.name,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: register.name,
                        detail: `${register.bits} bit register`,
                        documentation: register.description,
                        sortText: `010${register.name}`,
                        range
                    })),
                    ...symbolSuggestions()
                )
                return { suggestions }
            }

            const { node } = analysis
            const conditional = z80ConditionalMnemonics.has(analysis.mnemonic)
            for (const [token, child] of node.tokens) {
                const variant = variantOf(child)
                const isPunctuation = /^[^a-zA-Z_]/.test(token)
                suggestions.push({
                    label: token,
                    kind: isPunctuation
                        ? monaco.languages.CompletionItemKind.Operator
                        : conditionMap.has(token)
                          ? monaco.languages.CompletionItemKind.Value
                          : monaco.languages.CompletionItemKind.Variable,
                    insertText: token,
                    detail: variant?.instruction ?? describeToken(token, conditional),
                    documentation: variant?.description ?? describeToken(token, conditional),
                    sortText: `010${token}`,
                    range
                })
            }
            const expression = node.expression
            if (expression instanceof Map) {
                // `rst 18`, `im 1`: only these literal values assemble.
                for (const [value, branch] of expression) {
                    // The key is the literal the assembler matches on, so it is also what has to
                    // be inserted: `rst 10` is the third restart, not decimal ten.
                    const variant = variantOf(branch)
                    const text = String(value)
                    suggestions.push({
                        label: text,
                        kind: monaco.languages.CompletionItemKind.Value,
                        insertText: text,
                        detail: variant?.instruction,
                        documentation: variant?.description,
                        sortText: `010${text.padStart(3, '0')}`,
                        range
                    })
                }
            } else if (expression !== undefined) {
                // An expression goes here: a number, or one of the program's own symbols.
                suggestions.push(...symbolSuggestions(operandMap.get(expression.expr)?.description))
            }
            return { suggestions }
        }
    }
}

export function createZ80SignatureHelpProvider(
    _monaco: MonacoType
): monaco.languages.SignatureHelpProvider {
    return {
        signatureHelpTriggerCharacters: [' ', ',', '(', '['],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const context = assemblyOperandContext(prefix, Z80_TEXT_OPTIONS)
            if (!context) return null
            const variants = z80InstructionMap.get(context.operation)
            if (!variants?.length) return null
            const signatures = variants.slice(0, 64).map((variant) => ({
                label: variant.instruction,
                documentation: variant.description,
                parameters: variant.params.map((label) => ({ label }))
            }))
            const found = signatures.findIndex(
                (signature) => signature.parameters.length > context.activeOperand
            )
            const activeSignature = found < 0 ? 0 : found
            const parameters = signatures[activeSignature]?.parameters ?? []
            return {
                value: {
                    signatures,
                    activeSignature,
                    activeParameter: Math.min(
                        context.activeOperand,
                        Math.max(0, parameters.length - 1)
                    )
                },
                dispose() {}
            }
        }
    }
}

/** Markdown table cells cannot contain a pipe or a newline, and a long row wraps badly. */
function cell(text: string, maxLength: number): string {
    const flat = text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
    return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat
}

function formatFlags(variant: Z80InstructionVariant): string {
    const touched = variant.flagsTable.filter((flag) => flag.effect !== '-')
    if (touched.length === 0) return '—'
    //the table writes an undefined flag as either `*` or a space; a space would render as a chip
    //with a blank in it, which reads as "affected, effect missing" rather than "undefined"
    return touched
        .map((flag) => `\`${flag.name}${flag.effect === ' ' ? '*' : flag.effect}\``)
        .join(' ')
}

function formatCycles(variant: Z80InstructionVariant): string {
    const { taken, notTaken } = variant.cycles
    return taken === notTaken ? `${taken}` : `${taken}/${notTaken}`
}

function formatInstructionHover(name: string, variants: Z80InstructionVariant[]): string {
    const header = `**${name}** — ${formatZ80InstructionSummary(variants)}`
    const rows = variants.slice(0, HOVER_VARIANT_LIMIT).map((variant) => {
        const instruction = variant.undocumented
            ? `\`${variant.instruction}\` ⚠`
            : `\`${variant.instruction}\``
        return `| ${instruction} | ${cell(variant.description, 120)} | ${formatFlags(variant)} | ${variant.bytes} | ${formatCycles(variant)} |`
    })
    const table = [
        '| Instruction | Description | Flags | Bytes | Cycles |',
        '| --- | --- | --- | --- | --- |',
        ...rows
    ].join('\n')
    const hidden = variants.length - rows.length
    const more = hidden > 0 ? `\n\n… ${hidden} more, see the documentation.` : ''
    const undocumented = variants
        .slice(0, HOVER_VARIANT_LIMIT)
        .some((variant) => variant.undocumented)
        ? '\n\n⚠ undocumented: implemented by the hardware and by this emulator, but not by Zilog.'
        : ''
    return `${header}\n\n${table}${more}${undocumented}`
}

/**
 * Reads a Z80 numeric literal in any of the syntaxes the assembler accepts, so that hovering a
 * constant can show it in the other bases.
 */
function parseZ80Number(word: string): number | null {
    const text = word.toLowerCase()
    const patterns: [RegExp, number][] = [
        [/^0x([0-9a-f]+)$/, 16],
        [/^\$([0-9a-f]+)$/, 16],
        [/^0b([01]+)$/, 2],
        [/^%([01]+)$/, 2],
        [/^0o([0-7]+)$/, 8],
        [/^([0-9][0-9a-f]*)h$/, 16],
        [/^([01]+)b$/, 2],
        [/^([0-7]+)o$/, 8],
        [/^(\d+)$/, 10]
    ]
    for (const [pattern, radix] of patterns) {
        const match = pattern.exec(text)
        if (match) {
            const value = parseInt(match[1], radix)
            return Number.isNaN(value) ? null : value
        }
    }
    return null
}

/**
 * The hover. Mnemonics get the table of their variants, everything else gets the one line of
 * documentation the pages would show.
 */
export function createZ80HoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover: (model, position) => {
            const found = model.getWordAtPosition(position)
            if (!found) return null
            const range = new monaco.Range(
                position.lineNumber,
                found.startColumn,
                position.lineNumber,
                found.endColumn
            )
            const word = found.word
            const lower = word.toLowerCase()
            const contents: monaco.IMarkdownString[] = []

            if (z80InstructionMap.has(lower)) contents.push({ value: instructionDocs(lower).hover })

            const register = registerMap.get(lower)
            if (register) {
                const badge = register.undocumented ? ' *(undocumented)*' : ''
                contents.push({
                    value: `**${register.name}** — ${register.bits} bit register${badge}\n\n${register.description}`
                })
            }

            const condition = conditionMap.get(lower)
            if (condition) {
                contents.push({
                    value: `**${condition.name}** — condition code\n\n${condition.description}`
                })
            }

            // Directives keep their prefix in the word, and `org` and `.org` are the same thing.
            const directive =
                directiveMap.get(lower) ?? directiveMap.get(lower.replace(/^[#.]/, ''))
            if (directive) {
                const synonyms = directive.names.filter((name) => name !== lower)
                const also =
                    synonyms.length > 0
                        ? `\n\nAlso written ${synonyms.map((name) => `\`${name}\``).join(', ')}.`
                        : ''
                contents.push({
                    value: `**${directive.primary}** — directive\n\n${directive.description}${also}`
                })
            }

            const value = parseZ80Number(word)
            if (value !== null) {
                contents.push({
                    value: `\`${value}\` = \`0x${value.toString(16).toUpperCase()}\` = \`0b${value.toString(2)}\``
                })
            }

            if (contents.length === 0) {
                const symbols = collectSymbols(model.getValue())
                if (symbols.labels.includes(word)) contents.push({ value: `Label **${word}**` })
                else if (symbols.constants.includes(word))
                    contents.push({ value: `Constant **${word}**` })
            }

            if (contents.length === 0) return null
            return { range, contents }
        }
    }
}
