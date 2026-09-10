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

/** High-confidence NASM forms used by signature help and snippets. */
export const X86_SIGNATURES = new Map<string, X86Form[]>([
    ['mov', [{ operands: ['destination', 'source'], description: 'Copy source to destination.' }]],
    ['lea', [{ operands: ['register', '[address]'], description: 'Load an effective address.' }]],
    ['xchg', [{ operands: ['left', 'right'], description: 'Exchange two operands.' }]],
    ['push', [{ operands: ['source'], description: 'Push a value onto the stack.' }]],
    ['pop', [{ operands: ['destination'], description: 'Pop a value from the stack.' }]],
    ['call', [{ operands: ['target'], description: 'Call a procedure.' }]],
    ['jmp', [{ operands: ['target'], description: 'Jump unconditionally.' }]],
    [
        'ret',
        [
            { operands: [], description: 'Return from a procedure.' },
            { operands: ['bytes'], description: 'Return and discard stack arguments.' }
        ]
    ],
    ['add', [{ operands: ['destination', 'source'], description: 'Add source to destination.' }]],
    ['adc', [{ operands: ['destination', 'source'], description: 'Add with carry.' }]],
    [
        'sub',
        [{ operands: ['destination', 'source'], description: 'Subtract source from destination.' }]
    ],
    ['sbb', [{ operands: ['destination', 'source'], description: 'Subtract with borrow.' }]],
    ['cmp', [{ operands: ['left', 'right'], description: 'Compare two operands.' }]],
    [
        'test',
        [{ operands: ['left', 'right'], description: 'Test bits without storing the result.' }]
    ],
    ['and', [{ operands: ['destination', 'source'], description: 'Bitwise AND.' }]],
    ['or', [{ operands: ['destination', 'source'], description: 'Bitwise OR.' }]],
    ['xor', [{ operands: ['destination', 'source'], description: 'Bitwise XOR.' }]],
    ['inc', [{ operands: ['destination'], description: 'Increment an operand.' }]],
    ['dec', [{ operands: ['destination'], description: 'Decrement an operand.' }]],
    ['neg', [{ operands: ['destination'], description: 'Two’s-complement negation.' }]],
    ['not', [{ operands: ['destination'], description: 'Invert every bit.' }]],
    ['mul', [{ operands: ['source'], description: 'Unsigned multiply by the accumulator.' }]],
    [
        'imul',
        [
            { operands: ['source'], description: 'Signed multiply by the accumulator.' },
            { operands: ['destination', 'source'], description: 'Signed two-operand multiply.' },
            {
                operands: ['destination', 'source', 'immediate'],
                description: 'Signed multiply by an immediate.'
            }
        ]
    ],
    ['div', [{ operands: ['source'], description: 'Unsigned divide the accumulator.' }]],
    ['idiv', [{ operands: ['source'], description: 'Signed divide the accumulator.' }]],
    ['shl', [{ operands: ['destination', 'count'], description: 'Shift left.' }]],
    ['shr', [{ operands: ['destination', 'count'], description: 'Logical shift right.' }]],
    ['sar', [{ operands: ['destination', 'count'], description: 'Arithmetic shift right.' }]],
    ['rol', [{ operands: ['destination', 'count'], description: 'Rotate left.' }]],
    ['ror', [{ operands: ['destination', 'count'], description: 'Rotate right.' }]],
    ['int', [{ operands: ['vector'], description: 'Invoke a software interrupt.' }]],
    ['syscall', [{ operands: [], description: 'Enter the operating-system syscall handler.' }]],
    ['nop', [{ operands: [], description: 'Perform no operation.' }]]
])

for (const instruction of X86Instructions) {
    const lower = instruction.toLowerCase()
    if (/^j(?!mp)[a-z]+$/.test(lower) && !X86_SIGNATURES.has(lower)) {
        X86_SIGNATURES.set(lower, [
            { operands: ['target'], description: 'Jump when the condition is true.' }
        ])
    }
    if (/^set[a-z]+$/.test(lower) && !X86_SIGNATURES.has(lower)) {
        X86_SIGNATURES.set(lower, [
            { operands: ['destination'], description: 'Set a byte from a condition.' }
        ])
    }
    if (/^cmov[a-z]+$/.test(lower) && !X86_SIGNATURES.has(lower)) {
        X86_SIGNATURES.set(lower, [
            {
                operands: ['destination', 'source'],
                description: 'Move when the condition is true.'
            }
        ])
    }
}

const branchInstructions = new Set(
    [...X86_SIGNATURES.keys()].filter(
        (name) => name === 'call' || name === 'jmp' || /^j/.test(name)
    )
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
                                'NASM instruction',
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
            const forms = X86_SIGNATURES.get(word)
            if (instructionSet.has(word)) {
                const signatures = forms
                    ?.map(
                        (form) =>
                            `\`${word}${form.operands.length ? ` ${form.operands.join(', ')}` : ''}\``
                    )
                    .join('  \n')
                contents.push({
                    value: `**NASM instruction:** \`${original}\`${signatures ? `\n\n${signatures}` : ''}`
                })
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
