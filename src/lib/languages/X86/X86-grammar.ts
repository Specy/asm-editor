import type monaco from 'monaco-editor'
import { X86_MNEMONICS } from './generated/x86Mnemonics'
import {
    X86_ADDRESS_KEYWORDS,
    X86_ASSEMBLER_REGISTERS,
    X86_DIRECTIVES,
    X86_PREPROCESSOR_DIRECTIVES,
    X86_PSEUDO_OPS,
    X86_SIZE_SPECIFIERS,
    X86_STANDARD_MACROS
} from './generated/x86Tokens'

/**
 * The words the assembler accepts, from the tables NASM generates its own parser from, so the
 * highlighter cannot drift from what assembles. `scripts/x86-docs-generate.mjs` writes them;
 * `docs/design/x86-documentation.md` says where each one comes from.
 */
export const X86Registers = X86_ASSEMBLER_REGISTERS

export const X86Instructions = X86_MNEMONICS

/**
 * Everything that is written where an instruction goes but is not one: the parser's own directives,
 * the user level ones NASM ships as macros (`section`, `struc`, `align`), the data pseudo-ops, and
 * the preprocessor. `times` is in neither table because NASM parses it as a prefix of the line it
 * repeats.
 */
export const X86Directives = [
    ...new Set([
        ...X86_DIRECTIVES,
        ...X86_STANDARD_MACROS,
        ...X86_PSEUDO_OPS,
        ...X86_PREPROCESSOR_DIRECTIVES,
        'times'
    ])
]

/** Operand widths, and the words that pick the reach of a jump or how an address is formed. */
export const X86SizeSpecifiers = [...X86_SIZE_SPECIFIERS, ...X86_ADDRESS_KEYWORDS]

export const X86Language: monaco.languages.IMonarchLanguage = {
    ignoreCase: true,

    // Common Registers (add more as needed)
    registers: X86Registers,

    // Common Instructions (expand significantly for full coverage)
    instructions: X86Instructions,

    // Assembler directives (NASM/MASM style primarily)
    directives: X86Directives,

    // Size specifiers (often used with PTR or directly)
    sizeSpecifiers: X86SizeSpecifiers,

    operators: [
        '+',
        '-',
        '*',
        '/',
        '%', // Arithmetic
        '=',
        '==',
        '!=',
        '<',
        '<=',
        '>',
        '>=', // Comparison (often in %if)
        '&',
        '|',
        '^',
        '~', // Bitwise
        '<<',
        '>>', // Shift
        '?',
        ':' // Ternary (sometimes in macros/equ)
    ],

    symbols: /[=><!~?:&|+\-*/^%]+/,

    // C# style strings
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
        root: [
            // These context-sensitive forms must run before the general identifier rule.
            [/^[ \t]*%[a-zA-Z_]\w*/, 'preprocessor'],
            [/^[ \t]*[a-zA-Z_@$.][\w@$.]*:/, 'tag.label'],
            [/[a-zA-Z_@$.][\w@$.]*:/, 'tag.label'],

            // Identifiers and keywords (instructions, directives, registers, size specifiers)
            [
                /[a-zA-Z_@$.%][\w@$.]*/,
                {
                    cases: {
                        '@instructions': 'keyword.instruction',
                        '@registers': 'variable.predefined',
                        '@directives': 'keyword',
                        '@sizeSpecifiers': 'keyword.size',
                        '@default': 'identifier'
                    }
                }
            ],

            // Whitespace
            { include: '@whitespace' },

            // Delimiters and operators (brackets, comma, colon, operators)
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [
                /@symbols/,
                {
                    cases: {
                        '@operators': 'operator',
                        '@default': ''
                    }
                }
            ],
            [/,/, 'delimiter.comma'],
            // Colon handled by label definition or maybe operators if needed contextually

            // Numbers (Hex, Binary, Decimal)
            // Hex patterns: 0x123, 123h
            [/-?\d+(\.\d+)/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/[0-9][0-9a-fA-F]*h/, 'number.hex'],
            // Binary patterns: 0b0101, 0101b
            [/0[bB][01]+/, 'number.binary'],
            [/[01]+b/, 'number.binary'],
            // Octal patterns: 0o123, 123o, 123q (less common)
            [/0[oO][0-7]+/, 'number.octal'],
            [/[0-7]+[oq]/, 'number.octal'],
            // Decimal
            [/[0-9]+/, 'number'],

            // Strings (double quoted, single quoted)
            [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
            [/'([^'\\]|\\.)*$/, 'string.invalid'], // non-terminated string
            [/"/, { token: 'string.quote', bracket: '@open', next: '@string_dq' }],
            [/'/, { token: 'string.quote', bracket: '@open', next: '@string_sq' }],

            // Characters (single quoted) - treat like strings for simplicity here
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid']
        ],

        comment: [
            [/[;#].*$/, 'comment'] // Allow comments after whitespace
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/[;#].*$/, 'comment'], // Allow comments after whitespace
            [/^\s*%[a-zA-Z_]+.*$/, 'preprocessor'] // NASM preprocessor directives
        ],

        string_dq: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],

        string_sq: [
            [/[^\\']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ]
    } // tokenizer
}

export const X86LanguageConfiguration: monaco.languages.LanguageConfiguration = {
    wordPattern: /[a-zA-Z_@$.%][\w@$.%]*/g,
    comments: {
        lineComment: ';'
    },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
    ],
    // Indentation rules are hard for assembly, basic ones might be:
    indentationRules: {
        // Increase indent after labels and certain directives?
        increaseIndentPattern:
            /^\s*[a-zA-Z_@$.][\w@$.]*:\s*$|^\s*(section|segment|proc|struc|macro|%if|%ifdef|%ifndef|%macro)/i,
        // Decrease indent before end directives?
        decreaseIndentPattern: /^\s*(endp|endstruc|endm|%endif)\b/i
    }
}
