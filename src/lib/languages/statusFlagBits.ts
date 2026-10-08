import type { AvailableLanguages } from '$lib/Project.svelte'
import { Z80_FLAGS } from './Z80/Z80-model'

/**
 * Where each status flag sits in the word a step records as `old_ccr`/`new_ccr`, listed in the
 * order the Target's emulator lists its status registers. Each Core reports its own register:
 * s68k reports the CCR one bit up (C at bit 1 through X at bit 5, as its `Flag` enum says), x86
 * reports EFLAGS, and Z80 reports F. MIPS and RISC-V have no status flags.
 */
const STATUS_FLAG_BITS: Record<AvailableLanguages, readonly number[]> = {
    // X N Z V C
    M68K: [5, 4, 3, 2, 1],
    // CF PF AF ZF SF TF DF OF
    X86: [0, 2, 4, 6, 7, 8, 10, 11],
    Z80: Z80_FLAGS.map((flag) => flag.bit),
    MIPS: [],
    'RISC-V': [],
    'RISC-V-64': []
}

/** Which of the Target's status flags are set in a recorded status word, in status-register order. */
export function statusFlagsFromBits(language: AvailableLanguages, bits: number): boolean[] {
    return STATUS_FLAG_BITS[language].map((bit) => ((bits >>> bit) & 1) === 1)
}
