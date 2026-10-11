//https://github.com/microsoft/monaco-editor/blob/main/src/basic-languages/mips/mips.ts

import type { languages } from 'monaco-editor'
import { mipsDirectivesMap, mipsInstructionNames } from './MIPS-documentation'

export const MIPSLanguageConfiguration: languages.LanguageConfiguration = {
    // dots stay inside a name so hovering `abs.d` or `c.eq.s` finds the whole mnemonic,
    // while a directive's leading dot stays outside it
    wordPattern:
        /(-?\d*\.\d\w*)|([a-zA-Z_][\w.]*)|([^\`\~\!\@\#%\^\&\*\(\)\=\$\-\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    comments: {
        lineComment: '#'
    },
    // declared so Monaco colours the pairs and closes them, as it does for the other languages
    brackets: [['(', ')']],
    autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string', 'comment'] },
        { open: "'", close: "'", notIn: ['string', 'comment'] }
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
    ],
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

    keywords: mipsInstructionNames,
    // their own token, coloured apart from the instructions as the other languages' are
    directives: Object.keys(mipsDirectivesMap).map((d) => `.${d}`),

    symbols: /[\.,\:]+/,
    escapes: /\\(?:[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // A statement's first name is its instruction or directive and the names after it are its
    // operands, so a label spelled like an instruction (`b:`, `j b`) reads as the name it is.
    tokenizer: {
        root: [
            // a name with a colon defines a label, whatever it is spelled like
            [/[.a-zA-Z_][\w.]*(?=\s*:)/, 'label'],
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
            [/[.a-zA-Z_][\w.]*/, ''],
            { include: '@common' }
        ],

        common: [
            // registers by name and by number: `$t0`, `$8`
            [/\$(?:[a-zA-Z_]\w*|\d+)/, 'variable.predefined'],
            // the halves of an address, `lui $at, %hi(msg)`, read as the operators they are
            [/%(?:hi|lo)\b/, 'keyword'],

            [/[ \t\r\n]+/, ''],
            [/#.*$/, 'comment'],
            [/@symbols/, 'delimiter'],

            [/\d+[eE]([\-+]?\d+)?/, 'number.float'],
            [/\d+\.\d+([eE][\-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/0[0-7]+(?!\d)/, 'number.octal'],
            [/\d+/, 'number'],

            // after the numbers, so the dot of `1.5` is not read as one
            [/[,.]/, 'delimiter'],

            // strings and characters, which share their escapes
            [/"/, { token: 'string', next: '@string."' }],
            [/'/, { token: 'string', next: "@string.'" }]
        ],

        // the closing quote is the one that opened it, kept as the state's argument
        string: [
            // a string left open ends with its line, as it does for the assembler
            [/^/, { token: '', next: '@pop' }],
            [/[^\\"']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [
                /["']/,
                {
                    cases: {
                        '$#==$S2': { token: 'string', next: '@pop' },
                        '@default': 'string'
                    }
                }
            ]
        ]
    }
}
