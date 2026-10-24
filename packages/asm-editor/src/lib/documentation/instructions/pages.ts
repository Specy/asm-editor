import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
import { mipsInstructionMap } from '#lib/languages/MIPS/MIPS-documentation.ts'
import { riscvInstructionMap } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { x86DocumentedNames } from '#lib/languages/X86/X86-documentation.ts'
import { z80InstructionMap } from '#lib/languages/Z80/Z80-documentation.ts'
import type { DocumentationLanguage } from '#lib/search/scope.ts'

/**
 * The mnemonics that have a page of their own under `/documentation/<language>/instruction`, read
 * from the same maps the pages load, so nothing that links to one can name a page that does not
 * exist. x86 has a page per documented instruction rather than per accepted mnemonic: the vector
 * and system extensions are listed on the complete documentation page instead.
 */
export const INSTRUCTION_PAGES: Record<DocumentationLanguage, ReadonlySet<string>> = {
    m68k: new Set(M68KUncompoundedInstructions.keys()),
    mips: new Set(mipsInstructionMap.keys()),
    'risc-v': new Set(riscvInstructionMap.keys()),
    x86: new Set(x86DocumentedNames),
    z80: new Set(z80InstructionMap.keys())
}

export function instructionPathname(language: DocumentationLanguage, name: string): string {
    return `/documentation/${language}/instruction/${name}`
}
