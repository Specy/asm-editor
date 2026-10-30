import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { S68k } from '@specy/s68k'
import type monaco from 'monaco-editor'
import {
    AddressingMode,
    addressingModeToString,
    fromSizesToString,
    fromSizeToString,
    getAddressingModeNames,
    getInstructionDocumentation,
    M68KDirectives,
    M68kInstructions,
    M68KRecognizedDirectives,
    M68KRecognizedInstructions,
    type InstructionDocumentation
} from './M68K-documentation'
import { s68kColumnToUtf16 } from './m68kDiagnostics'
import { documentHover } from '#lib/documentation/instructions/hoverLine.ts'
import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'
import {
    isM68kLaterProcessor,
    isM68kProcessorTag,
    m68kInstructionDocument,
    m68kProcessorFact,
    m68kProcessorOnly,
    type M68kLaterProcessor
} from '#lib/documentation/m68k/instructionDocument.ts'
import {
    m68kFirstProcessor,
    m68kHiddenModes,
    m68kHiddenSizes,
    m68kInstructionForms,
    m68kInstructionShown,
    m68kIsBitField
} from './M68K-forms'
import { m68kDialectHas, m68kDialectKey, type M68kDialect } from './m68kDialect'
import { m68kModelDialect } from './M68K-project-language'

const completionTokens = [...M68kInstructions, ...M68KDirectives]

/**
 * What completion says of an operation: an instruction only a later processor has, `extb`, says
 * which and how to write the program for it, and a bit field that `opt bit` gives the 68000 too. It
 * is offered all the same where the program's processor is unknown, and the quick fix on the
 * diagnostic it gets adds the `opt` line; a program whose processor the analysis knows is offered
 * only what that processor has.
 */
function operationCompletionText(name: string): {
    detail: string | undefined
    documentation: string | monaco.IMarkdownString | undefined
} {
    const documentation = getInstructionDocumentation(name)
    if (!documentation) return { detail: undefined, documentation: undefined }
    if (directiveSet.has(name))
        return { detail: 'M68K directive', documentation: documentation.description }
    const processor = m68kFirstProcessor({ name })
    if (!isM68kLaterProcessor(processor))
        return { detail: 'M68K instruction', documentation: documentation.description }
    const bitField = m68kIsBitField({ name })
    return {
        detail: `M68K instruction, ${m68kProcessorOnly(processor, bitField)}`,
        documentation: {
            value: `${documentation.description}\n\n${m68kProcessorFact(processor, bitField)}.`
        }
    }
}
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

/**
 * Formats only structural separators; commas and colons inside strings/comments stay untouched, and
 * so does the text s68k reads as one word, `opt`'s options (`opt p=68020,bit`): a space after one
 * of its commas would end the options there and make the rest a comment.
 */
