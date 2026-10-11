/**
 * Editor and documentation data for the Z80, derived at import time from the tables that
 * `@specy/z80` ships (`mnemonicMap`, `getAsmDirectiveDocs()`).
 *
 * This module is plain data: no Svelte, no app aliases, nothing but `./Z80-model` and the package,
 * so the documentation routes can import it from a `+page.server.ts` while prerendering and so it
 * can be probed from node.
 */

import { getAsmDirectiveDocs, mnemonicMap, type OpcodeVariant } from '@specy/z80'
import {
    Z80_COLORS,
    Z80_FLAG_STRING_LEGEND,
    Z80_FLAG_STRING_ORDER,
    Z80_FLAGS,
    Z80_MOUSE_VIEWS,
    Z80_PORT_DOCS,
    Z80_PORT_GROUP_DOCS,
    Z80_SCREEN_COMMAND_DOCS,
    type Z80PortGroup
} from './Z80-model'

// The docs pages want the flag table and the port map next to the instruction data, and importing
// them from here keeps the pages down to a single import.
export {
    Z80_COLORS,
    Z80_FLAGS,
    Z80_MOUSE_VIEWS,
    Z80_PORT_DOCS,
    Z80_PORT_GROUP_DOCS,
    Z80_SCREEN_COMMAND_DOCS,
    type Z80PortGroup
}

/**
 * How one instruction touches one flag, expanded from the 6 character flag string of the
 * instruction table (see `Z80_FLAG_STRING_ORDER` for why the order is not the bit order).
 */
export type Z80FlagEffect = {
    name: string
    /** The raw character from the flag string, kept so the UI can group or colour by it. */
    effect: string
    meaning: string
}

/**
 * One assemblable form of a mnemonic, e.g. `ld a,nn`. The Z80 has 1300+ of them because every
 * register combination is a separate opcode, so the UI usually groups or caps them.
 */
export type Z80InstructionVariant = {
    mnemonic: string
    /** The form as it is written in source, e.g. `ld (ix+dd),b`. */
    instruction: string
    /** One entry per operand, e.g. `['(ix+dd)', 'b']`. */
    params: string[]
    /** The package's HTML description, converted to markdown. */
    description: string
    /** The raw 6 character flag string, in `Z80_FLAG_STRING_ORDER`. */
    flags: string
    flagsTable: Z80FlagEffect[]
    bytes: number
    /**
     * Clock cycles. `taken` and `notTaken` differ only for conditional branches, where the
     * package reports the with-jump and without-jump counts separately.
     */
    cycles: { taken: number; notTaken: number }
    /** The opcode bytes as packed hex, e.g. `DD21`; the operand bytes are not included. */
    opcodes: string
    /**
     * Not in Zilog's manual but implemented by the silicon and by this emulator (`sll`, the ix/iy
     * halves, …). Shown with a badge instead of being hidden.
     */
    undocumented: boolean
    /** An alias the assembler accepts, e.g. `adc a,b` written as `adc b`. */
    isPseudo: boolean
}

/**
 * Turns the instruction table's HTML into markdown: `<var>nn</var>` marks an operand placeholder
 * and becomes code, the handful of `<a>` links to z80.info become markdown links, anything else is
 * dropped. The tables also contain runs of spaces from the original HTML layout.
 */
function descriptionToMarkdown(html: string): string {
    return html
        .replace(/<var>(.*?)<\/var>/g, (_, name: string) => `\`${name}\``)
        .replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, (_, href: string, text: string) =>
            text.trim().length > 0 ? `[${text}](${href})` : href
        )
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function toFlagsTable(flags: string): Z80FlagEffect[] {
    return Z80_FLAG_STRING_ORDER.map((name, index) => {
        const effect = flags[index] ?? '-'
        return {
            name,
            effect,
            meaning: Z80_FLAG_STRING_LEGEND[effect] ?? 'undefined'
        }
    })
}

function toVariant(variant: OpcodeVariant): Z80InstructionVariant {
    const clr = variant.clr
    return {
        mnemonic: variant.mnemonic,
        instruction: clr.instruction,
        params: [...variant.params],
        description: descriptionToMarkdown(clr.description),
        flags: clr.flags,
        flagsTable: toFlagsTable(clr.flags),
        bytes: clr.byte_count,
        cycles: {
            taken: clr.with_jump_clock_count,
            notTaken: clr.without_jump_clock_count
        },
        opcodes: clr.opcodes,
        undocumented: clr.undocumented,
        isPseudo: variant.isPseudo
    }
}

