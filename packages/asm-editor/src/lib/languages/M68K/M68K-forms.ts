import { S68k, type InstructionForm, type Processor } from '@specy/s68k'
import type { InstructionDocumentation } from './M68K-documentation'
import { isM68kBitFieldForm } from '#lib/documentation/instructions/formTags.ts'
import { M68K_PROCESSORS, m68kFormShown, type M68kDialect } from './m68kDialect'

/**
 * The **Instruction forms** of the M68K's documented instructions, from s68k's own instruction
 * table ([ADR 0051](../../../../../../docs/adr/0051-instruction-categories-in-the-editor-tags-from-the-core.md)):
 * per form, the addressing modes of each operand, the sizes, whether the 68000 reserves it for
 * supervisor mode, and the first processor that has it. The hand-written Documentation keeps one
 * merged mode list per operand; this is the list of forms beside it.
 *
 * Kept apart from `M68K-documentation.ts`, which the hovers, the grammar and the language detector
 * import, so that only what lists forms loads the Core. s68k instantiates its WebAssembly as its
 * module loads, so once imported the table reads synchronously: in the browser, in the node tests
 * and while prerendering alike.
 */

export type M68KInstructionForm = InstructionForm

let table: Map<string, InstructionForm[]> | undefined

function formsByMnemonic(): Map<string, InstructionForm[]> {
    table ??= new Map(S68k.instructionTable().map(({ mnemonic, forms }) => [mnemonic, forms]))
    return table
}

/**
 * The forms of a Documentation entry. A family (`bcc`, `asd`) is written in its members' own
 * spellings, which share one set of forms, so its forms are its first member's; any other entry's
 * are its mnemonic's. Empty for a name s68k does not assemble.
 */
export function m68kInstructionForms(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>
): M68KInstructionForm[] {
    const forms = formsByMnemonic()
    const member = (instruction.compundNames ?? [instruction.name]).find((name) => forms.has(name))
    return member ? forms.get(member)! : []
}

/**
 * The first processor that has an instruction in any form: the 68000 for nearly all of them, the
 * 68020 for `extb`, whose every form it brought. `move` is the 68000's, though its `ccr,<ea>` form
 * came with the 68010. The 68000 too for a name s68k lists no forms of.
 */
export function m68kFirstProcessor(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>
): Processor {
    const forms = m68kInstructionForms(instruction)
    if (forms.length === 0) return '68000'
    return forms
        .map((form) => form.processor)
        .reduce((first, processor) =>
            M68K_PROCESSORS.indexOf(processor) < M68K_PROCESSORS.indexOf(first) ? processor : first
        )
}

/**
 * Whether an instruction is one of the 68020's bit fields in every form, `bfextu`: those EASy68K's
 * `opt bit` gives a program for the 68000 or the 68010 as well.
 */
export function m68kIsBitField(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>
): boolean {
    const forms = m68kInstructionForms(instruction)
    return forms.length > 0 && forms.every(isM68kBitFieldForm)
}

/**
 * Whether a program written for `dialect` can write an instruction in some form: not `extb` in a
 * 68000 program, and a bit field only under `opt bit` or `opt p=68020`. A name s68k lists no forms
 * of, a directive's, is always there.
 */
export function m68kInstructionShown(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>,
    dialect: M68kDialect
): boolean {
    const forms = m68kInstructionForms(instruction)
    return forms.length === 0 || forms.some((form) => m68kFormShown(form, dialect))
}

/** An instruction's forms a program written for `dialect` cannot write, and those it can. */
function formsFor(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>,
    dialect: M68kDialect
) {
    const forms = m68kInstructionForms(instruction)
    return {
        shown: forms.filter((form) => m68kFormShown(form, dialect)),
        hidden: forms.filter((form) => !m68kFormShown(form, dialect))
    }
}

/**
 * The sizes of an instruction only its forms a program written for `dialect` cannot write take:
 * `.l` of `chk` in a 68000 program, which the 68020 brought. A size no form names is not one.
 */
export function m68kHiddenSizes(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>,
    dialect: M68kDialect
): Set<InstructionForm['sizes'][number]> {
    const { shown, hidden } = formsFor(instruction, dialect)
    const kept = new Set(shown.flatMap((form) => form.sizes))
    return new Set(hidden.flatMap((form) => form.sizes).filter((size) => !kept.has(size)))
}

/**
 * The modes at an operand position only an instruction's forms a program written for `dialect`
 * cannot write take, by s68k's names: `ccr` as `move`'s source in a 68000 program, which the
 * 68010's `move ccr,<ea>` brought, and every mode of `movec` there.
 */
export function m68kHiddenModes(
    instruction: Pick<InstructionDocumentation, 'name' | 'compundNames'>,
    position: number,
    dialect: M68kDialect
): Set<string> {
    const { shown, hidden } = formsFor(instruction, dialect)
    const at = (forms: M68KInstructionForm[]) =>
        forms.flatMap((form) => form.operands[position] ?? [])
    const kept = new Set(at(shown))
    return new Set(at(hidden).filter((mode) => !kept.has(mode)))
}
