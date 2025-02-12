import type { MonacoType } from "$lib/monaco/Monaco"
import { instructionsDocumentationList } from "./M68K-documentation"
import { mipsDirectivesMap, mipsInstructionMap, mipsInstructionsVariants, mipsInstructionsWithDuplicates, type MIPSInstruction } from "./MIPS-documentation"
import { MIPSRegisterNames } from "./MIPSEmulator.svelte"

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
    return result.filter(r => r.length > 0)
}

function parseArgs(args: string) {
    return splitAtChars(args, [',', ' ', '\t']).map(arg => arg.trim())
}

function getPossibleInstruction(args: string[]): { instruction: string, other: string[] } | null {
    const clone = [...args]
    if (clone.length === 0) return null
    //label
    if (clone[0].endsWith(':')) {
        //macro
        if (clone[1].startsWith('.')) return null
        return { instruction: clone[1], other: clone.slice(2) }
    } else if (clone[0].includes(":")) {
        //label:instruction
        const [label, instruction] = clone[0].split(":")
        if (instruction.startsWith('.')) return null
        return { instruction, other: [label, ...clone.slice(1)] }
    }
    return { instruction: clone[0], other: clone.slice(1) }
}

export function createMIPSCompletition(monaco: MonacoType) {
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
            const lastCharacter = data.substring(data.length - 1, data.length)
            const labels = lines.map(l => l.trim()).filter(l => l.endsWith(':')).map(l => l.substring(0, l.length - 1))
            const args = parseArgs(data)
            let suggestions = []
            const ins = getPossibleInstruction(args)
            const lastArg = args[args.length - 1]
            if (lastArg?.startsWith('$') && !CompletitionMap[lastArg]) {
                suggestions.push(...MIPSRegisterNames.map(r => {
                    return {
                        label: r,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: r.substring(1),
                        documentation: `Register ${r}`,
                        detail: r
                    }
                }))
            }


            if (lastArg?.startsWith('.')) {
                suggestions.push(...Object.entries(mipsDirectivesMap).map(([key, value]) => {
                    return {
                        label: key,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: key,
                        documentation: value.description,
                        detail: value.description
                    }
                }))

            }
            if (ins) {
                const match = mipsInstructionMap.get(ins.instruction)
                if (match) {
                    const labelsSuggestions = labels.map(l => {
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
                        const prefixed = mipsInstructionsVariants.filter(i => i[0].name.startsWith(ins.instruction) && i[0].name !== ins.instruction)
                        suggestions.push(...[...prefixed, match].map(i => {
                            return {
                                label: i[0].name,
                                kind: monaco.languages.CompletionItemKind.Function,
                                insertText: i[0].name,
                                documentation: i[0].example + ' ' + i.map(i => i.description).join('\n'),
                                detail: i.map(i => i.description).join('\n')
                            }
                        }))

                    }


                    const possibleArgs = match.flatMap(m => {
                        const suggestedArg = m.args[ins.other.length]
                        if (suggestedArg) {
                            return suggestedArg.map(suggestedArg => {
                                return {
                                    label: CompletitionMap[suggestedArg.type]?.label ?? suggestedArg.value,
                                    kind: monaco.languages.CompletionItemKind.Variable,
                                    internal_type: suggestedArg.type,
                                    insertText: CompletitionMap[suggestedArg.type]?.insertText ?? suggestedArg.value,
                                    documentation: suggestedArg.value,
                                    detail: suggestedArg.type,
                                    sortText: `${1000 - (CompletitionMap[suggestedArg.type]?.priority ?? 0)}`
                                }
                            })
                        }
                    })
                    const dedupedArgs = possibleArgs.filter((arg, index, self) => self.findIndex(a => a.label === arg.label) === index)
                    if (dedupedArgs.find(a => a.internal_type === 'IDENTIFIER')) {
                        suggestions.push(...labelsSuggestions)
                    }
                    const onlyRegs = dedupedArgs.filter(a => a.internal_type === 'REGISTER_NAME' || a.internal_type === 'FP_REGISTER_NAME')
                    const rest = dedupedArgs.filter(a => a.internal_type !== 'REGISTER_NAME' && a.internal_type !== 'FP_REGISTER_NAME')
                    suggestions.push(...rest, ...onlyRegs)
                } else {
                    const prefixed = mipsInstructionsVariants.filter(i => i[0].name.startsWith(ins.instruction))
                    suggestions.push(...prefixed.map(i => {
                        return {
                            label: i[0].name,
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: i[0].name,
                            documentation: i[0].example + ' ' + i.map(i => i.description).join('\n'),
                            detail: i.map(i => i.description).join('\n')
                        }
                    }))
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

function formatInstruction(ins: MIPSInstruction) {
    const [left, right] = ins.description.split(':')
    if (!right) return left
    return `**${left.trim()}**: ${right}`
}


export function createMIPSHoverProvider(monaco: MonacoType) {
    return {
        provideHover: (model, position) => {
            const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, 1000)
            const line = model.getValueInRange(range).trim()
            const contents = []
            const text = model.getValue()
            const labels = text.split('\n').map(l => l.trim()).filter(l => l.endsWith(':')).map(l => l.substring(0, l.length - 1))

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
            const ins = mipsInstructionMap.get(word)
            if (ins) {
                contents.push({
                    value: ins.map((ins, i) => `${i + 1}. ${formatInstruction(ins)}`).join('\n')
                })
            }
            if (MIPSRegistersMap['$' + word]) {
                contents.push({
                    value: MIPSRegistersMap["$" + word].documentation
                })
            }
            if (mipsDirectivesMap[word]) {
                contents.push({
                    value: mipsDirectivesMap[word].description
                })
            }

            return {
                range,
                contents,
            }
        }
    }
}


const possibleArgs = mipsInstructionsWithDuplicates.flatMap(i => i.args.flatMap(a => a.map(b => b.type)))
const possibleArgsSet = new Set(possibleArgs)


const MIPSAddressingModes = {
    "REGISTER_NAME": {
        detail: "$t1",
        label: "$reg",
        insertText: "$",
        documentation: "Register name",
        priority: 1,
    },
    "INTEGER_16": {
        detail: "0",
        label: 'int16',
        documentation: "16 bit integer",
        priority: 2,
    },
    "INTEGER_16U": {
        detail: "0",
        label: 'int16u',
        documentation: "Unsigned 16 bit integer",
        priority: 2,
    },
    "INTEGER_5": {
        detail: "0",
        label: 'int5',
        documentation: "5 bit integer",
        priority: 2,
    },
    "INTEGER_32": {
        detail: "0",
        label: 'int32',
        documentation: "32 bit integer",
        priority: 2,
    },
    "LEFT_PAREN": {
        detail: "(",
        label: '(',
        documentation: "Left parenthesis",
        priority: 3,
    },
    "RIGHT_PAREN": {
        detail: ")",
        label: ')',
        documentation: "Right parenthesis",
        priority: 3,
    },
    "IDENTIFIER": {
        detail: "identifier",
        label: 'id',
        documentation: "Identifier",
        priority: 4,
    },
    "REGISTER_NUMBER": {
        detail: "0",
        label: 'regnum',
        documentation: "Register number",
        priority: 1,
    },
    "FP_REGISTER_NAME": {
        detail: "$f1",
        label: "$freg",
        insertText: "$f",
        documentation: "Floating point register name",
        priority: 1,
    },
    "PLUS": {
        detail: "+",
        label: '+',
        documentation: "Plus",
        priority: 3,
    }
}





const MIPSRegistersMap = Object.fromEntries(MIPSRegisterNames.map(r => {
    return [r, {
        detail: r,
        label: r,
        insertText: r,
        documentation: `Register ${r}`
    }]
}))

const CompletitionMap = {
    ...MIPSRegistersMap,
    ...MIPSAddressingModes
}

