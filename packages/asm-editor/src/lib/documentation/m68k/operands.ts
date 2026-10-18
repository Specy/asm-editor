/**
 * The M68K's operand notation, in the 68000 manual's own spelling
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 7;
 * [the plan](../../../../../../docs/design/instruction-layout-plan.md), decision 18): how a page
 * writes each of s68k's addressing modes, the 68000's classes of them, and one legend line per
 * symbol, linked to the symbol's addressing-mode entry where there is one.
 */

const MODES = '/documentation/m68k/addressing-mode'

/**
 * s68k's name for each addressing mode and how the pages write it, in the manual's order: `Im` is
 * `#imm`, `Ea/<label>` is `abs` (an absolute address or a label).
 */
export const M68K_MODE_SYMBOLS: Readonly<Record<string, string>> = {
    Dn: 'Dn',
    An: 'An',
    '(An)': '(An)',
    '(An)+': '(An)+',
    '-(An)': '-(An)',
    'd(An)': 'd(An)',
    'd(An,Xn)': 'd(An,Xn)',
    'Ea/<label>': 'abs',
    'd(PC)': 'd(PC)',
    'd(PC,Xn)': 'd(PC,Xn)',
    Im: '#imm',
    '<register list>': '<register list>',
    sr: 'sr',
    ccr: 'ccr'
}

/** The modes in the manual's order, as the pages write them. */
export const M68K_MODE_ORDER: readonly string[] = Object.values(M68K_MODE_SYMBOLS)

const ALL_MODES = [
    'Dn',
    'An',
    '(An)',
    '(An)+',
    '-(An)',
    'd(An)',
    'd(An,Xn)',
    'abs',
    'd(PC)',
    'd(PC,Xn)',
    '#imm'
]

function allBut(...modes: string[]): string[] {
    return ALL_MODES.filter((mode) => !modes.includes(mode))
}

/**
 * The 68000's classes of effective addresses, each the exact set of modes it stands for: data is
 * every mode but `An`, memory every mode but the registers, control the modes that name a place
 * without changing a register, alterable the ones that can be written.
 */
export const M68K_MODE_CLASSES: readonly { name: string; modes: readonly string[] }[] = [
    { name: 'all modes', modes: ALL_MODES },
    { name: 'data', modes: allBut('An') },
    { name: 'memory', modes: allBut('Dn', 'An') },
    { name: 'control', modes: ['(An)', 'd(An)', 'd(An,Xn)', 'abs', 'd(PC)', 'd(PC,Xn)'] },
    { name: 'alterable', modes: allBut('d(PC)', 'd(PC,Xn)', '#imm') },
    { name: 'data alterable', modes: allBut('An', 'd(PC)', 'd(PC,Xn)', '#imm') },
    { name: 'memory alterable', modes: allBut('Dn', 'An', 'd(PC)', 'd(PC,Xn)', '#imm') }
]

/** The class a set of modes is, when it is exactly one of them. */
export function m68kModeClass(modes: readonly string[]): string | undefined {
    const own = new Set(modes)
    return M68K_MODE_CLASSES.find(
        (modeClass) =>
            modeClass.modes.length === own.size && modeClass.modes.every((mode) => own.has(mode))
    )?.name
}

export type M68KOperandLine = { meaning: string; href?: string }

