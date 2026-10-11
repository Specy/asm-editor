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

/**
 * The directives a bare name before which is the label they define, colon or not: `msg db "hi"`,
 * `COUNT equ 5`. The preprocessor's own (`%define`) open their line instead.
 */
const labelledDirectives = X86Directives.filter((directive) => !directive.startsWith('%'))

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

    // the escapes of a backquoted string, the only kind NASM reads escapes in
    escapes: /\\(?:[abtnvfre'"`\\?]|[0-7]{1,3}|x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    // A statement's first word is its instruction or directive and the words after it are its
    // operands, so a label spelled like an instruction (`jmp loop`) reads as a name there.
    tokenizer: {
        root: [
            // These context-sensitive forms must run before the general identifier rule.
            [/([a-zA-Z_@$.][\w@$.]*)(:)/, ['label', 'delimiter']],
            // a name a data or value directive follows is the label it defines, without a colon
            [
                new RegExp(
                    `[a-zA-Z_@$.][\\w@$.]*(?=[ \\t]+(?:${labelledDirectives.join('|')})(?![\\w@$.]))`
                ),
                {
                    cases: {
                        '@prefixes': 'keyword.prefix',
                        '@instructions': { token: 'keyword.instruction', next: '@operands' },
                        '@directives': { token: 'directive', next: '@operands' },
                        '@default': 'label'
                    }
                }
            ],
            // NASM's deprecated `$0FF`, before the rule that reads `$` as the start of a name
            [/\$[0-9][0-9a-fA-F_]*/, 'number.hex'],

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
            [/\$[0-9][0-9a-fA-F_]*/, 'number.hex'],
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
            [/0[hH][0-9a-fA-F]+/, 'number.hex'],
            [/[0-9][0-9a-fA-F]*h/, 'number.hex'],
            // Binary patterns: 0b0101, 0101b
            [/0[bB][01]+/, 'number.binary'],
            [/[01]+b/, 'number.binary'],
            // Octal patterns: 0o123, 123o, 123q (less common)
            [/0[oO][0-7]+/, 'number.octal'],
            [/[0-7]+[oq]/, 'number.octal'],
            // Decimal
            [/[0-9]+/, 'number'],

            // Strings and characters. NASM reads a quoted string as it is written, a backslash
            // included (`"C:\"`), and escapes only in a backquoted one (`` `hi\n` ``). One left
            // open runs to the end of its line.
            [/"[^"]*"?/, 'string'],
            [/'[^']*'?/, 'string'],
            [/`/, { token: 'string', next: '@string_bq' }]
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/;.*$/, 'comment']
        ],

        string_bq: [
            [/^/, { token: '', next: '@pop' }],
            [/[^\\`]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/`/, { token: 'string', next: '@pop' }]
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
