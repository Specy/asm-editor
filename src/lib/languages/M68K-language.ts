import type { MonacoType } from "$lib/Monaco"

const arithmetic = ["add","addi","adda","sub","subi","suba","mulu","muls","divu","divs"]
const logic = ["not","and","andi","or","ori","eor","eori"]
const special = ["move","movea","exg","clr","swap","neg"]
const withDescriptors = ["add","sub","divs","move"]
const registers = ["d0","d1","d2","d3","d4","d5","d6","d7","a0","a1","a2","a3","a4","a5","a6","a7"]
const registersMap = toMap(registers)
const withDescriptorsMap = toMap(withDescriptors)
const arithmeticMap = toMap(arithmetic)
function toMap(arr){
    return Object.fromEntries(arr.map(e => [e,true]))
}

export const M68KLanguage = {
	defaultToken: '',
	ignoreCase: false,
	tokenPostfix: '.m68k',

	regEx: /\/(?!\/\/)(?:[^/\\]|\\.)*\/[igm]*/,

	keywords: [...arithmetic,...logic,...special,"ext","lsl","lsr","asl","asr","rol","ror","cmp","cmpa","cmpi","tst","jmp","bra","jsr","rts","bsr","beq","bne","bge","bgt","ble","blt"],
	// we include these common regular expressions
	symbols: /[.,:]+/,
	escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

	// The main tokenizer for our languages
	tokenizer: {
		root: [
            //data registers
            [/\b(D0|D1|D2|D3|D4|D5|D6|D7|d0|d1|d2|d3|d4|d5|d6|d7)/, 'data-register'],
            [/\b(A0|A1|A2|A3|A4|A5|A6|A7|a0|a1|a2|a3|a4|a5|a6|a7)/, 'address-register'],

			// identifiers and keywords
			[/\$[a-zA-Z_]\w*/, 'variable.predefined'],
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
			[/;.*$/, 'comment'],

			// regular expressions
			['///', { token: 'regexp', next: '@hereregexp' }],

			[/^(\s*)(@regEx)/, ['', 'regexp']],
			[/(,)(\s*)(@regEx)/, ['delimiter', '', 'regexp']],
			[/(:)(\s*)(@regEx)/, ['delimiter', '', 'regexp']],

			// delimiters
			[/@symbols/, 'delimiter'],

			// numbers
            [/#%[0-1]+/, 'number.binary'],
			[/\d+[eE]([-+]?\d+)?/, 'number.float'],
			[/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
			[/#\$[0-9a-fA-F]+/, 'number.hex'],
            [/#0x[A-F0-9]+/, 'number.hex'],
			[/0[0-7]+(?!\d)/, 'number.octal'],
			[/#[-+]?[0-9]+/, 'number'],

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
			[/[^"'#\\]+/, 'string'],
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
			[/[^;]+/, 'comment'],
			[/;/, 'comment']
		],

		hereregexp: [
			[/[^\\/#]+/, 'regexp'],
			[/\\./, 'regexp'],
			[/#.*$/, 'comment'],
			['///[igm]*', { token: 'regexp', next: '@pop' }],
			[/\//, 'regexp']
		]
	}
};

export function M68KCompletition(monaco: MonacoType){
	return {
		triggerCharacters: ['.',' ','\t','\n','deleteLeft','Tab','$','#'],
		provideCompletionItems: (model, position) => {
			const data:string = model.getValueInRange({startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column})
			const lastCharacter = data.substring(data.length - 1, data.length)
			let suggestions = []
			const trimmed = data.trim()
			if(lastCharacter === '#'){
				const numerical = ['$','%','#']
				suggestions = suggestions.concat(...numerical.map(numerical => {
					return {
						kind: monaco.languages.CompletionItemKind.Unit,
						label: numerical,
						insertText: numerical !== '#' ? numerical : '',
					}
				}))
			}
			if(lastCharacter === '$' && !trimmed.endsWith('#$')){
                suggestions = suggestions.concat(...registers.map(register => {
                    return {
                        kind: monaco.languages.CompletionItemKind.Variable,
                        label: register,
                        insertText: register
                    }   
                }))
            }
			if(lastCharacter !== ' ' && withDescriptorsMap[trimmed.replace('.', '')]){
				const kind = monaco.languages.CompletionItemKind.Enum
				suggestions = suggestions.concat(...[
					{
						kind,
						label: 'l', 
						documentation: "Select all bits of the register",
						insertText: 'l '
					},{
						kind,
						label: 'w',
						documentation: "Select first part of the register",
						insertText: 'w '
					},{
						kind,
						label: 'b',
						documentation: "Select first 8 bits of the register",
						insertText: 'b '
					},
				])
			}
			if(trimmed.length === 0 && data){
				suggestions = suggestions.concat(...M68KLanguage.keywords.map(keyword => {
					return {
						kind: monaco.languages.CompletionItemKind.Function,
						label: keyword,
						insertText: keyword + ' ',
					}
				}))
			}
			if(arithmeticMap[trimmed] && (lastCharacter === ' ' || lastCharacter === ',') ){
				suggestions = suggestions.concat(...registers.map(register => {
					return {
						kind: monaco.languages.CompletionItemKind.Variable,
						label: register,
						insertText: `$${lastCharacter === ' ' ? register + ', ' : register }`
					}

				}))
			}
			if(trimmed){
				suggestions = suggestions.concat(...M68KLanguage.keywords.filter(keyword => keyword.startsWith(data.trimStart()))
				.map(keyword => {
					return {
						kind: monaco.languages.CompletionItemKind.Function,
						label: keyword,
						insertText: keyword + ' ',
					}
				}))
			}
			return {
				suggestions
			}
		},
		resolveCompletionItem(item, token){
			return {
				...CompletitionMap[item.label],
				...item,
				preselect: true
			}
		}
	}
}


const CompletitionMap = {
	l:{
		detail: 'Select all 32 bits of the register',
	},
	w:{
		detail: 'Selects first 16 bits of the register',
	},
	b:{
		detail: 'Selects first 8 bits of the register',
	},
	add: {
		detail: 'add <reg/num>, <dest>',
		documentation: "Adds the first register to the second register, stores result in the second register"
	},
	sub: {
		detail: 'sub <reg/num>, <dest> | subtracts numbers',
		documentation: 'Subtracts the first register from the second register, stores result in the second register'
	},
	divs: {
		detail: 'divs <reg/num>, <dest> | divides numbers',
		documentation: 'Divides the first register by the second register, stores result in the second register'
	},
	muls: {
		detail: 'muls <reg/num>, <dest> | multiplies numbers',
		documentation: 'Multiplies the first register by the second register, stores result in the second register'
	},
	swap:{
		detail: 'swap <reg> swaps the two words of the register',
		documentation: 'Swaps the two words of the register es: "FFFF 0000" -> "0000 FFFF"'
	},
	exg: {
		detail: 'exg <reg1>, <reg2> | exchanges the two registers',
		documentation: 'Exchanges the content of the two registers'
	},
	neg: {
		detail: 'neg <reg> | negates register',
		documentation: 'Negates the register, es: "1234" -> "-1234"'
	}
}