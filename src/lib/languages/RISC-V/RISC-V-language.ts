import type { MonacoType } from '$lib/monaco/Monaco'
import type monaco from 'monaco-editor'
import {
    RISCVAddressingModes,
    riscvDirectivesMap,
    type RISCVInstruction,
    riscvInstructionMap,
    riscvInstructionsVariants,
    formatAggregatedArgs,
    groupVariantsByDescription,
    riscvVariantOperands
} from './RISC-V-documentation'
import { RISCVLanguageRegisterNames as RISCVRegisterNames } from './RISC-V-registers'
import {
    assemblyOperandContext,
    instructionSnippet,
    parseAssemblyLine,
    type AssemblyTextOptions
} from '$lib/languages/service/assemblyText'

export const RISCV_TEXT_OPTIONS = {
    comment: '#',
    sectionPattern: /^\.(?:text|data|ktext|kdata|bss)$/i,
    blockPairs: [
        { start: /^\s*\.macro\b/i, end: /^\s*\.(?:end_macro|endmacro)\b/i },
        { start: /^\s*\.(?:if|ifdef|ifndef|ifb|ifnb)\b/i, end: /^\s*\.endif\b/i }
    ]
} satisfies AssemblyTextOptions

type CompletionMetadata = {
    detail?: string
    documentation?: string
    insertText?: string
    label?: string
    priority?: number
}
type RegisterMetadata = Required<
    Pick<CompletionMetadata, 'detail' | 'documentation' | 'insertText' | 'label'>
>

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function insertTextWithTypedCase(value: string, typed: string): string {
    return typed && typed === typed.toUpperCase() && typed !== typed.toLowerCase()
        ? value.toUpperCase()
        : value
}

