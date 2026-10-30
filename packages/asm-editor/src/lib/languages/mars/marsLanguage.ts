import type { MonacoType } from '#lib/monaco/Monaco.ts'
import type monaco from 'monaco-editor'
import {
    runtimeFunctionDocumentation,
    runtimeFunctionsForModel
} from '#lib/sourceRuntime/runtimeLanguage.ts'
import {
    inAssemblyComment,
    instructionSnippet,
    parseAssemblyLine,
    type AssemblyTextOptions
} from '#lib/languages/service/assemblyText.ts'
import { operandSignatureHelp } from '#lib/languages/service/operandSignatureHelp.ts'
import { documentHover } from '#lib/documentation/instructions/hoverLine.ts'
import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'
import type { MarsForm } from '#lib/documentation/mars/instructionDocument.ts'

/**
 * The completion, hover and signature help of MIPS and RISC-V. MARS and RARS list their
 * instructions, operands and directives the same way, so one provider of each serves both, and what
 * differs between the two languages is their dialect.
 */
export type MarsDialect<Form extends MarsForm> = {
    textOptions: AssemblyTextOptions
    triggerCharacters: string[]
    /** Each mnemonic's forms the Target accepts; a mnemonic with none is left out. */
    instructions: ReadonlyMap<string, readonly Form[]>
    /** A form's operands as signature help and the snippets name them. */
    operands: (form: Form) => string[]
    directives: (
        model: monaco.editor.ITextModel
    ) => Readonly<Record<string, { description: string }>>
    /** The registers operand completion offers. */
    registers: readonly string[]
    /** The operand typed so far as the prefix of a register, when it can be one. */
    registerPrefix: (lastArg: string) => string | undefined
    /** What completing a register inserts. */
    registerInsert: (register: string) => string
    /** The register a hovered word names. */
    hoverRegister: (word: string) => string
    addressingModes: Readonly<Record<string, CompletionMetadata>>
    runtimeLanguage: 'MIPS' | 'RISC-V' | 'RISC-V-64'
    document: (name: string, forms: readonly Form[]) => InstructionDocument
    /** The language's part of a Documentation address, `/documentation/<path>/instruction/<name>`. */
    docsPath: string
}

type CompletionMetadata = {
    detail?: string
    documentation?: string
    insertText?: string
    label?: string
    priority?: number
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function insertTextWithTypedCase(value: string, typed: string): string {
    return typed && typed === typed.toUpperCase() && typed !== typed.toLowerCase()
        ? value.toUpperCase()
        : value
}

function labelsIn(text: string): string[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.endsWith(':'))
        .map((l) => l.substring(0, l.length - 1))
}

function splitAtChars(text: string, chars: string[]) {
    const result = []
    let current = ''
    for (const char of text) {
        if (chars.includes(char)) {
            result.push(current)
            current = ''
        } else {
            current += char
        }
    }
    result.push(current)
    return result.filter((r) => r.length > 0)
}

function parseArgs(args: string) {
    return splitAtChars(args, [',', ' ', '\t']).map((arg) => arg.trim())
}

function getPossibleInstruction(args: string[]): { instruction: string; other: string[] } | null {
    const clone = [...args]
    if (clone.length === 0) return { instruction: '', other: [] }
    //label
    if (clone[0].endsWith(':')) {
        if (!clone[1]) return { instruction: '', other: [] }
        //macro
        if (clone[1].startsWith('.')) return null
        return { instruction: clone[1], other: clone.slice(2) }
    } else if (clone[0].includes(':')) {
        //label:instruction
        const [, instruction = ''] = clone[0].split(':', 2)
        if (!instruction) return null
        if (instruction.startsWith('.')) return null
        return { instruction, other: clone.slice(1) }
    }
    return { instruction: clone[0], other: clone.slice(1) }
}

