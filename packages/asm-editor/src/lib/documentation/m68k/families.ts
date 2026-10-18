import { instructionsDocumentationList } from '#lib/languages/M68K/M68K-documentation.ts'
import type { InstructionCategory } from '../instructions/categories'
import { m68kInstructionCategories } from './categories'

/**
 * The M68K Documentation writes a family of mnemonics as one entry (`bcc` for `beq`, `bne`…; `asd`
 * for `asl` and `asr`), while the documentation site gives every member a page and a line in the
 * sidebar. A member takes its family's **Instruction category**
 * ([the plan](../../../../../../docs/design/instruction-categories-plan.md), decision 5).
 */

const entryNames = new Set(instructionsDocumentationList.map((instruction) => instruction.name))

const familyOfMember = new Map<string, string>()
for (const instruction of instructionsDocumentationList) {
    for (const member of instruction.compundNames ?? []) {
        if (!familyOfMember.has(member)) familyOfMember.set(member, instruction.name)
    }
}

/** The entry a mnemonic is documented under: its own, else its family's. */
export function m68kEntryName(name: string): string | undefined {
    return entryNames.has(name) ? name : familyOfMember.get(name)
}

/** A mnemonic's category, a family member's being its family's. */
export function m68kInstructionCategory(name: string): InstructionCategory | undefined {
    const entry = m68kEntryName(name)
    return entry === undefined ? undefined : m68kInstructionCategories[entry]
}
