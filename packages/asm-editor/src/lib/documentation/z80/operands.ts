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
    r: { meaning: 'Any 8-bit register: {members}.' },
    "r'": { meaning: 'A second 8-bit register, picked independently of `r`: {members}.' },
    rr: { meaning: 'A register pair: {members}.' },
    "rr'": { meaning: 'A second register pair, picked independently of `rr`: {members}.' },
    ix: {
        meaning:
            'The index register `ix`. Every form works the same way with `iy`, at the same size and speed: write `iy` where the row has `ix`.',
        href: `${REGISTERS}#register-ix`
    },
    '(ix+dd)': {
        meaning:
            'The byte in memory at `ix` plus `dd`, a signed displacement from -128 to 127, written `(ix+5)` or `(ix-3)`. `(iy+dd)` works the same way.',
        href: `${REGISTERS}#operand-ix-dd`
    },
    'ixh/l': {
        meaning:
            'The high or the low byte of `ix`: `ixh` or `ixl`. `iyh` and `iyl` work the same way with `iy`.',
        href: `${REGISTERS}#register-ixh`
    },
    "ixh/l'": {
        meaning: 'A second half of the same index register, picked independently of `ixh/l`.'
    },
    '(hl)': {
        meaning:
            'The byte in memory at the address in `hl`. It goes where an 8-bit register goes, at the cost of one more memory access.',
        href: `${REGISTERS}#operand-hl`
    },
    nn: {
        meaning:
            'An 8-bit value, 0 to 255 or -128 to 127: a number, a character constant or a symbol.',
        href: `${REGISTERS}#operand-nn`
    },
    nnnn: {
        meaning:
            'A 16-bit value or address, 0 to 65535, such as a label. In parentheses, `(nnnn)` is the memory at that address.',
        href: `${REGISTERS}#operand-nnnn`
    },
    offset: {
        meaning:
            'The target of a relative jump: a label or an address. The assembler works out the displacement, -128 to 127, and reports an error when the target is out of reach.',
        href: `${REGISTERS}#operand-offset`
    },
    cc: {
        meaning: 'A condition on the flags: {members}.',
        href: `${REGISTERS}#operand-cc`
    },
    b: { meaning: 'A bit number, 0 to 7; bit 0 is the lowest.' }
}

/** What each condition code tests, for the `cc` line. */
export const Z80_CONDITION_MEANINGS: Record<string, string> = {
    nz: 'Z is 0',
    z: 'Z is 1',
    nc: 'C is 0',
    c: 'C is 1',
    po: 'P/V is 0',
    pe: 'P/V is 1',
    p: 'S is 0',
    m: 'S is 1',
    nv: 'another name for `po`',
    v: 'another name for `pe`'
}

/** Said on the `cc` line of a page whose rows take the condition `c`. */
export const Z80_CARRY_CONDITION_NOTE = 'Here `c` is the carry condition, not the register.'

/** Said on the `r` line of the `ld` page, which also loads the refresh register. */
export const Z80_REFRESH_REGISTER_NOTE =
    'Not the refresh register `r` of `ld a, r` and `ld r, a`, which is spelled the same.'
