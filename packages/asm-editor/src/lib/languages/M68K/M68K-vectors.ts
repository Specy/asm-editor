/**
 * The 68000's exception vectors, `$000` to `$3FF`: 256 long words, each the address of the handler
 * the processor jumps to for one exception. Named here as the memory view, the History and the Call
 * stack name them ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 28
 * and 31).
 */

/** One past the last byte of the vector table. */
export const M68K_VECTOR_TABLE_END = 0x400

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
    15: 'Uninitialized interrupt',
    24: 'Spurious interrupt'
}

/**
 * What vector `vector` is for, as a learner reads it: `Divide by zero`, `Level 2 autovector`,
 * `TRAP #3`, `Reserved vector 12`, `User vector 64`. Each name is unique, so the memory view's
 * address input can take it as a label.
 */
export function m68kVectorName(vector: number): string {
    const named = NAMED[vector]
    if (named) return named
    if (vector >= 25 && vector <= 31) return `Level ${vector - 24} autovector`
    if (vector >= 32 && vector <= 47) return `TRAP #${vector - 32}`
    if (vector >= M68K_FIRST_USER_VECTOR) return `User vector ${vector}`
    return `Reserved vector ${vector}`
}

/** Where vector `vector` is, as the Log writes it: `$000014` for vector 5. */
export function m68kVectorAddress(vector: number): string {
    return `$${(vector * 4).toString(16).toUpperCase().padStart(6, '0')}`
}
