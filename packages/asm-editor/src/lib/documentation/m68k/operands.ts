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
            'An operand using one of the instruction’s supported addressing modes, such as `d0`, `(a0)+` or `4(a1)`. It may name a register, memory or an immediate value.',
        href: MODES
    },
    Dn: { meaning: 'A data register, `d0` to `d7`.', href: `${MODES}#direct` },
    An: {
        meaning: 'An address register, `a0` to `a7`; `sp` is another name for `a7`.',
        href: `${MODES}#direct`
    },
    '(An)': {
        meaning: 'Memory at the address stored in an address register, for example `(a0)`.',
        href: `${MODES}#indirect`
    },
    '(An)+': {
        meaning:
            'Memory at the address stored in an address register, for example `(a0)+`. After access, the simulator increases the register by the operation’s size in bytes.',
        href: `${MODES}#indirect-post-pre-increment`
    },
    '-(An)': {
        meaning:
            'The simulator first decreases the address register by the operation’s size in bytes, then accesses memory at the new address, for example `-(sp)`.',
        href: `${MODES}#indirect-post-pre-increment`
    },
    'd(An)': {
        meaning:
            'Memory at the address stored in an address register plus a signed 16-bit displacement, for example `4(a0)`.',
        href: `${MODES}#address-register-displacement`
    },
    'd(An,Xn)': {
        meaning:
            'Memory at the sum of an address register, an index register and a signed 8-bit displacement, for example `4(a0,d1.w)`. `Xn` is a data or address register; `.w` uses its signed low word, and `.l` uses its full long value.',
        href: `${MODES}#address-register-indexed`
    },
    abs: {
        meaning:
            'An absolute memory address, written as a number or label: `$1000`, `buffer` or `buffer.w`.',
        href: `${MODES}#effective-address`
    },
    label: {
        meaning:
            'A branch target, written as a label or address. The assembler calculates the relative displacement.',
        href: `${MODES}#effective-address`
    },
    'd(PC)': {
        meaning:
            'Memory addressed relative to the program counter, based two bytes after the instruction’s start. Write the target label or address, as in `table(pc)`; the assembler computes a signed 16-bit displacement. This addressing mode cannot write memory.',
        href: `${MODES}#program-counter-relative`
    },
    'd(PC,Xn)': {
        meaning:
            'Memory at a target address plus an index register, for example `4(pc,d0.w)`. The assembler computes a signed 8-bit displacement from two bytes after the instruction’s start to the target. `Xn` is a data or address register; `.w` uses its signed low word, and `.l` its full long value. This addressing mode cannot write memory.',
        href: `${MODES}#program-counter-relative`
    },
    '#imm': {
        meaning:
            "An immediate value written after `#`: a number, character or label, such as `#10`, `#$FF` or `#'a'`. It must fit the operation’s size: byte `-128` to `255`, word `-32768` to `65535`, or long `-2147483648` to `4294967295`; signed and unsigned spellings are accepted.",
        href: `${MODES}#immediate`
    },
    sr: {
        meaning:
            'The 16-bit status register. Its upper byte contains system flags; its lower byte contains the condition codes.',
        href: `${MODES}#status-registers`
    },
    ccr: {
        meaning:
            'The condition-code register: the low byte of `sr`, containing the `X`, `N`, `Z`, `V` and `C` flags.',
        href: `${MODES}#status-registers`
    },
    '<register list>': {
        meaning:
            'A register list using `/` to separate registers and `-` for ranges. For example, `d0-d2/a0` selects `d0`, `d1`, `d2` and `a0`. A single data or address register is also valid.'
    }
}

/**
 * What the immediate is on the instructions that take only some values, by Documentation entry, so
 * that a family's members (`asl`, `asr`) share their family's (`asd`).
 */
const IMMEDIATE_MEANINGS: Readonly<Record<string, string>> = {
    moveq: 'An 8-bit immediate, `-128` to `255`, sign-extended to 32 bits, for example `#-1` or `#$7F`. Values `128` to `255` represent `-128` to `-1`.',
    addq: 'An immediate from `1` to `8`, for example `#1`.',
    subq: 'An immediate from `1` to `8`, for example `#1`.',
    asd: 'An immediate shift count from `1` to `8`, for example `#3`.',
    lsd: 'An immediate shift count from `1` to `8`, for example `#3`.',
    rod: 'An immediate rotate count from `1` to `8`, for example `#3`.',
    roxd: 'An immediate rotate count from `1` to `8`, for example `#3`.',
    btst: 'An immediate value. As the first operand, it selects a bit: `0` to `31` for a data register, or `0` to `7` for memory.',
    bset: 'An immediate value. As the first operand, it selects a bit: `0` to `31` for a data register, or `0` to `7` for memory.',
    bclr: 'An immediate value. As the first operand, it selects a bit: `0` to `31` for a data register, or `0` to `7` for memory.',
    bchg: 'An immediate value. As the first operand, it selects a bit: `0` to `31` for a data register, or `0` to `7` for memory.',
    trap: 'A trap vector from `0` to `15`. Use `#15` to call the simulator’s service handler.',
    link: 'A signed 16-bit displacement added to the stack pointer. Use a negative value to reserve stack space, for example `#-16`.'
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
