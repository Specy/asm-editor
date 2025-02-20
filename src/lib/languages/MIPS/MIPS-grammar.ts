//https://github.com/microsoft/monaco-editor/blob/main/src/basic-languages/mips/mips.ts

import type { languages } from "monaco-editor";
import { mipsDirectivesMap, mipsInstructionNames } from "./MIPS-documentation";

export const MIPSLanguageConfiguration: languages.LanguageConfiguration = {
	wordPattern:
		/(-?\d*\.\d\w*)|([^\`\~\!\@\#%\^\&\*\(\)\=\$\-\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
	comments: {
		blockComment: ['###', '###'],
		lineComment: '#'
	},
	folding: {
		markers: {
			start: new RegExp('^\\s*#region\\b'),
			end: new RegExp('^\\s*#endregion\\b')
		}
	}
};

export const MIPSLanguage = <languages.IMonarchLanguage>{
	defaultToken: '',
	ignoreCase: false,
	tokenPostfix: '.mips',

	regEx: /\/(?!\/\/)(?:[^\/\\]|\\.)*\/[igm]*/,

	keywords: [
        ...([...Object.keys(mipsDirectivesMap)].map(d => `.${d}`)),
        ...mipsInstructionNames
	],

	// we include these common regular expressions
	symbols: /[\.,\:]+/,
	escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

	// The main tokenizer for our languages
	tokenizer: {
		root: [
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