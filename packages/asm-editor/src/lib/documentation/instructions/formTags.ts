import type { InstructionForm as S68kInstructionForm } from '@specy/s68k'
import type { MIPSInstruction } from '#lib/languages/MIPS/MIPS-documentation.ts'
import type { RISCVInstruction } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import type { X86InstructionForm } from '#lib/languages/X86/X86-documentation.ts'
import type { Z80InstructionVariant } from '#lib/languages/Z80/Z80-documentation.ts'
import type { InstructionTag } from './categories'

/**
 * The **Instruction tags** of one **Instruction form**, per language, read from what its Core says
 * about the form ([ADR 0051](../../../../../../docs/adr/0051-instruction-categories-in-the-editor-tags-from-the-core.md)).
 * Each data module's form carries the facts; these turn them into tags, in the shared list's order.
 *
 * They sit here rather than beside the data because the data modules read their Cores when they
 * load (`MIPS.getInstructionSet()`, `S68k.instructionTable()`): a view or a hover can import these
 * without loading a Core.
 */

export function mipsFormTags(form: Pick<MIPSInstruction, 'isPseudo'>): InstructionTag[] {
    return form.isPseudo ? ['pseudo'] : []
}

export function riscvFormTags(
    form: Pick<RISCVInstruction, 'isPseudo' | 'isRv64Only'>
): InstructionTag[] {
    const tags: InstructionTag[] = []
    if (form.isPseudo) tags.push('pseudo')
    if (form.isRv64Only) tags.push('rv64-only')
    return tags
}

/** From NASM's own flags: `UNDOC` and `PRIV`. */
export function x86FormTags(form: Pick<X86InstructionForm, 'notes'>): InstructionTag[] {
    const tags: InstructionTag[] = []
    if (form.notes.includes('UNDOC')) tags.push('undocumented')
    if (form.notes.includes('PRIV')) tags.push('privileged')
    return tags
}

/**
 * A pseudo spelling of an undocumented opcode has both: `add ixh` is the assembler's short form of
 * `add a,ixh`, which Zilog's manual leaves out.
 */
export function z80FormTags(
    variant: Pick<Z80InstructionVariant, 'isPseudo' | 'undocumented'>
): InstructionTag[] {
    const tags: InstructionTag[] = []
    if (variant.isPseudo) tags.push('pseudo')
    if (variant.undocumented) tags.push('undocumented')
    return tags
}

/**
 * Privileged is the 68000's rule, which s68k enforces: in user mode the form raises a privilege
 * violation. A form a later processor brought is tagged with that processor, the 68010 or the
 * 68020, which a program chooses with `opt p=`
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3). A bit field, the
 * form whose operand takes `{offset:width}`, is tagged `opt-bit` too: EASy68K's `opt bit` gives it
 * to a program for the 68000 or the 68010.
 */
export function m68kFormTags(
    form: Pick<S68kInstructionForm, 'privileged' | 'processor' | 'operands'>
): InstructionTag[] {
    const tags: InstructionTag[] = []
    if (form.privileged) tags.push('privileged')
    if (form.processor !== '68000') tags.push(form.processor)
    if (isM68kBitFieldForm(form)) tags.push('opt-bit')
    return tags
}

/** How s68k's table names the bit field an operand position takes. */
export const M68K_BIT_FIELD_MODE = '{offset:width}'

/** Whether a form is one of the bit fields, which `opt bit` gives an earlier processor. */
export function isM68kBitFieldForm(form: Pick<S68kInstructionForm, 'operands'>): boolean {
    return form.operands.some((modes) => modes.includes(M68K_BIT_FIELD_MODE))
}
