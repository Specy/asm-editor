import {
    branchConditionsDescriptions,
    directionsDescriptions,
    M68KUncompoundedInstructions
} from '#lib/languages/M68K/M68K-documentation.ts'
import { summaryOf } from '../entries'
import { m68kEntryName } from './families'

/**
 * Long names and summaries of the documented M68K instructions
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 6), by page
 * name, so a family's members (`beq`) have their own. Every page's long name is written here, after
 * the Programmer's Reference Manual, and a summary where the Documentation's first sentence reads
 * badly; the rules below stand in for a page the table leaves out: a family member's long name
 * from its condition or direction, and the summary from the first sentence.
 *
 * It reads only the hand-written Documentation, never the Core, so the hovers can import it.
 */
export const m68kInstructionNames: Readonly<
    Record<string, { longName?: string; summary?: string }>
> = {
    abcd: { longName: 'Add decimal with extend' },
    add: { longName: 'Add', summary: 'Adds the value of the first operand to the second operand.' },
    adda: {
        longName: 'Add address',
        summary:
            'Adds the first operand to an address register, sign extending a word to long and leaving sr unchanged.'
    },
    addi: { longName: 'Add immediate', summary: 'Adds the immediate value to the second operand.' },
    addq: {
        longName: 'Add quick',
        summary: 'Adds an immediate value from 1 to 8 to the second operand.'
    },
    addx: { longName: 'Add extended' },
    and: {
        longName: 'Logical AND',
        summary:
            'Performs a logical AND of the first and second operands and stores the result in the second operand.'
    },
    andi: {
        longName: 'Logical AND immediate',
        summary:
            'Performs a logical AND of an immediate value and the second operand, storing the result in the second operand.'
    },
    asd: { longName: 'Arithmetic shift' },
    asl: { longName: 'Arithmetic shift left' },
    asr: { longName: 'Arithmetic shift right' },
    bcc: {
        longName: 'Branch conditionally',
        summary: 'Branches to the specified address if the condition named by the suffix holds.'
    },
    bchg: {
        longName: 'Test a bit and change',
        summary:
            'Inverts the bit in the second operand numbered by the first operand, setting Z to the inverse of its old value.'
    },
    bclr: {
        longName: 'Test a bit and clear',
        summary:
            'Clears the bit in the second operand numbered by the first operand, setting Z to the inverse of its old value.'
    },
    bcs: {
        longName: 'Branch if carry set',
        summary: 'Branches to the specified address if carry set.'
    },
    beq: { longName: 'Branch if equal', summary: 'Branches to the specified address if equal.' },
    bge: {
        longName: 'Branch if greater or equal',
        summary: 'Branches to the specified address if greater or equal.'
    },
    bgt: {
        longName: 'Branch if greater than',
        summary: 'Branches to the specified address if greater than.'
    },
    bhi: {
        longName: 'Branch if unsigned higher',
        summary: 'Branches to the specified address if unsigned higher.'
    },
    bhs: {
        longName: 'Branch if unsigned higher or same',
        summary: 'Branches to the specified address if unsigned higher or same.'
    },
    ble: {
        longName: 'Branch if less than or equal',
        summary: 'Branches to the specified address if less than or equal.'
    },
    blo: {
        longName: 'Branch if unsigned lower',
        summary: 'Branches to the specified address if unsigned lower.'
    },
    bls: {
        longName: 'Branch if unsigned lower or same',
        summary: 'Branches to the specified address if unsigned lower or same.'
    },
    blt: {
        longName: 'Branch if less than',
        summary: 'Branches to the specified address if less than.'
    },
    bmi: { longName: 'Branch if minus', summary: 'Branches to the specified address if minus.' },
    bne: {
        longName: 'Branch if not equal',
        summary: 'Branches to the specified address if not equal.'
    },
    bpl: { longName: 'Branch if plus', summary: 'Branches to the specified address if plus.' },
    bra: {
        longName: 'Branch always',
        summary: 'Branches to the specified address unconditionally.'
    },
    bset: {
        longName: 'Test a bit and set',
        summary:
            'Sets the bit in the second operand numbered by the first operand, setting Z to the inverse of its old value.'
    },
    bsr: {
        longName: 'Branch to subroutine',
        summary: 'Pushes the return address onto the stack and branches to the specified address.'
    },
    btst: {
        longName: 'Test a bit',
        summary:
            'Tests the bit in the second operand numbered by the first operand and sets Z to the inverse of its value.'
    },
    bvc: {
        longName: 'Branch if overflow clear',
        summary: 'Branches to the specified address if overflow clear.'
    },
    bvs: {
        longName: 'Branch if overflow set',
        summary: 'Branches to the specified address if overflow set.'
    },
    chk: { longName: 'Check register against bounds' },
    clr: {
        longName: 'Clear',
        summary:
            'Sets all bits of the destination operand to 0 at the given size (byte, word or long).'
    },
    cmp: {
        longName: 'Compare',
        summary:
            'Subtracts the first operand from the second operand and sets the flags, leaving both unchanged.'
    },
    cmpa: {
        longName: 'Compare address',
        summary:
            'Compares an address register with the first operand and sets the flags, sign extending a word to long.'
    },
    cmpi: {
        longName: 'Compare immediate',
        summary:
            'Subtracts the immediate value from the second operand and sets the flags, leaving the operand unchanged.'
    },
    cmpm: {
        longName: 'Compare memory',
        summary:
            'Compares two memory operands that use post-increment addressing and sets the flags.'
    },
    dbcc: {
        longName: 'Test condition, decrement and branch',
        summary:
            'Decrements the first operand by 1 and branches if the condition named by the suffix is false and the first operand is not -1.'
    },
    dbcs: { longName: 'Decrement and branch until carry set' },
    dbeq: { longName: 'Decrement and branch until equal' },
    dbf: {
        longName: 'Decrement and branch until false',
        summary: 'Decrements the first operand by 1 and branches unless it becomes -1, like dbra.'
    },
    dbge: { longName: 'Decrement and branch until greater or equal' },
    dbgt: { longName: 'Decrement and branch until greater than' },
    dbhi: { longName: 'Decrement and branch until unsigned higher' },
    dbhs: { longName: 'Decrement and branch until unsigned higher or same' },
    dble: { longName: 'Decrement and branch until less than or equal' },
    dblo: { longName: 'Decrement and branch until unsigned lower' },
    dbls: { longName: 'Decrement and branch until unsigned lower or same' },
    dblt: { longName: 'Decrement and branch until less than' },
    dbmi: { longName: 'Decrement and branch until minus' },
    dbne: { longName: 'Decrement and branch until not equal' },
    dbpl: { longName: 'Decrement and branch until plus' },
    dbra: { longName: 'Decrement and branch' },
    dbt: {
        longName: 'Decrement and branch until true',
        summary:
            'Falls through without changing the counter, because the true condition always holds.'
    },
    dbvc: { longName: 'Decrement and branch until overflow clear' },
    dbvs: { longName: 'Decrement and branch until overflow set' },
    divs: { longName: 'Signed divide' },
    divu: { longName: 'Unsigned divide' },
    eor: {
        longName: 'Logical exclusive OR',
        summary:
            'Performs a logical exclusive OR of the first and second operands and stores the result in the second operand.'
    },
    eori: {
        longName: 'Logical exclusive OR immediate',
        summary:
            'Performs a logical exclusive OR of an immediate value and the second operand, storing the result in the second operand.'
    },
    exg: {
        longName: 'Exchange registers',
        summary: 'Exchanges the full long contents of two registers.'
    },
    ext: { longName: 'Sign-extend' },
    extb: { longName: 'Sign-extend byte to long' },
    illegal: { longName: 'Take illegal instruction trap' },
    jmp: { longName: 'Jump', summary: 'Jumps to the specified address unconditionally.' },
    jsr: {
        longName: 'Jump to subroutine',
        summary: 'Pushes the return address onto the stack and jumps to the specified address.'
    },
    lea: {
        longName: 'Load effective address',
        summary:
            'Loads the effective address of the first operand into an address register, without reading memory.'
    },
    link: {
        longName: 'Link and allocate',
        summary:
            'Pushes an address register onto the stack, copies a7 into it, then adds a signed displacement to a7.'
    },
    lsd: { longName: 'Logical shift' },
    lsl: { longName: 'Logical shift left' },
    lsr: { longName: 'Logical shift right' },
    move: {
        longName: 'Move data',
        summary: 'Moves the value from the first operand to the second operand.'
    },
    movea: {
        longName: 'Move address',
        summary:
            'Moves the value from the first operand to an address register, sign extending a word to long and leaving sr unchanged.'
    },
    movem: {
        longName: 'Move multiple registers',
        summary: 'Moves a list of registers such as d0-d7 and a0-a7 to or from memory.'
    },
    movep: { longName: 'Move peripheral data' },
    moveq: {
        longName: 'Move quick',
        summary:
            'Moves a byte immediate from -128 through 255 into a data register, sign extended to long.'
    },
    muls: { longName: 'Signed multiply' },
    mulu: { longName: 'Unsigned multiply' },
    nbcd: { longName: 'Negate decimal with extend' },
    neg: {
        longName: 'Negate',
        summary: 'Replaces the destination operand with zero minus its value, at the given size.'
    },
    negx: { longName: 'Negate with extend' },
    nop: {
        longName: 'No operation',
        summary: 'Does nothing except advance to the next instruction.'
    },
    not: {
        longName: 'Logical complement',
        summary: 'Inverts every bit of the operand at the given size.'
    },
    or: {
        longName: 'Logical OR',
        summary:
            'Performs a logical OR of the first and second operands and stores the result in the second operand.'
    },
    ori: {
        longName: 'Logical OR immediate',
        summary:
            'Performs a logical OR of an immediate value and the second operand, storing the result in the second operand.'
    },
    pea: {
        longName: 'Push effective address',
        summary: 'Computes the effective address of the operand and pushes it onto the stack.'
    },
    rod: { longName: 'Rotate' },
    rol: { longName: 'Rotate left' },
    ror: { longName: 'Rotate right' },
    roxd: { longName: 'Rotate with extend' },
    roxl: { longName: 'Rotate left with extend' },
    roxr: { longName: 'Rotate right with extend' },
    rtr: {
        longName: 'Return and restore condition codes',
        summary: 'Returns by popping ccr and then the program counter from the stack.'
    },
    rts: {
        longName: 'Return from subroutine',
        summary:
            'Returns from a subroutine by popping the return address from the stack and jumping to it.'
    },
    sbcd: { longName: 'Subtract decimal with extend' },
    scc: {
        longName: 'Set according to condition',
        summary:
            'Sets the destination byte to $FF (-1) if the condition named by the suffix holds, otherwise to 0.'
    },
    scs: {
        longName: 'Set if carry set',
        summary: 'Sets the destination byte to $FF (-1) if carry set, otherwise to 0.'
    },
    seq: {
        longName: 'Set if equal',
        summary: 'Sets the destination byte to $FF (-1) if equal, otherwise to 0.'
    },
    sf: {
        longName: 'Set if false',
        summary: 'Always sets the destination byte to 0, because the false condition never holds.'
    },
    sge: {
        longName: 'Set if greater or equal',
        summary: 'Sets the destination byte to $FF (-1) if greater or equal, otherwise to 0.'
    },
    sgt: {
        longName: 'Set if greater than',
        summary: 'Sets the destination byte to $FF (-1) if greater than, otherwise to 0.'
    },
    shi: {
        longName: 'Set if unsigned higher',
        summary: 'Sets the destination byte to $FF (-1) if unsigned higher, otherwise to 0.'
    },
    shs: {
        longName: 'Set if unsigned higher or same',
        summary: 'Sets the destination byte to $FF (-1) if unsigned higher or same, otherwise to 0.'
    },
    sle: {
        longName: 'Set if less than or equal',
        summary: 'Sets the destination byte to $FF (-1) if less than or equal, otherwise to 0.'
    },
    slo: {
        longName: 'Set if unsigned lower',
        summary: 'Sets the destination byte to $FF (-1) if unsigned lower, otherwise to 0.'
    },
    sls: {
        longName: 'Set if unsigned lower or same',
        summary: 'Sets the destination byte to $FF (-1) if unsigned lower or same, otherwise to 0.'
    },
    slt: {
        longName: 'Set if less than',
        summary: 'Sets the destination byte to $FF (-1) if less than, otherwise to 0.'
    },
    smi: {
        longName: 'Set if minus',
        summary: 'Sets the destination byte to $FF (-1) if minus, otherwise to 0.'
    },
    sne: {
        longName: 'Set if not equal',
        summary: 'Sets the destination byte to $FF (-1) if not equal, otherwise to 0.'
    },
    spl: {
        longName: 'Set if plus',
        summary: 'Sets the destination byte to $FF (-1) if plus, otherwise to 0.'
    },
    st: { longName: 'Set if true', summary: 'Always sets the destination byte to $FF (-1).' },
    sub: {
        longName: 'Subtract',
        summary:
            'Subtracts the value of the first operand from the second operand and stores the result in the second operand.'
    },
    suba: {
        longName: 'Subtract address',
        summary:
            'Subtracts the first operand from an address register, sign extending a word to long and leaving sr unchanged.'
    },
    subi: {
        longName: 'Subtract immediate',
        summary: 'Subtracts the immediate value from the second operand.'
    },
    subq: {
        longName: 'Subtract quick',
        summary: 'Subtracts an immediate value of 1 to 8 from the second operand.'
    },
    subx: { longName: 'Subtract extended' },
    svc: {
        longName: 'Set if overflow clear',
        summary: 'Sets the destination byte to $FF (-1) if overflow clear, otherwise to 0.'
    },
    svs: {
        longName: 'Set if overflow set',
        summary: 'Sets the destination byte to $FF (-1) if overflow set, otherwise to 0.'
    },
    swap: {
        longName: 'Swap register halves',
        summary: 'Swaps the upper and lower words of a data register.'
    },
    tas: {
        longName: 'Test and set an operand',
        summary: 'Tests a byte to set the condition codes, then sets its top bit.'
    },
    trap: { longName: 'Trap' },
    trapv: { longName: 'Trap on overflow' },
    tst: {
        longName: 'Test',
        summary: 'Sets the condition codes from the operand, as if comparing it with zero.'
    },
    unlk: {
        longName: 'Unlink',
        summary:
            'Loads a7 from the address register, then pops a long from the stack into that register.'
    }
}

