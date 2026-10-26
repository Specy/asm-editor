import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { S68k } from '@specy/s68k'
import type monaco from 'monaco-editor'
import {
    AddressingMode,
    fromSizesToString,
    fromSizeToString,
    getAddressingModeNames,
    getInstructionDocumentation,
    M68KDirectives,
    M68kInstructions,
    M68KRecognizedDirectives,
    M68KRecognizedInstructions
} from './M68K-documentation'
import { s68kColumnToUtf16 } from './m68kDiagnostics'
import { documentHover } from '#lib/documentation/instructions/hoverLine.ts'
import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'
import { m68kInstructionDocument } from '#lib/documentation/m68k/instructionDocument.ts'

const completionTokens = [...M68kInstructions, ...M68KDirectives]
const recognizedTokens = [...M68KRecognizedInstructions, ...M68KRecognizedDirectives]
const recognizedTokenSet = new Set(recognizedTokens)
const directiveSet = new Set<string>(M68KDirectives)

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function insertTextWithTypedCase(value: string, typed: string): string {
    if (typed && typed === typed.toUpperCase() && typed !== typed.toLowerCase()) {
        return value.toUpperCase()
    }
    return value
}

type OperationCompletionContext = {
    prefix: string
    start: number
    end: number
}

/** Finds the operation-name field even after either spelling of a v2 label. */
function operationCompletionContext(linePrefix: string): OperationCompletionContext | undefined {
    const parsed = S68k.parseLine(linePrefix)
    const meaningfulEnd = linePrefix.trimEnd().length
    if (parsed.comment && parsed.comment.span.start < linePrefix.length) return undefined

    const operation = parsed.operation
    if (
        operation &&
        !operation.sizeSpan &&
        operation.nameSpan.end === meaningfulEnd &&
        linePrefix.length === meaningfulEnd
    ) {
        return {
            prefix: operation.name,
            start: operation.nameSpan.start,
            end: operation.nameSpan.end
        }
    }

    // A half-written operation in column one is necessarily read as a bare label until it becomes
    // a known name. Completion has to keep offering `simhalt` while the source says only `sim`.
    if (
        !operation &&
        parsed.label &&
        !parsed.label.colon &&
        parsed.label.span.start === 0 &&
        parsed.label.span.end === meaningfulEnd
    ) {
        return {
            prefix: parsed.label.name,
            start: parsed.label.span.start,
            end: parsed.label.span.end
        }
    }

    if (parsed.kind === 'blank') {
        return { prefix: '', start: linePrefix.length, end: linePrefix.length }
    }
    if (!operation && parsed.label) {
        const labelEnd = parsed.label.span.end + (parsed.label.colon ? 1 : 0)
        if (labelEnd === meaningfulEnd || /\s$/.test(linePrefix)) {
            return { prefix: '', start: linePrefix.length, end: linePrefix.length }
        }
    }
    return undefined
}

/** Formats only structural separators; commas and colons inside strings/comments stay untouched. */
function formatSeparators(line: string): string {
    const parsed = S68k.parseLine(line)
    if (parsed.kind === 'comment') return line
    const commentStart = parsed.comment?.span.start ?? line.length
    const labelColon = parsed.label?.colon ? parsed.label.span.end : -1
    let quote = ''
    let formatted = ''

    for (let index = 0; index < line.length; index++) {
        const character = line[index]
        formatted += character
        if (index >= commentStart) continue

        if (quote) {
            if (character === quote) quote = ''
            continue
        }
        if (character === "'" || character === '"') {
            quote = character
            continue
        }

        const structuralColon = index === labelColon
        if (
            (character === ',' || structuralColon) &&
            line[index + 1] &&
            !/\s/.test(line[index + 1])
        ) {
            formatted += structuralColon ? '\t' : ' '
        }
    }
    return formatted
}

export function formatM68kSource(source: string): string {
    const eol = source.includes('\r\n') ? '\r\n' : '\n'
    return source
        .split(/\r?\n/g)
        .map((line) => {
            const parsed = S68k.parseLine(line)
            const formatted = formatSeparators(line)
            const operation = parsed.operation?.name.toLowerCase()
            if (
                parsed.label === undefined &&
                operation &&
                recognizedTokenSet.has(operation) &&
                formatted.length > 0 &&
                !/^\s/.test(formatted)
            ) {
                return `\t${formatted}`
            }
            return formatted
        })
        .join(eol)
}
export function createM68kFormatter(
    _monaco: MonacoType
): monaco.languages.DocumentFormattingEditProvider {
    return {
        provideDocumentFormattingEdits: (model) => {
            return [
                {
                    text: formatM68kSource(model.getValue()),
                    range: model.getFullModelRange()
                }
            ]
        }
    }
}