export function createMarsCompletion<Form extends MarsForm>(
    monaco: MonacoType,
    dialect: MarsDialect<Form>
): monaco.languages.CompletionItemProvider {
    const instructionGroups = [...dialect.instructions.values()]
    const completionMap: Partial<Record<string, CompletionMetadata>> = {
        ...Object.fromEntries(
            dialect.registers.map((r) => {
                return [
                    r,
                    {
                        detail: r,
                        label: r,
                        insertText: r,
                        documentation: `Register ${r}`
                    }
                ]
            })
        ),
        ...dialect.addressingModes
    }

    /** The mnemonics, and when `withSnippets` the snippets of their first forms after them. */
    function instructionSuggestions(
        groups: (readonly Form[])[],
        typed: string,
        withSnippets: boolean,
        range: monaco.IRange
    ): monaco.languages.CompletionItem[] {
        const suggestions: monaco.languages.CompletionItem[] = groups.map((i) => {
            return {
                label: i[0].name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: insertTextWithTypedCase(i[0].name, typed),
                documentation: i[0].example + ' ' + i.map((i) => i.description).join('\n'),
                detail: i.map((i) => i.description).join('\n'),
                range
            }
        })
        if (!withSnippets) return suggestions
        for (const variants of groups) {
            const operands = dialect.operands(variants[0])
            if (operands.length === 0) continue
            suggestions.push({
                label: {
                    label: variants[0].name,
                    description: operands.join(', ')
                },
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: instructionSnippet(
                    insertTextWithTypedCase(variants[0].name, typed),
                    operands
                ),
                insertTextRules: monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet,
                detail: 'Instruction snippet',
                documentation: variants[0].description,
                sortText: `0999${variants[0].name}`,
                range
            })
        }
        return suggestions
    }

    return {
        triggerCharacters: dialect.triggerCharacters,
        provideCompletionItems: (model, position) => {
            const data: string = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            if (parseAssemblyLine(data, dialect.textOptions).comment) return { suggestions: [] }
            const labels = labelsIn(model.getValue())
            const args = parseArgs(data)
            const word = model.getWordUntilPosition(position)
            const range = new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn
            )
            const suggestions: monaco.languages.CompletionItem[] = []
            const ins = getPossibleInstruction(args)
            const lastArg = args[args.length - 1]
            const registerPrefix = lastArg ? dialect.registerPrefix(lastArg) : undefined
            if (registerPrefix) {
                suggestions.push(
                    ...dialect.registers
                        .filter((register) => register.toLowerCase().startsWith(registerPrefix))
                        .map((r) => {
                            return {
                                label: r,
                                kind: monaco.languages.CompletionItemKind.Variable,
                                insertText: dialect.registerInsert(r),
                                documentation: `Register ${r}`,
                                detail: r,
                                range
                            }
                        })
                )
            }

            if (lastArg?.startsWith('.')) {
                const directivePrefix = lastArg.slice(1).toLowerCase()
                suggestions.push(
                    ...Object.entries(dialect.directives(model))
                        .filter(([key]) => key.startsWith(directivePrefix))
                        .map(([key, value]) => {
                            return {
                                label: key,
                                kind: monaco.languages.CompletionItemKind.Keyword,
                                insertText: insertTextWithTypedCase(key, lastArg.slice(1)),
                                documentation: value.description,
                                detail: value.description,
                                range
                            }
                        })
                )
            }
            if (ins) {
                const instructionPrefix = ins.instruction.toLowerCase()
                const match = dialect.instructions.get(instructionPrefix)
                if (match) {
                    const labelsSuggestions = labels.map((l) => {
                        return {
                            label: l,
                            kind: monaco.languages.CompletionItemKind.Constant,
                            insertText: l,
                            documentation: `Label ${l}`,
                            detail: 'Label',
                            sortText: `${1000 - 5}`,
                            range
                        }
                    })

                    if (ins.other.length === 0) {
                        const prefixed = instructionGroups.filter(
                            (i) =>
                                i[0].name.startsWith(instructionPrefix) &&
                                i[0].name !== instructionPrefix
                        )
                        suggestions.push(
                            ...instructionSuggestions(
                                [...prefixed, match],
                                ins.instruction,
                                !/[ \t]$/.test(data),
                                range
                            )
                        )
                    }

                    const possibleArgs = match.flatMap((m) => {
                        const suggestedArg = m.args[ins.other.length]
                        if (suggestedArg) {
                            return suggestedArg.map((suggestedArg) => {
                                const metadata = hasOwnKey(completionMap, suggestedArg.type)
                                    ? completionMap[suggestedArg.type]
                                    : undefined
                                return {
                                    label: metadata?.label ?? suggestedArg.value,
                                    kind: monaco.languages.CompletionItemKind.Variable,
                                    internal_type: suggestedArg.type,
                                    insertText: metadata?.insertText ?? suggestedArg.value,
                                    documentation: suggestedArg.value,
                                    detail: suggestedArg.type,
                                    sortText: `${1000 - (metadata?.priority ?? 0)}`,
                                    range
                                }
                            })
                        }
                        return []
                    })
                    const dedupedArgs = possibleArgs.filter(
                        (arg, index, self) => self.findIndex((a) => a.label === arg.label) === index
                    )
                    if (dedupedArgs.find((a) => a.internal_type === 'IDENTIFIER')) {
                        suggestions.push(...labelsSuggestions)
                        //the Runtime library's functions, when the Build links it
                        suggestions.push(
                            ...runtimeFunctionsForModel(model).map((entry) => ({
                                label: entry.name,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: entry.name,
                                detail: entry.prototype,
                                documentation: {
                                    value: runtimeFunctionDocumentation(
                                        entry,
                                        dialect.runtimeLanguage
                                    )
                                },
                                sortText: `${1000 - 4}${entry.name}`,
                                range
                            }))
                        )
                    }
                    const onlyRegs = dedupedArgs.filter(
                        (a) =>
                            a.internal_type === 'REGISTER_NAME' ||
                            a.internal_type === 'FP_REGISTER_NAME'
                    )
                    const rest = dedupedArgs.filter(
                        (a) =>
                            a.internal_type !== 'REGISTER_NAME' &&
                            a.internal_type !== 'FP_REGISTER_NAME'
                    )
                    suggestions.push(...rest, ...onlyRegs)
                } else {
                    const prefixed = instructionGroups.filter((i) =>
                        i[0].name.startsWith(instructionPrefix)
                    )
                    suggestions.push(
                        ...instructionSuggestions(prefixed, ins.instruction, true, range)
                    )
                }
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            const metadata = hasOwnKey(completionMap, label) ? completionMap[label] : undefined
            return {
                ...metadata,
                ...item
            }
        }
    }
}

