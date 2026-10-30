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

/**
 * The options `opt` takes, which s68k reads as one word each up to a comma: `p=` and the processor,
 * `bit`, and EASy68K's listing options with or without `no` before them. They are coloured as the
 * operand keywords they are; a word that is none of them stays plain, as s68k warns about it.
 */
export const M68K_OPT_OPTIONS = '(?:p|bit|(?:no)?(?:cre|mex|sex|war|cex))'

/** How an operand's words are coloured, by what they name. */
type RegisterCases = Record<string, string>

/**
 * The special registers: the program counter, the status register and its low byte, the user stack
 * pointer, and the control registers `movec` names, the 68010's and the 68020's.
 */
const SPECIAL_REGISTERS = 'sr|ccr|usp|sfc|dfc|vbr|msp|isp|cacr|caar'

/** The data and address registers, and the special ones, the control registers among them. */
const OPERAND_REGISTERS: RegisterCases = {
    '$1~[dD][0-7]': 'data-register',
    '$1~(?:[aA][0-7]|sp)': 'address-register',
    [`$1~(?:pc|${SPECIAL_REGISTERS})`]: 'variable.predefined',
    '@default': 'identifier'
}

/**
 * The same inside an operand's parentheses, where the 68020's suppressed registers are registers
 * too: `za0` to `za7`, `zd0` to `zd7` and `zpc`. Outside them they are names like any other.
 */
const PARENTHESISED_REGISTERS: RegisterCases = {
    '$1~z?[dD][0-7]': 'data-register',
    '$1~(?:z?[aA][0-7]|sp)': 'address-register',
    [`$1~(?:z?pc|${SPECIAL_REGISTERS})`]: 'variable.predefined',
    '@default': 'identifier'
}

/** The rules an operand is read by, registers coloured by `registers`. */
function operandRules(registers: RegisterCases): monaco.languages.IMonarchLanguageRule[] {
    return [
        // the size an absolute address or an expression is taken at: `($1000).w`, and a
        // displacement's width: `(1000.w,a0,d1)`. Before the rule below reads `.w` as a dotted name
        [/\.[bwlsBWLS](?![\w.])/, 'keyword.size'],
        // `d0.w` is the `d0` register, its index sized as a word
        [new RegExp(`(\\.?[A-Za-z_]\\w*)(${sizeSuffix})`), [{ cases: registers }, 'keyword.size']],
        { include: '@common' }
    ]
}

/** Monaco's lexical view of the v2 grammar. Meaning and diagnostics remain the Core's job. */
export const M68KLanguage: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    ignoreCase: true,
    tokenPostfix: '.m68k',

    keywords: M68KRecognizedInstructions,
    //the 68020's module call, which s68k leaves out, is refused, as words the assembler refuses are
    refusedKeywords: [...M68KRefusedInstructions],
    //`[` and `]` are the 68020's memory indirection, `([4,a0],d1.w*4,8)`, `{` and `}` its bit
    //fields, `d0{4:8}`, and `:` joins its register pairs, `d0:d1` and `(a0):(a1)`
    symbols: /[()[\]{},.:]/,
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
            // `opt p=68020,bit`: its options are words of its own rather than operands
            [/opt\b/, { token: 'directive', next: '@options' }],
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

        // the options of an `opt` line, up to the end of the line or its comment
        options: [
            [/^/, { token: '', next: '@pop' }],
            [
                /[A-Za-z_]\w*/,
                { cases: { [`$0~${M68K_OPT_OPTIONS}`]: 'keyword.size', '@default': 'identifier' } }
            ],
            { include: '@common' }
        ],

        // the rest of the statement, until the next line starts another one
        operands: [
            [/^/, { token: '', next: '@pop' }],
            [/\(/, { token: 'delimiter', next: '@parentheses' }],
            ...operandRules(OPERAND_REGISTERS)
        ],

        // inside an operand's parentheses, where the 68020's suppressed registers are registers:
        // `([4,za0],d1.w*4)`. A parenthesis left open ends with its line, as the operands do
        parentheses: [
            [/^/, { token: '', next: '@popall' }],
            [/\(/, { token: 'delimiter', next: '@push' }],
            [/\)/, { token: 'delimiter', next: '@pop' }],
            ...operandRules(PARENTHESISED_REGISTERS)
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
    brackets: [
        ['(', ')'],
        ['[', ']'],
        ['{', '}']
    ],
    autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: '{', close: '}' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
    ]
}
