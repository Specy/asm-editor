import type { RegisterName } from '@specy/mips'

export const MIPSNumericRegisterNames: readonly RegisterName[] = [
    '$zero',
    '$at',
    '$v0',
    '$v1',
    '$a0',
    '$a1',
    '$a2',
    '$a3',
    '$t0',
    '$t1',
    '$t2',
    '$t3',
    '$t4',
    '$t5',
    '$t6',
    '$t7',
    '$s0',
    '$s1',
    '$s2',
    '$s3',
    '$s4',
    '$s5',
    '$s6',
    '$s7',
    '$t8',
    '$t9',
    '$k0',
    '$k1',
    '$gp',
    '$sp',
    '$fp',
    '$ra'
]

export type MIPSRegisterName = RegisterName | 'pc' | 'hi' | 'lo'

export const MIPSRegisterNames: readonly MIPSRegisterName[] = [
    ...MIPSNumericRegisterNames,
    'pc',
    'hi',
    'lo'
]

/**
 * The FPU register file, `$f0` to `$f31` in register-number order, which is the order
 * `getCoprocessor1Values` returns them in.
 */
export const MIPSCoprocessor1RegisterNames: readonly string[] = Array.from(
    { length: 32 },
    (_, index) => `$f${index}`
)

/**
 * The four coprocessor 0 registers MARS implements, in the order `getCoprocessor0Values` returns
 * them, spelled as MARS's Coproc 0 tab spells them. The register's MIPS number is part of its name
 * because coprocessor 0 is sparse: the number is not the position in the file, and the setter takes
 * the number, so `MIPS_COPROCESSOR0_REGISTER_NUMBERS` holds the same order.
 */
export const MIPSCoprocessor0RegisterNames: readonly string[] = [
    '$8 (vaddr)',
    '$12 (status)',
    '$13 (cause)',
    '$14 (epc)'
]
