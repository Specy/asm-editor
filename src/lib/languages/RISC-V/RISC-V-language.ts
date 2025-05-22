import type { MonacoType } from '$lib/monaco/Monaco'
import {
    RISCVAddressingModes,
    riscvDirectivesMap,
    riscvInstructionMap,
    riscvInstructionsVariants,
    riscvInstructionsWithDuplicates,
    type RISCVInstruction
} from './RISC-V-documentation'
import {
    ALTERNATIVE_RISCVRegister_NAMES,
} from './RISC-VEmulator.svelte'
import { RISCV_REGISTERS } from '@specy/risc-v'

const RISCVRegisterNames = [
    ...RISCV_REGISTERS,
    ...ALTERNATIVE_RISCVRegister_NAMES
]

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

export function createRISCVCompletition(monaco: MonacoType) {
    return {
        triggerCharacters: ['.', ',', ' ', 'deleteLeft', 'tab'],
        provideCompletionItems: (model, position) => {
            const data: string = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const lines = model.getValue().split('\n')
            const lastCharacter = data.substring(data.length - 1, data.length)
            const labels = lines
                .map((l) => l.trim())
                .filter((l) => l.endsWith(':'))
                .map((l) => l.substring(0, l.length - 1))
            const args = parseArgs(data)
            let suggestions = []
            const ins = getPossibleInstruction(args)
            const lastArg = args[args.length - 1]
            const someInstruction = RISCVRegisterNames.some(r => r.startsWith(lastArg))
            if (someInstruction && !CompletitionMap[lastArg]) {
                suggestions.push(
                    ...RISCVRegisterNames.map((r) => {
                        return {
                            label: r,
                            kind: monaco.languages.CompletionItemKind.Variable,
                            insertText: r.substring(1),
                            documentation: `Register ${r}`,
                            detail: r
                        }
                    })
                )
            }

            if (lastArg?.startsWith('.')) {
                suggestions.push(
                    ...Object.entries(riscvDirectivesMap).map(([key, value]) => {
                        return {
                            label: key,
                            kind: monaco.languages.CompletionItemKind.Keyword,
                            insertText: key,
                            documentation: value.description,
                            detail: value.description
                        }
                    })
                )
            }
            if (ins) {
                const match = riscvInstructionMap.get(ins.instruction)
                if (match) {
                    const labelsSuggestions = labels.map((l) => {
                        return {
                            label: l,
                            kind: monaco.languages.CompletionItemKind.Constant,
                            insertText: l,
                            documentation: `Label ${l}`,
                            detail: 'Label',
                            sortText: `${1000 - 5}`
                        }
                    })

                    if (ins.other.length === 0) {
                        const prefixed = riscvInstructionsVariants.filter(
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
                                    detail: i.map((i) => i.description).join('\n')
                                }
                            })
                        )
                    }

                    const possibleArgs = match.flatMap((m) => {
                        const suggestedArg = m.args[ins.other.length]
                        if (suggestedArg) {
                            return suggestedArg.map((suggestedArg) => {
                                return {
                                    label:
                                        CompletitionMap[suggestedArg.type]?.label ??
                                        suggestedArg.value,
                                    kind: monaco.languages.CompletionItemKind.Variable,
                                    internal_type: suggestedArg.type,
                                    insertText:
                                        CompletitionMap[suggestedArg.type]?.insertText ??
                                        suggestedArg.value,
                                    documentation: suggestedArg.value,
                                    detail: suggestedArg.type,
                                    sortText: `${1000 - (CompletitionMap[suggestedArg.type]?.priority ?? 0)}`
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
                    const prefixed = riscvInstructionsVariants.filter((i) =>
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
                                detail: i.map((i) => i.description).join('\n')
                            }
                        })
                    )
                }
            }
            const trimmed = data.trim()
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            return {
                ...CompletitionMap[item.label],
                ...item,
                preselect: true
            }
        }
    }
}

function formatInstruction(ins: RISCVInstruction) {
    const [left, right] = ins.description.split(':')
    if (!right) return left
    return `**${left.trim()}**: ${right}`
}

export function createRISCVHoverProvider(monaco: MonacoType) {
    return {
        provideHover: (model, position) => {
            const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, 1000)
            const line = model.getValueInRange(range).trim()
            const contents = []
            const text = model.getValue()
            const labels = text
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.endsWith(':'))
                .map((l) => l.substring(0, l.length - 1))

            const word = model.getWordAtPosition(position)?.word
            if (line?.startsWith(word) && line.includes(':')) {
                contents.push({
                    value: `Label **${word}**`
                })
            }
            if (labels.includes(word) && !line.startsWith(word)) {
                contents.push({
                    value: `Label **${word}**`
                })
            }
            const ins = riscvInstructionMap.get(word)
            if (ins) {
                if (ins.length === 1) {
                    contents.push({
                        value: formatInstruction(ins[0])
                    })
                } else {
                    contents.push({
                        value: ins.map((ins, i) => `${i + 1}. ${formatInstruction(ins)}`).join('\n')
                    })
                }

            }
            if (RISCVRegistersMap[word]) {
                contents.push({
                    value: RISCVRegistersMap[word].documentation
                })
            }
            if (riscvDirectivesMap[word]) {
                contents.push({
                    value: riscvDirectivesMap[word].description
                })
            }

            return {
                range,
                contents
            }
        }
    }
}

const possibleArgs = riscvInstructionsWithDuplicates.flatMap((i) =>
    i.args.flatMap((a) => a.map((b) => b.type))
)
const possibleArgsSet = new Set(possibleArgs)


const RISCVRegistersMap = Object.fromEntries(
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

const CompletitionMap = {
    ...RISCVRegistersMap,
    ...RISCVAddressingModes
}
