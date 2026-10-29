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
    ccr: 'ccr',
    usp: 'usp',
    Rc: 'Rc',
    //the 68020's: `cas2`'s two addresses, in the manual's letters. A pair of data registers is
    //written by what it holds, on each page
    '(Rx):(Ry)': '(Rn1):(Rn2)'
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

/**
 * What a legend says of a position that takes `d(An,Xn)` or `d(PC,Xn)`: under `opt p=68020` it takes
 * the 68020's indexed modes too, which its pages list in no row of their own
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3).
 */
export const M68020_INDEXED =
    'With `opt p=68020`, an allowed `d(An,Xn)` or `d(PC,Xn)` mode also permits the corresponding 68020 indexed and memory indirect forms. See [68020 addressing](/documentation/m68k/addressing-mode#68020).'

/** What each symbol of an M68K row stands for: one line of markdown each. */
export const M68K_OPERAND_MEANINGS: Readonly<Record<string, M68KOperandLine>> = {
    '<ea>': {
        meaning:
            'An operand using one of the addressing modes listed for this form. The list determines whether it can be a register, memory or an immediate value.',
        href: MODES
    },
    Dn: { meaning: 'A data register, `d0` to `d7`.', href: `${MODES}#direct` },
    An: {
        meaning: 'An address register, `a0` to `a7`; `sp` is another name for `a7`.',
        href: `${MODES}#direct`
    },
    Rn: {
        meaning: 'A data or address register, `d0` to `d7` or `a0` to `a7`.',
        href: `${MODES}#direct`
    },
    '(An)': {
        meaning: 'Memory at the address stored in an address register, for example `(a0)`.',
        href: `${MODES}#indirect`
    },
    '(An)+': {
        meaning:
            'Memory at an address register, followed by an increase of 1, 2 or 4 bytes for a byte, word or long access. A byte access through `sp` increases it by 2 to keep it even.',
        href: `${MODES}#indirect-post-pre-increment`
    },
    '-(An)': {
        meaning:
            'Decreases an address register by 1, 2 or 4 bytes for a byte, word or long access, then accesses memory there. A byte access through `sp` decreases it by 2 to keep it even.',
        href: `${MODES}#indirect-post-pre-increment`
    },
    'd(An)': {
        meaning:
            'Memory at the address stored in an address register plus a signed 16-bit displacement, for example `4(a0)`.',
        href: `${MODES}#address-register-displacement`
    },
    'd(An,Xn)': {
        meaning: `Memory at the sum of an address register, an index register and a signed 8-bit displacement, for example \`4(a0,d1.w)\`. \`Xn\` is a data or address register; \`.w\` uses its signed low word, and \`.l\` uses its full long value. ${M68020_INDEXED}`,
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
            'Memory addressed relative to the program counter. Write a target label or address, as in `table(pc)`. The assembler computes a signed 16-bit displacement from the operand’s extension word, usually two bytes after the instruction starts. This mode cannot write memory.',
        href: `${MODES}#program-counter-relative`
    },
    'd(PC,Xn)': {
        meaning: `Memory at a target address plus an index register, for example \`table(pc,d0.w)\`. The assembler computes a signed 8-bit displacement to the target from the operand’s extension word. With no target, as in \`(pc,d0.w)\`, the target is the instruction itself. \`Xn\` is a data or address register. \`.w\` uses its signed low word, and \`.l\` its full long value. This mode cannot write memory. ${M68020_INDEXED}`,
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
    usp: {
        meaning:
            'The user stack pointer: the `a7` a program has in user mode. Supervisor code reads and sets it through an address register, as in `move.l usp, a0`.',
        href: `${MODES}#user-stack-pointer`
    },
    Rc: {
        meaning:
            'A control register: on the 68010 `vbr`, the vector base register, where the vector table starts; `sfc` or `dfc`, the source or destination function code; or `usp`, the user stack pointer. The 68020 adds `msp` and `isp`, its master and interrupt stack pointers, and `cacr` and `caar`, its cache registers.',
        href: `${MODES}#control-registers`
    },
    '<register list>': {
        meaning:
            'A register list using `/` to separate registers and `-` for ranges. For example, `d0-d2/a0` selects `d0`, `d1`, `d2` and `a0`. A single data or address register is also valid.'
    },
    //the 68020's register pairs and bit fields
    'Dh:Dl': {
        meaning:
            'Two data registers for a 64-bit product, for example `d2:d1`. `Dl` supplies the 32-bit multiplicand. The result’s high long replaces `Dh`, and its low long replaces `Dl`. Use different registers for the two halves.',
        href: `${MODES}#register-pairs`
    },
    'Dr:Dq': {
        meaning:
            'A remainder register followed by a quotient register, for example `d2:d1`. For `divs.l` and `divu.l`, both supply the 64-bit dividend, high long first. For `divsl.l` and `divul.l`, only `Dq` supplies the 32-bit dividend. The quotient replaces `Dq` and the remainder replaces `Dr`.',
        href: `${MODES}#register-pairs`
    },
    'Dc1:Dc2': {
        meaning:
            'The compare registers for the first and second memory operands, for example `d0:d1`. If either comparison fails, both registers receive the corresponding memory values.',
        href: `${MODES}#register-pairs`
    },
    'Du1:Du2': {
        meaning:
            'The update registers for the first and second memory operands, for example `d2:d3`. Both values are written only if both comparisons succeed.',
        href: `${MODES}#register-pairs`
    },
    '(Rn1):(Rn2)': {
        meaning:
            'Two memory addresses, each held in a data or address register, for example `(a0):(a1)`. The first uses `Dc1` and `Du1`, and the second uses `Dc2` and `Du2`.',
        href: `${MODES}#register-pairs`
    },
    '{offset:width}': {
        meaning:
            'A field of 1 to 32 bits, written immediately after the operand. Literal offsets range from 0 to 31, and literal widths from 1 to 32. Either may be a data register, as in `{d1:d2}`. See the linked section for register values, negative memory offsets and wrapping.',
        href: `${MODES}#bit-fields`
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
    rtd: 'A signed 16-bit number of bytes added to the stack pointer once the return address is popped: the size of the arguments, for example `#8`.',
    bkpt: 'A breakpoint number from `0` to `7`, which a hardware debugger would read.',
    trap: 'A trap number from `0` to `15`. `#0` to `#14` run the handler in vectors 32 to 46; `#15` runs the simulator’s task numbered in `d0.b`.',
    stop: 'A 16-bit status-register value, written after `#`, for example `#$2000`. It sets the interrupt mask and processor mode before the wait.',
    link: 'A signed 16-bit displacement added to the stack pointer, or 32-bit with `link.l`. Use a negative value to reserve stack space, for example `#-16`.',
    trapcc: 'An optional word or long immediate, for example `#3`. The processor ignores its value, but the handler can read it to identify the trap.',
    pack: 'A 16-bit adjustment added to the source word before packing, for example `#0`.',
    unpk: 'A 16-bit adjustment added after unpacking, for example `#$3030` to produce ASCII digits.'
}

const PREDECREMENT_MEANINGS: Readonly<Record<string, string>> = {
    pack: 'The source address decreases by 2 before reading two bytes. The destination address decreases by 1 before writing one byte, or by 2 if it is `sp`.',
    unpk: 'The source address decreases by 1 before reading one byte, or by 2 if it is `sp`. The destination address decreases by 2 before writing two bytes.'
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
    if (symbol === '-(An)' && entry !== undefined && entry in PREDECREMENT_MEANINGS) {
        return { ...line, meaning: PREDECREMENT_MEANINGS[entry] }
    }
    return line
}
