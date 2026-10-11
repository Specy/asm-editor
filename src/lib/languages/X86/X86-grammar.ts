import type monaco from 'monaco-editor'
import { X86_MNEMONICS } from './generated/x86Mnemonics'
import { X86_ASSEMBLER_REGISTERS } from './generated/x86Tokens'
import { X86Directives, X86Prefixes, X86SizeSpecifiers } from './X86-keywords'

/**
 * The words the assembler accepts, from the tables NASM generates its own parser from, so the
 * highlighter cannot drift from what assembles. `scripts/x86-docs-generate.mjs` writes them;
 * `docs/design/x86-documentation.md` says where each one comes from.
 */
export const X86Registers = X86_ASSEMBLER_REGISTERS

export const X86Instructions = X86_MNEMONICS

export { X86Directives, X86SizeSpecifiers }

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

    // `rep`, `lock`: part of the instruction they stand before, and coloured as one
    prefixes: X86Prefixes,

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

    // A statement's first word is its instruction or directive and the words after it are its
    // operands, so a label spelled like an instruction (`jmp loop`) reads as a name there.
    tokenizer: {
        root: [
            // These context-sensitive forms must run before the general identifier rule.
            [/^[ \t]*%[a-zA-Z_]\w*/, 'preprocessor'],
            [/^[ \t]*[a-zA-Z_@$.][\w@$.]*:/, 'tag.label'],
            [/[a-zA-Z_@$.][\w@$.]*:/, 'tag.label'],

            // Identifiers and keywords (instructions, directives, registers, size specifiers).
            // A prefix and `times`, which repeats what follows its count, leave the statement's
            // instruction still to come.
            [
                /[a-zA-Z_@$.%][\w@$.]*/,
                {
                    cases: {
                        times: 'directive',
                        '@prefixes': 'keyword.prefix',
                        '@instructions': { token: 'keyword.instruction', next: '@operands' },
                        '@directives': { token: 'directive', next: '@operands' },
                        '@registers': 'variable.predefined',
                        '@sizeSpecifiers': 'keyword.size',
                        '@default': { token: 'identifier', next: '@operands' }
                    }
                }
            ],
            { include: '@common' }
        ],

        // the rest of the statement, until the next line starts another one
        operands: [
            [/^/, { token: '', next: '@pop' }],
            [
                /[a-zA-Z_@$.%][\w@$.]*/,
                {
                    cases: {
                        '@registers': 'variable.predefined',
                        '@directives': 'directive',
                        '@sizeSpecifiers': 'keyword.size',
                        '@default': 'identifier'
                    }
                }
            ],
            { include: '@common' }
        ],

        common: [
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
