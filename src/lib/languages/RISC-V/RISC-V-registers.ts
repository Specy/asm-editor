import {
    type CsrRegisterName,
    type FloatingPointRegisterName,
    type RegisterName,
    RISCV_CSR_REGISTERS,
    RISCV_FLOATING_POINT_REGISTERS,
    RISCV_REGISTERS
} from '@specy/risc-v'

export type RISCVRegisterName = RegisterName | 'pc'

export const RISCVRegisterNames: readonly RISCVRegisterName[] = [...RISCV_REGISTERS, 'pc']

export const ALTERNATIVE_RISCVRegister_NAMES = RISCV_REGISTERS.map((_, index) => `x${index}`)

export const RISCVLanguageRegisterNames: readonly string[] = [
    ...RISCV_REGISTERS,
    ...ALTERNATIVE_RISCVRegister_NAMES
]

export type RISCVFloatingPointRegisterName = FloatingPointRegisterName
export type RISCVCsrRegisterName = CsrRegisterName

/**
 * The FPU Register file, in the order the Core reads and writes it, which is register number order
 * `f0..f31` spelled as RARS spells the registers.
 */
export const RISCVFloatingPointRegisterNames: readonly RISCVFloatingPointRegisterName[] =
    RISCV_FLOATING_POINT_REGISTERS

/** The CSR Register file, in the order the Core reads and writes it. */
export const RISCVCsrRegisterNames: readonly RISCVCsrRegisterName[] = RISCV_CSR_REGISTERS

/**
 * The CSR number RARS gives each register of the CSR file, in the same order as the names above.
 * These are the architectural addresses the `csrr*` instructions take, which
 * `ControlAndStatusRegisterFile` builds its block from, and they are sparse: a backstep entry for a
 * CSR write names the register it restores by this number and not by its position in the file
 * (`ControlAndStatusRegisterFile.updateRegister` hands the CSR number the instruction named to
 * `BackStepper.addControlAndStatusRestore`), so the undo history has to come back through it.
 */
const RISCV_CSR_NUMBERS: readonly number[] = [
    0x000, // ustatus
    0x001, // fflags
    0x002, // frm
    0x003, // fcsr
    0x004, // uie
    0x005, // utvec
    0x040, // uscratch
    0x041, // uepc
    0x042, // ucause
    0x043, // utval
    0x044, // uip
    0xc00, // cycle
    0xc01, // time
    0xc02, // instret
    0xc80, // cycleh
    0xc81, // timeh
    0xc82 // instreth
]

/** The name of the CSR with that number, or nothing for a number the file does not hold. */
export function riscvCsrRegisterName(csrNumber: number): RISCVCsrRegisterName | undefined {
    //seventeen entries scanned while rendering an undo entry, which is cheaper than the map an
    //adapter would otherwise keep alive for the whole session
    const index = RISCV_CSR_NUMBERS.indexOf(csrNumber)
    return index === -1 ? undefined : RISCVCsrRegisterNames[index]
}