export function createM68kRangeFormatter(
    monacoInstance: MonacoType
): monaco.languages.DocumentRangeFormattingEditProvider {
    return {
        provideDocumentRangeFormattingEdits: (model, range) => {
            const fullLines = new monacoInstance.Range(
                range.startLineNumber,
                1,
                range.endLineNumber,
                model.getLineMaxColumn(range.endLineNumber)
            )
            const original = model.getValueInRange(fullLines)
            const formatted = formatM68kSource(original)
            return formatted === original ? [] : [{ text: formatted, range: fullLines }]
        }
    }
}

export function createM68KCompletion(monaco: MonacoType): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['.', ',', ' ', '$', '#', '('],
        provideCompletionItems: (model, position) => {
            const data: string = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const lastCharacter = data.substring(data.length - 1, data.length)
            const word = model.getWordUntilPosition(position)
            const range = new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn
            )
            const suggestions: monaco.languages.CompletionItem[] = []
            const parsed = S68k.parseLine(data)

            //numeric values
            function addNumerical() {
                const numericals = ['$', '%', '@', "'"]
                suggestions.push(
                    ...numericals.map((numerical) => {
                        return {
                            kind: monaco.languages.CompletionItemKind.Unit,
                            label: numerical,
                            insertText: numerical,
                            range
                        }
                    })
                )
            }

            if (lastCharacter === '#') {
                addNumerical()
            }
            const operationContext = operationCompletionContext(data)
            if (operationContext) {
                const operationRange = new monaco.Range(
                    position.lineNumber,
                    s68kColumnToUtf16(data, operationContext.start) + 1,
                    position.lineNumber,
                    s68kColumnToUtf16(data, operationContext.end) + 1
                )
                const lowerPrefix = operationContext.prefix.toLowerCase()
                suggestions.push(
                    ...completionTokens
                        .filter((keyword) => keyword.startsWith(lowerPrefix))
                        .map((keyword) => {
                            const documentation = getInstructionDocumentation(keyword)
                            return {
                                kind: directiveSet.has(keyword)
                                    ? monaco.languages.CompletionItemKind.Keyword
                                    : monaco.languages.CompletionItemKind.Function,
                                label: keyword,
                                insertText: insertTextWithTypedCase(
                                    keyword,
                                    operationContext.prefix
                                ),
                                detail: directiveSet.has(keyword)
                                    ? 'M68K directive'
                                    : 'M68K instruction',
                                documentation: documentation?.description,
                                range: operationRange
                            }
                        })
                )
            }

            const operation = parsed.operation
            const firstArgDoc = getInstructionDocumentation(operation?.name.toLowerCase() ?? '')
            const sizeSpan = operation?.sizeSpan
            if (firstArgDoc && sizeSpan && sizeSpan.end === data.trimEnd().length) {
                const typedSize = data.slice(sizeSpan.start + 1, sizeSpan.end)
                const sizeRange = new monaco.Range(
                    position.lineNumber,
                    s68kColumnToUtf16(data, sizeSpan.start + 1) + 1,
                    position.lineNumber,
                    s68kColumnToUtf16(data, sizeSpan.end) + 1
                )
                suggestions.push(
                    ...firstArgDoc.sizes.flatMap((size) => {
                        const name = fromSizeToString(size)
                        if (
                            !name.startsWith(typedSize.toLowerCase()) ||
                            !hasOwnKey(SIZE_COMPLETIONS, name)
                        ) {
                            return []
                        }
                        return [
                            {
                                documentation: SIZE_COMPLETIONS[name].documentation,
                                kind: monaco.languages.CompletionItemKind.Enum,
                                label: name,
                                insertText: `${insertTextWithTypedCase(name, typedSize)} `,
                                range: sizeRange
                            }
                        ]
                    })
                )
            }

            // Once an operation and separator are complete, offer the modes allowed at this operand.
            if (
                firstArgDoc &&
                !parsed.comment &&
                (lastCharacter === ' ' || lastCharacter === ',')
            ) {
                const operandPosition = operation?.operands.length ?? 0
                suggestions.push(
                    ...getAddressingModes(firstArgDoc.args[operandPosition], monaco, range)
                )
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            const details = hasOwnKey(CompletionMap, label) ? CompletionMap[label] : undefined
            const documentation = getInstructionDocumentation(label.toLowerCase())
            return {
                detail: documentation
                    ? directiveSet.has(label.toLowerCase())
                        ? 'M68K directive'
                        : 'M68K instruction'
                    : undefined,
                documentation: documentation?.description,
                ...details,
                ...item
            }
        }
    }
}

