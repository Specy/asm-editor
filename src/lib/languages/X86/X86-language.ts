import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import {
    assemblyOperandContext,
    instructionSnippet,
    parseAssemblyLine,
    splitAssemblyComment,
    type AssemblyTextOptions
} from '$lib/languages/service/assemblyText'
import { X86Directives, X86Instructions, X86Registers, X86SizeSpecifiers } from './X86-grammar'
import {
    describeX86Instruction,
    formatX86Cpu,
    formatX86Form,
    hasX86InstructionPage,
    x86InstructionMap,
    type X86Instruction
} from './X86-documentation'

const instructionSet = new Set(X86Instructions.map((instruction) => instruction.toLowerCase()))
const registerSet = new Set(X86Registers.map((register) => register.toLowerCase()))
const directiveSet = new Set(X86Directives.map((directive) => directive.toLowerCase()))
const sizeSpecifierSet = new Set(X86SizeSpecifiers.map((size) => size.toLowerCase()))

export const X86_TEXT_OPTIONS = {
    comment: ';',
    knownOperations: new Set([...instructionSet, ...directiveSet]),
    sectionPattern: /^(?:section|segment)$/i,
    columnZeroPattern: /^%/,
    blockPairs: [
        { start: /^\s*%macro\b/i, end: /^\s*%endmacro\b/i },
        { start: /^\s*(?:struc|istruc)\b/i, end: /^\s*(?:endstruc|iend)\b/i },
        {
            start: /^\s*%(?:if|ifdef|ifndef|ifmacro|ifnum|ifstr)\b/i,
            end: /^\s*%endif\b/i
        }
    ]
} satisfies AssemblyTextOptions

type X86Form = { operands: string[]; description: string }

/**
 * `mov` has 66 operand shapes and a signature picker cannot show 66 of anything, so the popup gets
 * the widest few: this is a 64 bit editor, and a reader writing `mov rax, ` wants the 64 bit form
 * first rather than the 8 bit one NASM's table happens to list first.
 */
const SIGNATURE_LIMIT = 6

function widthOf(operands: string[]): number {
    return operands.reduce((widest, operand) => {
        const width = /(?:r\/m|reg|imm|mem)(\d+)/.exec(operand)
        return Math.max(widest, width ? Number(width[1]) : 0)
    }, 0)
}

