import type monaco from 'monaco-editor'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import {
    instructionSnippet,
    parseAssemblyLine,
    splitAssemblyComment,
    type AssemblyTextOptions
} from '#lib/languages/service/assemblyText.ts'
import { operandSignatureHelp } from '#lib/languages/service/operandSignatureHelp.ts'
import { x86FormFails, x86IsUnsupported, x86SupportNote } from './x86Support'
import { X86Directives, X86Instructions, X86Registers, X86SizeSpecifiers } from './X86-grammar'
import {
    describeX86Instruction,
    formatX86Cpu,
    formatX86Form,
    hasX86InstructionPage,
    x86InstructionMap,
    type X86Instruction
} from './X86-documentation'
import {
    runtimeFunctionDocumentation,
    runtimeFunctionsForModel
} from '#lib/sourceRuntime/runtimeLanguage.ts'
import { x86InstructionCategories } from '#lib/documentation/x86/categories.ts'
import { mnemonicTags } from '#lib/documentation/instructions/categories.ts'
import { x86FormTags } from '#lib/documentation/instructions/formTags.ts'
import { documentHover, instructionHoverLine } from '#lib/documentation/instructions/hoverLine.ts'
import { x86InstructionDocument } from '#lib/documentation/x86/instructionDocument.ts'
import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'

const instructionSet = new Set(X86Instructions.map((instruction) => instruction.toLowerCase()))
const registerSet = new Set(X86Registers.map((register) => register.toLowerCase()))
const directiveSet = new Set(X86Directives.map((directive) => directive.toLowerCase()))
const sizeSpecifierSet = new Set(X86SizeSpecifiers.map((size) => size.toLowerCase()))