/**
 * Every mnemonic the assembler understands, minus the Z180 extensions: the assembler accepts them
 * but this Z80 core executes them as no-ops, so documenting them would promise something the
 * emulator does not do. Ten mnemonics (`mlt`, `in0`, `out0`, `slp`, `tst`, …) disappear entirely.
 */
export const z80InstructionMap: Map<string, Z80InstructionVariant[]> = new Map()
for (const [mnemonic, variants] of mnemonicMap) {
    const kept = variants.filter((variant) => !variant.clr.z180).map(toVariant)
    if (kept.length > 0) z80InstructionMap.set(mnemonic, kept)
}

export const z80InstructionEntries: [string, Z80InstructionVariant[]][] = [
    ...z80InstructionMap.entries()
].sort(([a], [b]) => a.localeCompare(b))

export const z80InstructionNames: string[] = z80InstructionEntries.map(([name]) => name)

const EIGHT_BIT_REGISTERS = new Set(['a', 'b', 'c', 'd', 'e', 'h', 'l'])
const UNDOCUMENTED_HALVES = new Set(['ixh', 'ixl', 'iyh', 'iyl'])
const SIXTEEN_BIT_REGISTERS = new Set(['bc', 'de', 'hl', 'sp', 'ix', 'iy', 'af', "af'"])
const INDIRECT_REGISTERS = new Set(['(bc)', '(de)', '(hl)', '(sp)', '(c)', '(ix)', '(iy)'])
/** Mnemonics whose first operand may be a condition code, which is how `c` stops meaning register C. */
export const z80ConditionalMnemonics: Set<string> = new Set(['jr', 'jp', 'call', 'ret'])
const BIT_MNEMONICS = new Set(['bit', 'res', 'set'])

/**
 * Collapses one operand into the placeholder the summary uses. Without this a summary of `ld`
 * would list all 192 register pairs instead of the six shapes a programmer actually thinks in.
 */
function summarizeParam(mnemonic: string, param: string, index: number, used: Set<string>): string {
    //`jp` also takes `(hl)`, `(ix)` and `(iy)` as its first operand, which are jump targets and not
    //condition codes: collapsing those into `cc` would advertise a `jp cc` form that does not exist
    //and hide the indirect jumps that do
    if (z80ConditionalMnemonics.has(mnemonic) && index === 0 && CONDITION_CODES.has(param))
        return 'cc'
    if (BIT_MNEMONICS.has(mnemonic) && index === 0) return 'bit'
    if (EIGHT_BIT_REGISTERS.has(param) || UNDOCUMENTED_HALVES.has(param)) {
        // A second register operand becomes r' so `ld b,c` reads as `ld r,r'` rather than `ld r,r`.
        const name = used.has('r') ? "r'" : 'r'
        used.add(name)
        return name
    }
    if (SIXTEEN_BIT_REGISTERS.has(param)) {
        const name = used.has('rr') ? "rr'" : 'rr'
        used.add(name)
        return name
    }
    if (INDIRECT_REGISTERS.has(param)) return '(rr)'
    if (param === '(ix+dd)' || param === '(iy+dd)') return '(ii+dd)'
    return param
}

/**
 * The operand shapes of a mnemonic, e.g. `ld r,r' | ld r,nn | ld rr,nnnn | …`, for the hover header
 * and the instruction pages. Deduped, in the order the package lists the variants.
 */
export function formatZ80InstructionSummary(variants: Z80InstructionVariant[]): string {
    const forms: string[] = []
    const seen = new Set<string>()
    for (const variant of variants) {
        // The interrupt vector and refresh registers are spelled `i` and `r`, which would collide
        // with the `r` placeholder for a generic 8 bit register: show those four forms verbatim.
        const isSpecialRegisterForm = variant.params.some((param) => param === 'i' || param === 'r')
        const used = new Set<string>()
        const params = variant.params.map((param, index) =>
            summarizeParam(variant.mnemonic, param, index, used)
        )
        const form = isSpecialRegisterForm
            ? variant.instruction
            : params.length > 0
              ? `${variant.mnemonic} ${params.join(',')}`
              : variant.mnemonic
        if (seen.has(form)) continue
        seen.add(form)
        forms.push(form)
    }
    return forms.join(' | ')
}

