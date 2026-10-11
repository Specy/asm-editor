import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { ASSEMBLY_TOKEN_COLORS, type AssemblyThemeToken } from '#lib/monaco/assemblyTokenColors.ts'
import type { AssemblyToken } from './assemblyHighlight'

/** `--asm-<token>` per editor token, the custom properties a code block's spans are painted by. */
export function assemblyPaletteStyle(isDark: boolean): string {
    return Object.entries(ASSEMBLY_TOKEN_COLORS[isDark ? 'dark' : 'light'])
        .map(([token, color]) => `--asm-${cssName(token)}: ${color}`)
        .join('; ')
}

/** `a0`..`a7` and `sp`, which the M68K grammar colours apart from the data registers. */
const M68K_ADDRESS_REGISTER = /^(?:a[0-7]|sp)(?:\.[bwl])?$/i
const M68K_DATA_REGISTER = /^d[0-7](?:\.[bwl])?$/i
/** `0x1F`, `$1F` and `1Fh`, after an immediate's `#`. */
const HEX_LITERAL = /^#?(?:0x|\$|[0-9][0-9a-f]*h$)/i

/**
 * The token the language's own grammar gives this piece of a code block, so the block is painted
 * as the editor paints it. The grammars do not agree with one another: M68K splits its registers
 * in two and leaves `pc` and `sr` uncoloured, calls its `$1F` a plain number where the others have
 * a hex one, and only M68K and Z80 underline labels while x86 paints them as tags, and only with
 * their colon: a name given a value (`COUNT equ 5`) stays plain there.
 */
export function assemblyTokenOf(
    token: AssemblyToken,
    language: AvailableLanguages
): AssemblyThemeToken | 'label' | undefined {
    switch (token.kind) {
        case 'comment':
        case 'string':
        case 'directive':
        case 'condition':
        case 'keyword':
            return token.kind
        case 'mnemonic':
            return 'keyword'
        case 'immediate':
            return 'number.immediate'
        case 'register':
            if (language !== 'M68K') return 'variable.predefined'
            if (M68K_ADDRESS_REGISTER.test(token.text)) return 'address-register'
            return M68K_DATA_REGISTER.test(token.text) ? 'data-register' : undefined
        case 'number':
            return language !== 'M68K' && HEX_LITERAL.test(token.text) ? 'number.hex' : 'number'
        case 'label':
            if (language === 'X86') return token.text.endsWith(':') ? 'tag' : undefined
            return language === 'M68K' || language === 'Z80' ? 'label' : undefined
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

const cssName = (token: string) => token.replace('.', '-')
