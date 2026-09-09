import type monaco from 'monaco-editor'
import {
    M68KDirectives,
    M68KRecognizedInstructions,
    M68KRefusedDirectives,
    M68KRefusedInstructions
} from './M68K-documentation'

function alternatives(words: string[]): string {
    return [...words].sort((a, b) => b.length - a.length).join('|')
}

const directives = alternatives(M68KDirectives)
const refusedDirectives = alternatives(M68KRefusedDirectives)

/** Monaco's lexical view of the v2 grammar. Meaning and diagnostics remain the Core's job. */
export const M68KLanguage: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.m68k',

    keywords: M68KRecognizedInstructions,
    refusedKeywords: M68KRefusedInstructions,
    symbols: /[(),.:]/,
    operators: ['+', '-', '*', '/', '\\', '&', '!', '|', '^', '<<', '>>', '~'],

    tokenizer: {
        root: [
            // A comment line is never tokenized. Elsewhere only `;` is unconditionally a comment;
            // `*` is also multiplication and the current-address expression in v2.
            [/^\s*[;*].*$/, 'comment'],
            [/;.*/, 'comment'],

            // One to four quoted characters are numeric expressions; longer values are data strings.
            [/'(?:''|[^'])*'/, 'string'],
            [/"(?:""|[^"])*"/, 'string'],

            // A colon always wins over a mnemonic/directive spelling: `end:` is a label.
            [/(?:[A-Za-z_]\w*|\.[A-Za-z0-9_]\w*):/, 'label'],
            [new RegExp(`(?:${refusedDirectives})\\b`), 'invalid'],
            [new RegExp(`(?:${directives})\\b`), 'directive'],

            // In column one, an unknown identifier without a colon is treated as a bare label.
            [
                /^[A-Za-z_]\w*(?=\s|$)/,
                {
                    cases: {
                        '@refusedKeywords': 'invalid',
                        '@keywords': { token: 'keyword.$0' },
                        '@default': 'label'
                    }
                }
            ],
            [
                /\.?[A-Za-z_]\w*/,
                {
                    cases: {
                        '[dD][0-7]': 'data-register',
                        '[aA][0-7]': 'address-register',
                        sp: 'address-register',
                        pc: 'register',
                        sr: 'register',
                        ccr: 'register',
                        usp: 'register',
                        '@refusedKeywords': 'invalid',
                        '@keywords': { token: 'keyword.$0' },
                        '@default': 'identifier'
                    }
                }
            ],

            [/[ \t\f\v\r\n]+/, ''],
            [/#/, 'number.immediate'],
            [/%[0-1][\w]*/, 'number'],
            [/\$[0-9a-fA-F][\w]*/, 'number'],
            [/@[0-7][\w]*/, 'number'],
            [/\d[\w]*/, 'number'],
            [/[+\-*\/\\&!|^~]|<<|>>/, 'operator'],
            [/@symbols/, 'delimiter']
        ]
    }
}

export const M68KLanguageConfiguration: monaco.languages.LanguageConfiguration = {
    comments: { lineComment: ';' },
    brackets: [['(', ')']],
    autoClosingPairs: [
        { open: '(', close: ')' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
    ]
}
