import type { languages } from 'monaco-editor'
import {
    z80ConditionCodes,
    z80DirectiveNames,
    z80InstructionNames,
    z80Registers
} from './Z80-documentation'

const registerNames = z80Registers.map((register) => register.name)
const conditionNames = z80ConditionCodes.map((condition) => condition.name)
// `=` is a directive too (a synonym of `equ`) but it is punctuation, not a word, so it is coloured
// by the delimiter rule instead of the keyword lists.
const directiveNames = z80DirectiveNames.filter((name) => /^[#.]?[a-zA-Z_]/.test(name))

export const Z80LanguageConfiguration: languages.LanguageConfiguration = {
    /**
     * The default word pattern splits on `.`, `$`, `#` and `'`, which would make `.org` two words
     * and `af'` one word without its apostrophe. Hover and completion both work on the word under
     * the cursor, so the pattern has to keep the Z80's spellings together: a hex constant (`$ff`),
     * a binary constant (`%101`), a directive or identifier with its prefix and its optional
     * alternate-register apostrophe (`.org`, `#include`, `af'`), or a number with the suffixes the
     * assembler accepts (`12h`, `0x12`, `101b`).
     */
    wordPattern: /(\$[0-9a-fA-F]+)|(%[01]+)|([#.]?[a-zA-Z_][\w.]*'?)|(\d\w*)/g,
    comments: {
        lineComment: ';'
    },
    brackets: [
        ['(', ')'],
        ['[', ']']
    ],
    autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '"', close: '"', notIn: ['string', 'comment'] }
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '"', close: '"' }
    ]
    // No auto closing pair for `'`: the alternate registers are spelled `af'`, `bc'`, `de'`, `hl'`,
    // so closing the quote automatically would fight with the most common use of the character.
}

export const Z80Language = <languages.IMonarchLanguage>{
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.z80',

    mnemonics: z80InstructionNames,
    registers: registerNames,
    conditions: conditionNames,
    directives: directiveNames,

    escapes: /\\(?:[abfnrtv\\"'0]|x[0-9A-Fa-f]{1,2})/,

    tokenizer: {
        root: [
            // Comments run to the end of the line and start with `;`.
            [/;.*$/, 'comment'],

            // An identifier followed by a colon is a label definition wherever it appears, even
            // when it is spelled like a mnemonic or a directive (`add:`, `data:`), so this rule
            // comes before the ones that colour those.
            [/[a-zA-Z_][\w.]*(?=\s*:)/, 'label'],

            // Column 0 belongs to labels: an identifier there defines a label unless it is a
            // mnemonic or a directive, with or without the trailing colon.
            [
                /^[#.a-zA-Z_][\w.]*/,
                {
                    cases: {
                        '@mnemonics': 'keyword',
                        '@directives': 'directive',
                        '@default': 'label'
                    }
                }
            ],

            // Prefixed directives: `.org`, `#include`.
            [
                /[#.][a-zA-Z_][\w.]*/,
                {
                    cases: {
                        '@directives': 'directive',
                        '@default': ''
                    }
                }
            ],

            // Bare words: registers (including the alternate set), condition codes, mnemonics and
            // the directives that are written without a prefix (`org`, `defb`, `equ`, `end`).
            [
                /[a-zA-Z_][\w]*'?/,
                {
                    cases: {
                        '@registers': 'variable.predefined',
                        '@conditions': 'address-register',
                        '@mnemonics': 'keyword',
                        '@directives': 'directive',
                        '@default': ''
                    }
                }
            ],

            [/[ \t\r\n]+/, ''],

            // Every number syntax the assembler accepts. The suffixed forms have to be tried
            // before the plain decimal rule, which would otherwise eat the digits of `12h`.
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/\$[0-9a-fA-F]+/, 'number.hex'],
            [/[0-9][0-9a-fA-F]*[hH]\b/, 'number.hex'],
            [/0[bB][01]+/, 'number.binary'],
            [/%[01]+/, 'number.binary'],
            [/[01]+[bB]\b/, 'number.binary'],
            [/0[oO][0-7]+/, 'number.octal'],
            [/[0-7]+[oO]\b/, 'number.octal'],
            [/\d+/, 'number'],
            // A lone `$` is the address of the current line.
            [/\$/, 'number'],

            // Character constants and strings. Both use the same escapes.
            [/'(?:[^'\\]|@escapes)*'/, 'string'],
            [/"(?:[^"\\]|@escapes)*"/, 'string'],
            [/'/, 'string.invalid'],
            [/"/, 'string.invalid'],

            [/[,:()[\]+\-*/]/, 'delimiter']
        ]
    }
}