/** The forms signature help and the snippets offer, widest first and without repeats. */
function formsOf(instruction: X86Instruction): X86Form[] {
    const seen = new Set<string>()
    return [...instruction.forms]
        .sort((left, right) => widthOf(right.operands) - widthOf(left.operands))
        .filter((form) => {
            const key = form.operands.join(',')
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
        .slice(0, SIGNATURE_LIMIT)
        .map((form) => ({
            operands: form.operands,
            description: instruction.summary || formatX86Form(instruction.name, form)
        }))
}

/** Built once: the editor asks for these on every keystroke. */
export const X86_SIGNATURES = new Map<string, X86Form[]>(
    X86Instructions.map((name) => [name, formsOf(x86InstructionMap.get(name)!)])
)

/**
 * The instructions whose operand is a label, so that completion offers the labels of the file
 * instead of registers. Taken from NASM's own sections rather than from the spelling of the name:
 * `jmp` and `jz` are jumps, `jecxz` is too, and `js` is not a store.
 */
const branchInstructions = new Set(
    X86Instructions.filter((name) => {
        const section = x86InstructionMap.get(name)?.section
        return section === 'Jumps' || section === 'Call and return'
    })
)

function replacementAt(prefix: string): { word: string; startColumn: number; endColumn: number } {
    const match = /[%A-Za-z_@.$?][\w@.$?]*$/.exec(prefix)
    const word = match?.[0] ?? ''
    return { word, startColumn: prefix.length - word.length + 1, endColumn: prefix.length + 1 }
}

function labelsIn(text: string): string[] {
    const labels: string[] = []
    for (const line of text.split(/\r?\n/)) {
        const source = splitAssemblyComment(line, ';').code
        const label = /^\s*([A-Za-z_@$.?][\w@$.?]*)\s*:/.exec(source)?.[1]
        if (label) labels.push(label)
    }
    return labels
}

function typedCase(value: string, typed: string): string {
    return typed && typed === typed.toUpperCase() && typed !== typed.toLowerCase()
        ? value.toUpperCase()
        : value
}

export function createX86CompletionProvider(
    monacoInstance: MonacoType
): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['.', '%', '[', ',', ' ', '\t'],
        provideCompletionItems(model, position) {
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            if (splitAssemblyComment(prefix, ';').comment) return { suggestions: [] }
            const word = replacementAt(prefix)
            const range = new monacoInstance.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn
            )
            const parsed = parseAssemblyLine(prefix, X86_TEXT_OPTIONS)
            const afterOperation = parsed.operation ? prefix.slice(parsed.operation.end) : ''
            const mnemonicContext =
                !parsed.operation || (afterOperation.trim().length === 0 && !/\s$/.test(prefix))
            const typed = word.word.toLowerCase()
            const suggestions: monaco.languages.CompletionItem[] = []
            const item = (
                label: string,
                kind: monaco.languages.CompletionItemKind,
                detail: string,
                sortText: string
            ): monaco.languages.CompletionItem => ({
                label,
                kind,
                detail,
                documentation: detail,
                insertText: typedCase(label, word.word),
                sortText,
                range
            })

            if (mnemonicContext) {
                const directivesOnly = /^\s*%/.test(prefix)
                if (!directivesOnly) {
                    for (const instruction of X86Instructions) {
                        if (!instruction.toLowerCase().startsWith(typed)) continue
                        suggestions.push(
                            item(
                                instruction,
                                monacoInstance.languages.CompletionItemKind.Function,
                                x86InstructionMap.get(instruction)?.summary || 'NASM instruction',
                                `010${instruction}`
                            )
                        )
                        const form = X86_SIGNATURES.get(instruction.toLowerCase())?.[0]
                        if (form?.operands.length) {
                            suggestions.push({
                                ...item(
                                    instruction,
                                    monacoInstance.languages.CompletionItemKind.Snippet,
                                    'Instruction snippet',
                                    `011${instruction}`
                                ),
                                label: {
                                    label: instruction,
                                    description: form.operands.join(', ')
                                },
                                insertText: instructionSnippet(
                                    typedCase(instruction, word.word),
                                    form.operands
                                ),
                                insertTextRules:
                                    monacoInstance.languages.CompletionItemInsertTextRule
                                        ?.InsertAsSnippet
                            })
                        }
                    }
                }
                for (const directive of X86Directives) {
                    if (directive.toLowerCase().startsWith(typed)) {
                        suggestions.push(
                            item(
                                directive,
                                monacoInstance.languages.CompletionItemKind.Keyword,
                                'NASM directive',
                                `020${directive}`
                            )
                        )
                    }
                }
                return { suggestions }
            }

            const operation = parsed.operation?.text.toLowerCase() ?? ''
            const labels = labelsIn(model.getValue())
            if (operation === 'bits') {
                for (const bits of ['16', '32', '64']) {
                    suggestions.push(
                        item(
                            bits,
                            monacoInstance.languages.CompletionItemKind.Value,
                            `${bits}-bit mode`,
                            `010${bits}`
                        )
                    )
                }
                return { suggestions }
            }
            if (operation === 'section' || operation === 'segment') {
                for (const section of ['.text', '.data', '.bss', '.rodata']) {
                    suggestions.push(
                        item(
                            section,
                            monacoInstance.languages.CompletionItemKind.Module,
                            'Section',
                            `010${section}`
                        )
                    )
                }
                return { suggestions }
            }
            if (branchInstructions.has(operation)) {
                for (const label of labels) {
                    if (label.toLowerCase().startsWith(typed)) {
                        suggestions.push(
                            item(
                                label,
                                monacoInstance.languages.CompletionItemKind.Reference,
                                'Jump target',
                                `010${label}`
                            )
                        )
                    }
                }
                return { suggestions }
            }

            const inAddress = prefix.lastIndexOf('[') > prefix.lastIndexOf(']')
            for (const register of X86Registers) {
                if (register.toLowerCase().startsWith(typed)) {
                    suggestions.push(
                        item(
                            register,
                            monacoInstance.languages.CompletionItemKind.Variable,
                            inAddress ? 'Address register' : 'Register',
                            `010${register}`
                        )
                    )
                }
            }
            if (!inAddress) {
                for (const size of X86SizeSpecifiers) {
                    if (size.toLowerCase().startsWith(typed)) {
                        suggestions.push(
                            item(
                                size,
                                monacoInstance.languages.CompletionItemKind.TypeParameter,
                                'Size specifier',
                                `020${size}`
                            )
                        )
                    }
                }
            }
            for (const label of labels) {
                if (label.toLowerCase().startsWith(typed)) {
                    suggestions.push(
                        item(
                            label,
                            monacoInstance.languages.CompletionItemKind.Reference,
                            'Label',
                            `030${label}`
                        )
                    )
                }
            }
            return { suggestions }
        }
    }
}