const hoverDocuments = new Map<string, InstructionDocument | undefined>()

/** An instruction's shared document, built once per name; none for a name with no page. */
function m68kHoverDocument(name: string): InstructionDocument | undefined {
    if (!hoverDocuments.has(name)) hoverDocuments.set(name, m68kInstructionDocument(name))
    return hoverDocuments.get(name)
}

export function createM68kHoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover: (model, position) => {
            const line = model.getLineContent(position.lineNumber)
            const parsed = S68k.parseLine(line)
            const operation = parsed.operation
            const column = position.column - 1
            if (
                operation &&
                column >= operation.nameSpan.start &&
                column < operation.nameSpan.end &&
                (parsed.kind === 'instruction' || parsed.kind === 'directive')
            ) {
                const documentation = getInstructionDocumentation(operation.name.toLowerCase())
                if (!documentation) return null
                const range = new monaco.Range(
                    position.lineNumber,
                    s68kColumnToUtf16(line, operation.nameSpan.start) + 1,
                    position.lineNumber,
                    s68kColumnToUtf16(line, operation.nameSpan.end) + 1
                )
                const name = operation.name.toLowerCase()
                const document = parsed.kind === 'instruction' ? m68kHoverDocument(name) : undefined
                if (document) {
                    // The same header and first rows as the page and the panel row (the plan,
                    // decision 22).
                    const blocks = documentHover(document, {
                        word: operation.name,
                        href: `/documentation/m68k/instruction/${document.name}`
                    })
                    return { range, contents: blocks.map((value) => ({ value })) }
                }
                // A directive has no page: its operands, sizes, description and example.
                const defaultSize = documentation.defaultSize
                    ? fromSizeToString(documentation.defaultSize)
                    : ''
                const operands =
                    documentation.args?.map(
                        (e, i) => `**Op ${i + 1}:** \`${getAddressingModeNames(e)}\``
                    ) ?? []
                const contents = [
                    {
                        value: [`# ${operation.name}`, ...operands].join('\n\n')
                    },
                    {
                        value: `**Sizes:** ${documentation.sizes?.length ? fromSizesToString(documentation.sizes) : 'Not sized'} ${defaultSize ? `\n\n**Default:**  ${defaultSize}` : ''}`
                    }
                ]
                if (documentation.description) {
                    contents.push({ value: documentation.description })
                }
                if (documentation.example) {
                    contents.push({ value: documentation.example })
                }
                return {
                    range,
                    contents
                }
            }
            return null
        }
    }
}

/** The UTF-16 range of an instruction or directive name, for composed hover providers. */
export function m68kOperationSpan(line: string): { start: number; end: number } | undefined {
    const parsed = S68k.parseLine(line)
    if (parsed.kind !== 'instruction' && parsed.kind !== 'directive') return undefined
    const operation = parsed.operation
    if (!operation) return undefined
    return {
        start: s68kColumnToUtf16(line, operation.nameSpan.start),
        end: s68kColumnToUtf16(line, operation.nameSpan.end)
    }
}

function activeM68kParameter(line: string, operandStart: number): number {
    let active = 0
    let depth = 0
    let quote = ''
    for (let index = operandStart; index < line.length; index++) {
        const character = line[index]
        if (quote) {
            if (character === quote) quote = ''
            continue
        }
        if (character === "'" || character === '"') {
            quote = character
            continue
        }
        if (character === '(') depth += 1
        else if (character === ')') depth = Math.max(0, depth - 1)
        else if (character === ',' && depth === 0) active += 1
    }
    return active
}

export function createM68kSignatureHelpProvider(
    _monaco: MonacoType
): monaco.languages.SignatureHelpProvider {
    return {
        signatureHelpTriggerCharacters: [' ', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
            const line = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const parsed = S68k.parseLine(line)
            const operation = parsed.operation
            if (
                !operation ||
                (parsed.comment !== undefined && parsed.comment.span.start < line.length)
            ) {
                return null
            }
            const documentation = getInstructionDocumentation(operation.name.toLowerCase())
            if (!documentation || documentation.args.length === 0) return null
            const parameterLabels = documentation.args.map((modes) => getAddressingModeNames(modes))
            const operationEnd = operation.sizeSpan?.end ?? operation.nameSpan.end
            const spelling = line.slice(operation.nameSpan.start, operationEnd)
            const activeParameter = Math.min(
                activeM68kParameter(line, operationEnd),
                parameterLabels.length - 1
            )
            return {
                value: {
                    signatures: [
                        {
                            label: `${spelling} ${parameterLabels.join(', ')}`,
                            documentation: documentation.description,
                            parameters: parameterLabels.map((label) => ({ label }))
                        }
                    ],
                    activeSignature: 0,
                    activeParameter
                },
                dispose() {}
            }
        }
    }
}

