import type { InstructionReference } from '../instructions/document'
import {
    RISCV_MANUAL_LINKS,
    RISCV_MANUAL_URL
} from '#lib/languages/RISC-V/generated/riscvManual.ts'

/**
 * Where the RISC-V ISA manual defines a mnemonic, named for the instruction it describes there:
 * "RISC-V manual: add" on `add`'s page and on `mv`'s, which becomes an `add`. None for `uret`,
 * which the manual no longer has.
 */
export function riscvManualReference(mnemonic: string): InstructionReference | undefined {
    const link = RISCV_MANUAL_LINKS[mnemonic.toLowerCase()]
    if (!link) return undefined
    return {
        label: `RISC-V manual: ${link.instruction}`,
        href: `${RISCV_MANUAL_URL}${link.page}.html${link.anchor ? `#${link.anchor}` : ''}`
    }
}