export function createX86SignatureHelpProvider(
    _monaco: MonacoType
): monaco.languages.SignatureHelpProvider {
    return {
        signatureHelpTriggerCharacters: [' ', ',', '['],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
            const prefix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            })
            const context = assemblyOperandContext(prefix, X86_TEXT_OPTIONS)
            const forms = context ? X86_SIGNATURES.get(context.operation) : undefined
            if (!context || !forms?.length) return null
            const signatures = forms.map((form) => ({
                label: `${context.operation}${form.operands.length ? ` ${form.operands.join(', ')}` : ''}`,
                documentation: form.description,
                parameters: form.operands.map((label) => ({ label }))
            }))
            const found = forms.findIndex((form) => form.operands.length > context.activeOperand)
            const activeSignature = found < 0 ? 0 : found
            return {
                value: {
                    signatures,
                    activeSignature,
                    activeParameter: Math.min(
                        context.activeOperand,
                        Math.max(0, forms[activeSignature]!.operands.length - 1)
                    )
                },
                dispose() {}
            }
        }
    }
}

export function createX86HoverProvider(monacoInstance: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const wordInfo = model.getWordAtPosition(position)
            if (!wordInfo) return null
            const original = wordInfo.word
            const word = original.toLowerCase()
            const contents: monaco.IMarkdownString[] = []
            const instruction = x86InstructionMap.get(word)
            if (instruction) {
                const forms = X86_SIGNATURES.get(word) ?? []
                const shapes = forms
                    .map(
                        (form) =>
                            `\`${word}${form.operands.length ? ` ${form.operands.join(', ')}` : ''}\``
                    )
                    .join('  \n')
                const heading = instruction.summary
                    ? `**${original}** ${instruction.summary}`
                    : `**${original}**`
                const since = instruction.cpu ? `${formatX86Cpu(instruction.cpu)} and later` : ''
                const extensions = instruction.features.length
                    ? `, ${instruction.features.join(', ')}`
                    : ''
                contents.push({ value: `${heading}${since ? `\n\n*${since}${extensions}*` : ''}` })
                if (shapes) contents.push({ value: shapes })
                // The first paragraph only: a hover is a reminder, and the page it links to is the
                // place for the rest.
                const description = describeX86Instruction(word).split('\n\n')[0]
                if (description && description !== instruction.summary) {
                    contents.push({ value: description })
                }
                if (hasX86InstructionPage(word)) {
                    contents.push({
                        value: `[Documentation](/documentation/x86/instruction/${word})`
                    })
                }
            } else if (registerSet.has(word)) {
                contents.push({ value: `**Register:** \`${original}\`` })
            } else if (directiveSet.has(word) || directiveSet.has(`%${word}`)) {
                contents.push({ value: `**NASM directive:** \`${original}\`` })
            } else if (sizeSpecifierSet.has(word)) {
                contents.push({ value: `**Size specifier:** \`${original}\`` })
            }
            if (contents.length === 0) return null
            return {
                range: new monacoInstance.Range(
                    position.lineNumber,
                    wordInfo.startColumn,
                    position.lineNumber,
                    wordInfo.endColumn
                ),
                contents
            }
        }
    }
}