function formatSeparators(line: string): string {
    const parsed = S68k.parseLine(line)
    if (parsed.kind === 'comment') return line
    const commentStart = parsed.comment?.span.start ?? line.length
    const labelColon = parsed.label?.colon ? parsed.label.span.end : -1
    const text = parsed.operation?.text?.span
    const textStart = text ? s68kColumnToUtf16(line, text.start) : -1
    const textEnd = text ? s68kColumnToUtf16(line, text.end) : -1
    let quote = ''
    let formatted = ''

    for (let index = 0; index < line.length; index++) {
        const character = line[index]
        formatted += character
        if (index >= commentStart || (index >= textStart && index < textEnd)) continue

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
            //in a Project whose analysis knows the program's processor, what a later processor
            //brought is left out (m68k-machine.md, decision 36); unknown, everything is offered
            const dialect = m68kModelDialect(model)

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
                        .filter(
                            (keyword) =>
                                keyword.startsWith(lowerPrefix) &&
                                (!dialect || m68kInstructionShown({ name: keyword }, dialect))
                        )
                        .map((keyword) => {
                            const { detail, documentation } = operationCompletionText(keyword)
                            return {
                                kind: directiveSet.has(keyword)
                                    ? monaco.languages.CompletionItemKind.Keyword
                                    : monaco.languages.CompletionItemKind.Function,
                                label: keyword,
                                insertText: insertTextWithTypedCase(
                                    keyword,
                                    operationContext.prefix
                                ),
                                detail,
                                documentation,
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
                const hiddenSizes = dialect
                    ? m68kHiddenSizes(firstArgDoc, dialect)
                    : new Set<string>()
                suggestions.push(
                    ...firstArgDoc.sizes.flatMap((size) => {
                        const name = fromSizeToString(size)
                        if (
                            !name.startsWith(typedSize.toLowerCase()) ||
                            !hasOwnKey(SIZE_COMPLETIONS, name) ||
                            hiddenSizes.has(fromSizeToString(size, true))
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

            // Once an operation and separator are complete, offer the modes allowed at this operand;
            // a comma inside an operand's parentheses, `(4,a0,` or `([4,a0],`, separates its parts
            if (
                firstArgDoc &&
                operation &&
                !parsed.comment &&
                (lastCharacter === ' ' || lastCharacter === ',') &&
                operandCursor(
                    data,
                    s68kColumnToUtf16(data, operation.sizeSpan?.end ?? operation.nameSpan.end)
                ).depth === 0
            ) {
                const operandPosition = operation?.operands.length ?? 0
                suggestions.push(
                    ...getAddressingModes(
                        firstArgDoc.args[operandPosition],
                        monaco,
                        range,
                        laterFormModes(firstArgDoc, operandPosition),
                        dialect && {
                            dialect,
                            hiddenModes: m68kHiddenModes(firstArgDoc, operandPosition, dialect)
                        }
                    )
                )
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            const details = hasOwnKey(CompletionMap, label) ? CompletionMap[label] : undefined
            return {
                ...operationCompletionText(label.toLowerCase()),
                ...details,
                ...item
            }
        }
    }
}

const hoverDocuments = new Map<string, InstructionDocument | undefined>()

/**
 * An instruction's shared document, built once per name and Processor dialect; none for a name
 * with no page. Where the program's dialect is known it leaves out what a later processor brought,
 * as the Documentation panel and completion do
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36); an instruction
 * the program cannot write in any form keeps its whole document, which says what it needs.
 */
function m68kHoverDocument(name: string, dialect?: M68kDialect): InstructionDocument | undefined {
    const key = dialect ? `${name} ${m68kDialectKey(dialect)}` : name
    if (!hoverDocuments.has(key)) {
        const shown = dialect && m68kInstructionDocument(name, dialect)
        hoverDocuments.set(key, shown || m68kInstructionDocument(name))
    }
    return hoverDocuments.get(key)
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
                const document =
                    parsed.kind === 'instruction'
                        ? m68kHoverDocument(name, m68kModelDialect(model))
                        : undefined
                if (document) {
                    // The same header and first rows as the page and the panel row (the plan,
                    // decision 22). An instruction only a later processor has says so in a header
                    // fact, "68020 only: write `opt p=68020` …", which its tags would only repeat.
                    const shown = {
                        ...document,
                        tags: document.tags.filter((tag) => !isM68kProcessorTag(tag))
                    }
                    const blocks = documentHover(shown, {
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

/**
 * Where a cursor at the end of `line` is among the operands that start at `operandStart`: which
 * operand, by the commas outside parentheses, and how deeply inside an operand's parentheses.
 */
function operandCursor(line: string, operandStart: number): { active: number; depth: number } {
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
    return { active, depth }
}

function activeM68kParameter(line: string, operandStart: number): number {
    return operandCursor(line, operandStart).active
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
                            parameters: documentation.args.map((modes, index) => {
                                const said = [bitFieldNote(modes), laterOperandModes(modes)]
                                const value = said.filter(Boolean).join('\n\n')
                                return {
                                    label: parameterLabels[index],
                                    ...(value ? { documentation: { value } } : {})
                                }
                            })
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

/** An addressing mode as completion offers it at an operand. */
type OperandCompletion = {
    mode: AddressingMode
    kind: 'Variable' | 'Value'
    label: string
    insertText: string
    detail: string
    documentation?: string
    /** The processor that brought it, the 68020 for its indexed modes; none for the 68000's own. */
    processor?: M68kLaterProcessor
}

function operand(
    mode: AddressingMode,
    kind: OperandCompletion['kind'],
    label: string,
    insertText: string,
    detail: string,
    documentation?: string
): OperandCompletion {
    return { mode, kind, label, insertText, detail, documentation }
}

/**
 * The 68020's indexed modes, which it takes wherever the 68000 takes `d(An,Xn)` or `d(PC,Xn)`
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3): a scaled index
 * with a base displacement of any width, and memory indirection, the pointer read after the index is
 * added (preindexed) or before (postindexed).
 */
function indexed68020(
    mode: AddressingMode,
    base: 'An' | 'PC',
    register: 'a0' | 'pc'
): OperandCompletion[] {
    //from the program counter, the base displacement is written as the label the operand reaches
    const at = base === 'PC' ? 'the address specified by bd' : `${register} + bd`
    const processor = '68020'
    return [
        {
            mode,
            kind: 'Value',
            label: `(bd,${base},Xn*k)`,
            insertText: `(0,${register},d0.w*4)`,
            detail: 'Scaled index with a base displacement',
            documentation: `Memory at ${at} + index × k. k is 1, 2, 4 or 8, allowing the index to count elements instead of bytes. bd can be a word or a long word. Any component can be omitted.`,
            processor
        },
        {
            mode,
            kind: 'Value',
            label: `([bd,${base}],Xn,od)`,
            insertText: `([0,${register}],d0.w,0)`,
            detail: 'Memory indirect, postindexed',
            documentation: `Reads a pointer at ${at}, adds the index and outer displacement od, then accesses memory at the resulting address.`,
            processor
        },
        {
            mode,
            kind: 'Value',
            label: `([bd,${base},Xn],od)`,
            insertText: `([0,${register},d0.w],0)`,
            detail: 'Memory indirect, preindexed',
            documentation: `Reads a pointer at ${at} + the index, such as an entry in a table of pointers. Adds the outer displacement od to the pointer and accesses memory at that address.`,
            processor
        }
    ]
}

/**
 * The addressing modes completion offers at an operand, in the order it offers them: the mode, its
 * kind of completion, its label and insert text, the detail and documentation it resolves to, and
 * the later processor that brought it, which it is tagged with wherever it is offered. Where the
 * program's processor is unknown that is in a 68000 program too, as an instruction is (E6a of the
 * plan), and the quick fix on the diagnostic adds the `opt p=` line; a program whose processor the
 * analysis knows is offered only what that processor has.
 */
const OPERAND_COMPLETIONS: OperandCompletion[] = [
    operand(AddressingMode.AddressRegister, 'Variable', 'An', 'a0', 'Address register'),
    operand(AddressingMode.DataRegister, 'Variable', 'Dn', 'd0', 'Data register'),
    operand(
        AddressingMode.Immediate,
        'Value',
        '#',
        '#',
        '#<num/label> | decimal number or label',
        'Decimal immediate number or label'
    ),
    operand(AddressingMode.Absolute, 'Value', 'EA', 'label', 'Effective address'),
    operand(AddressingMode.Indirect, 'Value', '(An)', '(a0)', 'Indirect'),
    operand(AddressingMode.PreIndirect, 'Value', '-(An)', '-(a0)', 'Indirect with predecrement'),
    operand(AddressingMode.PostIndirect, 'Value', '(An)+', '(a0)+', 'Indirect with postincrement'),
    operand(
        AddressingMode.IndirectWithDisplacement,
        'Value',
        'd(An)',
        '0(a0)',
        'Address-register displacement'
    ),
    operand(
        AddressingMode.IndirectIndex,
        'Value',
        'd(An,Xn)',
        '0(a0,d0)',
        'Address-register displacement with an index'
    ),
    operand(
        AddressingMode.PcDisplacement,
        'Value',
        'd(PC)',
        '0(pc)',
        'Program-counter displacement'
    ),
    operand(
        AddressingMode.PcIndex,
        'Value',
        'd(PC,Xn)',
        '0(pc,d0)',
        'Program-counter displacement with an index'
    ),
    operand(
        AddressingMode.RegisterRange,
        'Variable',
        '<register list>',
        'd0-d1/a0-a1',
        'Register list for MOVEM'
    ),
    operand(AddressingMode.StatusRegister, 'Variable', 'sr', 'sr', 'Status register'),
    operand(
        AddressingMode.ConditionCodeRegister,
        'Variable',
        'ccr',
        'ccr',
        'Condition-code register'
    ),
    operand(AddressingMode.UserStackPointer, 'Variable', 'usp', 'usp', 'User stack pointer'),
    //the 68010's control registers, `Rc`, which `movec` names one by one
    operand(AddressingMode.ControlRegister, 'Variable', 'vbr', 'vbr', 'Vector base register'),
    operand(AddressingMode.ControlRegister, 'Variable', 'sfc', 'sfc', 'Source function code'),
    operand(AddressingMode.ControlRegister, 'Variable', 'dfc', 'dfc', 'Destination function code'),
    //and the 68020's: the two supervisor stack pointers M chooses between, and the cache registers
    ...(
        [
            [
                'msp',
                'Master stack pointer',
                'A7 in supervisor mode when the M bit (SR bit 12) is set.'
            ],
            [
                'isp',
                'Interrupt stack pointer',
                "A7 in supervisor mode when the M bit (SR bit 12) is clear. Corresponds to the 68000's SSP and holds interrupt frames."
            ],
            [
                'cacr',
                'Cache control register',
                'Stores bits 0 (E, enable) and 1 (F, freeze). The simulator does not model a cache, so these bits have no effect.'
            ],
            [
                'caar',
                'Cache address register',
                'Selects a cache entry for CACR commands. The simulator does not model a cache, so this register only stores the value written to it.'
            ]
        ] as const
    ).map(([name, detail, documentation]) => ({
        ...operand(AddressingMode.ControlRegister, 'Variable', name, name, detail, documentation),
        processor: '68020' as const
    })),
    //the 68020's pairs, which its long multiplies and divides and `cas2` take
    {
        ...operand(
            AddressingMode.RegisterPair,
            'Variable',
            'Dx:Dy',
            'd0:d1',
            'Register pair',
            "Two data registers used for a 64-bit value (high long word first), a division's remainder and quotient, or CAS2's compare or update values."
        ),
        processor: '68020'
    },
    {
        ...operand(
            AddressingMode.IndirectPair,
            'Value',
            '(Rx):(Ry)',
            '(a0):(a1)',
            'Pair of addresses',
            'Two memory operands for CAS2. Each address is held in a data register or an address register.'
        ),
        processor: '68020'
    },
    ...indexed68020(AddressingMode.IndirectIndex, 'An', 'a0'),
    ...indexed68020(AddressingMode.PcIndex, 'PC', 'pc')
]

/** What an operand completion says: its detail and documentation, tagged with a later processor. */
function operandCompletionText(completion: OperandCompletion): {
    detail: string
    documentation?: string | monaco.IMarkdownString
} {
    const { detail, documentation, processor } = completion
    if (!processor) return { detail, documentation }
    return {
        detail: `${detail}, ${m68kProcessorOnly(processor)}`,
        documentation: {
            value: `${documentation ? `${documentation}\n\n` : ''}${m68kProcessorFact(processor)}.`
        }
    }
}

/** The modes of the Core's forms, by the names it gives them, as the Documentation's lists hold them. */
const MODE_BY_NAME = new Map(
    Object.values(AddressingMode)
        .filter((mode): mode is AddressingMode => typeof mode === 'number')
        .map((mode) => [addressingModeToString(mode), mode])
)

/**
 * The modes a later processor's forms of an instruction add at an operand position, with the
 * processor that brought each, from the Core's forms: the 68020's `tst` of An, an immediate and
 * the PC-relative modes, and its `cmpi` to a PC-relative destination. Only where the
 * Documentation's list there is the first processor's forms whole: `cmp`'s leaves out the forms it
 * assembles as `cmpi` and `cmpm`, and with them the 68020's.
 */
function laterFormModes(
    documentation: InstructionDocumentation,
    position: number
): Map<AddressingMode, M68kLaterProcessor> {
    const later = new Map<AddressingMode, M68kLaterProcessor>()
    const listed = documentation.args[position]
    if (!listed) return later
    const forms = m68kInstructionForms(documentation).filter(
        (form) => form.operands.length === documentation.args.length
    )
    const first = m68kFirstProcessor(documentation)
    const own = new Set(listed.map(addressingModeToString))
    const firstModes = forms
        .filter((form) => form.processor === first)
        .flatMap((form) => form.operands[position])
    if (!firstModes.every((mode) => own.has(mode))) return later
    for (const form of forms) {
        const processor = form.processor
        if (processor === first || !isM68kLaterProcessor(processor)) continue
        for (const name of form.operands[position]) {
            const mode = MODE_BY_NAME.get(name)
            if (mode === undefined || own.has(name)) continue
            //the earliest processor that has it, should two later ones both
            if (later.get(mode) !== '68010') later.set(mode, processor)
        }
    }
    return later
}

/**
 * What a program whose processor the analysis knows can write at an operand position: its
 * dialect, and the modes there only the instruction's forms it cannot write take, by s68k's names.
 */
type OperandProgram = { dialect: M68kDialect; hiddenModes: ReadonlySet<string> }

/**
 * Whether a program can write an operand completion: not a mode its processor lacks,
 * `(bd,An,Xn*k)` before the 68020, nor one only forms it cannot write take, every mode of `movec`
 * in a 68000 program ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36).
 */
function operandShown(completion: OperandCompletion, program: OperandProgram): boolean {
    const { processor } = completion
    if (processor && !m68kDialectHas(program.dialect, { processor })) return false
    return !program.hiddenModes.has(addressingModeToString(completion.mode))
}

function getAddressingModes(
    am: AddressingMode[] | undefined,
    monaco: MonacoType,
    range: monaco.IRange,
    later: ReadonlyMap<AddressingMode, M68kLaterProcessor> = new Map(),
    program?: OperandProgram
): monaco.languages.CompletionItem[] {
    if (!am) return []
    const allowed = new Set([...am, ...later.keys()])
    const items = OPERAND_COMPLETIONS.filter(({ mode }) => allowed.has(mode)).flatMap((offered) => {
        //a mode a later processor's form of the instruction brought is tagged with it here
        const processor = offered.processor ?? later.get(offered.mode)
        const completion = processor ? { ...offered, processor } : offered
        if (program && !operandShown(completion, program)) return []
        return {
            kind: monaco.languages.CompletionItemKind[completion.kind],
            label: completion.label,
            insertText: completion.insertText,
            range,
            //a later processor's mode says so in the list, and comes after the 68000's own
            ...(completion.processor
                ? { ...operandCompletionText(completion), sortText: `~${completion.label}` }
                : {})
        }
    })
    if (!allowed.has(AddressingMode.BitField)) return items
    //a bit field's operand is what the field is in with the field after it, `d0{0:8}`: offered
    //whole, it says so, and keeps a later processor's mode's tag
    return items.map((item) => {
        const own = CompletionMap[item.label]
        const detail = item.detail ?? own?.detail
        const documentation = item.documentation ?? own?.documentation
        return {
            ...item,
            label: `${item.label}${BIT_FIELD}`,
            insertText: `${item.insertText}{0:8}`,
            detail: `${detail ? `${detail}, ` : ''}with a bit field`,
            documentation: {
                value: `${typeof documentation === 'string' ? documentation : (documentation?.value ?? '')}${documentation ? '\n\n' : ''}${BIT_FIELD_TEXT}`
            },
            ...(item.sortText ? { sortText: `~${item.label}${BIT_FIELD}` } : {})
        }
    })
}

/** How a bit field is written, after the operand it is in. */
const BIT_FIELD = '{offset:width}'

/** What a bit field is, as completion and signature help say it. */
const BIT_FIELD_TEXT =
    'A bit field follows the operand: `{offset:width}` selects `width` bits, counting `offset` from the highest bit. For example, `d0{24:8}` selects the low byte of d0, and `(a0){0:5}` selects the first five bits in memory.'

/** What signature help says of a position that takes a bit field. */
function bitFieldNote(modes: AddressingMode[]): string | undefined {
    return modes.includes(AddressingMode.BitField) ? BIT_FIELD_TEXT : undefined
}

/**
 * The later processors' modes a position takes besides its own, for signature help: the 68020's
 * indexed modes where it takes `d(An,Xn)` or `d(PC,Xn)`.
 */
function laterOperandModes(modes: AddressingMode[]): string | undefined {
    const allowed = new Set(modes)
    const later = OPERAND_COMPLETIONS.filter(
        (completion) => completion.processor && allowed.has(completion.mode)
    )
    //a position that takes a later processor's modes alone, `cas2`'s, takes nothing besides them:
    //its instruction is that processor's, as completion says of it
    const own = OPERAND_COMPLETIONS.some(
        (completion) => !completion.processor && allowed.has(completion.mode)
    )
    if (later.length === 0 || !own) return undefined
    const labels = later.map(({ label }) => `\`${label}\``)
    const listed =
        labels.length === 1
            ? labels[0]
            : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
    return `Also accepts ${listed}. ${m68kProcessorFact(later[0].processor!)}.`
}

/** What an offered item resolves to by its label: the sizes, the modes and the number prefixes. */
const CompletionMap: Record<
    string,
    { detail: string; documentation?: string | monaco.IMarkdownString }
> = {
    ...SIZE_COMPLETIONS,
    ...Object.fromEntries(
        OPERAND_COMPLETIONS.map((completion) => [
            completion.label,
            operandCompletionText(completion)
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
