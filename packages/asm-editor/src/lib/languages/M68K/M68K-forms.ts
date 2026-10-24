import { S68k, type InstructionForm } from '@specy/s68k'
import type { InstructionDocumentation } from './M68K-documentation'

/**
 * The **Instruction forms** of the M68K's documented instructions, from s68k's own instruction
 * table ([ADR 0051](../../../../../../docs/adr/0051-instruction-categories-in-the-editor-tags-from-the-core.md)):
 * per form, the addressing modes of each operand, the sizes, and whether the 68000 reserves it for
 * supervisor mode. The hand-written Documentation keeps one merged mode list per operand; this is
 * the list of forms beside it.
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
