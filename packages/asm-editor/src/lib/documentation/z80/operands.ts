/**
 * What each operand symbol of a Z80 Form pattern stands for, in the notation of Zilog's manual
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 7, and
 * [the plan](../../../../../../docs/design/instruction-layout-plan.md), decision 17). One line of
 * markdown each; a page's Operands legend shows the ones its rows use. `{members}` stands for the
 * members the page's rows take, which the adapter fills in: `push` takes `af` where `ld` takes `sp`.
 */

export type Z80OperandLine = {
    meaning: string
    /** The symbol's own entry in the Registers & Flags Chapter, where there is one. */
    href?: string
}

const REGISTERS = '/documentation/z80/registers'

export const Z80_OPERAND_LINES: Record<string, Z80OperandLine> = {
    r: { meaning: 'An 8-bit register: {members}.' },
    "r'": { meaning: 'An 8-bit register: {members}. It may be the same register as `r`.' },
    rr: { meaning: 'A register pair: {members}.' },
    "rr'": { meaning: 'A register pair: {members}. It may be the same pair as `rr`.' },
    ix: {
        meaning:
            'The `ix` index register. You can also use `iy`, with the same instruction size and timing.',
        href: `${REGISTERS}#register-ix`
    },
    '(ix+dd)': {
        meaning:
            'The byte in memory at `ix + dd`, where `dd` is a signed displacement from `-128` to `127`, for example `(ix+5)` or `(ix-3)`. `(iy+dd)` works the same way.',
        href: `${REGISTERS}#operand-ix-dd`
    },
    'ixh/l': {
        meaning: 'The high or low byte of `ix`: `ixh` or `ixl`. For `iy`, use `iyh` or `iyl`.',
        href: `${REGISTERS}#register-ixh`
    },
    "ixh/l'": {
        meaning:
            'Choose `ixh` or `ixl` again; the same half may be used twice. If the other operand uses `iyh` or `iyl`, choose from `iyh` or `iyl` here too.'
    },
    '(hl)': {
        meaning: 'The byte in memory at the address stored in `hl`.',
        href: `${REGISTERS}#operand-hl`
    },
    nn: {
        meaning:
            'An 8-bit immediate value, `0` to `255` or `-128` to `127`, written as a number, character constant or symbol.',
        href: `${REGISTERS}#operand-nn`
    },
    nnnn: {
        meaning:
            'A 16-bit value or address, `0` to `65535`, written as a number or label. `(nnnn)` accesses memory at that address.',
        href: `${REGISTERS}#operand-nnnn`
    },
    offset: {
        meaning:
            'A relative-jump target, written as a label or address. The assembler calculates the displacement, `-128` to `127`, and reports an error if the target is out of range.',
        href: `${REGISTERS}#operand-offset`
    },
    cc: {
        meaning: 'A flag condition: {members}.',
        href: `${REGISTERS}#operand-cc`
    },
    b: { meaning: 'A bit number from `0` to `7`, where bit `0` is the least significant bit.' }
}

/** What each condition code tests, for the `cc` line. */
export const Z80_CONDITION_MEANINGS: Record<string, string> = {
    nz: 'zero flag clear, `Z = 0`',
    z: 'zero flag set, `Z = 1`',
    nc: 'carry flag clear, `C = 0`',
    c: 'carry flag set, `C = 1`',
    po: 'parity/overflow flag clear, `P/V = 0`',
    pe: 'parity/overflow flag set, `P/V = 1`',
    p: 'sign flag clear, `S = 0`',
    m: 'sign flag set, `S = 1`',
    nv: 'alias for `po`, `P/V = 0`',
    v: 'alias for `pe`, `P/V = 1`'
}

/** Said on the `cc` line of a page whose rows take the condition `c`. */
export const Z80_CARRY_CONDITION_NOTE =
    'Here `c` tests the carry flag; it does not name the `c` register.'

/** Said on the `r` line of the `ld` page, which also loads the refresh register. */
export const Z80_REFRESH_REGISTER_NOTE =
    'The placeholder `r` stands for an 8-bit register. In `ld a, r` and `ld r, a`, the literal `r` names the refresh register.'