/** The sizes completion offers after an operation's dot: what each is offered with, and resolves to. */
const SIZE_COMPLETIONS = {
    l: {
        detail: 'Select all 32 bits of the register',
        documentation: 'Select all bits of the register'
    },
    w: {
        detail: 'Selects first 16 bits of the register',
        documentation: 'Select first part of the register'
    },
    b: {
        detail: 'Selects first 8 bits of the register',
        documentation: 'Select first 8 bits of the register'
    },
    s: {
        detail: 'Selects a short branch displacement',
        documentation: 'Select a short branch displacement'
    }
}

/**
 * The addressing modes completion offers at an operand, in the order it offers them: the mode, its
 * kind of completion, its label and insert text, and the detail and documentation it resolves to.
 */
const OPERAND_COMPLETIONS: [
    mode: AddressingMode,
    kind: 'Variable' | 'Value',
    label: string,
    insertText: string,
    detail: string,
    documentation?: string
][] = [
    [AddressingMode.AddressRegister, 'Variable', 'An', 'a0', 'Address register'],
    [AddressingMode.DataRegister, 'Variable', 'Dn', 'd0', 'Data register'],
    [
        AddressingMode.Immediate,
        'Value',
        '#',
        '#',
        '#<num/label> | decimal number or label',
        'Decimal immediate number or label'
    ],
    [AddressingMode.Absolute, 'Value', 'EA', 'label', 'Effective address'],
    [AddressingMode.Indirect, 'Value', '(An)', '(a0)', 'Indirect'],
    [AddressingMode.PreIndirect, 'Value', '-(An)', '-(a0)', 'Indirect with predecrement'],
    [AddressingMode.PostIndirect, 'Value', '(An)+', '(a0)+', 'Indirect with postincrement'],
    [
        AddressingMode.IndirectWithDisplacement,
        'Value',
        'd(An)',
        '0(a0)',
        'Address-register displacement'
    ],
    [
        AddressingMode.IndirectIndex,
        'Value',
        'd(An,Xn)',
        '0(a0,d0)',
        'Address-register displacement with an index'
    ],
    [AddressingMode.PcDisplacement, 'Value', 'd(PC)', '0(pc)', 'Program-counter displacement'],
    [
        AddressingMode.PcIndex,
        'Value',
        'd(PC,Xn)',
        '0(pc,d0)',
        'Program-counter displacement with an index'
    ],
    [
        AddressingMode.RegisterRange,
        'Variable',
        '<register list>',
        'd0-d1/a0-a1',
        'Register list for MOVEM'
    ],
    [AddressingMode.StatusRegister, 'Variable', 'sr', 'sr', 'Status register'],
    [AddressingMode.ConditionCodeRegister, 'Variable', 'ccr', 'ccr', 'Condition-code register']
]

function getAddressingModes(
    am: AddressingMode[] | undefined,
    monaco: MonacoType,
    range: monaco.IRange
): monaco.languages.CompletionItem[] {
    if (!am) return []
    const allowed = new Set(am)
    return OPERAND_COMPLETIONS.filter(([mode]) => allowed.has(mode)).map(
        ([, kind, label, insertText]) => ({
            kind: monaco.languages.CompletionItemKind[kind],
            label,
            insertText,
            range
        })
    )
}

/** What an offered item resolves to by its label: the sizes, the modes and the number prefixes. */
const CompletionMap: Record<string, { detail: string; documentation?: string }> = {
    ...SIZE_COMPLETIONS,
    ...Object.fromEntries(
        OPERAND_COMPLETIONS.map(([, , label, , detail, documentation]) => [
            label,
            { detail, documentation }
        ])
    ),
    $: {
        detail: '$<num> | hexadecimal number',
        documentation: 'Hexadecimal immediate number'
    },
    '@': {
        detail: '@<num> | octal number',
        documentation: 'Octal immediate number'
    },
    '%': {
        detail: '%<num> | binary number',
        documentation: 'Binary immediate number'
    }
}
