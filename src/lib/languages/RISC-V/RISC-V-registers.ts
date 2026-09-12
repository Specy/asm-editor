import { RISCV_REGISTERS, type RegisterName } from '@specy/risc-v'

export type RISCVRegisterName = RegisterName | 'pc'

export const RISCVRegisterNames: readonly RISCVRegisterName[] = [...RISCV_REGISTERS, 'pc']

export const ALTERNATIVE_RISCVRegister_NAMES = RISCV_REGISTERS.map((_, index) => `x${index}`)

export const RISCVLanguageRegisterNames: readonly string[] = [
    ...RISCV_REGISTERS,
    ...ALTERNATIVE_RISCVRegister_NAMES
]