export const X86_TEXT_OPTIONS = {
    comment: ';',
    //NASM's backquoted string, which reads C escapes, holds a ';' or ',' as its quoted ones do
    quotes: '"\'`',
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
    // a snippet of a form the Core does not run would be a program that stops with SIGILL, and an
    // AVX-512 form is the widest an AVX instruction has: offer what runs, unless nothing does
    const running = instruction.forms.filter((form) => !x86FormFails(instruction.name, form))
    return [...(running.length > 0 ? running : instruction.forms)]
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

/** What completion says beside a mnemonic: its summary, and that the Core stops at it if it does. */
function completionDetail(instruction: X86Instruction | undefined): string {
    const summary = instruction?.summary || 'NASM instruction'
    return instruction && x86IsUnsupported(instruction)
        ? `${summary} (not supported by this emulator)`
        : summary
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
        const source = splitAssemblyComment(line, ';', X86_TEXT_OPTIONS.quotes).code
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
            if (splitAssemblyComment(prefix, ';', X86_TEXT_OPTIONS.quotes).comment)
                return { suggestions: [] }
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
            const { CompletionItemKind } = monacoInstance.languages
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
            //the names of a list that start with what was typed
            const offer = (
                names: readonly string[],
                kind: monaco.languages.CompletionItemKind,
                detail: string,
                sortPrefix: string
            ) =>
                names
                    .filter((name) => name.toLowerCase().startsWith(typed))
                    .map((name) => item(name, kind, detail, `${sortPrefix}${name}`))

            if (mnemonicContext) {
                const suggestions: monaco.languages.CompletionItem[] = []
                const directivesOnly = /^\s*%/.test(prefix)
                if (!directivesOnly) {
                    for (const instruction of X86Instructions) {
                        if (!instruction.toLowerCase().startsWith(typed)) continue
                        suggestions.push(
                            item(
                                instruction,
                                CompletionItemKind.Function,
                                completionDetail(x86InstructionMap.get(instruction)),
                                `010${instruction}`
                            )
                        )
                        const form = X86_SIGNATURES.get(instruction.toLowerCase())?.[0]
                        if (form?.operands.length) {
                            suggestions.push({
                                ...item(
                                    instruction,
                                    CompletionItemKind.Snippet,
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
                suggestions.push(
                    ...offer(X86Directives, CompletionItemKind.Keyword, 'NASM directive', '020')
                )
                return { suggestions }
            }

            const operation = parsed.operation?.text.toLowerCase() ?? ''
            const labels = labelsIn(model.getValue())
            //the Runtime library's functions, when the Build links it
            const libraryFunctions = () =>
                runtimeFunctionsForModel(model)
                    .filter(
                        (entry) =>
                            entry.name.toLowerCase().startsWith(typed) &&
                            !labels.includes(entry.name)
                    )
                    .map((entry) => ({
                        label: entry.name,
                        kind: CompletionItemKind.Function,
                        insertText: entry.name,
                        detail: entry.prototype,
                        documentation: { value: runtimeFunctionDocumentation(entry, 'X86') },
                        sortText: `040${entry.name}`,
                        range
                    }))
            if (operation === 'extern') return { suggestions: libraryFunctions() }
            //every width and section, whatever was typed: Monaco filters them by the word
            if (operation === 'bits') {
                return {
                    suggestions: ['16', '32', '64'].map((bits) =>
                        item(bits, CompletionItemKind.Value, `${bits}-bit mode`, `010${bits}`)
                    )
                }
            }
            if (operation === 'section' || operation === 'segment') {
                return {
                    suggestions: ['.text', '.data', '.bss', '.rodata'].map((section) =>
                        item(section, CompletionItemKind.Module, 'Section', `010${section}`)
                    )
                }
            }
            if (branchInstructions.has(operation)) {
                return {
                    suggestions: [
                        ...offer(labels, CompletionItemKind.Reference, 'Jump target', '010'),
                        ...libraryFunctions()
                    ]
                }
            }

            const inAddress = prefix.lastIndexOf('[') > prefix.lastIndexOf(']')
            return {
                suggestions: [
                    ...offer(
                        X86Registers,
                        CompletionItemKind.Variable,
                        inAddress ? 'Address register' : 'Register',
                        '010'
                    ),
                    ...(inAddress
                        ? []
                        : offer(
                              X86SizeSpecifiers,
                              CompletionItemKind.TypeParameter,
                              'Size specifier',
                              '020'
                          )),
                    ...offer(labels, CompletionItemKind.Reference, 'Label', '030')
                ]
            }
        }
    }
}

export function createX86SignatureHelpProvider(
    _monaco: MonacoType
): monaco.languages.SignatureHelpProvider {
    return operandSignatureHelp(X86_TEXT_OPTIONS, [' ', ',', '['], (operation) =>
        X86_SIGNATURES.get(operation)?.map((form) => ({
            label: formatX86Form(operation, form),
            documentation: form.description,
            parameters: form.operands
        }))
    )
}

const hoverDocuments = new Map<string, InstructionDocument>()

/** A documented instruction's shared document, built once per mnemonic for its hovers. */
function x86HoverDocument(instruction: X86Instruction): InstructionDocument {
    let document = hoverDocuments.get(instruction.name)
    if (!document) {
        document = x86InstructionDocument(instruction)
        hoverDocuments.set(instruction.name, document)
    }
    return document
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
            if (instruction && hasX86InstructionPage(word)) {
                // The same header and rows as the instruction's page and its panel row.
                for (const value of documentHover(x86HoverDocument(instruction), {
                    word: original,
                    href: `/documentation/x86/instruction/${word}`
                })) {
                    contents.push({ value })
                }
            } else if (instruction) {
                const forms = X86_SIGNATURES.get(word) ?? []
                const shapes = forms.map((form) => `\`${formatX86Form(word, form)}\``).join('  \n')
                const heading = instruction.summary
                    ? `**${original}** ${instruction.summary}`
                    : `**${original}**`
                const since = instruction.cpu ? `${formatX86Cpu(instruction.cpu)} and later` : ''
                const extensions = instruction.features.length
                    ? `, ${instruction.features.join(', ')}`
                    : ''
                // Only the documented mnemonics have a category; the tags come from every form
                // NASM lists, not just the few the hover shows.
                const unsupported = x86SupportNote(instruction)
                const kind = instructionHoverLine(
                    x86InstructionCategories[word],
                    mnemonicTags(instruction.forms.map(x86FormTags)),
                    since ? `${since}${extensions}` : ''
                )
                contents.push({
                    value: [heading, kind, unsupported].filter(Boolean).join('\n\n')
                })
                if (shapes) contents.push({ value: shapes })
                // The first paragraph only: a hover is a reminder, and the page it links to is the
                // place for the rest.
                const description = describeX86Instruction(word).split('\n\n')[0]
                if (description && description !== instruction.summary) {
                    contents.push({ value: description })
                }
            } else if (registerSet.has(word)) {
                contents.push({ value: `**Register:** \`${original}\`` })
            } else if (directiveSet.has(word) || directiveSet.has(`%${word}`)) {
                contents.push({ value: `**NASM directive:** \`${original}\`` })
            } else if (sizeSpecifierSet.has(word)) {
                contents.push({ value: `**Size specifier:** \`${original}\`` })
            } else {
                const library = runtimeFunctionsForModel(model).find(
                    (entry) => entry.name === original
                )
                if (library && !labelsIn(model.getValue()).includes(original))
                    contents.push({ value: runtimeFunctionDocumentation(library, 'X86') })
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