function variantsForTarget(variants: RISCVInstruction[], is64: boolean): RISCVInstruction[] {
    return is64 ? variants : variants.filter((instruction) => !instruction.isRv64Only)
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

export function createRISCVCompletion(
    monaco: MonacoType,
    is64 = false
): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['.', ',', ' '],
        provideCompletionItems: (model, position) => {
            const data: string = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            if (parseAssemblyLine(data, RISCV_TEXT_OPTIONS).comment) return { suggestions: [] }
            const lines = model.getValue().split('\n')
            const labels = lines
                .map((l) => l.trim())
                .filter((l) => l.endsWith(':'))
                .map((l) => l.substring(0, l.length - 1))
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
            const someInstruction = lastArg
                ? RISCVRegisterNames.some((r) => r.startsWith(lastArg.toLowerCase()))
                : false
            const registerPrefix = someInstruction ? lastArg.toLowerCase() : undefined
            if (registerPrefix) {
                suggestions.push(
                    ...RISCVRegisterNames.filter((register) =>
                        register.startsWith(registerPrefix)
                    ).map((r) => {
                        return {
                            label: r,
                            kind: monaco.languages.CompletionItemKind.Variable,
                            insertText: r,
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
                    ...Object.entries(riscvDirectivesMap)
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
                const allMatches = riscvInstructionMap.get(instructionPrefix)
                const match = allMatches ? variantsForTarget(allMatches, is64) : []
                if (match.length > 0) {
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
                        const prefixed = riscvInstructionsVariants
                            .map((variants) => variantsForTarget(variants, is64))
                            .filter(
                                (variants) =>
                                    variants.length > 0 &&
                                    variants[0].name.startsWith(instructionPrefix) &&
                                    variants[0].name !== instructionPrefix
                            )
                        suggestions.push(
                            ...[...prefixed, match].map((i) => {
                                return {
                                    label: i[0].name,
                                    kind: monaco.languages.CompletionItemKind.Function,
                                    insertText: insertTextWithTypedCase(i[0].name, ins.instruction),
                                    documentation:
                                        i[0].example + ' ' + i.map((i) => i.description).join('\n'),
                                    detail: i.map((i) => i.description).join('\n'),
                                    range
                                }
                            })
                        )
                        if (!/[ \t]$/.test(data)) {
                            for (const variants of [...prefixed, match]) {
                                const targetVariants = variantsForTarget(variants, is64)
                                if (targetVariants.length === 0) continue
                                const operands = riscvVariantOperands(targetVariants[0])
                                if (operands.length === 0) continue
                                suggestions.push({
                                    label: {
                                        label: targetVariants[0].name,
                                        description: operands.join(', ')
                                    },
                                    kind: monaco.languages.CompletionItemKind.Snippet,
                                    insertText: instructionSnippet(
                                        insertTextWithTypedCase(
                                            targetVariants[0].name,
                                            ins.instruction
                                        ),
                                        operands
                                    ),
                                    insertTextRules:
                                        monaco.languages.CompletionItemInsertTextRule
                                            ?.InsertAsSnippet,
                                    detail: 'Instruction snippet',
                                    documentation: targetVariants[0].description,
                                    sortText: `0999${targetVariants[0].name}`,
                                    range
                                })
                            }
                        }
                    }

                    const possibleArgs = match.flatMap((m) => {
                        const suggestedArg = m.args[ins.other.length]
                        if (suggestedArg) {
                            return suggestedArg.map((suggestedArg) => {
                                const metadata = hasOwnKey(CompletionMap, suggestedArg.type)
                                    ? CompletionMap[suggestedArg.type]
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
                    const prefixed = riscvInstructionsVariants
                        .map((variants) => variantsForTarget(variants, is64))
                        .filter(
                            (variants) =>
                                variants.length > 0 &&
                                variants[0].name.startsWith(instructionPrefix)
                        )
                    suggestions.push(
                        ...prefixed.map((i) => {
                            return {
                                label: i[0].name,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: insertTextWithTypedCase(i[0].name, ins.instruction),
                                documentation:
                                    i[0].example + ' ' + i.map((i) => i.description).join('\n'),
                                detail: i.map((i) => i.description).join('\n'),
                                range
                            }
                        })
                    )
                    for (const variants of prefixed) {
                        const operands = riscvVariantOperands(variants[0])
                        if (operands.length === 0) continue
                        suggestions.push({
                            label: {
                                label: variants[0].name,
                                description: operands.join(', ')
                            },
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: instructionSnippet(
                                insertTextWithTypedCase(variants[0].name, ins.instruction),
                                operands
                            ),
                            insertTextRules:
                                monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet,
                            detail: 'Instruction snippet',
                            documentation: variants[0].description,
                            sortText: `0999${variants[0].name}`,
                            range
                        })
                    }
                }
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            const metadata = hasOwnKey(CompletionMap, label) ? CompletionMap[label] : undefined
            return {
                ...metadata,
                ...item
            }
        }
    }
}

function formatInstructionHover(ins: RISCVInstruction[]) {
    const args = formatAggregatedArgs(ins)
    const groups = groupVariantsByDescription(ins)
    const header = `**${ins[0].name}** ${args}`
    const body = groups
        .map((g) => {
            const desc = g.description
            const examples = g.examples.filter(Boolean)
            if (examples.length > 0) {
                return `${desc}\n\n\`${examples[0]}\``
            }
            return desc
        })
        .join('\n\n---\n\n')
    return `${header}\n\n${body}`
}

export function createRISCVHoverProvider(
    monaco: MonacoType,
    is64 = false
): monaco.languages.HoverProvider {
    return {
        provideHover: (model, position) => {
            const line = model.getLineContent(position.lineNumber).trim()
            const contents: monaco.IMarkdownString[] = []
            const text = model.getValue()
            const labels = text
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.endsWith(':'))
                .map((l) => l.substring(0, l.length - 1))

            const word = model.getWordAtPosition(position)?.word
            if (!word) return null
            const wordInfo = model.getWordAtPosition(position)
            if (!wordInfo) return null
            const range = new monaco.Range(
                position.lineNumber,
                wordInfo.startColumn,
                position.lineNumber,
                wordInfo.endColumn
            )
            if (word && line.startsWith(word) && line.includes(':')) {
                contents.push({
                    value: `Label **${word}**`
                })
            }
            if (word && labels.includes(word) && !line.startsWith(word)) {
                contents.push({
                    value: `Label **${word}**`
                })
            }
            const variants = riscvInstructionMap.get(word.toLowerCase())
            const ins = variants ? variantsForTarget(variants, is64) : []
            if (ins.length > 0) {
                contents.push({
                    value: formatInstructionHover(ins)
                })
            }
            const register = RISCVRegistersMap[word.toLowerCase()]
            if (register) {
                contents.push({
                    value: register.documentation
                })
            }
            const lowerWord = word.toLowerCase()
            if (hasOwnKey(riscvDirectivesMap, lowerWord)) {
                contents.push({ value: riscvDirectivesMap[lowerWord].description })
            }

            return contents.length > 0 ? { range, contents } : null
        }
    }
}

export function createRISCVSignatureHelpProvider(
    _monaco: MonacoType,
    is64 = false
): monaco.languages.SignatureHelpProvider {
    return {
        signatureHelpTriggerCharacters: [' ', ',', '('],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const context = assemblyOperandContext(prefix, RISCV_TEXT_OPTIONS)
            const allVariants = context ? riscvInstructionMap.get(context.operation) : undefined
            const variants = allVariants ? variantsForTarget(allVariants, is64) : []
            if (!context || variants.length === 0) return null
            const signatures = variants.map((variant) => {
                const operands = riscvVariantOperands(variant)
                return {
                    label: `${variant.name}${operands.length ? ` ${operands.join(', ')}` : ''}`,
                    documentation: variant.description,
                    parameters: operands.map((label) => ({ label }))
                }
            })
            const found = variants.findIndex(
                (variant) => riscvVariantOperands(variant).length > context.activeOperand
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

const RISCVRegistersMap: Partial<Record<string, RegisterMetadata>> = Object.fromEntries(
    RISCVRegisterNames.map((r) => {
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
)

const CompletionMap: Partial<Record<string, CompletionMetadata>> = {
    ...RISCVRegistersMap,
    ...RISCVAddressingModes
}
