import type { MonacoType } from '$lib/monaco/Monaco'
import { S68k } from '@specy/s68k'
import type monaco from 'monaco-editor'
import {
    AddressingMode,
    AffectedFlagKind,
    fromSizesToString,
    fromSizeToString,
    getAddressingModeNames,
    getInstructionDocumentation,
    M68KDirectives,
    M68KFlag,
    M68kInstructions
} from './M68K-documentation'

const formattableTokens = [...M68kInstructions, ...M68KDirectives]
const formattableTokensMap = new Map(formattableTokens.map((e) => [e, true]))

type Arg = {
    value: string
    boundary: string | undefined
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

function parseArgs(data: string): [Arg[], string[]] {
    const trimmed = data.trim()
    const boundaries = data.trimEnd().match(/[\s,]+/g) || []
    const args = trimmed.split(/[\s,]+/g).map((value, i) => {
        const data = {
            value: value.trim(),
            boundary: boundaries[i]
        }
        return data
    })
    return [args, boundaries]
}
export function createM68kFormatter(
    _monaco: MonacoType
): monaco.languages.DocumentFormattingEditProvider {
    return {
        provideDocumentFormattingEdits: (model) => {
            //this just formats arguments and labels
            const text = model.getValue()
            const lines = text.split(/\r?\n/g)

            const formatted = lines.map((line) => {
                const chars = line.split('')
                for (let i = 0; i < chars.length; i++) {
                    if (chars[i] === ':' && i + 1 < chars.length && !chars[i + 1].match(/\s/)) {
                        chars.splice(i + 1, 0, '\t')
                        i--
                    }
                    if (chars[i] === ',' && i + 1 < chars.length && !chars[i + 1].match(/\s/)) {
                        chars.splice(i + 1, 0, ' ')
                        i--
                    }
                }
                //ugly way to get the first instruction
                const arg = line.split(' ')?.[0]?.split('.')?.[0]
                if (formattableTokensMap.has(arg?.toLowerCase())) {
                    chars.unshift('\t')
                }
                return chars.join('')
            })
            return [
                {
                    text: formatted.join('\n'),
                    range: model.getFullModelRange()
                }
            ]
        }
    }
}

export function createM68KCompletition(
    monaco: MonacoType
): monaco.languages.CompletionItemProvider {
    return {
        triggerCharacters: ['.', ',', ' ', 'deleteLeft', 'tab', '$', '#'],
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
            let suggestions: monaco.languages.CompletionItem[] = []
            const trimmed = data.trim()
            const [args] = parseArgs(data)

            //numeric values
            function addNumerical() {
                const numericals = ['$', '%', '#', '@']
                suggestions.push(
                    ...numericals.map((numerical) => {
                        return {
                            kind: monaco.languages.CompletionItemKind.Unit,
                            label: numerical,
                            insertText: numerical === '#' && lastCharacter === '#' ? '' : numerical,
                            range
                        }
                    })
                )
            }

            if (lastCharacter === '#') {
                addNumerical()
            }
            const firstArgDoc = getInstructionDocumentation(
                args[0]?.value.split('.')[0].toLowerCase()
            )
            //Add instruction descriptions completition if the first word is an instruction
            if (lastCharacter !== ' ' && args.length === 1) {
                if (firstArgDoc && firstArgDoc.sizes.length) {
                    const descriptorSuggestions = firstArgDoc.sizes.flatMap((size) => {
                        const name = fromSizeToString(size)
                        if (!hasOwnKey(DescriptionsMap, name)) return []
                        return [
                            {
                                ...DescriptionsMap[name],
                                kind: monaco.languages.CompletionItemKind.Enum,
                                label: name,
                                range
                            }
                        ]
                    })
                    suggestions = suggestions.concat(...descriptorSuggestions)
                }
            }

            //if wrote a space, suggest the instructions
            if (trimmed.length === 0 && data) {
                suggestions.push(
                    ...formattableTokens.map((keyword) => {
                        return {
                            kind: monaco.languages.CompletionItemKind.Function,
                            label: keyword,
                            insertText: '',
                            range
                        }
                    })
                )
            }
            //if it wrote a instruction, suggest the registers and numbers
            if (firstArgDoc && (lastCharacter === ' ' || lastCharacter === ',')) {
                const position = args.filter((e) => e.value).length - 1
                const addressingModes = getAddressingModes(
                    firstArgDoc.args[position],
                    monaco,
                    range
                )
                suggestions.push(...addressingModes)
            }
            //keyword suggestion
            if (trimmed) {
                suggestions.push(
                    ...formattableTokens
                        .filter((keyword) => keyword.startsWith(data.trimStart()))
                        .map((keyword) => {
                            return {
                                kind: monaco.languages.CompletionItemKind.Function,
                                label: keyword,
                                insertText: keyword,
                                range
                            }
                        })
                )
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item) {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            const details = hasOwnKey(CompletitionMap, label) ? CompletitionMap[label] : undefined
            return {
                ...details,
                ...item,
                preselect: true
            }
        }
    }
}

export function createM68kHoverProvider(monaco: MonacoType): monaco.languages.HoverProvider {
    return {
        provideHover: (model, position) => {
            const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, 1000)

            const line = model.getValueInRange(range).trim()
            const parsed = S68k.parseLine(line)
            const word = model.getWordAtPosition(position)?.word
            if (parsed.kind === 'instruction' || parsed.kind === 'directive') {
                const documentation = word
                    ? getInstructionDocumentation(word.toLowerCase())
                    : undefined
                const defaultSize = documentation?.defaultSize
                    ? fromSizeToString(documentation.defaultSize)
                    : ''
                if (!documentation) return { range, contents: [] }
                const flagSymbols = [
                    M68KFlag.Extend,
                    M68KFlag.Negative,
                    M68KFlag.Zero,
                    M68KFlag.Overflow,
                    M68KFlag.Carry
                ]
                const flagHeaders = flagSymbols.map((f) => f).join(' | ')
                const flagValues = flagSymbols
                    .map((f) => {
                        const kind = documentation.affectsFlags[f]
                        if (kind === AffectedFlagKind.Edits) return '\u2731'
                        if (kind === AffectedFlagKind.ToZero) return '0'
                        if (kind === AffectedFlagKind.ToOne) return '1'
                        return '\u2014'
                    })
                    .join(' | ')
                const flagsTable = `| ${flagHeaders} |\n|${flagSymbols.map(() => ' :---: ').join('|')}|\n| ${flagValues} |`
                const contents = [
                    {
                        value: `
							# ${word}
							${documentation.args?.map((e, i) => `\n**Op ${i + 1}:** \`${getAddressingModeNames(e)}\``).join('\n') ?? ''}
						`.trim()
                    },
                    {
                        value: `**Sizes:** ${documentation.sizes?.length ? fromSizesToString(documentation.sizes) : 'Not sized'} ${defaultSize ? `\n\n**Default:**  ${defaultSize}` : ''}`
                    }
                ]
                if (documentation.description) {
                    contents.push({ value: documentation.description })
                }
                contents.push({ value: `${flagsTable}` })
                if (documentation.example) {
                    contents.push({ value: documentation.example })
                }
                return {
                    range,
                    contents
                }
            }
            return {
                range,
                contents: []
            }
        }
    }
}

const DescriptionsMap = {
    l: {
        documentation: 'Select all bits of the register',
        insertText: 'l '
    },
    w: {
        documentation: 'Select first part of the register',
        insertText: 'w '
    },
    b: {
        documentation: 'Select first 8 bits of the register',
        insertText: 'b '
    }
} satisfies Record<string, Pick<monaco.languages.CompletionItem, 'documentation' | 'insertText'>>

function getAddressingModes(
    am: AddressingMode[] | undefined,
    monaco: MonacoType,
    range: monaco.IRange
): monaco.languages.CompletionItem[] {
    if (!am) return []
    const amMap = new Map(am.map((e) => [e, true]))
    const res: monaco.languages.CompletionItem[] = []
    if (amMap.has(AddressingMode.AddressRegister)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Variable,
            label: 'An',
            insertText: 'a',
            range
        })
    }
    if (amMap.has(AddressingMode.DataRegister)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Variable,
            label: 'Dn',
            insertText: 'd',
            range
        })
    }
    if (amMap.has(AddressingMode.Immediate)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Value,
            label: '#',
            insertText: '#',
            range
        })
    }
    if (amMap.has(AddressingMode.Absolute)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Value,
            label: 'EA',
            insertText: '',
            range
        })
    }
    if (amMap.has(AddressingMode.Indirect)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Value,
            label: '(An)',
            insertText: '()',
            range
        })
    }
    if (amMap.has(AddressingMode.PreIndirect)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Value,
            label: '-(An)',
            insertText: '-()',
            range
        })
    }
    if (amMap.has(AddressingMode.PostIndirect)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Value,
            label: '(An)+',
            insertText: '()+',
            range
        })
    }
    if (amMap.has(AddressingMode.IndirectWithDisplacement)) {
        res.push({
            kind: monaco.languages.CompletionItemKind.Value,
            label: '(An, Dn/An)',
            insertText: '(,)',
            range
        })
    }
    return res
}

const CompletitionMap = {
    l: {
        detail: 'Select all 32 bits of the register'
    },
    w: {
        detail: 'Selects first 16 bits of the register'
    },
    b: {
        detail: 'Selects first 8 bits of the register'
    },
    An: {
        detail: 'Address register'
    },
    Dn: {
        detail: 'Data register'
    },
    EA: {
        detail: 'Effective address'
    },
    '(An)': {
        detail: 'Indirect'
    },
    '-(An)': {
        detail: 'Indirect with predecrement'
    },
    '(An)+': {
        detail: 'Indirect with postincrement'
    },
    '(An, Dn/An)': {
        detail: 'Indirect base with displacement'
    },

    '#': {
        detail: '#<num/label> | decimal number or label',
        documentation: 'Decimal immediate number or label'
    },
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
} satisfies Record<
    string,
    | Pick<monaco.languages.CompletionItem, 'detail'>
    | {
          detail: string
          documentation: string
      }
>
