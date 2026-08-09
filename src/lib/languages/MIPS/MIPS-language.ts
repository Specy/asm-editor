import type { MonacoType } from '$lib/monaco/Monaco'
import type monaco from 'monaco-editor'
import {
    MIPSAddressingModes,
    mipsDirectivesMap,
    mipsInstructionMap,
    mipsInstructionsVariants,
    formatAggregatedArgs,
    groupVariantsByDescription,
    type MIPSInstruction
} from './MIPS-documentation'
import { MIPSRegisterNames } from './MIPSEmulator.svelte'

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
    if (clone.length === 0) return null
    //label
    if (clone[0].endsWith(':')) {
        //macro
        if (clone[1].startsWith('.')) return null
        return { instruction: clone[1], other: clone.slice(2) }
    } else if (clone[0].includes(':')) {
        //label:instruction
        const [label, instruction] = clone[0].split(':')
        if (instruction.startsWith('.')) return null
        return { instruction, other: [label, ...clone.slice(1)] }
    }
    return { instruction: clone[0], other: clone.slice(1) }
}

export function createMIPSCompletition(
    monaco: MonacoType
): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['.', ',', ' ', 'deleteLeft', 'tab', '$'],
        provideCompletionItems: (model, position) => {
            const data: string = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
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
            if (lastArg?.startsWith('$') && !hasOwnKey(CompletitionMap, lastArg)) {
                suggestions.push(
                    ...MIPSRegisterNames.map((r) => {
                        return {
                            label: r,
                            kind: monaco.languages.CompletionItemKind.Variable,
                            insertText: r.substring(1),
                            documentation: `Register ${r}`,
                            detail: r,
                            range
                        }
                    })
                )
            }

            if (lastArg?.startsWith('.')) {
                suggestions.push(
                    ...Object.entries(mipsDirectivesMap).map(([key, value]) => {
                        return {
                            label: key,
                            kind: monaco.languages.CompletionItemKind.Keyword,
                            insertText: key,
                            documentation: value.description,
                            detail: value.description,
                            range
                        }
                    })
                )
            }
            if (ins) {
                const match = mipsInstructionMap.get(ins.instruction)
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
                        const prefixed = mipsInstructionsVariants.filter(
                            (i) =>
                                i[0].name.startsWith(ins.instruction) &&
                                i[0].name !== ins.instruction
                        )
                        suggestions.push(
                            ...[...prefixed, match].map((i) => {
                                return {
                                    label: i[0].name,
                                    kind: monaco.languages.CompletionItemKind.Function,
                                    insertText: i[0].name,
                                    documentation:
                                        i[0].example + ' ' + i.map((i) => i.description).join('\n'),
                                    detail: i.map((i) => i.description).join('\n'),
                                    range
                                }
                            })
                        )
                    }

                    const possibleArgs = match.flatMap((m) => {
                        const suggestedArg = m.args[ins.other.length]
                        if (suggestedArg) {
                            return suggestedArg.map((suggestedArg) => {
                                const metadata = hasOwnKey(CompletitionMap, suggestedArg.type)
                                    ? CompletitionMap[suggestedArg.type]
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
                    const prefixed = mipsInstructionsVariants.filter((i) =>
                        i[0].name.startsWith(ins.instruction)
                    )
                    suggestions.push(
                        ...prefixed.map((i) => {
                            return {
                                label: i[0].name,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: i[0].name,
                                documentation:
                                    i[0].example + ' ' + i.map((i) => i.description).join('\n'),
                                detail: i.map((i) => i.description).join('\n'),
                                range
                            }
                        })
                    )
                }
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            const metadata = hasOwnKey(CompletitionMap, label) ? CompletitionMap[label] : undefined
            return {
                ...metadata,
                ...item,
                preselect: true
            }
        }
    }
}

function formatInstructionHover(ins: MIPSInstruction[]) {
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

export function createMIPSHoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover: (model, position) => {
            const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, 1000)
            const line = model.getValueInRange(range).trim()
            const contents: monaco.IMarkdownString[] = []
            const text = model.getValue()
            const labels = text
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.endsWith(':'))
                .map((l) => l.substring(0, l.length - 1))

            const word = model.getWordAtPosition(position)?.word
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
            const ins = word ? mipsInstructionMap.get(word) : undefined
            if (ins) {
                contents.push({
                    value: formatInstructionHover(ins)
                })
            }
            const register = word ? MIPSRegistersMap[`$${word}`] : undefined
            if (register) {
                contents.push({
                    value: register.documentation
                })
            }
            if (word && hasOwnKey(mipsDirectivesMap, word)) {
                contents.push({
                    value: mipsDirectivesMap[word].description
                })
            }

            return {
                range,
                contents
            }
        }
    }
}

const MIPSRegistersMap: Partial<Record<string, RegisterMetadata>> = Object.fromEntries(
    MIPSRegisterNames.map((r) => {
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

const CompletitionMap: Partial<Record<string, CompletionMetadata>> = {
    ...MIPSRegistersMap,
    ...MIPSAddressingModes
}