/** What each symbol of an M68K row stands for: one line of markdown each. */
export const M68K_OPERAND_MEANINGS: Readonly<Record<string, M68KOperandLine>> = {
    '<ea>': {
        meaning:
            'An effective address: an operand in any of the addressing modes the row lists when it is opened, such as `d0`, `(a0)+` or `4(a1)`.',
        href: MODES
    },
    Dn: { meaning: 'A data register, `d0` to `d7`.', href: `${MODES}#direct` },
    An: {
        meaning: 'An address register, `a0` to `a7`; `sp` is another name for `a7`.',
        href: `${MODES}#direct`
    },
    '(An)': {
        meaning: 'The memory at the address an address register holds: `(a0)`.',
        href: `${MODES}#indirect`
    },
    '(An)+': {
        meaning:
            'The memory at the address an address register holds, which then grows by the size of the operation: `(a0)+`.',
        href: `${MODES}#indirect-post-pre-increment`
    },
    '-(An)': {
        meaning:
            'An address register shrunk first by the size of the operation, then the memory at its new address: `-(sp)`.',
        href: `${MODES}#indirect-post-pre-increment`
    },
    'd(An)': {
        meaning: 'The memory at an address register plus a signed 16-bit displacement: `4(a0)`.',
        href: `${MODES}#address-register-displacement`
    },
    'd(An,Xn)': {
        meaning:
            'The memory at an address register plus an index register and a signed 8-bit displacement: `4(a0,d1.w)`.',
        href: `${MODES}#address-register-indexed`
    },
    abs: {
        meaning: 'An absolute address, a number or a label: `$1000`, `buffer`, `buffer.w`.',
        href: `${MODES}#effective-address`
    },
    label: {
        meaning:
            'Where to branch: a label, or an address, which the assembler turns into a distance from this instruction.',
        href: `${MODES}#effective-address`
    },
    'd(PC)': {
        meaning:
            'The memory at this instruction plus a signed 16-bit displacement, usually written with a label: `table(pc)`. It can be read but not written.',
        href: `${MODES}#program-counter-relative`
    },
    'd(PC,Xn)': {
        meaning:
            'The memory at this instruction plus an index register and a signed 8-bit displacement: `4(pc,d0.w)`. It can be read but not written.',
        href: `${MODES}#program-counter-relative`
    },
    '#imm': {
        meaning:
            "An immediate: a number, a character or a label written after `#`, such as `#10`, `#$FF` or `#'a'`, in the size of the operation.",
        href: `${MODES}#immediate`
    },
    sr: {
        meaning:
            'The 16-bit status register: the system byte and, in its low byte, the condition codes.',
        href: `${MODES}#status-registers`
    },
    ccr: {
        meaning: 'The condition-code register, the low byte of `sr`, which holds X N Z V C.',
        href: `${MODES}#status-registers`
    },
    '<register list>': {
        meaning:
            'Registers joined by `/`, a range written with `-`: `d0-d2/a0` is `d0 d1 d2 a0`. One `Dn` or `An` is a list of one.'
    }
}

/**
 * What the immediate is on the instructions that take only some values, by Documentation entry, so
 * that a family's members (`asl`, `asr`) share their family's (`asd`).
 */
const IMMEDIATE_MEANINGS: Readonly<Record<string, string>> = {
    moveq: 'An immediate from `-128` to `255`, sign-extended to 32 bits: `#-1`, `#$7F`. `128` to `255` are the unsigned spellings of `-128` to `-1`.',
    addq: 'An immediate from `1` to `8`: `#1`.',
    subq: 'An immediate from `1` to `8`: `#1`.',
    asd: 'The shift count as an immediate, `1` to `8`: `#3`.',
    lsd: 'The shift count as an immediate, `1` to `8`: `#3`.',
    rod: 'The rotate count as an immediate, `1` to `8`: `#3`.',
    roxd: 'The rotate count as an immediate, `1` to `8`: `#3`.',
    btst: 'An immediate; as the first operand, the bit number: `0` to `31` in a data register, `0` to `7` in memory.',
    bset: 'An immediate; as the first operand, the bit number: `0` to `31` in a data register, `0` to `7` in memory.',
    bclr: 'An immediate; as the first operand, the bit number: `0` to `31` in a data register, `0` to `7` in memory.',
    bchg: 'An immediate; as the first operand, the bit number: `0` to `31` in a data register, `0` to `7` in memory.',
    trap: 'The trap vector, `0` to `15`; `#15` is the simulator’s service handler.',
    link: 'The signed 16-bit displacement added to the stack pointer, negative to reserve space: `#-16`.'
}

/** A symbol's legend line on one instruction's page; `entry` is its Documentation entry. */
export function m68kOperandLine(
    symbol: string,
    entry: string | undefined
): M68KOperandLine | undefined {
    const line = M68K_OPERAND_MEANINGS[symbol]
    if (symbol === '#imm' && entry !== undefined && entry in IMMEDIATE_MEANINGS) {
        return { ...line, meaning: IMMEDIATE_MEANINGS[entry] }
    }
    return line
}
