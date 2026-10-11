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
/** `.b`, `.w`, `.l` and the short branch's `.s`, or nothing: not the start of a longer name. */
const sizeSuffix = '(?:\\.[bwlsBWLS](?![\\w.]))?'

/** Monaco's lexical view of the v2 grammar. Meaning and diagnostics remain the Core's job. */
export const M68KLanguage: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.m68k',

    keywords: M68KRecognizedInstructions,
    refusedKeywords: M68KRefusedInstructions,
    symbols: /[(),.:]/,
    operators: ['+', '-', '*', '/', '\\', '&', '!', '|', '^', '<<', '>>', '~'],

    // A statement's first word is its instruction or directive and the words after it are its
    // operands, so a label spelled like an instruction (`bsr reset`, `bra add`) reads as a name.
    tokenizer: {
        root: [
            // A comment line is never tokenized. Elsewhere only `;` is unconditionally a comment;
            // `*` is also multiplication and the current-address expression in v2.
            [/^\s*[;*].*$/, 'comment'],

            // A colon always wins over a mnemonic/directive spelling: `end:` is a label.
            [/([A-Za-z_]\w*|\.[A-Za-z0-9_]\w*)(:)/, ['label', 'delimiter']],
            // so is a name being given a value, indented or not: the directive after it opens
            // the statement
            [/[A-Za-z_]\w*(?=\s+(?:equ|set)\b|\s*=)/, 'label'],
            // a size suffix is coloured apart from the word it sizes, here and on instructions and
            // registers: `dc.w` is the `dc` directive, `.w` wide
            [
                new RegExp(`(${refusedDirectives})(${sizeSuffix})\\b`),
                ['invalid', { token: 'keyword.size', next: '@operands' }]
            ],
            [
                new RegExp(`(${directives})(${sizeSuffix})\\b`),
                ['directive', { token: 'keyword.size', next: '@operands' }]
            ],

            // In column one, an unknown identifier without a colon is treated as a bare label.
            [
                /^[A-Za-z_]\w*(?=\s|$)/,
                {
                    cases: {
                        '@refusedKeywords': { token: 'invalid', next: '@operands' },
                        '@keywords': { token: 'keyword.$0', next: '@operands' },
                        '@default': 'label'
                    }
                }
            ],
            // The word is told apart without its size suffix: `move.l` is the `move` instruction.
            [
                new RegExp(`(\\.?[A-Za-z_]\\w*)(${sizeSuffix})`),
                [
                    {
                        cases: {
                            '$1@refusedKeywords': 'invalid',
                            '$1@keywords': 'keyword.$1',
                            '@default': 'identifier'
                        }
                    },
                    { token: 'keyword.size', next: '@operands' }
                ]
            ],
            { include: '@common' }
        ],

        // the rest of the statement, until the next line starts another one
        operands: [
            [/^/, { token: '', next: '@pop' }],
            // the size an absolute address or an expression is taken at: `($1000).w`, before the
            // rule below reads `.w` as a dotted name
            [/\.[bwlsBWLS](?![\w.])/, 'keyword.size'],
            // `d0.w` is the `d0` register, its index sized as a word
            [
                new RegExp(`(\\.?[A-Za-z_]\\w*)(${sizeSuffix})`),
                [
                    {
                        cases: {
                            '$1~[dD][0-7]': 'data-register',
                            '$1~(?:[aA][0-7]|sp)': 'address-register',
                            '$1~(?:pc|sr|ccr|usp)': 'variable.predefined',
                            '@default': 'identifier'
                        }
                    },
                    'keyword.size'
                ]
            ],
            { include: '@common' }
        ],

        common: [
            [/;.*/, 'comment'],

            // One to four quoted characters are numeric expressions; longer values are data strings.
            [/'(?:''|[^'])*'/, 'string'],
            [/"(?:""|[^"])*"/, 'string'],

            [/[ \t\f\v\r\n]+/, ''],
            [/#/, 'number.immediate'],
            [/%[0-1][\w]*/, 'number'],
            [/\$[0-9a-fA-F][\w]*/, 'number.hex'],
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
