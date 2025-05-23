import { M68KDirectives, M68kInstructions } from './M68K-documentation'

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

            [new RegExp(`(${M68KDirectives.join('|')})`), 'directive'],
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
            [/'.'/, 'number'],
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
}
