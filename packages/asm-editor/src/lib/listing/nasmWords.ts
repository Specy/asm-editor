import { X86_ASSEMBLER_REGISTERS } from '#lib/languages/X86/generated/x86Tokens.ts'

/**
 * The words NASM reads in an instruction's operands that are no names, in one place for the two
 * that must agree on them: the Patch prompt never looks one up as a label (`patchResolver.ts`),
 * and a person's name for a label or a variable is never one (`names.ts`,
 * [annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 7),
 * so that every name the Listing writes can be typed back. Both sets are in lower case: NASM reads
 * these words in any case.
 */

/**
 * Every register NASM names, its own list (`x86Tokens.ts`), and the spellings it reads beside
 * those: the instruction pointer as the disassembler writes it (`rip`, `eip`, `ip`), `st` alone
 * for the top of the x87 stack, and `r8l` to `r15l` for the low bytes `r8b` to `r15b`.
 */
export const NASM_REGISTERS: ReadonlySet<string> = new Set([
    ...X86_ASSEMBLER_REGISTERS,
    'rip',
    'eip',
    'ip',
    'st',
    ...Array.from({ length: 8 }, (_, index) => `r${index + 8}l`)
])

/**
 * NASM's words in an operand besides registers: the sizes, `ptr`, the addressing words (`rel`,
 * `abs`, `nosplit`), the jump distances, `strict`, `seg` and `wrt`, and `to`, as in `fadd to st1`.
 */
export const NASM_OPERAND_WORDS: ReadonlySet<string> = new Set([
    'byte',
    'word',
    'dword',
    'qword',
    'tword',
    'oword',
    'yword',
    'zword',
    'ptr',
    'rel',
    'abs',
    'nosplit',
    'short',
    'near',
    'far',
    'strict',
    'seg',
    'wrt',
    'to'
])
