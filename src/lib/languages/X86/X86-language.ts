import type monaco from 'monaco-editor'
import { X86Registers, X86Instructions, X86Directives, X86SizeSpecifiers } from './X86-grammar' // Adjust the import path as needed

// --- Data Preprocessing for faster lookups ---

// Use Sets for efficient existence checks (case-insensitive)
const instructionSet = new Set(X86Instructions.map((i) => i.toLowerCase()))
const registerSet = new Set(X86Registers.map((r) => r.toLowerCase()))
const directiveSet = new Set(X86Directives.map((d) => d.toLowerCase()))
const sizeSpecifierSet = new Set(X86SizeSpecifiers.map((s) => s.toLowerCase()))

// Helper function to create CompletionItems
function createCompletionItem(
    monacoInstance: typeof monaco,
    label: string,
    kind: monaco.languages.CompletionItemKind,
    detail: string,
    insertText?: string,
    range?: monaco.IRange
): monaco.languages.CompletionItem {
    return {
        label: label,
        kind: kind,
        detail: detail,
        documentation: detail, // Keep it simple for now
        insertText: insertText ?? label,
        range: range // Important for replacing the correct text part
    }
}

// --- Completion Provider ---

export function createX86CompletitionProvider(
    monacoInstance: typeof monaco
): monaco.languages.CompletionItemProvider {
    return {
        // Basic trigger characters - adjust as needed
        triggerCharacters: ['.', '%', '[', ' ', '\t'],

        provideCompletionItems: (
            model,
            position
        ): monaco.languages.ProviderResult<monaco.languages.CompletionList> => {
            const wordInfo = model.getWordUntilPosition(position)
            const word = wordInfo.word.toLowerCase()
            const currentLine = model
                .getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                })
                .trimStart() // Get text from line start to cursor, trimmed left

            const suggestions: monaco.languages.CompletionItem[] = []

            // Define the range to be replaced by the completion
            const replaceRange = new monacoInstance.Range(
                position.lineNumber,
                wordInfo.startColumn,
                position.lineNumber,
                wordInfo.endColumn
            )

            // 1. Suggest Labels defined in the document
            // Simple label detection: word followed by colon at line start (ignoring whitespace)
            const text = model.getValue()
            const labelRegex = /^\s*([a-zA-Z_@$.][\w@$.]*):/gm
            let match
            const labels = new Set<string>()
            while ((match = labelRegex.exec(text)) !== null) {
                labels.add(match[1])
            }

            labels.forEach((label) => {
                if (label.toLowerCase().startsWith(word)) {
                    suggestions.push(
                        createCompletionItem(
                            monacoInstance,
                            label,
                            monacoInstance.languages.CompletionItemKind.Constant,
                            'Label',
                            label,
                            replaceRange
                        )
                    )
                }
            })

            // 2. Suggest Instructions
            X86Instructions.forEach((instr) => {
                if (instr.toLowerCase().startsWith(word)) {
                    suggestions.push(
                        createCompletionItem(
                            monacoInstance,
                            instr,
                            monacoInstance.languages.CompletionItemKind.Function, // Or Keyword
                            'Instruction',
                            instr,
                            replaceRange
                        )
                    )
                }
            })

            // 3. Suggest Registers
            X86Registers.forEach((reg) => {
                if (reg.toLowerCase().startsWith(word)) {
                    suggestions.push(
                        createCompletionItem(
                            monacoInstance,
                            reg,
                            monacoInstance.languages.CompletionItemKind.Variable,
                            'Register',
                            reg,
                            replaceRange
                        )
                    )
                }
            })

            // 4. Suggest Directives (including NASM %directives)
            X86Directives.forEach((dir) => {
                // Prioritize directives if line starts with '.' or '%' or contains 'section', etc.?
                // Simple approach: suggest if prefix matches
                if (
                    dir.toLowerCase().startsWith(word) ||
                    (word.startsWith('%') &&
                        dir.startsWith('%') &&
                        dir.toLowerCase().startsWith(word))
                ) {
                    suggestions.push(
                        createCompletionItem(
                            monacoInstance,
                            dir,
                            monacoInstance.languages.CompletionItemKind.Keyword,
                            'Directive',
                            dir,
                            replaceRange
                        )
                    )
                }
            })

            // 5. Suggest Size Specifiers
            X86SizeSpecifiers.forEach((size) => {
                if (size.toLowerCase().startsWith(word)) {
                    suggestions.push(
                        createCompletionItem(
                            monacoInstance,
                            size,
                            monacoInstance.languages.CompletionItemKind.TypeParameter, // Or Keyword
                            'Size Specifier',
                            size,
                            replaceRange
                        )
                    )
                }
            })

            // Note: Could add context awareness here, e.g.,
            // - If inside `[...]`, prioritize registers, size specifiers, labels?
            // - If line starts with '%', prioritize NASM directives?
            // - If first word on line, prioritize instructions/labels/directives?

            return {
                suggestions: suggestions
            }
        }
    }
}

// --- Hover Provider ---

export function createX86HoverProvider(
    monacoInstance: typeof monaco
): monaco.languages.HoverProvider {
    return {
        provideHover: (
            model,
            position
        ): monaco.languages.ProviderResult<monaco.languages.Hover> => {
            const wordInfo = model.getWordAtPosition(position)
            if (!wordInfo) {
                return null
            }
            const word = wordInfo.word.toLowerCase()
            const originalWord = wordInfo.word // Keep original casing for display

            const contents: monaco.IMarkdownString[] = []

            // Check if it's a known keyword
            if (instructionSet.has(word)) {
                contents.push({ value: `**Instruction:** \`${originalWord}\`` })
            } else if (registerSet.has(word)) {
                contents.push({ value: `**Register:** \`${originalWord}\`` })
            } else if (directiveSet.has(word)) {
                contents.push({ value: `**Directive:** \`${originalWord}\`` })
            } else if (sizeSpecifierSet.has(word)) {
                contents.push({ value: `**Size Specifier:** \`${originalWord}\`` })
            } else {
                // Check if it's a label definition on this line
                const lineContent = model.getLineContent(position.lineNumber).trim()
                const labelDefRegex = new RegExp(`^\\s*${originalWord}\\s*:\\s*(.*)`)
                if (labelDefRegex.test(lineContent)) {
                    contents.push({ value: `**Label Definition:** \`${originalWord}\`` })
                } else {
                    // Check if it's a known label used elsewhere (more complex, requires scanning)
                    // Simple check: Is it potentially a label based on usage (e.g., after jmp/call)?
                    // For simplicity, we won't do full analysis here. Could check if it exists in the labelSet generated earlier.
                    const text = model.getValue()
                    const labelRegex = /^\s*([a-zA-Z_@$.][\w@$.]*):/gm
                    let match
                    const labels = new Set<string>()
                    while ((match = labelRegex.exec(text)) !== null) {
                        labels.add(match[1])
                    }
                    if (labels.has(originalWord)) {
                        contents.push({ value: `**Label Reference:** \`${originalWord}\`` })
                    }
                }
            }

            if (contents.length > 0) {
                return {
                    range: new monacoInstance.Range(
                        position.lineNumber,
                        wordInfo.startColumn,
                        position.lineNumber,
                        wordInfo.endColumn
                    ),
                    contents: contents
                }
            }

            return null // No hover information for this word
        }
    }
}
