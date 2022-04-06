export const M68KLanguage = {
	defaultToken: '',
	ignoreCase: false,
	tokenPostfix: '.m68k',

	regEx: /\/(?!\/\/)(?:[^/\\]|\\.)*\/[igm]*/,

	keywords: ["add","addi","adda","sub","subi","suba","mulu","muls","divu","divs","not","and","andi","or","ori","eor","eori","move","movea","exg","clr","swap","neg","ext","lsl","lsr","asl","asr","rol","ror","cmp","cmpa","cmpi","tst","jmp","bra","jsr","rts","bsr","beq","bne","bge","bgt","ble","blt"],
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