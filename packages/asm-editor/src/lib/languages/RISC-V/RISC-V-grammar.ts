//https://github.com/microsoft/monaco-editor/blob/main/src/basic-languages/riscv/riscv.ts

import type { languages } from 'monaco-editor'
import {
    riscvDirectivesMap,
    riscvGnuDirectiveNames,
    riscvInstructionNames
} from './RISC-V-documentation'

import {
    RISCVCsrRegisterNames,
    RISCVLanguageFloatingPointRegisterNames,
    RISCVLanguageRegisterNames
} from './RISC-V-registers'

/**
 * The integer and the FPU registers, and `fp`, the name the assembler also takes for `s0`, longest
 * first so `ft10` is not read as `ft1`.
 */
const RISCVRegisterNames = [
    ...RISCVLanguageRegisterNames,
    'fp',
    ...RISCVLanguageFloatingPointRegisterNames
].sort((a, b) => b.length - a.length)

export const RISCVLanguageConfiguration: languages.LanguageConfiguration = {
    // dots stay inside a name so hovering `fadd.s` or `fcvt.w.s` finds the whole mnemonic,
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

export const RISCVLanguage = <languages.IMonarchLanguage>{
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.riscv',

    keywords: riscvInstructionNames,
    // their own token, coloured apart from the instructions as the other languages' are
    directives: [
        ...Object.keys(riscvDirectivesMap).map((d) => `.${d}`),
        ...riscvGnuDirectiveNames.map((d) => `.${d}`)
    ],
    csrs: RISCVCsrRegisterNames,

    symbols: /[\.,\:]+/,
    escapes: /\\(?:[0-7]{1,3}|[abfnrtv\\"'$]|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // A statement's first name is its instruction or directive and the names after it are its
    // operands, so a label spelled like an instruction (`b:`, `j b`) reads as the name it is.
    tokenizer: {
        root: [
            // a name with a colon defines a label, whatever it is spelled like, and so does a
            // number: `1:` is the local label `1b` and `1f` refer to
            [/(?:[.a-zA-Z_][\w.]*|\d+)(?=\s*:)/, 'label'],
            // a CSR is named only among the operands of the instructions that read and write one,
            // where it is a register; elsewhere `time` or `cycle` is any other name
            [
                /csr\w*/,
                {
                    cases: {
                        '@keywords': { token: 'keyword.$0', next: '@csrOperands' },
                        '@default': { token: '', next: '@operands' }
                    }
                }
            ],
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
            { include: '@common' },
            [/[.a-zA-Z_][\w.]*/, '']
        ],

        csrOperands: [
            [/^/, { token: '', next: '@pop' }],
            { include: '@common' },
            [/[.a-zA-Z_][\w.]*/, { cases: { '@csrs': 'variable.predefined', '@default': '' } }]
        ],

        common: [
            [/%(?:pcrel_hi|pcrel_lo|hi|lo)\b/, 'keyword'],
            [/\b[0-9]+[bf]\b/, 'identifier'],
            [new RegExp(`\\b(?:${RISCVRegisterNames.join('|')})\\b`), 'variable.predefined'],

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