type Family = {
    /** The family's own long name, the manual's heading for it. */
    name: string
    /** A member's long name, `{}` standing for its condition or direction. */
    member: string
    /** The condition or direction a member's mnemonic names, in words. */
    part: (mnemonic: string) => string | undefined
}

const CONSTANT_CONDITIONS: Record<string, string> = { t: 'true', f: 'false' }

function condition(code: string): string | undefined {
    const words = branchConditionsDescriptions.get(code)
    return words ? words.toLowerCase() : CONSTANT_CONDITIONS[code]
}

function direction(mnemonic: string): string | undefined {
    return directionsDescriptions.get(mnemonic.slice(-1))?.toLowerCase()
}

/** The families of the Documentation, by entry name. */
const FAMILIES: Readonly<Record<string, Family>> = {
    bcc: {
        name: 'Branch conditionally',
        member: 'Branch if {}',
        part: (mnemonic) => condition(mnemonic.slice(1))
    },
    dbcc: {
        name: 'Test condition, decrement and branch',
        member: 'Decrement and branch until {}',
        part: (mnemonic) => condition(mnemonic.slice(2))
    },
    scc: {
        name: 'Set according to condition',
        member: 'Set if {}',
        part: (mnemonic) => condition(mnemonic.slice(1))
    },
    asd: { name: 'Arithmetic shift', member: 'Arithmetic shift {}', part: direction },
    lsd: { name: 'Logical shift', member: 'Logical shift {}', part: direction },
    rod: { name: 'Rotate', member: 'Rotate {}', part: direction },
    roxd: { name: 'Rotate with extend', member: 'Rotate {} with extend', part: direction }
}

/**
 * The Documentation's description of a page name. A family's own page fills the placeholders its
 * members fill with their condition or direction, which it would otherwise show as written.
 */
export function m68kDescription(name: string): string | undefined {
    const instruction = M68KUncompoundedInstructions.get(name)
    if (!instruction) return undefined
    if (!(name in FAMILIES)) return instruction.description
    return instruction.description
        .replaceAll('{condition code}', '[`cc`](/documentation/m68k/condition-codes)')
        .replaceAll('{direction}', 'left or right')
}

/** What a page name stands for: from the table, else derived. */
export function m68kLongName(name: string): string {
    const written = m68kInstructionNames[name]?.longName
    if (written) return written
    const entry = m68kEntryName(name)
    const family = entry === undefined ? undefined : FAMILIES[entry]
    if (family && entry === name) return family.name
    const part = family?.part(name)
    if (family && part) return family.member.replace('{}', part)
    return name.toUpperCase()
}

/** One sentence about the page name's instruction: from the table, else the description's first. */
export function m68kSummary(name: string): string {
    return m68kInstructionNames[name]?.summary ?? summaryOf(m68kDescription(name) ?? '')
}