/**
 * Groups variants that share a description, so a page can print one paragraph followed by the
 * forms it applies to instead of repeating the same sentence 24 times.
 */
export function groupZ80VariantsByDescription(
    variants: Z80InstructionVariant[]
): { description: string; instructions: string[] }[] {
    const groups: { description: string; instructions: string[] }[] = []
    const indexes = new Map<string, number>()
    for (const variant of variants) {
        const index = indexes.get(variant.description)
        if (index !== undefined) {
            groups[index].instructions.push(variant.instruction)
        } else {
            indexes.set(variant.description, groups.length)
            groups.push({ description: variant.description, instructions: [variant.instruction] })
        }
    }
    return groups
}

export type Z80Directive = {
    /** Every spelling the assembler accepts, e.g. `['defb', 'db', '.db', '.byte', …]`. */
    names: string[]
    /** The spelling used as the heading and as the completion label. */
    primary: string
    description: string
}

/**
 * The assembler directives, one entry per group of synonyms (`defb`/`db`/`.byte`/… are one entry).
 */
export const z80Directives: Z80Directive[] = getAsmDirectiveDocs().map((doc) => {
    const names = [...doc.directives]
    return { names, primary: names[0], description: doc.description }
})

/** Every accepted spelling, including the `.x` and `#x` forms, for the grammar and completion. */
export const z80DirectiveNames: string[] = z80Directives.flatMap((directive) => directive.names)

export type Z80RegisterDoc = {
    name: string
    /** Width in bits, for the registers table. */
    bits: number
    description: string
    undocumented?: boolean
}

/**
 * The programmer's model. The package has no register documentation, so this is written by hand;
 * it feeds the registers page, the hover provider and the completion details.
 */
export const z80Registers: Z80RegisterDoc[] = [
    {
        name: 'a',
        bits: 8,
        description:
            'Accumulator. The destination of every 8 bit arithmetic and logic instruction, and the only register that can be loaded from or stored to a bare address.'
    },
    {
        name: 'f',
        bits: 8,
        description:
            "Flags. Holds the sign, zero, half carry, parity/overflow, add/subtract and carry bits; it is read and written only as part of `af` (`push af`, `pop af`, `ex af,af'`)."
    },
    {
        name: 'b',
        bits: 8,
        description:
            'General purpose register, and the counter used by `djnz`, the block instructions (`ldir`, `cpir`, …) and the `(c)` port instructions.'
    },
    {
        name: 'c',
        bits: 8,
        description:
            'General purpose register, and the port number used by `in r,(c)` and `out (c),r`.'
    },
    { name: 'd', bits: 8, description: 'General purpose register, the high half of `de`.' },
    { name: 'e', bits: 8, description: 'General purpose register, the low half of `de`.' },
    { name: 'h', bits: 8, description: 'General purpose register, the high half of `hl`.' },
    { name: 'l', bits: 8, description: 'General purpose register, the low half of `hl`.' },
    {
        name: 'af',
        bits: 16,
        description:
            "The accumulator and the flags as one 16 bit register. Only `push`, `pop` and `ex af,af'` use it as a pair."
    },
    {
        name: 'bc',
        bits: 16,
        description:
            'The `b` and `c` registers as a pair. Used as a byte counter by the block instructions and as the port address by the `(c)` forms.'
    },
    {
        name: 'de',
        bits: 16,
        description:
            'The `d` and `e` registers as a pair. The destination pointer of the block copy instructions.'
    },
    {
        name: 'hl',
        bits: 16,
        description:
            "The `h` and `l` registers as a pair. The Z80's main pointer: `(hl)` can stand in for any 8 bit register operand, and `add hl,rr` is the only 16 bit addition."
    },
    {
        name: 'ix',
        bits: 16,
        description:
            'Index register. Addressed as `(ix+dd)` with a signed 8 bit displacement, which costs an extra prefix byte and several clock cycles per access.'
    },
    {
        name: 'iy',
        bits: 16,
        description: 'Index register, identical to `ix` but with its own prefix.'
    },
    {
        name: 'sp',
        bits: 16,
        description:
            'Stack pointer. `push` decrements it by two before writing, so the stack grows downwards; it starts at the top of memory.'
    },
    {
        name: 'pc',
        bits: 16,
        description: 'Program counter: the address of the next instruction to execute.'
    },
    {
        name: "af'",
        bits: 16,
        description:
            "The alternate accumulator and flags, swapped in by `ex af,af'`. Traditionally reserved for interrupt handlers."
    },
    {
        name: "bc'",
        bits: 16,
        description: "The alternate `bc`, swapped in by `exx` together with `de'` and `hl'`."
    },
    { name: "de'", bits: 16, description: 'The alternate `de`, swapped in by `exx`.' },
    { name: "hl'", bits: 16, description: 'The alternate `hl`, swapped in by `exx`.' },
    {
        name: 'i',
        bits: 8,
        description:
            'Interrupt vector register: the high byte of the vector table address in interrupt mode 2. Nothing raises interrupts in this emulator.'
    },
    {
        name: 'r',
        bits: 8,
        description:
            'Memory refresh register. The low 7 bits increment on every instruction fetch, which is why it is sometimes used as a cheap random number.'
    },
    { name: 'ixh', bits: 8, description: 'The high half of `ix`.', undocumented: true },
    { name: 'ixl', bits: 8, description: 'The low half of `ix`.', undocumented: true },
    { name: 'iyh', bits: 8, description: 'The high half of `iy`.', undocumented: true },
    { name: 'iyl', bits: 8, description: 'The low half of `iy`.', undocumented: true }
]

