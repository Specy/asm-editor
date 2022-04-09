import type { MonacoType } from "$lib/Monaco";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
function toMap(arr) {
    return Object.fromEntries(arr.map(e => [e, true]))
}

const registers = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]
const registersRegex = new RegExp(`\\$(${registers.join('|')})`, 'g')
const arithmetic = ['add',
    'addu',
    'addi',
    'addiu',
    'and',
    'andi',
    'div',
    'divu',
    'mult',
    'multu']
const arithmeticMap = toMap(arithmetic)

const keywords = [
    ...arithmetic,
    'nor',
    'or',
    'ori',
    'sll',
    'slv',
    'sra',
    'srav',
    'srl',
    'srlv',
    'sub',
    'subu',
    'xor',
    'xori',
    'lhi',
    'lho',
    'lhi',
    'llo',
    'slt',
    'slti',
    'sltu',
    'sltiu',
    'beq',
    'bgtz',
    'blez',
    'bne',
    'j',
    'jal',
    'jalr',
    'jr',
    'lb',
    'lbu',
    'lh',
    'lhu',
    'lw',
    'li',
    'la',
    'sb',
    'sh',
    'sw',
    'mfhi',
    'mflo',
    'mthi',
    'mtlo',
    'move',
    'syscall',
    'trap',
]
const keywordsMap = toMap(keywords)
export const MIPSLanguage = {
    defaultToken: '',
    ignoreCase: false,
    tokenPostfix: '.mips',

    regEx: /\/(?!\/\/)(?:[^\/\\]|\\.)*\/[igm]*/,

    keywords: [...keywords, '.data', '.text'],

    // we include these common regular expressions
    symbols: /[.,:]+/,
    escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // identifiers and keywords
            [registersRegex, 'variable.predefined'],
            [
                /[.a-zA-Z_]\w*/,
                {
                    cases: {
                        this: 'variable.predefined',
                        '@keywords': { token: 'keyword.$0' },
                        '@default': ''
                    }
                }
            ],

            // whitespace
            [/[ \t\r\n]+/, ''],

            // Comments
            [/#.*$/, 'comment'],

            // regular expressions
            ['///', { token: 'regexp', next: '@hereregexp' }],

            [/^(\s*)(@regEx)/, ['', 'regexp']],
            [/(\,)(\s*)(@regEx)/, ['delimiter', '', 'regexp']],
            [/(\:)(\s*)(@regEx)/, ['delimiter', '', 'regexp']],

            // delimiters
            [/@symbols/, 'delimiter'],

            // numbers
            [/\d+[eE]([\-+]?\d+)?/, 'number.float'],
            [/\d+\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/0[0-7]+(?!\d)/, 'number.octal'],
            [/\d+/, 'number'],

            // delimiter: after number because of .\d floats
            [/[,.]/, 'delimiter'],

            // strings:
            [/"""/, 'string', '@herestring."""'],
            [/'''/, 'string', "@herestring.'''"],
            [
                /"/,
                {
                    cases: {
                        '@eos': 'string',
                        '@default': { token: 'string', next: '@string."' }
                    }
                }
            ],
            [
                /'/,
                {
                    cases: {
                        '@eos': 'string',
                        '@default': { token: 'string', next: "@string.'" }
                    }
                }
            ]
        ],

        string: [
            [/[^"'\#\\]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\./, 'string.escape.invalid'],
            [/\./, 'string.escape.invalid'],

            [
                /#{/,
                {
                    cases: {
                        '$S2=="': {
                            token: 'string',
                            next: 'root.interpolatedstring'
                        },
                        '@default': 'string'
                    }
                }
            ],

            [
                /["']/,
                {
                    cases: {
                        '$#==$S2': { token: 'string', next: '@pop' },
                        '@default': 'string'
                    }
                }
            ],
            [/#/, 'string']
        ],

        herestring: [
            [
                /("""|''')/,
                {
                    cases: {
                        '$1==$S2': { token: 'string', next: '@pop' },
                        '@default': 'string'
                    }
                }
            ],
            [/[^#\\'"]+/, 'string'],
            [/['"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\./, 'string.escape.invalid'],

            [/#{/, { token: 'string.quote', next: 'root.interpolatedstring' }],
            [/#/, 'string']
        ],

        comment: [
            [/[^#]+/, 'comment'],
            [/#/, 'comment']
        ],

        hereregexp: [
            [/[^\\\/#]+/, 'regexp'],
            [/\\./, 'regexp'],
            [/#.*$/, 'comment'],
            ['///[igm]*', { token: 'regexp', next: '@pop' }],
            [/\//, 'regexp']
        ]
    }
};


export const MIPSFormatter = {
	provideDocumentFormattingEdits(model) {
		const text = model.getValue();
		const lines = text.split('\n');
		const parsed = lines.map(line => {
            let formatted = ''
            try{
                const [args] = parseArgs(line)
                if (keywordsMap[args[0]?.value]) formatted += `	${args.shift()?.value} `
                formatted += args.map(a => a.value + (a.boundary?.trim() || '')).join(' ')
            }catch(e){
                console.error(e)
                return line
            }
			return formatted
		})
		return [{
			text: parsed.join('\n'),
			range: model.getFullModelRange()
		}]
	}
}
type Arg = {
	value: string
	boundary: string
}
function parseArgs(data): [Arg[], string[]] {
	const trimmed = data.trim();
	const boundaries = data.trimEnd().match(/[\s,]+/g) || []
	const args = trimmed.split(/[\s,]+/g).map((value, i) => {
		const data = {
			value: value.trim(),
			boundary: boundaries[i],
		}
		return data
	})
	return [args, boundaries]
}
export function MIPSCompletition(monaco: MonacoType) {
    return {
        triggerCharacters: ['.', ' ', '\t', '\n', 'deleteLeft', '$'],
        provideCompletionItems: (model, position) => {
            const data: string = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
            const lastCharacter = data.substring(data.length - 1, data.length)
            let suggestions = []
            const trimmed = data.trim()
            const [args, boundaries] = parseArgs(data)
            function addNumerical() {
                suggestions.push({
                    label: '<num>',
                    kind: monaco.languages.CompletionItemKind.Value,
                    insertText: '',
                    documentation: "Decimal number",
                }, {
                    label: '0x<num>',
                    insertText: '0x',
                    kind: monaco.languages.CompletionItemKind.Value,
                    documentation: "Hexadecimal number",
                })
            }
            function addRegisters() {
                suggestions = suggestions.concat(...registers.map(register => {
                    return {
                        kind: monaco.languages.CompletionItemKind.Variable,
                        label: register,
                        insertText: register
                    }
                }))
            }
            if (lastCharacter === '$') {
                addRegisters()
            }
            // if wrote only space or tab, suggest keywords
            if (trimmed.length === 0) {
                suggestions = suggestions.concat(...keywords.map(keyword => {
                    return {
                        kind: monaco.languages.CompletionItemKind.Function,
                        label: keyword,
                        insertText: keyword,
                    }
                }))
            }
            //if wrote a keyword and wants to add register
            if (keywordsMap[args[0]?.value] && (lastCharacter === ' ' || lastCharacter === ',')) {
                addRegisters()
                addNumerical()
            }
            if (trimmed) {
                suggestions = suggestions.concat(...keywords.filter(keyword => keyword.startsWith(data.trimStart()))
                    .map(keyword => {
                        return {
                            kind: monaco.languages.CompletionItemKind.Function,
                            label: keyword,
                            insertText: keyword,
                        }
                    }))
            }
            return {
                suggestions
            }
        },
        resolveCompletionItem(item, token) {
            return CompletitionMap[item.label]
        }
    }
}

const CompletitionMap = {
    li: {
        detail: 'li <dest>, <number>',
        documentation: 'Loads a number into a register'
    },
    move: {
        detail: 'move <dest>, <reg>',
        documentation: 'Copies the content of <reg> to <dest>'
    },
    add: {
        detail: 'add <dest>, <reg>, <reg/number> ',
        documentation: 'Adds <reg/number> to <reg> and stores the result in <dest>'
    },
    sub: {
        detail: 'sub <dest>, <reg>, <reg/number>',
        documentation: 'Subtracts <reg/number> from <reg> and stores the result in <dest>'
    },
    div: {
        detail: 'div <dest>, <reg>, <reg/number |OR| div <dividing>, <divisor>',
        documentation: `With 3 arguments: Divides <reg/number> by <reg> and stores the result in <dest>
                        With 2 arguments: Divides <dividing> by <divisor> and stores the reminder in HI and result in LO`
    },
    mul: {
        detail: 'mul <dest>, <reg>, <reg/number>',
        documentation: 'Multiplies <reg/number> and <reg> and stores the result in <dest>'
    },
    mfhi: {
        detail: 'mfhi <dest> | copies content of HI to <dest>',
        documentation: 'Copies content of HI to <dest>'
    },
    mflo: {
        detail: 'mflo <dest> | copies content of LO to <dest>',
        documentation: 'Copies content of LO to <dest>'
    },
    mthi: {
        detail: 'mthi <reg/number> | copies content of <reg/number> to HI',
        documentation: 'Copies content of <reg/number> to HI'
    },
    mtlo: {
        detail: 'mtlo <reg/number> | copies content of <reg/number> to LO',
        documentation: 'Copies content of <reg/number> to LO'
    },
    mult: {
        detail: 'mult <reg>, <reg> | multiplies <reg> and <reg> and stores the result in HI and LO',
        documentation: 'Multiplies <reg> and <reg> and stores the result in HI and LO'
    }
}