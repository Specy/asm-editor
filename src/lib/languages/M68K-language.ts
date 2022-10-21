import type { MonacoType } from "$lib/Monaco"

const arithmetic = ["add", "sub", "suba", "adda", "divs", "divu", "muls", "mulu"]
const logic = ["tst", "cmp", "not", "or", "and", "eor", "lsl", "lsr", "asr", "asl", "rol", "ror", "btst", "bclr", "bchg", "bset"]
const special = ["clr", "exg", "neg", "ext", "swap", "move", "trap"]
const registers = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]
const others = ["scc", "scs", "seq", "sne", "sge", "sgt", "sle", "sls", "slt", "shi", "smi", "spl", "svc", "svs", "sf", "st", "beq", "bne", "blt", "ble", "bgt", "bge", "blo", "bls", "bhi", "bhs", "bsr", "bra", "jsr", "rts"]

const withDescriptors = ["move", "add", "sub", "adda", "suba", "clr", "neg", "ext", "tst", "cmp", "not", "or", "and", "eor", "lsl", "lsr", "asr", "asl", "rol", "ror",]
const withDescriptorsMap = toMap(withDescriptors)
function toMap(arr) {
	return Object.fromEntries(arr.map(e => [e, true]))
}
const instructions = [...arithmetic, ...logic, ...special, ...others]
export const M68KLanguage = {
	defaultToken: '',
	ignoreCase: false,
	tokenPostfix: '.m68k',

	regEx: /\/(?!\/\/)(?:[^/\\]|\\.)*\/[igm]*/,

	keywords: [...instructions, ...instructions.map(s => s.toUpperCase())],
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
			[/\*.*$/, 'comment'],
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
			[/[^\*]+/, 'comment'],
			[/\*/, 'comment']
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
export const M68KFormatter = {
	provideDocumentFormattingEdits(model) {
		const text = model.getValue();
		const lines = text.split('\n');
		const parsed = lines.map(line => {
			let formatted = ''
			try {
				const [args] = parseArgs(line)
				if (keywordsMap[args[0]?.value]) formatted += `	${args.shift()?.value} `
				formatted += args.map(a => a.value + (a.boundary?.trim() || '')).join(' ')
			} catch (e) {
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

const keywordsMap = toMap(M68KLanguage.keywords)
export function M68KCompletition(monaco: MonacoType) {
	return {
		triggerCharacters: ['.', ',', ' ', '\t', '\n', 'deleteLeft', 'Tab', '$', '#'],
		provideCompletionItems: (model, position) => {
			const data: string = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
			const lastCharacter = data.substring(data.length - 1, data.length)
			let suggestions = []
			const trimmed = data.trim()
			const [args, boundaries] = parseArgs(data)
			const lastArg = args.length ? args[args.length - 1] : null
			//numeric values
			function addNumerical() {
				const numericals = ['$', '%', '#']
				suggestions = suggestions.concat(...numericals.map(numerical => {
					return {
						kind: monaco.languages.CompletionItemKind.Unit,
						label: numerical,
						insertText: numerical === '#' && lastCharacter === '#'
							? ''
							: numerical !== '#' ? '#' + numerical : numerical,
					}
				}))
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
			if (lastCharacter === '#') {
				addNumerical()
			}

			//Description completition
			if (lastCharacter !== ' ' && withDescriptorsMap[trimmed.replace('.', '')]) {
				const kind = monaco.languages.CompletionItemKind.Enum
				suggestions = suggestions.concat(...[
					{
						kind,
						label: 'l',
						documentation: "Select all bits of the register",
						insertText: 'l '
					}, {
						kind,
						label: 'w',
						documentation: "Select first part of the register",
						insertText: 'w '
					}, {
						kind,
						label: 'b',
						documentation: "Select first 8 bits of the register",
						insertText: 'b '
					},
				])
			}
			//if wrote a space, suggest the instructions
			if (trimmed.length === 0 && data) {
				suggestions = suggestions.concat(...instructions.map(keyword => {
					return {
						kind: monaco.languages.CompletionItemKind.Function,
						label: keyword,
						insertText: keyword,
					}
				}))
			}
			//if it wrote a instruction, suggest the registers and numbers
			if (keywordsMap[args[0]?.value] && (lastCharacter === ' ' || lastCharacter === ',')) {
				addNumerical()
				addRegisters()
			}
			//suggest registers completition
			if (args.length > 1 && lastCharacter === 'a' || lastCharacter === 'd') {
				addRegisters()
			}
			//keyword suggestion
			if (trimmed) {
				suggestions = suggestions.concat(...instructions.filter(keyword => keyword.startsWith(data.trimStart()))
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
		resolveCompletionItem(item, token) {
			return {
				...CompletitionMap[item.label],
				...item,
				preselect: true
			}
		}
	}
}


const CompletitionMap = {
	l: {
		detail: 'Select all 32 bits of the register',
	},
	w: {
		detail: 'Selects first 16 bits of the register',
	},
	b: {
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
	swap: {
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
	},
	'#': {
		detail: '#<num> | decimal number',
		documentation: 'Decimal immediate number'
	},
	'$': {
		detail: '$<num> | hexadecimal number',
		documentation: 'Hexadecimal immediate number'
	},
	'%': {
		detail: '%<num> | binary number',
		documentation: 'Binary immediate number'
	}
}