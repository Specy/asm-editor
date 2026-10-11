import {
    X86_ADDRESS_KEYWORDS,
    X86_DIRECTIVES,
    X86_PREFIXES,
    X86_PREPROCESSOR_DIRECTIVES,
    X86_PSEUDO_OPS,
    X86_SIZE_SPECIFIERS,
    X86_STANDARD_MACROS
} from './generated/x86Tokens'

/**
 * The x86 words that are neither instructions nor registers, in a module of their own, away from
 * the grammar's mnemonic list, so the code blocks that colour x86 the way the editor does can read
 * them without loading every instruction.
 */

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

/** What can stand before an instruction on its line: `rep movsb`, `lock add`. */
export const X86Prefixes = X86_PREFIXES
