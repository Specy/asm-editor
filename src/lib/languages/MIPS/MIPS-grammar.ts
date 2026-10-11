//https://github.com/microsoft/monaco-editor/blob/main/src/basic-languages/mips/mips.ts

import type { languages } from 'monaco-editor'
import { mipsDirectivesMap, mipsInstructionNames } from './MIPS-documentation'

export const MIPSLanguageConfiguration: languages.LanguageConfiguration = {
    // dots stay inside a name so hovering `abs.d` or `c.eq.s` finds the whole mnemonic,
    // while a directive's leading dot stays outside it
    wordPattern:
        /(-?\d*\.\d\w*)|([a-zA-Z_][\w.]*)|([^\`\~\!\@\#%\^\&\*\(\)\=\$\-\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
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
}

export const MIPSLanguage = <languages.IMonarchLanguage>{
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.mips',

    regEx: /\/(?!\/\/)(?:[^\/\\]|\\.)*\/[igm]*/,

    keywords: mipsInstructionNames,
    // their own token, coloured apart from the instructions as the other languages' are
    directives: Object.keys(mipsDirectivesMap).map((d) => `.${d}`),

    // we include these common regular expressions
    symbols: /[\.,\:]+/,
    escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // The main tokenizer for our languages. A statement's first name is its instruction or
    // directive and the names after it are its operands, so a label spelled like an instruction
    // (`b:`, `j b`) reads as the name it is.
    tokenizer: {
        root: [
            // a name with a colon defines a label, whatever it is spelled like
            [/[.a-zA-Z_][\w.]*(?=\s*:)/, ''],
            // dots stay inside the name so `c.ueq.s` or `cvt.d.w` matches as one keyword
            [
                /[.a-zA-Z_][\w.]*/,
                {
                    cases: {
                        '@directives': { token: 'directive', next: '@operands' },
                        '@keywords': { token: 'keyword.$0', next: '@operands' },
                        '@default': { token: '', next: '@operands' }
                    }
                }
            ],
            { include: '@common' }
        ],

        // the rest of the statement, until the next line starts another one
        operands: [
            [/^/, { token: '', next: '@pop' }],
            [/[.a-zA-Z_][\w.]*/, { cases: { this: 'variable.predefined', '@default': '' } }],
            { include: '@common' }
        ],

        common: [
            // registers by name and by number: `$t0`, `$8`
            [/\$(?:[a-zA-Z_]\w*|\d+)/, 'variable.predefined'],

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
}
