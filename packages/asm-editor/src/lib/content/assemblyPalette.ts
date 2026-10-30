import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import {
    ASSEMBLY_BRACKET_COLORS,
    ASSEMBLY_TOKEN_COLORS,
    type AssemblyThemeToken
} from '#lib/monaco/assemblyTokenColors.ts'
import type { AssemblyToken } from './assemblyHighlight'
import type { CppToken } from './cppHighlight'

/** `--asm-<token>` per editor token and bracket level, the properties a code block is painted by. */
export function assemblyPaletteStyle(isDark: boolean): string {
    const theme = isDark ? 'dark' : 'light'
    const brackets = ASSEMBLY_BRACKET_COLORS[theme]
    return [
        ...Object.entries(ASSEMBLY_TOKEN_COLORS[theme]).map(
            ([token, color]) => `--asm-${cssName(token)}: ${color}`
        ),
        ...brackets.levels.map((color, level) => `--asm-bracket-${level + 1}: ${color}`),
        `--asm-bracket-unexpected: ${brackets.unexpected}`
    ].join('; ')
}

/** A bracket's colour, by its nesting level as the editor cycles through three. */
export type AssemblyBracketPaint = 'bracket-1' | 'bracket-2' | 'bracket-3' | 'bracket-unexpected'

const bracketPaint = (level: number | undefined): AssemblyBracketPaint =>
    level === undefined
        ? 'bracket-unexpected'
        : (`bracket-${(level % 3) + 1}` as AssemblyBracketPaint)

/**
 * `a0`..`a7` and `sp`, which the M68K grammar colours apart from the data registers, and the
 * 68020's suppressed `za0` and `zd0` as the registers they leave out.
 */
const M68K_ADDRESS_REGISTER = /^(?:z?a[0-7]|sp)$/i
const M68K_DATA_REGISTER = /^z?d[0-7]$/i
/** `0x1F`, `$1F` and `1Fh`, after an immediate's `#`; the M68K writes hex with `$` alone. */
const HEX_LITERAL = /^#?(?:0x|\$|[0-9][0-9a-f]*h$)/i
const M68K_HEX_LITERAL = /^#?\$/

/**
 * The token the language's own grammar gives this piece of a code block, so the block is painted
 * as the editor paints it. The grammars agree on all but the M68K's registers, which it splits in
 * two, and on what a hex literal looks like.
 */
export function assemblyTokenOf(
    token: AssemblyToken,
    language: AvailableLanguages
): AssemblyThemeToken | 'label' | AssemblyBracketPaint | undefined {
    switch (token.kind) {
        case 'comment':
        case 'string':
        case 'directive':
        case 'condition':
        case 'keyword':
        case 'invalid':
        case 'label':
            return token.kind
        case 'mnemonic':
            return 'keyword'
        case 'size':
            return 'keyword.size'
        case 'immediate':
            return 'number.immediate'
        case 'register':
            if (language !== 'M68K') return 'variable.predefined'
            if (M68K_ADDRESS_REGISTER.test(token.text)) return 'address-register'
            return M68K_DATA_REGISTER.test(token.text) ? 'data-register' : 'variable.predefined'
        case 'number':
            return (language === 'M68K' ? M68K_HEX_LITERAL : HEX_LITERAL).test(token.text)
                ? 'number.hex'
                : 'number'
        case 'bracket':
            return bracketPaint(token.level)
        default:
            return undefined
    }
}

/** The class of a code block's span, which `codeBlocks.css` paints; none for plain text. */
export function assemblyTokenClass(
    token: AssemblyToken,
    language: AvailableLanguages
): string | undefined {
    const editorToken = assemblyTokenOf(token, language)
    return editorToken && `asm-${cssName(editorToken)}`
}

/**
 * The token a piece of a C or C++ code block is painted as, from what the editor was measured to
 * paint each of its grammar's tokens with: every keyword alike, a string with its escapes, valid or
 * not, and an included path alike, every number but a hex one alike, a documentation comment as a
 * comment. Names, operators and punctuation are the editor's text, as plain text is.
 */
export function cppTokenOf(token: CppToken): AssemblyThemeToken | AssemblyBracketPaint | undefined {
    switch (token.kind) {
        case 'comment':
        case 'doc-comment':
            return 'comment'
        case 'string':
        case 'escape':
        case 'invalid-escape':
        case 'invalid-string':
            return 'string'
        case 'keyword':
        case 'directive':
        case 'annotation':
            return token.kind
        case 'number':
        case 'float':
        case 'octal':
        case 'binary':
            return 'number'
        case 'hex':
            return 'number.hex'
        case 'bracket':
            return bracketPaint(token.level)
        default:
            return undefined
    }
}

/** The class of a C or C++ block's span, which `codeBlocks.css` paints; none for plain text. */
export function cppTokenClass(token: CppToken): string | undefined {
    const editorToken = cppTokenOf(token)
    return editorToken && `asm-${cssName(editorToken)}`
}

const cssName = (token: string) => token.replace('.', '-')
