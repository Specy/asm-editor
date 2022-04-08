import type { MonacoType } from "$lib/Monaco";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const registers = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]
const registersRegex = new RegExp(`\\$(${registers.join('|')})`, 'g')

const keywords = [
    'add',
    'addu',
    'addi',
    'addiu',
    'and',
    'andi',
    'div',
    'divu',
    'mult',
    'multu',
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
    '.data',
    '.text',
    'syscall',
    'trap',
]
export const MIPSLanguage = {
    defaultToken: '',
    ignoreCase: false,
    tokenPostfix: '.mips',

    regEx: /\/(?!\/\/)(?:[^\/\\]|\\.)*\/[igm]*/,

    keywords,

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


export function MIPSCompletition(monaco: MonacoType){
	return {
		triggerCharacters: ['.',' ','\t','\n','deleteLeft','$'],
		provideCompletionItems: (model, position) => {
			const data: string = model.getValueInRange({startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column})
			let suggestions = []
            const lastCharacter = data.substr(data.length - 1)

            if(lastCharacter === '$'){
                suggestions = suggestions.concat(...registers.map(register => {
                    return {
                        kind: monaco.languages.CompletionItemKind.Variable,
                        label: register,
                        insertText: register
                    }   
                }))
            }
			if(data.trim().length === 0 ){
				suggestions = suggestions.concat(...MIPSLanguage.keywords.map(keyword => {
					return {
						kind: monaco.languages.CompletionItemKind.Keyword,
						label: keyword,
						insertText: keyword,
					}
				}))
			}
			if(data.trim()){
				suggestions = suggestions.concat(...MIPSLanguage.keywords.filter(keyword => keyword.startsWith(data.trimStart()))
				.map(keyword => {
					return {
						kind: monaco.languages.CompletionItemKind.Keyword,
						label: keyword,
						insertText: keyword,
					}
				}))
			}
			return {
				suggestions
			}
		}
	}
}