import type { Processor } from '@specy/s68k'

/**
 * The 68000's exception vectors, `$000` to `$3FF`: 256 long words, each the address of the handler
 * the processor jumps to for one exception. From the 68010 on the table starts at the vector base
 * register, VBR, which is 0 until `movec` moves it. Named here as the memory view, the History and
 * the Call stack name them ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
 * decisions 3, 28 and 31).
 */

/** The size of the vector table, in bytes: 256 vectors of four. */
export const M68K_VECTOR_TABLE_SIZE = 0x400

/** The 68000's address bus has 24 bits: VBR plus a vector's offset wraps at 16 MB. */
const ADDRESS_SPACE = 0x100_0000

/** The first of the user vectors, which only vectored interrupts use, and EASy68K has none. */
export const M68K_FIRST_USER_VECTOR = 64

const NAMED: Record<number, string> = {
    0: 'Reset SSP',
    1: 'Reset PC',
    2: 'Bus error',
    3: 'Address error',
    4: 'Illegal instruction',
    5: 'Divide by zero',
    6: 'CHK',
    7: 'TRAPV',
    8: 'Privilege violation',
    9: 'Trace',
    10: 'Line A',
    11: 'Line F',
    14: 'Format error',
    15: 'Uninitialized interrupt',
    24: 'Spurious interrupt'
}

/**
 * What vector `vector` is for, as a learner reads it: `Divide by zero`, `Level 2 autovector`,
 * `TRAP #3`, `Reserved vector 12`, `User vector 64`. Each name is unique, so the memory view's
 * address input can take it as a label. Vector 14 is the 68010's format error, and reserved on a
 * 68000: `processor` is the program's, where the table names every vector, and left out where
 * the vector was taken, which a 68000 never does through 14.
 */
export function m68kVectorName(vector: number, processor?: Processor): string {
    const named = vector === 14 && processor === '68000' ? undefined : NAMED[vector]
    if (named) return named
    if (vector >= 25 && vector <= 31) return `Level ${vector - 24} autovector`
    if (vector >= 32 && vector <= 47) return `TRAP #${vector - 32}`
    if (vector >= M68K_FIRST_USER_VECTOR) return `User vector ${vector}`
    return `Reserved vector ${vector}`
}

/**
 * Where vector `vector` is: four bytes per vector from the table's start, `vbr`, on the 24-bit bus.
 */
export function m68kVectorLocation(vector: number, vbr = 0): number {
    return (vbr + vector * 4) % ADDRESS_SPACE
}

/** Where vector `vector` is, as the Log writes it: `$000014` for vector 5, `$008014` past VBR $8000. */
export function m68kVectorAddress(vector: number, vbr = 0): string {
    return `$${m68kVectorLocation(vector, vbr).toString(16).toUpperCase().padStart(6, '0')}`
}

/** Where the vector table starts on the 24-bit bus, VBR as the program set it. */
export function m68kVectorTableStart(vbr = 0): number {
    return vbr % ADDRESS_SPACE
}

/** The first autovector, which a level-1 IRQ goes through; level n goes through 24 + n. */
const FIRST_AUTOVECTOR = 25

/** The IRQ level an autovector takes, 1 to 7, or undefined for any other vector. */
export function m68kAutovectorLevel(vector: number): number | undefined {
    const level = vector - FIRST_AUTOVECTOR + 1
    return level >= 1 && level <= 7 ? level : undefined
}

/**
 * What an exception taken through `vector` is called in the History and the Call stack: an
 * autovector's is the IRQ it takes, `IRQ 2`, and every other one is its vector's name, `TRAP #3`
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 28).
 */
export function m68kExceptionName(vector: number): string {
    const level = m68kAutovectorLevel(vector)
    return level === undefined ? m68kVectorName(vector) : `IRQ ${level}`
}

/**
 * What a processor `stop` stopped waits for, from the mask in its status register's bits 8 to 10:
 * "an interrupt above level 3", and at mask 7, where only level 7 gets through, "a level-7
 * interrupt" ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 29).
 */
export function m68kInterruptAbove(mask: number): string {
    return mask >= 7 ? 'a level-7 interrupt' : `an interrupt above level ${mask}`
}

/** Whether an IRQ at `level` gets past the interrupt mask `mask`: above it, or level 7. */
export function m68kIrqGetsThrough(level: number, mask: number): boolean {
    return level === 7 || level > mask
}

/** The interrupt mask in a status register, its bits 8 to 10. */
export function m68kInterruptMask(sr: number): number {
    return (sr >> 8) & 7
}