export type Z80OperandDoc = {
    name: string
    description: string
}

/**
 * The placeholders used in the instruction table, so a reader can tell what `ld (ix+dd),nn` wants.
 */
export const z80Operands: Z80OperandDoc[] = [
    {
        name: 'nn',
        description:
            '8 bit value: a number from 0 to 255 (or -128 to 127), a character constant, or a symbol.'
    },
    {
        name: 'nnnn',
        description: '16 bit value or address, from 0 to 65535. Labels are 16 bit values.'
    },
    {
        name: 'dd',
        description:
            'Signed 8 bit displacement, -128 to 127, added to `ix` or `iy` to form the address.'
    },
    {
        name: 'offset',
        description:
            'Target of a relative jump. Write a label or an address: the assembler computes the -128 to 127 displacement and reports an error when the target is out of reach.'
    },
    {
        name: '(hl)',
        description:
            'The byte in memory at the address in `hl`. Usable wherever an 8 bit register is, at the cost of one extra memory access.'
    },
    {
        name: '(ix+dd)',
        description:
            'The byte in memory at `ix` plus the signed displacement, e.g. `ld a,(ix+2)`. `iy` works the same way.'
    },
    {
        name: 'cc',
        description:
            'A condition code, tested against the flags by `jp`, `call`, `ret` and (for the first four only) `jr`.'
    }
]

export type Z80ConditionCodeDoc = {
    name: string
    description: string
}

/**
 * The condition codes accepted by `jp`, `call` and `ret`; `jr` only takes the first four.
 */
export const z80ConditionCodes: Z80ConditionCodeDoc[] = [
    { name: 'nz', description: 'Not zero: the Z flag is reset.' },
    { name: 'z', description: 'Zero: the Z flag is set.' },
    { name: 'nc', description: 'No carry: the C flag is reset.' },
    {
        name: 'c',
        description: 'Carry: the C flag is set. Not to be confused with the `c` register.'
    },
    { name: 'po', description: 'Parity odd / no overflow: the P/V flag is reset.' },
    { name: 'pe', description: 'Parity even / overflow: the P/V flag is set.' },
    { name: 'p', description: 'Plus: the S flag is reset, i.e. the result was not negative.' },
    { name: 'm', description: 'Minus: the S flag is set, i.e. the result was negative.' },
    { name: 'nv', description: 'No overflow: a synonym of `po`, kept for other assemblers.' },
    { name: 'v', description: 'Overflow: a synonym of `pe`, kept for other assemblers.' }
]

/**
 * The same names as a lookup, for the places that only have to tell a condition code from a
 * register or a jump target. Declared here because it is built from the table above.
 */
const CONDITION_CODES: Set<string> = new Set(z80ConditionCodes.map((condition) => condition.name))
