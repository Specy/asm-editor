import type { MonacoType } from "$lib/monaco/Monaco"
import { S68k } from "s68k"
import { AddressingMode, branchConditions, fromSizesToString, fromSizeToString, getAddressingModeNames, getInstructionDocumentation, setConditions } from "./M68K-documentation"


//TODO ALL OF THIS IS CRAP, IT NEEDS TO BE REDONE FROM 0


const arithmetic = ["add", "sub", "suba", "adda", "divs", "divu", "muls", "mulu", "addq", "subq", "addi", "subi"]
const logic = ["tst", "cmp","cmpa","cmpm", "cmpi", "not", "or", "and", "eor", "lsl", "lsr", "asr", "asl", "rol", "ror", "btst", "bclr", "bchg", "bset" ,"andi", "ori", "eori", "subi"]
const special = ["clr", "exg", "neg", "ext", "swap", "move", "movea", "trap"]
const directives = ["org", "equ", "dcb", "ds", "dc"]
const others = [
	...setConditions.map(e => `s${e}`), 
	...branchConditions.map(e => `b${e}`), 
	...branchConditions.map(e => `db${e}`), 
	"dbra", "bsr", "bra", "jsr", "rts", "link", "unlk", "lea", "pea", "moveq", "jmp"
]
export const M68kInstructions = [...arithmetic, ...logic, ...special, ...others]
const formattableTokens = [...M68kInstructions, ...directives]
const formattableTokensMap = new Map(formattableTokens.map(e => [e, true]))
export const M68KLanguage = {
	defaultToken: '',
	ignoreCase: true,
	tokenPostfix: '.m68k',

	regEx: /\/(?!\/\/)(?:[^/\\]|\\.)*\/[igm]*/,

	keywords: [...M68kInstructions],
	symbols: /[.,:]+/,
	escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

	tokenizer: {
		root: [
			//[/('.+'|\w+)[\+\-\/\*]('.+'|\w+)/, 'arithmetical-operation'],

			[new RegExp(`(${directives.join("|")})`), 'directive'],
			[/\w*:/, 'label'],
			[
				/[.a-zA-Z_]\w*/,
				{
					cases: {
						'(d|D)\\d': 'data-register',
						'(a\\d|A\\d|sp)': 'address-register',
						'@keywords': { token: 'keyword.$0' },
						'@default': ''
					}
				}
			],

			//technically not correct as it includes the spaces
			[/\s+(\*|;).*$/, 'comment'],
			// whitespace
			[/[ \t\r\n]+/, ''],
			// Comments
			[/^(\*|;).*$/, 'comment'],
			// regular expressions
			[/(,)(\s*)(@regEx)/, ['delimiter', '', 'regexp']],
			[/(:)(\s*)(@regEx)/, ['delimiter', '', 'regexp']],
			// delimiters
			[/@symbols/, 'delimiter'],
			// numbers
			[/#/, 'number.immediate'],
			[/%[0-1]+/, 'number'],
			[/\$[0-9a-fA-F]+/, 'number'],
			[/@[0-7]+(?!\d)/, 'number'],
			[/[-+]?[0-9]+/, 'number'],
			[/'.'/, "number"],
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

		hereregexp: [
			[/[^\\/#]+/, 'regexp'],
			[/\\./, 'regexp'],
			['///[igm]*', { token: 'regexp', next: '@pop' }],
			[/\//, 'regexp']
		]
	}
};

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
export function createM68kFormatter(monaco: MonacoType) {
	return {
		provideDocumentFormattingEdits: (model) => {
			//this just formats arguments and labels
			const text = model.getValue() as string;
			const lines = text.split(/\r?\n/g);

			const formatted = lines.map(line => {
				const chars = line.split('');
				for (let i = 0; i < chars.length; i++) {
					if (chars[i] === ':' && i + 1 < chars.length && !chars[i + 1].match(/\s/)) {
						chars.splice(i + 1, 0, '\t');
						i--
					}
					if (chars[i] === ',' && i + 1 < chars.length && !chars[i + 1].match(/\s/)) {
						chars.splice(i + 1, 0, ' ');
						i--
					}
				}
				//ugly way to get the first instruction
				const arg = line.split(" ")?.[0]?.split(".")?.[0];
				if (formattableTokensMap.has(arg?.toLowerCase())) {
					chars.unshift('\t');
				}
				return chars.join('');
			})
			return [{
				text: formatted.join('\n'),
				range: model.getFullModelRange()
			}]
		}
	}

}
export function createM68KCompletition(monaco: MonacoType) {
	return {
		triggerCharacters: ['.', ',', ' ', 'deleteLeft', 'tab', '$', '#'],
		provideCompletionItems: (model, position) => {
			const data: string = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
			const lastCharacter = data.substring(data.length - 1, data.length)
			let suggestions = []
			const trimmed = data.trim()
			const [args] = parseArgs(data)

			//numeric values
			function addNumerical() {
				const numericals = ['$', '%', '#', "@"]
				suggestions.push(...numericals.map(numerical => {
					return {
						kind: monaco.languages.CompletionItemKind.Unit,
						label: numerical,
						insertText: numerical === '#' && lastCharacter === '#'
							? ''
							: numerical,
					}
				}))
			}

			if (lastCharacter === '#') {
				addNumerical()
			}
			const firstArgDoc = getInstructionDocumentation(args[0]?.value.split(".")[0].toLowerCase())
			//Add instruction descriptions completition if the first word is an instruction
			if (lastCharacter !== ' ' && args.length === 1) {
				if (firstArgDoc && firstArgDoc.sizes.length) {
					const descriptorSuggestions = firstArgDoc.sizes.map(size => {
						const name = fromSizeToString(size)
						const doc = DescriptionsMap[fromSizeToString(size)]
						if (!doc) return
						return {
							...doc,
							kind: monaco.languages.CompletionItemKind.Enum,
							label: name
						}
					}).filter(Boolean)
					suggestions = suggestions.concat(...descriptorSuggestions)
				}
			}

			//if wrote a space, suggest the instructions
			if (trimmed.length === 0 && data) {
				suggestions.push(...formattableTokens.map(keyword => {
					return {
						kind: monaco.languages.CompletionItemKind.Function,
						label: keyword,
						insertText: "",
					}
				}))
			}
			//if it wrote a instruction, suggest the registers and numbers
			if (firstArgDoc && (lastCharacter === ' ' || lastCharacter === ',')) {
				const position = args.filter(e => e.value).length - 1
				const addressingModes = getAddressingModes(firstArgDoc.args[position], monaco)
				suggestions.push(...addressingModes)
			}
			//keyword suggestion
			if (trimmed) {
				suggestions.push(...formattableTokens.filter(keyword => keyword.startsWith(data.trimStart()))
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
		resolveCompletionItem(item) {
			return {
				...CompletitionMap[item.label],
				...item,
				preselect: true
			}
		}
	}
}




export function createM68kHoverProvider(monaco: MonacoType) {
	return {
		provideHover: (model, position) => {
			const range = new monaco.Range(
				position.lineNumber,
				1,
				position.lineNumber,
				1000
			)

			const line = model.getValueInRange(range).trim()
			const parsed = S68k.lexOne(line).parsed
			const word = model.getWordAtPosition(position)?.word
			if (parsed.type === 'Instruction' || parsed.type === 'Directive') {
				const documentation = getInstructionDocumentation(word?.toLowerCase())
				const defaultSize = documentation?.defaultSize ? fromSizeToString(documentation.defaultSize) : ""
				if (!documentation) return { range, contents: [] }
				return {
					range,
					contents: [
						{
							value: `
							**${word}**
							${documentation.args?.map((e, i) => `\n**Op ${i + 1}:** ${getAddressingModeNames(e)}`).join("\n") ?? ""}
						`.trim()
						},
						{ value: `**Sizes:** ${documentation.sizes?.length ? fromSizesToString(documentation.sizes) : "Not sized"} ${defaultSize ? `\n\n **Default:** ${defaultSize}` : ""}`},
						{ value: documentation.description ?? "No description" },
						{ value: `${documentation.example ?? "No examples"}` },
					]
				}
			}
			return {
				range,
				contents: []
			};
		}
	}
}


const DescriptionsMap = {
	l: {
		documentation: "Select all bits of the register",
		insertText: 'l '
	},
	w: {
		documentation: "Select first part of the register",
		insertText: 'w '
	},
	b: {
		documentation: "Select first 8 bits of the register",
		insertText: 'b '
	},
}



function getAddressingModes(am: AddressingMode[], monaco: MonacoType) {
	if (!am) return []
	const amMap = new Map(am.map(e => [e, true]))
	const res = []
	if (amMap.has(AddressingMode.AddressRegister)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Variable,
			label: "An",
			insertText: "a"
		})
	}
	if (amMap.has(AddressingMode.DataRegister)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Variable,
			label: "Dn",
			insertText: "d"
		})
	}
	if (amMap.has(AddressingMode.Immediate)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Value,
			label: "#",
			insertText: "#"
		})
	}
	if (amMap.has(AddressingMode.EffectiveAddress)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Value,
			label: "EA",
			insertText: ""
		})
	}
	if (amMap.has(AddressingMode.Indirect)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Value,
			label: "(An)",
			insertText: "()"
		})
	}
	if (amMap.has(AddressingMode.IndirectWithPredecrement)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Value,
			label: "-(An)",
			insertText: "-()"
		})
	}
	if (amMap.has(AddressingMode.IndirectWithPostincrement)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Value,
			label: "(An)+",
			insertText: "()+"
		})
	}
	if (amMap.has(AddressingMode.IndirectWithDisplacement)) {
		res.push({
			kind: monaco.languages.CompletionItemKind.Value,
			label: "(An, Dn/An)",
			insertText: "(,)"
		})
	}
	return res
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
	An: {
		detail: 'Address register',
	},
	Dn: {
		detail: 'Data register',
	},
	EA: {
		detail: 'Effective address',
	},
	"(An)": {
		detail: 'Indirect',
	},
	"-(An)": {
		detail: 'Indirect with predecrement',
	},
	"(An)+": {
		detail: 'Indirect with postincrement',
	},
	"(An, Dn/An)": {
		detail: 'Indirect base with displacement',
	},

	'#': {
		detail: '#<num/label> | decimal number or label',
		documentation: 'Decimal immediate number or label'
	},
	'$': {
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
}