/** Built once per set of forms; RV32's sets are not RV64's, as RV32 leaves some forms out. */
const hoverDocuments = new WeakMap<readonly MarsForm[], InstructionDocument>()

/**
 * An instruction's hover: the same header and first rows as its page and its panel row
 * ([the plan](../../../../../../docs/design/instruction-layout-plan.md), decision 22).
 */
function formatInstructionHover<Form extends MarsForm>(
    dialect: MarsDialect<Form>,
    ins: readonly Form[]
) {
    const name = ins[0].name
    let document = hoverDocuments.get(ins)
    if (!document) {
        document = dialect.document(name, ins)
        hoverDocuments.set(ins, document)
    }
    return documentHover(document, {
        href: `/documentation/${dialect.docsPath}/instruction/${name}`
    }).join('\n\n')
}

export function createMarsHover<Form extends MarsForm>(
    monaco: MonacoType,
    dialect: MarsDialect<Form>
): monaco.languages.HoverProvider {
    return {
        provideHover: (model, position) => {
            const fullLine = model.getLineContent(position.lineNumber)
            const { comment, quotes } = dialect.textOptions
            if (inAssemblyComment(fullLine, position.column - 1, comment, quotes)) return null
            const line = fullLine.trim()
            const contents: monaco.IMarkdownString[] = []
            const labels = labelsIn(model.getValue())

            const wordInfo = model.getWordAtPosition(position)
            if (!wordInfo?.word) return null
            const word = wordInfo.word
            const range = new monaco.Range(
                position.lineNumber,
                wordInfo.startColumn,
                position.lineNumber,
                wordInfo.endColumn
            )
            if (line.startsWith(word) && line.includes(':')) {
                contents.push({
                    value: `Label **${word}**`
                })
            }
            if (labels.includes(word) && !line.startsWith(word)) {
                contents.push({
                    value: `Label **${word}**`
                })
            }
            const ins = dialect.instructions.get(word.toLowerCase())
            if (ins) {
                contents.push({
                    value: formatInstructionHover(dialect, ins)
                })
            }
            const register = dialect.hoverRegister(word)
            if (dialect.registers.includes(register)) {
                contents.push({
                    value: `Register ${register}`
                })
            }
            const library = runtimeFunctionsForModel(model).find((entry) => entry.name === word)
            if (library && !labels.includes(word)) {
                contents.push({
                    value: runtimeFunctionDocumentation(library, dialect.runtimeLanguage)
                })
            }
            const lowerWord = word.toLowerCase()
            const directives = dialect.directives(model)
            if (hasOwnKey(directives, lowerWord)) {
                contents.push({ value: directives[lowerWord].description })
            }

            return contents.length > 0 ? { range, contents } : null
        }
    }
}

export function createMarsSignatureHelp<Form extends MarsForm>(
    dialect: MarsDialect<Form>
): monaco.languages.SignatureHelpProvider {
    return operandSignatureHelp(dialect.textOptions, [' ', ',', '('], (operation) =>
        dialect.instructions.get(operation)?.map((form) => {
            const operands = dialect.operands(form)
            return {
                label: `${form.name}${operands.length ? ` ${operands.join(', ')}` : ''}`,
                documentation: form.description,
                parameters: operands
            }
        })
    )
}
