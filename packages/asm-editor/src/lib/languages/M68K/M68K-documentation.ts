import structuredClone from '@ungap/structured-clone'

export enum AddressingMode {
    DataRegister = 1,
    AddressRegister = 2,
    Indirect = 4,
    PostIndirect = 8,
    PreIndirect = 16,
    IndirectWithDisplacement = 32,
    Immediate = 64,
    Absolute = 128,
    IndirectIndex = 256,
    RegisterRange = 512,
    PcDisplacement = 1024,
    PcIndex = 2048,
    StatusRegister = 4096,
    ConditionCodeRegister = 8192,
    UserStackPointer = 16384,
    /** The 68010's control registers that `movec` names: `vbr`, `sfc` and `dfc`. */
    ControlRegister = 32768,
    /**
     * The 68020's pair of data registers, `d1:d2`: a product's 64 bits, a division's remainder and
     * quotient, or `cas2`'s two compare and two update registers.
     */
    RegisterPair = 65536,
    /** `cas2`'s two addresses, each in a data or an address register: `(a0):(d1)`. */
    IndirectPair = 131072,
    /**
     * A bit field written straight after the operand, `d0{4:8}`: the operand of the 68020's
     * bit-field instructions, which take nothing without one. It marks the position; the modes
     * beside it are what the field is in.
     */
    BitField = 262144
}

export function addressingModeToString(addressingMode: AddressingMode): string {
    switch (addressingMode) {
        case AddressingMode.DataRegister:
            return 'Dn'
        case AddressingMode.AddressRegister:
            return 'An'

        case AddressingMode.Indirect:
            return '(An)'
        case AddressingMode.PostIndirect:
            return '(An)+'
        case AddressingMode.PreIndirect:
            return '-(An)'
        case AddressingMode.IndirectWithDisplacement:
            return 'd(An)'
        case AddressingMode.Immediate:
            return 'Im'
        case AddressingMode.Absolute:
            return 'Ea/<label>'
        case AddressingMode.IndirectIndex:
            return 'd(An,Xn)'
        case AddressingMode.RegisterRange:
            return '<register list>'
        case AddressingMode.PcDisplacement:
            return 'd(PC)'
        case AddressingMode.PcIndex:
            return 'd(PC,Xn)'
        case AddressingMode.StatusRegister:
            return 'sr'
        case AddressingMode.ConditionCodeRegister:
            return 'ccr'
        case AddressingMode.UserStackPointer:
            return 'usp'
        case AddressingMode.ControlRegister:
            return 'Rc'
        case AddressingMode.RegisterPair:
            return 'Dx:Dy'
        case AddressingMode.IndirectPair:
            return '(Rx):(Ry)'
        case AddressingMode.BitField:
            return '{offset:width}'
        default:
            return '_'
    }
}

export enum Size {
    Byte = 1,
    Word = 2,
    Long = 4,
    Short = 8
}

export enum M68KFlag {
    Carry = 'C',
    Overflow = 'V',
    Zero = 'Z',
    Negative = 'N',
    Extend = 'X'
}

export function fromSizeToString(size: Size, extended = false): string {
    let result = '_'
    switch (size) {
        case Size.Byte:
            result = 'byte'
            break
        case Size.Word:
            result = 'word'
            break
        case Size.Long:
            result = 'long'
            break
        case Size.Short:
            result = 'short'
            break
        default:
            break
    }
    return extended ? result : result[0]
}

export function fromSizesToString(sizes: Size[], extended = false): string {
    return sizes.map((e) => fromSizeToString(e, extended)).join(', ')
}

const Da = AddressingMode.DataRegister
const Ad = AddressingMode.AddressRegister
const In = AddressingMode.Indirect
const Ipi = AddressingMode.PostIndirect
const Ipd = AddressingMode.PreIndirect
const Id = AddressingMode.IndirectWithDisplacement
const Im = AddressingMode.Immediate
const Ea = AddressingMode.Absolute
const Ix = AddressingMode.IndirectIndex
const Rl = AddressingMode.RegisterRange
const Pd = AddressingMode.PcDisplacement
const Pi = AddressingMode.PcIndex
const Sr = AddressingMode.StatusRegister
const Ccr = AddressingMode.ConditionCodeRegister
const Usp = AddressingMode.UserStackPointer
const Rc = AddressingMode.ControlRegister
const Rp = AddressingMode.RegisterPair
const Ip = AddressingMode.IndirectPair
const Bf = AddressingMode.BitField

/** The same mode groups as s68k's v2 instruction table, aggregated for documentation/completion. */
const MEMORY = [In, Ipi, Ipd, Id, Ix, Ea, Pd, Pi]
const ANY = [Da, Ad, ...MEMORY, Im]
const NO_Ad = [Da, ...MEMORY, Im]
const NO_Im = [Da, Ad, In, Ipi, Ipd, Id, Ix, Ea]
const NO_IM_OR_Ad = [Da, In, Ipi, Ipd, Id, Ea, Ix]
const NO_Ad_AND_NO_Im = [Da, In, Ipi, Ipd, Id, Ea, Ix]
const ONLY_REG = [Da, Ad]
const ONLY_Ad = [Ad]
const ONLY_Da = [Da]
const ONLY_Da_OR_In_OR_Ea = NO_IM_OR_Ad
const ONLY_Ea = [Ea]
const ONLY_Im = [Im]
const ONLY_In_OR_Id_OR_Ea = [In, Id, Ix, Ea, Pd, Pi]
const ONLY_Ipi = [Ipi]
const COUNT = [Da, Im]
const EXTENDED_PAIR = [Da, Ipd]
const REGISTER_LIST_OR_REGISTER = [Da, Ad, Rl]
const STATUS_DESTINATION = [...NO_IM_OR_Ad, Sr, Ccr]
/** `move`'s destinations: an address register too, which it writes as `movea`, and the USP. */
const MOVE_DESTINATION = [Da, Ad, In, Ipi, Ipd, Id, Ea, Ix, Sr, Ccr, Usp]
/** Either operand of `movec`: a general register, or a control register, the USP among them. */
const MOVEC_OPERAND = [Da, Ad, Usp, Rc]
/** Either operand of `moves`: a general register, or memory that can be written. */
const MOVES_OPERAND = [Da, Ad, In, Ipi, Ipd, Id, Ix, Ea]
/** The 68020's long multiplies and divides write one data register, or a pair of them. */
const ONE_OR_TWO_DATA_REGISTERS = [Da, Rp]
/** The memory `cas` compares and swaps: the memory alterable modes. */
const CAS_OPERAND = [In, Ipi, Ipd, Id, Ix, Ea]
/** The bounds `chk2` and `cmp2` read, a lower then an upper one: the control modes. */
const BOUNDS = [In, Id, Ix, Ea, Pd, Pi]
/** The bit fields that are read, in a data register or in memory through a control mode. */
const BIT_FIELD_SOURCE = [Da, In, Id, Ix, Ea, Pd, Pi, Bf]
/** The bit fields that are written, which a PC-relative operand cannot be. */
const BIT_FIELD_DESTINATION = [Da, In, Id, Ix, Ea, Bf]

const NO_SIZE: Size[] = []
const ANY_SIZE = [Size.Byte, Size.Word, Size.Long]
const ONLY_LONG_OR_WORD = [Size.Long, Size.Word]
const ONLY_BYTE = [Size.Byte]
const ONLY_WORD = [Size.Word]
const ONLY_LONG = [Size.Long]
const BYTE_OR_LONG = [Size.Byte, Size.Long]
const BRANCH_SIZES = [Size.Byte, Size.Short, Size.Word, Size.Long]
/** `trap<cc>` takes no size without an operand, and `.w` or `.l` with one. */
const TRAPCC_SIZES = [Size.Word, Size.Long]

export enum AffectedFlagKind {
    ToZero = 'to-zero',
    ToOne = 'to-one',
    Edits = 'edits',
    Unaffected = 'unaffected'
}

const U = AffectedFlagKind.Unaffected
const E = AffectedFlagKind.Edits
const Z = AffectedFlagKind.ToZero
const O = AffectedFlagKind.ToOne

const UNAFFECTED: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: U,
    [M68KFlag.Zero]: U,
    [M68KFlag.Overflow]: U,
    [M68KFlag.Carry]: U
}
const FLAGS_MATH: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: E,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: E,
    [M68KFlag.Carry]: E
}
const FLAGS_CMP: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: E,
    [M68KFlag.Carry]: E
}
const FLAGS_LOGIC: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: Z,
    [M68KFlag.Carry]: Z
}
const FLAGS_DIV: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: E,
    [M68KFlag.Carry]: Z
}
const FLAGS_BIT: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: U,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: U,
    [M68KFlag.Carry]: U
}
const FLAGS_LSd: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: E,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: Z,
    [M68KFlag.Carry]: E
}
const FLAGS_ROd: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: Z,
    [M68KFlag.Carry]: E
}
const FLAGS_CLR: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: Z,
    [M68KFlag.Zero]: O,
    [M68KFlag.Overflow]: Z,
    [M68KFlag.Carry]: Z
}
const FLAGS_DECIMAL: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: E,
    [M68KFlag.Negative]: U,
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: U,
    [M68KFlag.Carry]: E
}
const FLAGS_CHK: Record<M68KFlag, AffectedFlagKind> = {
    [M68KFlag.Extend]: U,
    [M68KFlag.Negative]: E,
    [M68KFlag.Zero]: U,
    [M68KFlag.Overflow]: U,
    [M68KFlag.Carry]: U
}

export type InstructionDocumentation = {
    name: string
    compundNames?: string[]
    args: AddressingMode[][]
    sizes: Size[]
    description: string
    example?: string
    defaultSize?: Size
    interactiveExample?: {
        code: string
    }
    affectsFlags: Record<M68KFlag, AffectedFlagKind>
}

type InstructionName = string

export const branchConditions = [
    'hi',
    'ls',
    'cc',
    'cs',
    'ne',
    'eq',
    'vc',
    'vs',
    'pl',
    'mi',
    'ge',
    'lt',
    'gt',
    'le',
    'hs',
    'lo'
]
export const branchConditionsDescriptions = new Map<string, string>([
    ['hi', 'Unsigned higher'],
    ['ls', 'Unsigned lower or same'],
    ['cc', 'Carry clear'],
    ['cs', 'Carry set'],
    ['ne', 'Not equal'],
    ['eq', 'Equal'],
    ['vc', 'Overflow clear'],
    ['vs', 'Overflow set'],
    ['pl', 'Plus'],
    ['mi', 'Minus'],
    ['ge', 'Greater or equal'],
    ['lt', 'Less than'],
    ['gt', 'Greater than'],
    ['le', 'Less than or equal'],
    ['hs', 'Unsigned higher or same'],
    ['lo', 'Unsigned lower']
])

export const branchConditionsFlags = new Map<string, string>([
    ['hi', '!c && !z'],
    ['ls', 'c || z'],
    ['cc', '!c'],
    ['cs', 'c'],
    ['ne', '!z'],
    ['eq', 'z'],
    ['vc', '!v'],
    ['vs', 'v'],
    ['pl', '!n'],
    ['mi', 'n'],
    ['ge', '(n && v) || (!n && !v)'],
    ['lt', '(n && !v) || (!n && v)'],
    ['gt', '(n && v && !z) || (!n && !v && !z)'],
    ['le', 'z || (n && !v) || (!n && v)'],
    ['hs', '!c'],
    ['lo', 'c']
])

export const setConditions = [...branchConditions, 't', 'f']
const setConditionsDescriptions = new Map<string, string>([
    ['t', 'True'],
    ['f', 'False'],
    ...branchConditionsDescriptions.entries()
])
export const directions = ['l', 'r']
export const directionsDescriptions = new Map<string, string>([
    ['l', 'Left'],
    ['r', 'Right']
])
/** How far a branch reaches by its size, which `bra`, `bsr` and `bcc` share. */
const BRANCH_REACH =
    'The size says how far the branch reaches: `.s` (or `.b`) about 128 bytes either way, and `.w` 32 KB. Without one, the assembler makes it `.s` when the label is above the line and that close, and `.w` otherwise. In a program for the 68020, `.l` is a long branch, which reaches anywhere in memory; see [long branches](/documentation/m68k/addressing-mode#long-branches). On the 68000 `.l` is the same as `.w`, as in EASy68K.'

/** The 68020's long multiplies, which `muls` and `mulu` say after the 68000's. */
function longMultiply(name: 'muls' | 'mulu'): string {
    return `On the 68020, \`${name}.l\` multiplies two longs. \`${name}.l d0, d1\` keeps the low 32 bits of the product in \`d1\`, and sets V when the product does not fit in them; \`${name}.l d0, d2:d1\` keeps all 64 bits, the high long in \`d2\` and the low long in \`d1\`.`
}

/** The 68020's long divides, which `divs` and `divu` say after the 68000's. */
function longDivide(name: 'divs' | 'divu', withRemainder: 'divsl' | 'divul'): string {
    return `On the 68020, \`${name}.l\` divides by a long. \`${name}.l d0, d1\` divides the long in \`d1\` and keeps only the quotient; \`${name}.l d0, d2:d1\` divides the 64-bit number whose high long is in \`d2\` and low long in \`d1\`, and puts the quotient in \`d1\` and the remainder in \`d2\`. A quotient too large for 32 bits sets V and leaves the registers unchanged. [${withRemainder}](/documentation/m68k/instruction/${withRemainder}) divides a long and keeps the remainder too.`
}

/** How `chk2` and `cmp2` read their bounds, and how they compare the register with them. */
const BOUNDS_OPERAND =
    'The operand is the address of the two bounds, stored one after the other, the lower one first, each of the instruction’s size. A data register is compared at that size; an address register is compared whole, against the bounds sign-extended to a long.'
const BOUNDS_COMPARISON =
    'The bounds are compared as signed numbers, as `dc.w -5, 5` would be, unless the upper bound is below the lower one as signed numbers. In `dc.b 16, 240`, 240 is -16 as a signed byte, so the range is the unsigned one instead: 16 to 240.'

/** What a bit field is, which each bit-field instruction says after what it does. */
const BIT_FIELD =
    'A bit field is a run of 1 to 32 bits in a data register or in memory, written `{offset:width}` straight after the operand: `width` bits, starting `offset` bits after the operand’s highest bit, which is bit 31 of a register, or bit 7 of the byte at the address. See [bit fields](/documentation/m68k/addressing-mode#bit-fields).'

/** The flags of the bit-field instructions that change the field, from the field as it was. */
const BIT_FIELD_FLAGS_BEFORE =
    'The flags describe the field before the change: N is its highest bit, and Z is set when every bit of it was 0.'
const desc = {
    move: 'Moves the value from the first operand to second operand. If the second operand is an address register, the [MOVEA](/documentation/m68k/instruction/movea) instruction is used instead. `move.l a0, usp` sets the user stack pointer, the `a7` a program has in user mode, and `move.l usp, a0` reads it; only supervisor code may use either. See [user and supervisor mode](/documentation/m68k/exceptions#modes).\n\n`move sr, d0` copies the whole status register. A 68000 lets any code do it, but the 68010 and the 68020 let only supervisor code: in user mode it raises a privilege violation there. User code on those processors reads the condition codes with `move ccr, d0` instead, which they added.',
    moveq: 'Moves an 8-bit encoded value from -128 through 255 into a data register and sign extends it to 32 bits. Values 128 through 255 are the unsigned spellings of -128 through -1.',
    movea: 'Moves the value from the first operand to second operand. If the size is word, it is sign extended to long. It does not change the SR. When using word size, the first operand is sign extended to long and the second is written as a long.',
    movem:
        'Move many, useful when you want to save a bunch of registers, for example to save their value when branching to a function it moves a list of registers to memory, or memory to a list of registers. The first operand is the list of registers, ' +
        'the second operand is the memory region. If you define the registers as the first operand, then it will save the registers to memory, if the first operand is the memory, then it will load the registers from memory. You can write the list of registers by separating them with a "/", ' +
        'and the range between registers by using a dash. ex: a3-a5/d0-d2 will select d0, d1, d2, a3, a4, a5. The order of the register will be converted to first data, then address registers, from 0 to 7. When using the pre-decrement operand, the order of the registers will be reversed, going from a7 to a0, and d7 to d0.',
    add: 'Adds the value of the first operand to second operand. If the second operand is an address register, the [ADDA](/documentation/m68k/instruction/adda) instruction is used instead.',
    addi: 'Adds the immediate value to the second operand',
    adda: 'Adds the value of the first operand to second operand. It does not change the SR.  When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    addq: 'Adds the value of the first operand to second operand. The first operand value must be between 1 and 8. If the destination is an address register, it is always treated as a long, and the condition codes are not affected.',
    sub: 'Subtracts the value of the first operand from second operand and stores in the second. If the second operand is an address register, the [SUBA](/documentation/m68k/instruction/suba) instruction is used instead.',
    suba: 'Subtracts the value of the first operand from second operand and stores in the second. It does not change the SR. When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    subq: 'Subtracts the value of the first operand from second operand and stores in the second. The first operand value must be between 1 and 8. If the destination is an address register, it is always treated as a long, and the condition codes are not affected.',
    subi: 'Subtracts the immediate value to the second operand',
    divs:
        'Divides (signed) the value of the second operand by the value of the first operand (op2 / op1). The quotient is stored in the low 16 bits of the destination register and the remainder in its high 16 bits. The first operand is read as a word, the second as a long.\n\nDividing by zero raises a division-by-zero exception: the processor runs the handler whose address is in vector 5, at `$14`, and leaves the destination unchanged. A program that has not installed one ends there, at the `divs`. See [writing a handler](/documentation/m68k/exceptions#handlers). A quotient too large for 16 bits is no exception: V is set and the destination is left unchanged, so test it with `bvs` after the division.' +
        '\n\n' +
        longDivide('divs', 'divsl'),
    divu:
        'Divides (unsigned) the value of the second operand by the value of the first operand (op2 / op1). The quotient is stored in the low 16 bits of the destination register and the remainder in its high 16 bits. The first operand is read as a word, the second as a long.\n\nDividing by zero raises a division-by-zero exception: the processor runs the handler whose address is in vector 5, at `$14`, and leaves the destination unchanged. A program that has not installed one ends there, at the `divu`. See [writing a handler](/documentation/m68k/exceptions#handlers). A quotient too large for 16 bits is no exception: V is set and the destination is left unchanged, so test it with `bvs` after the division.' +
        '\n\n' +
        longDivide('divu', 'divul'),
    muls: `Multiplies the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long.\n\n${longMultiply('muls')}`,
    mulu: `Multiplies (unsigned) the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long.\n\n${longMultiply('mulu')}`,
    swap: 'Swaps the two words of the register, you can see the register as [a,b] after the swap it will be [b,a]',
    clr: 'Sets to 0 all the bits of the destination operand, how many bits are set to 0 depends on the specified size, defaults to word',
    exg: 'Exchanges the values of the two operands, only works in 32 bits',
    neg: 'Flips the sign of the operand, depending on the specified size, defaults to word',
    ext: 'Extends the sign of the operand, depending on the specified size. If the part to extend is negative, it will be filled with 1s, otherwise it will be filled with 0s. Defaults to word',
    tst: 'Compares the operand with 0, setting the flags as `cmp #0` would.\n\nOn the 68020, `tst` also takes an address register, as a word or a long, an immediate, and an operand relative to the program counter, such as `tst.w count(pc)`.',
    cmp: 'Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions. Works by subtracting the first operand from the second operand and setting the flags. If the second operand is an address register, the [CMPA](/documentation/m68k/instruction/cmpa) instruction is used instead.\n\nOn the 68020, an immediate can also be compared with an operand relative to the program counter, as in `cmp.w #1, flag(pc)`, which is [cmpi](/documentation/m68k/instruction/cmpi).',
    cmpa: 'Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions. When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    cmpm: 'Compares two memory regions, only valid operand is the postincrement, it sets the flags accordingly which will be used by the branching instructions.',
    cmpi: 'Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions.\n\nOn the 68020, the second operand can also be relative to the program counter, as in `cmpi.w #1, flag(pc)`.',
    bcc: `Branches to the specified address if {condition code}.\n\n${BRANCH_REACH}`,
    scc: 'Sets the first byte of the destination operand to $FF (-1) if flags {condition code} is true, otherwise it sets it to 0',
    dbcc: 'Decrements the first operand by 1 and branches to the specified address if {condition code} is false and the first operand is not -1. dbra is the same as dbf (will decrement until it reaches -1). It reads the operand as a word, so it can run at maximum 64k times',
    lea: 'Loads the address of the first operand into the second operand, when using indirect addressing, the value is not read, only the address is loaded. For example "lea 4(a0), a1" will load a0 + 4 in a1',
    pea: 'Same as lea, but it pushes the address to the stack',
    dbra: 'Decrements the first operand by 1 and branches to the specified address if the first operand is not -1. dbra is the same as dbf (will decrement until it reaches -1)',
    bra: `Branches to the specified address unconditionally.\n\n${BRANCH_REACH}`,
    jmp: 'Jumps to the specified address unconditionally',
    link: 'Pushes to the stack the long content of the address register, sets the address register to the current stack pointer and then decrements the stack pointer by the specified amount.\n\nOn the 68020, `link` can be written with its size: `link.w` is the same instruction, and `link.l` takes a 32-bit displacement, for a frame larger than 32 KB. A program for the 68000 or the 68010 writes `link` without a size.',
    unlk: 'Sets the SP to the address register, then pops a long value from the stack and stores the result in the address register',
    not: 'Inverts the bits of the operand depending on the specified size',
    and: 'Performs a logical AND between the first and second operand, stores the result in the second operand',
    andi: 'Performs a logical AND between the first immediate value and second operand, stores the result in the second operand',
    or: 'Performs a logical OR between the first and second operand, stores the result in the second operand',
    ori: 'Performs a logical OR between the first immediate value and second operand, stores the result in the second operand',
    eor: 'Performs a logical XOR between the first and second operand, stores the result in the second operand',
    eori: 'Performs a logical XOR between the first immediate value and second operand, stores the result in the second operand',
    lsd: 'Shifts the bits of the destination operand to the {direction}. Two forms: (1) `ls<d> Dx/Im, Dn` shifts Dn by the count in Dx or immediate (1–8), any size. New bits are filled with 0s. Defaults to word. (2) `ls<d>.w (An)` shifts a memory word by 1; `.w` is the only size accepted and may be omitted.',
    asd: 'Shifts the bits of the destination operand to the {direction}. Two forms: (1) `as<d> Dx/Im, Dn` shifts Dn by the count in Dx or immediate (1–8), any size. ASR fills the new high bits with copies of the sign bit, ASL fills the new low bits with zeros. Defaults to word. Note: ASL sets the overflow flag if the MSB changes during the shift, while ASR always clears it. (2) `as<d>.w (An)` shifts a memory word by 1; `.w` is the only size accepted and may be omitted.',
    rod: 'Rotates the bits of the destination operand to the {direction}. Two forms: (1) `ro<d> Dx/Im, Dn` rotates Dn by the count in Dx or immediate (1–8), any size. Defaults to word. (2) `ro<d>.w (An)` rotates a memory word by 1; `.w` is the only size accepted and may be omitted.',
    roxd: 'Rotates the destination to the {direction} through the extend flag. The register form takes a data-register or immediate count; the memory form rotates one word by one place.',
    btst: 'Tests the bit of the second operand at the position of the value of the first operand, it changes the Z (zero) flag, the destination operand is not modified',
    bclr: 'Clears the bit of the second operand at the position of the value of the first operand',
    bset: 'Sets to 1 the bit of the second operand at the position of the value of the first operand',
    bchg: 'Inverts the bit of the second operand at the position of the value of the first operand',
    bsr: `Branches to the specified address and stores the return address in the stack.\n\n${BRANCH_REACH}`,
    rts: 'Returns from a subroutine, pops the return address from the stack and jumps to it',
    jsr: 'Jumps to the specified address, like the "lea" instruction, when resolving the address, it does not read the memory, so "jsr 4(a0)" will jump to the value of "a0 + 4", the address is loaded and stores the return address in the stack',
    trap: `
Asks for a service: \`trap #0\` to \`trap #14\` run a handler your program installed, and \`trap #15\` one of the simulator's tasks.

For \`trap #0\` to \`trap #14\`, the processor pushes the address of the next instruction and the status register on the supervisor stack, switches to supervisor mode, and jumps to the address held in the trap's vector: \`trap #n\` uses vector 32 + n, at \`$80\` + 4 × n. The handler ends with [rte](/documentation/m68k/instruction/rte), which returns to the instruction after the \`trap\`. Write the handler's address into the vector before the first \`trap\`, as \`move.l #service, $8C\` does for \`trap #3\`. A vector nobody filled reads \`$FFFFFFFF\`, and the program ends at the \`trap\` with a message naming the vector. See [writing a handler](/documentation/m68k/exceptions#handlers).

\`trap #15\` is EASy68K's: the simulator carries out the task whose number is in \`d0.b\`, such as task 13, which prints the string at \`a1\`, and the program carries on after the \`trap\`. It works in user mode as well. The [trap tasks](/documentation/m68k/traps) list every task with its registers.
`.trim(),
    nop: 'This instruction is a no-operation, it does not do anything.',
    movep: 'Moves a word or long between a data register and every other byte beginning at a displacement from an address register.',
    addx: 'Adds the source, the destination and the extend flag. Use matching data registers or matching predecrement operands for multi-precision arithmetic.',
    subx: 'Subtracts the source and the extend flag from the destination. Use matching data registers or matching predecrement operands for multi-precision arithmetic.',
    negx: 'Negates the destination and subtracts the extend flag as well, with the cumulative zero-flag rule used by multi-precision arithmetic.',
    abcd: 'Adds two packed binary-coded-decimal bytes together with the extend flag.',
    sbcd: 'Subtracts two packed binary-coded-decimal bytes together with the extend flag.',
    nbcd: 'Takes the packed binary-coded-decimal tens complement of one byte, including the extend flag.',
    extb: 'Sign extends the low byte of a data register directly to a long.',
    tas: 'Tests the original byte into the condition codes, then sets its top bit.',
    rtr: 'Returns by popping the condition-code byte and then the program counter from the stack.',
    chk: 'Checks that the low word of a data register is between 0 and an upper bound, as a program checks an index before it uses it. Both are read as signed words. If the value is in range, nothing happens. If it is below 0 or above the bound, the processor raises a CHK exception: it runs the handler whose address is in vector 6, at `$18`, and that handler’s `rte` returns to the instruction after the `chk`. N tells the handler which end was crossed: set below 0, clear above the bound. A program that has not installed a handler ends at the `chk`. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nOn the 68020, `chk.l` checks the whole register against a long bound, and [chk2](/documentation/m68k/instruction/chk2) takes a lower bound of your own too. There `chk` also changes Z, V and C, in ways the manual leaves undefined, so a handler should read only N.',
    trapv: 'Raises an overflow exception if the overflow flag V is set, and does nothing otherwise. Put it after arithmetic whose result must fit, to send every overflow to one handler instead of testing V with `bvs` each time. The processor runs the handler whose address is in vector 7, at `$1C`, and that handler’s `rte` returns to the instruction after the `trapv`. A program that has not installed a handler ends at the `trapv`. See [writing a handler](/documentation/m68k/exceptions#handlers).',
    illegal:
        'Raises an illegal-instruction exception, always. It is the one instruction made to be nothing else, so programs use it to mark code that must never run. The processor runs the handler whose address is in vector 4, at `$10`. The exception saves the address of the `illegal` itself, not of the instruction after it, so a handler that wants the program to carry on adds 2 to the saved address before its `rte`; otherwise the `illegal` runs again. A program that has not installed a handler ends at the `illegal`. See [writing a handler](/documentation/m68k/exceptions#handlers).',
    rte: 'Returns from an exception handler: it pops the status register and then the program counter that the exception pushed, and the interrupted program carries on. Every handler ends with `rte`, as a subroutine ends with [rts](/documentation/m68k/instruction/rts). `rte` restores the whole status register, the S bit included, so a handler entered from user mode returns to user mode, and A7 becomes the user stack pointer again. It is privileged: in user mode it raises a privilege violation. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nOn the 68010 and the 68020 the frame also holds a format word, which says how big the frame is: `rte` reads it first, pops the whole frame, and raises a format error if the word is not one the processor writes. See [format errors](/documentation/m68k/exceptions#format-error).\n\nOn the 68020, an interrupt taken on the master stack leaves a second frame on the interrupt stack, the throwaway frame: `rte` pops it first, which takes `a7` back to the master stack, then pops the real frame there. See [the throwaway frame](/documentation/m68k/exceptions#throwaway-frame).',
    stop: 'Loads the status register with the immediate word, then waits, running nothing, until an interrupt request (an IRQ) above the new interrupt mask arrives, or one at level 7. The processor takes that IRQ at once: it runs the handler whose address is in the level’s autovector, and the handler’s `rte` comes back to the instruction after the `stop`. A program uses it to wait for a timer or a key without spinning in a loop. `stop #$2000` stays in supervisor mode with the mask at 0, so every level gets through. While the processor waits, Run waits with it and the status line says what for, and a Step runs nothing. It is privileged: in user mode it raises a privilege violation. See [interrupts](/documentation/m68k/exceptions#interrupts).',
    rtd: 'Returns from a subroutine and removes its arguments from the stack in one instruction. It pops the return address, as [rts](/documentation/m68k/instruction/rts) does, then adds the displacement to the stack pointer. A caller that pushed 8 bytes of arguments before its `bsr` gets them taken off by `rtd #8`, so it does not need its own `addq.l #8, sp` after every call.',
    bkpt: 'Marks a breakpoint for a hardware debugger. On a 68010 board with a debugger attached, the processor stops there and hands over to the debugger. With none attached, as in this editor, it raises an illegal-instruction exception instead, as [illegal](/documentation/m68k/instruction/illegal) does: the processor runs the handler whose address is in vector 4, at `$10`. The saved address is the `bkpt`’s own, so a handler that wants the program to carry on adds 2 to it before its `rte`. A program that has not installed a handler ends at the `bkpt`. The number, 0 to 7, says which breakpoint it is. To stop a program while you debug it here, set a breakpoint beside the line numbers instead.',
    movec: 'Copies a control register into a data or address register, or a data or address register into a control register. The 68010’s control registers are `vbr`, the vector base register, which says where the vector table starts; `sfc` and `dfc`, the function codes that [moves](/documentation/m68k/instruction/moves) uses; and `usp`, the user stack pointer. Moving the vector table is its main use: after `movec d0, vbr`, every exception reads its handler’s address at VBR + 4 × the vector number instead of at 4 × the vector number. It is always long, leaves the flags alone, and is privileged: in user mode it raises a privilege violation. See [on the 68010](/documentation/m68k/exceptions#68010).\n\nThe 68020 adds four control registers. `msp` and `isp` are its master and interrupt stack pointers: in supervisor mode the M bit of `sr` makes `a7` one of them, and `isp` is the 68000’s supervisor stack pointer. The master stack pointer starts at 0, so a program sets it with `movec` before it sets M. `cacr` and `caar` are the cache control and cache address registers; this editor’s 68020 has no cache, so they only keep what is written. See [master and interrupt stacks](/documentation/m68k/exceptions#master-stack).',
    moves: 'Moves a byte, word or long between a register and memory in another address space. An operating system uses it to reach the memory of a user program, which it keeps apart from its own: on a 68010 each memory access goes to an address space named by a three-bit function code, and `moves` reads from the space in `sfc` and writes to the space in `dfc`, which [movec](/documentation/m68k/instruction/movec) sets. This editor has one memory for everything, so `moves` reaches the same bytes `move` does, whatever `sfc` and `dfc` hold. One operand is a data or address register and the other is memory. It leaves the flags alone, and is privileged: in user mode it raises a privilege violation.',
    reset: 'Resets the devices wired to the processor: a real 68000 holds its RESET line for a moment and then goes on with the next instruction, its own registers unchanged. This editor has no such devices, so `reset` does nothing, as in EASy68K. It is not the reset that starts the processor at power-on, which reads the vectors at `$0` and `$4`. It is privileged: in user mode it raises a privilege violation.',
    trapcc: 'Raises an exception if {condition code}, and does nothing otherwise. It is [trapv](/documentation/m68k/instruction/trapv) for every condition a branch can test: `trapvs` traps on overflow as `trapv` does, `trapeq` when Z is set, and so on, with `trapt`, which always traps, and `trapf`, which never does. Put it where a result must not be what the condition says, to send that case to one handler instead of branching away each time. The processor runs the handler whose address is in vector 7, at `$1C`, the vector `trapv` uses, and that handler’s `rte` returns to the instruction after the trap. A program that has not installed a handler ends there. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nA word or a long can follow it, as in `trapeq.w #3`. The processor does nothing with it, but a handler can read it to tell its traps apart: it is the word or the long just before the address `rte` returns to. Without one, write no size.',
    chk2: `Checks that a register is between a lower and an upper bound, as a program checks an index before it uses it. It is [chk](/documentation/m68k/instruction/chk) with a lower bound of your own instead of 0. ${BOUNDS_OPERAND} If the value is in range, nothing happens. If it is outside, the processor raises a CHK exception: it runs the handler whose address is in vector 6, at \`$18\`, the vector \`chk\` uses, and that handler’s \`rte\` returns to the instruction after the \`chk2\`. A program that has not installed a handler ends at the \`chk2\`. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nZ is set when the register equals either bound, and C when it is outside them; N and V change too, in ways the manual leaves undefined. ${BOUNDS_COMPARISON} [cmp2](/documentation/m68k/instruction/cmp2) compares the same way without the exception.`,
    cmp2: `Compares a register with a lower and an upper bound and sets the flags: Z when the register equals either bound, and C when it is outside them, so \`bcs\` after it branches when the value is out of range. ${BOUNDS_OPERAND} It is [chk2](/documentation/m68k/instruction/chk2) without the exception, for a program that decides itself what to do with a value out of range.\n\nN and V change too, in ways the manual leaves undefined. ${BOUNDS_COMPARISON}`,
    cas: 'Compare and swap: compares a data register with an operand in memory, and writes a second register there only if they are equal. `cas.l d0, d1, (a0)` compares `d0` with the long at `(a0)`. If they are equal, it writes `d1` there; if not, it writes nothing and copies the long at `(a0)` into `d0`, so the program has the value that is there now. The flags are those of the comparison, so `beq` after it means the write happened.\n\nThe reading, the comparison and the writing are one step that nothing can come between, not even an interrupt. That makes it the way to update a value that an interrupt handler or another program also changes: read the value, work out the new one, and let `cas` store it only if the value is still the one read, trying again otherwise. [cas2](/documentation/m68k/instruction/cas2) does the same with two values at once.',
    cas2: 'Compares and swaps two operands at once: `cas2.l d0:d1, d2:d3, (a0):(a1)` compares `d0` with the long at `(a0)` and `d1` with the long at `(a1)`. Only if both are equal does it write `d2` to `(a0)` and `d3` to `(a1)`; otherwise it writes neither, and copies the two values into `d0` and `d1`. Each address is held in a data or an address register. As with [cas](/documentation/m68k/instruction/cas), it is one step that nothing can come between, so two values that must change together, such as the two ends of a queue, never change one without the other. The flags are those of the first comparison, or of the second when the first is equal, so `beq` after it means both were written.',
    pack: "Packs two decimal digits into one byte of packed decimal, where each half of the byte is one digit, so `$42` stands for 42. The digits come one in each byte of a word, in its low four bits, as they are in the ASCII text `'42'`, the word `$3432`. `pack` adds the adjustment to that word, then keeps bits 11 to 8 as the high digit and bits 3 to 0 as the low one. The operands are two data registers, reading the low word of the first and writing the low byte of the second, or two predecrement operands, which read the two bytes below the first address and write one byte below the second, so a string of digits is packed from its end. [unpk](/documentation/m68k/instruction/unpk) does the opposite, and [abcd](/documentation/m68k/instruction/abcd) adds numbers in packed decimal. It leaves the flags as they were.",
    unpk: "Unpacks a byte of packed decimal into two bytes, one digit in the low four bits of each, then adds the adjustment: `unpk d0, d1, #$3030` turns `$42` into `$3432`, the ASCII text `'42'`, ready to print. The operands are two data registers, reading the low byte of the first and writing the low word of the second, or two predecrement operands, which read the byte below the first address and write two bytes below the second. [pack](/documentation/m68k/instruction/pack) does the opposite. It leaves the flags as they were.",
    divsl: 'Divides a long by a long, signed, and keeps both the quotient and the remainder: `divsl.l d0, d1:d2` divides `d2` by `d0`, puts the quotient in `d2` and the remainder in `d1`. The remainder has the sign of the number divided, so -7 divided by 2 is -3 with -1 left over. It is the 32-bit division of [divs](/documentation/m68k/instruction/divs) with the remainder kept: `divs.l d0, d2` divides the same way and keeps only the quotient. Dividing by zero raises a division-by-zero exception, through vector 5 at `$14`, as `divs` does. The one quotient too large for 32 bits, -2147483648 divided by -1, sets V and leaves the registers unchanged.',
    divul: 'Divides a long by a long, unsigned, and keeps both the quotient and the remainder: `divul.l d0, d1:d2` divides `d2` by `d0`, puts the quotient in `d2` and the remainder in `d1`. It is the 32-bit division of [divu](/documentation/m68k/instruction/divu) with the remainder kept: `divu.l d0, d2` divides the same way and keeps only the quotient. Dividing by zero raises a division-by-zero exception, through vector 5 at `$14`, as `divu` does.',
    bftst: `Tests a bit field: N becomes its highest bit, Z is set when every bit of it is 0, and V and C are cleared. The field is left as it is, as [tst](/documentation/m68k/instruction/tst) leaves its operand. ${BIT_FIELD}`,
    bfextu: `Copies a bit field into the low bits of a data register and fills the bits above it with 0s, reading the field as an unsigned number: \`bfextu d0{24:8}, d1\` copies the low byte of \`d0\` into \`d1\`. It takes out a value packed into fewer bits than a byte, a word or a long, such as the 5 bits of red in a 16-bit colour. The flags are the field’s: N its highest bit, and Z set when it is 0. ${BIT_FIELD} [bfexts](/documentation/m68k/instruction/bfexts) reads the field as a signed number instead.`,
    bfexts: `Copies a bit field into the low bits of a data register and fills the bits above it with copies of the field’s highest bit, reading the field as a signed number: a field of 4 bits holding \`%1110\` becomes -2. The flags are the field’s: N its highest bit, and Z set when it is 0. ${BIT_FIELD} [bfextu](/documentation/m68k/instruction/bfextu) reads the field as an unsigned number instead.`,
    bfffo: `Finds the first bit set to 1 in a bit field, starting from its highest bit, and puts where it is into a data register: the field’s offset plus how many 0s come before the 1. If every bit of the field is 0, the register gets the offset plus the width, one past the field’s end. So \`bfffo d0{0:32}, d1\` counts the 0s above the highest 1 of \`d0\`, and 31 minus that count is the number of the bit. Programs use it to find the first free slot in a bitmap, or the highest bit set in a number. The flags are the field’s, so Z is set when it has no 1 at all. ${BIT_FIELD}`,
    bfchg: `Inverts every bit of a bit field, as [bchg](/documentation/m68k/instruction/bchg) inverts one bit. ${BIT_FIELD_FLAGS_BEFORE} ${BIT_FIELD}`,
    bfclr: `Clears every bit of a bit field to 0, as [bclr](/documentation/m68k/instruction/bclr) clears one bit: \`bfclr d0{20:12}\` clears the low 12 bits of \`d0\`. ${BIT_FIELD_FLAGS_BEFORE} ${BIT_FIELD}`,
    bfset: `Sets every bit of a bit field to 1, as [bset](/documentation/m68k/instruction/bset) sets one bit: \`bfset (a0){3:4}\` sets bits 4 to 1 of the byte at \`a0\`. ${BIT_FIELD_FLAGS_BEFORE} ${BIT_FIELD}`,
    bfins: `Inserts the low bits of a data register into a bit field, as many as the field is wide, and leaves the bits around the field as they were: \`bfins d1, (a0){0:5}\` writes the low 5 bits of \`d1\` into the first 5 bits at \`a0\`. It puts a value into fewer bits than a byte, a word or a long, such as the red of a 16-bit colour. The flags describe the value inserted: N is its highest bit, and Z is set when it is 0. ${BIT_FIELD} [bfextu](/documentation/m68k/instruction/bfextu) reads a field back.`
}
const dirsDesc = {
    dc: 'Defines constants, following the directive there can be a list of constants separated by commas, the size of each constant depends on the selected size. If no size is selected, the size is determined by the value of the constant. If the constant is a string, it will be stored as a sequence of bytes, if it is a number, it will be stored as a sequence of words',
    ds: 'Defines a space in memory of N elements, the size of each element depends on the specified size, the content of the space is undefined',
    dcb: 'Defines a space in memory of N elements, the size of each element depends on the specified size, the content of the space is initialized to the second operand',
    org: 'Sets the current position in memory for the following instructions',
    equ: 'Defines a constant expression. The symbol cannot be redefined later.',
    set: 'Defines an expression value that may be redefined later in the assembled order.',
    end: 'Stops assembly and optionally selects the program entry point. Code after it is ignored.',
    reg: 'Names a register list for use by `movem`.',
    fail: 'Raises an assembly error with the rest of the line as its message.',
    simhalt:
        'Pauses the program: it assembles as `$FFFF $FFFF`, the two words EASy68K stops at, and Run resumes at the following instruction. A program that neither pauses nor ends itself with task 9 runs on into whatever follows its last instruction, its data included.',
    section: 'Selects one of sixteen independent location counters, numbered 0 through 15.',
    offset: 'Enters an offset-only region at the given value. Labels receive offsets and no bytes are emitted until `org`.',
    include:
        'Assembles another text File at this point. The path is relative to the including File, then the Project root.',
    incbin: 'Copies the exact bytes of another File into memory at this point.',
    memory: [
        'Marks a range of memory with a rule the program has to follow there, as a real computer has memory that can only be read, or addresses where nothing is connected. `memory rom $8000,$8FFF` covers `$8000` to `$8FFF`, both included. There are four kinds:',
        '',
        '- `rom`: the program can read and run code here, but its writes are ignored, so the bytes stay as they are.',
        '- `read`: read only. The program can read and run code here, and a write is a bus error.',
        '- `protected`: only [supervisor mode](/documentation/m68k/exceptions#modes) can use it. Any access from user mode, a read, a write or running code, is a bus error.',
        '- `invalid`: nothing is there. Any access, a read, a write or running code, is a bus error.',
        '',
        'A **bus error** is the exception the processor takes when memory refuses an access, vector 2. It runs the handler whose address is at `$8`, as for any [exception](/documentation/m68k/exceptions#handlers); a program that installed none ends, and the Log says what it tried to access and which range refused it. A program has at most one range of each kind: a second `memory` line of the same kind replaces the first. The rules are for the program alone: the debugger still reads and changes these bytes, and the memory view shows each range as a region.'
    ].join('\n'),
    opt: "Chooses the processor the program is written for. Write `opt p=68010` or `opt p=68020` at the top of the program to use an instruction or an addressing mode a later processor added, such as the 68010's `movec`, the 68020's `extb`, or its [scaled index and memory indirect modes](/documentation/m68k/addressing-mode#68020) and long branches; a program without the line is written for the 68000. Every instruction of both is there, the 68020's [bit fields](/documentation/m68k/addressing-mode#bit-fields), long multiplies and divides, `cas`, `chk2` and `trap<cc>` among them, but for the 68020's module call, `callm` and `rtm`. `opt bit` gives a program for the 68000 or the 68010 the 68020's bit-field instructions, as it does in EASy68K, with that processor's addressing modes; `opt p=68020` has them already. EASy68K's listing options, `cre`, `mex`, `sex`, `war` and `cex`, each also with `no` before it, are accepted and change nothing.",
    list: 'Accepted for compatibility and ignored.',
    nolist: 'Accepted for compatibility and ignored.',
    page: 'Accepted for compatibility and ignored.'
}

export function getAddressingModeNames(addressingModes: AddressingMode[]): string {
    const args = addressingModes
        .filter((am) => am !== AddressingMode.BitField)
        .map((am) => addressingModeToString(am))
    //removes duplicates
    const names = args.filter((value, index, self) => self.indexOf(value) === index).join('/')
    //a bit field follows the operand it is in: `Dn/(An)/…{offset:width}`
    return addressingModes.includes(AddressingMode.BitField)
        ? `${names}${addressingModeToString(AddressingMode.BitField)}`
        : names
}

export const M68KDirectiveDocumentation = {
    dc: makeDirective(
        'dc',
        ANY_SIZE,
        dirsDesc.dc,
        "dc.b 'Hello world!', 4, %10, $F, @8, 'a', some_label"
    ),
    ds: makeDirective('ds', ANY_SIZE, dirsDesc.ds, 'ds.l 100'),
    dcb: makeDirective('dcb', ANY_SIZE, dirsDesc.dcb, 'dcb.b 50, 1'),
    org: makeDirective('org', NO_SIZE, dirsDesc.org, 'org $1000'),
    equ: makeDirective('equ', NO_SIZE, dirsDesc.equ, 'name equ 10'),
    set: makeDirective('set', NO_SIZE, dirsDesc.set, 'count set count+1'),
    end: makeDirective('end', NO_SIZE, dirsDesc.end, 'end START'),
    reg: makeDirective('reg', NO_SIZE, dirsDesc.reg, 'saved reg d0-d3/a0-a2'),
    fail: makeDirective('fail', NO_SIZE, dirsDesc.fail, 'fail Expected an argument'),
    simhalt: makeDirective('simhalt', NO_SIZE, dirsDesc.simhalt, 'simhalt'),
    section: makeDirective('section', NO_SIZE, dirsDesc.section, 'section 1'),
    offset: makeDirective('offset', NO_SIZE, dirsDesc.offset, 'offset 0'),
    include: makeDirective('include', NO_SIZE, dirsDesc.include, "include 'lib/io.x68'"),
    incbin: makeDirective('incbin', NO_SIZE, dirsDesc.incbin, "incbin 'images/sprite.bin'"),
    memory: makeDirective('memory', NO_SIZE, dirsDesc.memory, 'memory rom $8000,$8FFF'),
    opt: makeDirective('opt', NO_SIZE, dirsDesc.opt, 'opt p=68020'),
    list: makeDirective('list', NO_SIZE, dirsDesc.list, 'list'),
    nolist: makeDirective('nolist', NO_SIZE, dirsDesc.nolist, 'nolist'),
    page: makeDirective('page', NO_SIZE, dirsDesc.page, 'page')
}
export const M68KDirectiveDocumentationList = Object.values(M68KDirectiveDocumentation)

export const M68kDocumentation = {
    move: makeIns(
        'move',
        [[...ANY, Sr, Ccr, Usp], MOVE_DESTINATION],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.move,
        'move.b #10, d0',
        Size.Word,
        `
* --- Different sizes ---
move.b #$FF, d0
move.w #$1234, d1
move.l #$AABBCCDD, d2

* --- Register to register ---
move.l d2, d3

* --- Immediate to memory ---
lea $2000, a0
move.l #$DEADBEEF, (a0)
move.w #$1234, 4(a0)

* --- Memory to register ---
move.l (a0), d4
move.w 4(a0), d5

* --- Post-increment and pre-decrement ---
lea $2000, a1
move.l (a1)+, d6
move.l #$11223344, -(a1)

* --- The user stack pointer, for supervisor code only ---
lea $8000, a2
move.l a2, usp ; the a7 of user mode will start at $8000
move.l usp, a3
    `
    ),
    moveq: makeIns(
        'moveq',
        [ONLY_Im, ONLY_Da],
        ONLY_LONG,
        FLAGS_LOGIC,
        desc.moveq,
        'moveq #10, d0',
        Size.Long,
        `
moveq #100, d0
moveq #-1, d1
moveq #255, d2 ; the encoded byte is $ff, so d2 becomes -1
moveq #-128, d3
; moveq #256, d4 ; error! the encoded value must be -128..255
    `
    ),
    movem: makeIns(
        'movem',
        [
            [...REGISTER_LIST_OR_REGISTER, In, Ipi, Id, Ix, Ea, Pd, Pi],
            [...REGISTER_LIST_OR_REGISTER, In, Ipd, Id, Ix, Ea]
        ],
        ONLY_LONG_OR_WORD,
        UNAFFECTED,
        desc.movem,
        'movem.l d0-d2, (a0)',
        Size.Word,

        `
move.l #$1, d0
move.l #$2, d1
move.l #$3, d2
move.l #$4, a0
bsr my_function
bra END

my_function:
    ; save d0-d2/a0 to the stack
    movem.l d0-d2/a0, -(sp)
    ; overwrite them inside the function
    move.l #$FF, d0
    move.l #$FF, d1
    move.l #$FF, d2
    move.l #$FF, a0
    ; restore from the stack, values are back
    movem.l (sp)+, d0-d2/a0
    rts
END:
    `
    ),
    movea: makeIns(
        'movea',
        [ANY, ONLY_Ad],
        ONLY_LONG_OR_WORD,
        UNAFFECTED,
        desc.movea,
        'movea.l d0, a0',
        Size.Word,
        `
* --- Word is sign-extended to long ---
move.l #$0008, d0
movea.w d0, a0

* --- Negative word sign-extends with 1s ---
move.l #$FFF0, d1
movea.w d1, a1 ; a1 = $FFFFFFF0

* --- Long is copied as-is ---
move.l #$12345678, d2
movea.l d2, a2

* --- Does not affect flags ---
move.l #0, d3
tst d3
movea.l #$FFFFFFFF, a3 ; flags unchanged
    `
    ),
    add: makeIns(
        'add',
        [ANY, NO_Im],
        ANY_SIZE,
        FLAGS_MATH,
        desc.add,
        'add.l (a4, d3), d1',
        Size.Word,
        `
* --- Different sizes ---
move.l #$FF, d0
add.b #$01, d0 ; only affects low byte

move.l #$10000, d1
add.w #$FFFF, d1 ; only affects low word

move.l #$10000000, d2
add.l #$F0000000, d2 ; carry flag set

* --- Overflow: signed result changes sign ---
move.l #$7F, d3
add.b #$01, d3 ; $80, V flag set
    `
    ),
    adda: makeIns(
        'adda',
        [ANY, ONLY_Ad],
        ONLY_LONG_OR_WORD,
        UNAFFECTED,
        desc.adda,
        'adda.l d0, a0',
        Size.Word,
        `
* --- Word is sign-extended before adding ---
move.l #$10000, a0
adda.w #$FFFE, a0 ; $FFFE sign-extends to $FFFFFFFE (-2)

* --- Long adds as-is ---
move.l #$10000, a1
adda.l #$10000, a1

* --- Does NOT affect flags (compare with add) ---
move.l #$10000, d0
move.l #$10000, a2
add.l #$F0000000, d0 ; carry set
adda.l #$F0000000, a2 ; flags unchanged
    `
    ),
    addq: makeIns(
        'addq',
        [ONLY_Im, NO_Im],
        ANY_SIZE,
        FLAGS_MATH,
        desc.addq,
        'addq.w #4, d1',
        Size.Word,
        `
move.l #0, d0
addq.l #8, d0
addq.l #1, d0
; addq.w #9, d0 ; error! immediate must be 1-8
    `
    ),
    addi: makeIns(
        'addi',
        [ONLY_Im, NO_IM_OR_Ad],
        ANY_SIZE,
        FLAGS_MATH,
        desc.addi,
        'addi.w #4, d1',
        Size.Word,
        `
move.l #$1000, d0
addi.w #$234, d0
addi.l #$10000, d0
    `
    ),
    sub: makeIns(
        'sub',
        [ANY, NO_Im],
        ANY_SIZE,
        FLAGS_MATH,
        desc.sub,
        'sub.w $1000, d1',
        Size.Word,
        `
move.l #$100, d0
sub.b #$01, d0 ; only affects low byte

* --- Borrow: subtracting more than available ---
move.l #$00, d1
sub.b #$01, d1 ; carry flag set (borrow)

* --- Overflow ---
move.l #$80, d2
sub.b #$01, d2 ; $7F, V flag set
    `
    ),
    suba: makeIns(
        'suba',
        [ANY, ONLY_Ad],
        ONLY_LONG_OR_WORD,
        UNAFFECTED,
        desc.suba,
        'suba.w #$FF, a1',
        Size.Word,
        `
* --- Word is sign-extended before subtracting ---
move.l #$10000, a0
suba.w #$0002, a0

* --- Does NOT affect flags ---
move.l #0, d0
tst d0
suba.l #$FFFFF, a1 ; flags unchanged (Z still set)
    `
    ),
    subi: makeIns(
        'subi',
        [ONLY_Im, NO_IM_OR_Ad],
        ANY_SIZE,
        FLAGS_MATH,
        desc.subi,
        'subi #1, d3',
        Size.Word,
        `
move.l #$1234, d0
subi.w #$0234, d0
subi.l #$1000, d0
    `
    ),
    subq: makeIns(
        'subq',
        [ONLY_Im, NO_Im],
        ANY_SIZE,
        FLAGS_MATH,
        desc.subq,
        'subq.b #1, d3',
        Size.Word,
        `
move.l #$10, d0
subq.l #8, d0
subq.l #1, d0
; subq.w #9, d0 ; error! immediate must be 1-8
    `
    ),
    divs: makeIns(
        'divs',
        [NO_Ad, ONE_OR_TWO_DATA_REGISTERS],
        ONLY_LONG_OR_WORD,
        FLAGS_DIV,
        desc.divs,
        'divs #2, d1',
        Size.Word,
        `
* --- Result: quotient in low word, remainder in high word ---
move.l #21, d0
divs #4, d0
move.w d0, d1 ; d1 = quotient (5)
swap d0
move.w d0, d2 ; d2 = remainder (1)

* --- Negative dividend ---
move.l #-21, d3
divs #4, d3
move.w d3, d4 ; d4 = quotient (-5)
swap d3
move.w d3, d5 ; d5 = remainder (-1)

; move.l #10, d6
; divs #0, d6 ; division by zero: with nothing at $14, the program ends here
    `
    ),
    divu: makeIns(
        'divu',
        [NO_Ad, ONE_OR_TWO_DATA_REGISTERS],
        ONLY_LONG_OR_WORD,
        FLAGS_DIV,
        desc.divu,
        'divu #4, d1',
        Size.Word,
        `
* --- Result: quotient in low word, remainder in high word ---
move.l #21, d0
divu #4, d0
move.w d0, d1 ; d1 = quotient (5)
swap d0
move.w d0, d2 ; d2 = remainder (1)

* --- Large unsigned value ---
move.l #$FFFE, d3
divu #$FFFF, d3
move.w d3, d4 ; d4 = quotient (0)
swap d3
move.w d3, d5 ; d5 = remainder ($FFFE)
    `
    ),
    muls: makeIns(
        'muls',
        [NO_Ad, ONE_OR_TWO_DATA_REGISTERS],
        ONLY_LONG_OR_WORD,
        FLAGS_LOGIC,
        desc.muls,
        'muls d0, d1',
        Size.Word,
        `
move.l #2, d0
muls #-3, d0 ; d0 = -6

move.l #-4, d1
muls #-5, d1 ; d1 = 20

* --- Word operands, long result ---
move.l #$100, d2
muls #$100, d2 ; d2 = $10000
    `
    ),
    mulu: makeIns(
        'mulu',
        [NO_Ad, ONE_OR_TWO_DATA_REGISTERS],
        ONLY_LONG_OR_WORD,
        FLAGS_LOGIC,
        desc.mulu,
        'mulu d5, d2',
        Size.Word,
        `
move.l #2, d0
mulu #4, d0 ; d0 = 8

* --- Word operands, long result ---
move.l #$FFFF, d1
mulu #$FFFF, d1 ; d1 = $FFFE0001
    `
    ),
    swap: makeIns(
        'swap',
        [ONLY_Da],
        ONLY_WORD,
        FLAGS_LOGIC,
        desc.swap,
        'swap d0',
        Size.Word,
        `
move.l #$12345678, d0
swap d0 ; d0 = $56781234
    `
    ),
    clr: makeIns(
        'clr',
        [NO_Ad_AND_NO_Im],
        ANY_SIZE,
        FLAGS_CLR,
        desc.clr,
        'clr.b d0',
        Size.Word,
        `
* --- Only clears the portion specified by size ---
move.l #$FFFFFFFF, d0
clr.b d0 ; d0 = $FFFFFF00

move.l #$FFFFFFFF, d1
clr.w d1 ; d1 = $FFFF0000

move.l #$FFFFFFFF, d2
clr.l d2 ; d2 = $00000000
    `
    ),
    exg: makeIns(
        'exg',
        [ONLY_REG, ONLY_REG],
        ONLY_LONG,
        UNAFFECTED,
        desc.exg,
        'exg d0, a1',
        Size.Long,
        `
* --- Data registers ---
move.l #$AAAA, d0
move.l #$BBBB, d1
exg d0, d1

* --- Data and address register ---
move.l #$1234, d2
move.l #$5678, a0
exg d2, a0
    `
    ),
    neg: makeIns(
        'neg',
        [ONLY_Da_OR_In_OR_Ea],
        ANY_SIZE,
        FLAGS_MATH,
        desc.neg,
        'neg.l d0',
        Size.Word,
        `
move.b #1, d0
neg.b d0 ; d0 low byte = $FF (-1)

move.l #$7F, d1
neg.b d1 ; d1 low byte = $81 (-127), V flag set

* --- Negating zero ---
move.l #0, d2
neg.l d2 ; d2 = 0, Z flag set

* --- Size matters ---
move.l #$100, d3
neg.b d3 ; only negates low byte (was $00)
    `
    ),
    ext: makeIns(
        'ext',
        [ONLY_Da],
        ONLY_LONG_OR_WORD,
        FLAGS_LOGIC,
        desc.ext,
        'ext.w d0',
        Size.Word,
        `
* --- Byte to word: sign-extends byte in low word ---
move.l #$0000007F, d0
ext.w d0 ; d0 = $0000007F (positive, no change)

move.l #$000000FF, d1
ext.w d1 ; d1 = $0000FFFF (-1 sign-extended)

* --- Word to long: sign-extends word ---
move.l #$00008000, d2
ext.l d2 ; d2 = $FFFF8000
    `
    ),
    lea: makeIns(
        'lea',
        [ONLY_In_OR_Id_OR_Ea, ONLY_Ad],
        ONLY_LONG,
        UNAFFECTED,
        desc.lea,
        'lea (a0), a1',
        Size.Long,
        `
org $2000
someLabel: dc.l 0

START:
lea someLabel, a0
lea (a0), a1
lea $3000, a2
    `
    ),
    pea: makeIns(
        'pea',
        [ONLY_In_OR_Id_OR_Ea],
        ONLY_LONG,
        UNAFFECTED,
        desc.pea,
        'pea (a0)',
        Size.Long,
        `
* --- Pushes address onto stack, SP decremented by 4 ---
move.l sp, d0 ; save sp before
pea $2000
move.l sp, d1 ; sp decreased by 4
move.l (sp), d2 ; d2 = $00002000
    `
    ),
    tst: makeIns(
        'tst',
        [NO_IM_OR_Ad],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.tst,
        'tst.b (a0)',
        Size.Word,
        `
* --- Testing different values ---
move.l #$80, d0
tst.b d0 ; N flag set (bit 7 = 1)

move.l #$00, d1
tst.b d1 ; Z flag set

move.l #$7F, d2
tst.b d2 ; no flags (positive, nonzero)
    `
    ),
    cmp: makeIns(
        'cmp',
        [ANY, ONLY_REG],
        ANY_SIZE,
        FLAGS_CMP,
        desc.cmp,
        'cmp.l -(sp), d0',
        Size.Word,
        `
move.l #10, d0
move.l #20, d1
cmp.l d1, d0 ; compares d0 - d1 (sets flags, d0 unchanged)
sgt d2 ; d2 = $FF if d0 > d1, else $00
slt d3 ; d3 = $FF if d0 < d1, else $00
seq d4 ; d4 = $FF if d0 == d1, else $00

* --- Equal values ---
move.l #42, d5
move.l #42, d6
cmp.l d6, d5
seq d7 ; d7 = $FF
    `
    ),
    cmpi: makeIns(
        'cmpi',
        [ONLY_Im, NO_IM_OR_Ad],
        ANY_SIZE,
        FLAGS_CMP,
        desc.cmpi,
        'cmpi.w #10, d3',
        Size.Word,
        `
move.l #10, d0
cmpi.w #10, d0
seq d1 ; d1 = $FF (equal)

move.l #5, d2
cmpi.w #10, d2
slt d3 ; d3 = $FF (5 < 10)
sgt d4 ; d4 = $00
    `
    ),
    cmpa: makeIns(
        'cmpa',
        [ANY, ONLY_Ad],
        ONLY_LONG_OR_WORD,
        FLAGS_CMP,
        desc.cmpa,
        'cmpa.l $1000, a0',
        Size.Word,
        `
lea $1000, a0
cmpa.l #$1000, a0
seq d0 ; d0 = $FF (equal)

lea $2000, a1
cmpa.l #$1000, a1
sgt d1 ; d1 = $FF ($2000 > $1000)
    `
    ),
    cmpm: makeIns(
        'cmpm',
        [ONLY_Ipi, ONLY_Ipi],
        ANY_SIZE,
        FLAGS_CMP,
        desc.cmpm,
        'cmpm.b (a0)+, (a1)+',
        Size.Word,
        `
* --- Compare two memory blocks byte by byte ---
lea $2000, a0 ; free memory: the program itself is at $1000
lea $2100, a1
move.l #$AABB, (a0)
move.l #$AABB, (a1)

cmpm.b (a0)+, (a1)+ ; compare 1st byte (equal)
seq d0
cmpm.b (a0)+, (a1)+ ; compare 2nd byte (equal)
seq d1
; a0 and a1 are auto-incremented after each cmpm
    `
    ),
    bcc: {
        ...makeIns(
            'bcc',
            [ONLY_Ea],
            BRANCH_SIZES,
            UNAFFECTED,
            desc.bcc,
            '`b<cc> label` Where cc is one of the condition codes',
            undefined,
            `
* --- Loop: count down from 10 ---
move.l #10, d0
move.l #0, d1
loop:
    addq.l #1, d1
    subq.l #1, d0
    bne loop ; branch if d0 != 0

* --- Conditional skip ---
move.l #5, d2
move.l #5, d3
cmp.l d3, d2
beq are_equal ; branch if d2 == d3
move.l #0, d4
bra done
are_equal:
    move.l #$FF, d4
done:
    `
        ),
        compundNames: branchConditions.map((c) => `b${c}`)
    },
    scc: {
        ...makeIns(
            'scc',
            [NO_Ad_AND_NO_Im],
            ONLY_BYTE,
            UNAFFECTED,
            desc.scc,
            '`s<cc> d0` Where cc is one of the condition codes',
            undefined,
            `
move.l #5, d0
tst d0
spl d1 ; d1 = $FF (positive)
seq d2 ; d2 = $00 (not zero)

move.l #0, d3
tst d3
seq d4 ; d4 = $FF (zero)
sne d5 ; d5 = $00 (is zero)

move.l #-1, d6
tst d6
smi d7 ; d7 = $FF (negative)
    `
        ),
        compundNames: setConditions.map((c) => `s${c}`)
    },
    dbcc: {
        ...makeIns(
            'dbcc',
            [ONLY_Da, ONLY_Ea],
            ONLY_WORD,
            UNAFFECTED,
            desc.dbcc,
            '`db<cc> d0, label` Where cc is one of the condition codes',
            undefined,
            `
* --- Loops d0+1 times (decrements THEN tests) ---
move.l #3, d0
move.l #0, d1
loop:
    addq.l #1, d1
    dbra d0, loop ; loop runs 4 times (3, 2, 1, 0)

* --- With condition: dbne stops early if condition is true ---
move.l #10, d2
move.l #$FF, d3
loop2:
    subq.l #1, d3
    tst d3
    dbne d2, loop2 ; stops when d3 = 0 OR d2 exhausted
    `
        ),
        compundNames: setConditions.map((c) => `db${c}`)
    },
    not: makeIns(
        'not',
        [NO_Ad_AND_NO_Im],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.not,
        'not.b d0',
        Size.Word,
        `
* --- Bitwise complement ---
move.l #%00001111, d0
not.b d0 ; d0 low byte = %11110000

* --- Size affects which bits are flipped ---
move.l #$0000FFFF, d1
not.w d1 ; low word flipped: d1 = $00000000

move.l #$0000FFFF, d2
not.l d2 ; all bits flipped: d2 = $FFFF0000
    `
    ),
    or: makeIns(
        'or',
        [NO_Ad, NO_Ad_AND_NO_Im],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.or,
        'or.l #$FF, d1',
        Size.Word,
        `
move.l #%11110000, d0
move.l #%10101010, d1
or.b d1, d0 ; d0 = %11111010

* --- Use for setting specific bits ---
move.l #$00, d2
or.b #%00000101, d2 ; set bits 0 and 2
    `
    ),
    ori: makeIns(
        'ori',
        [ONLY_Im, STATUS_DESTINATION],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.ori,
        'ori.l #%1100, (a0)',
        Size.Word,
        `
move.l #%00001111, d0
ori.b #%11110000, d0 ; d0 = %11111111
    `
    ),
    and: makeIns(
        'and',
        [NO_Ad, NO_Ad_AND_NO_Im],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.and,
        'and.l d0, d1',
        Size.Word,
        `
move.l #%11110000, d0
move.l #%10101010, d1
and.b d1, d0 ; d0 = %10100000

* --- Use for masking (keeping specific bits) ---
move.l #$ABCD, d2
and.w #$00FF, d2 ; keep low byte only: d2 = $00CD
    `
    ), //destination should only be register
    andi: makeIns(
        'andi',
        [ONLY_Im, STATUS_DESTINATION],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.andi,
        'andi.l #$FF, (a0)',
        Size.Word,
        `
move.l #$ABCD, d0
andi.w #$FF00, d0 ; keep high byte only: d0 = $AB00
    `
    ),
    eor: makeIns(
        'eor',
        [ONLY_Da, NO_Ad_AND_NO_Im],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.eor,
        'eor.l d0, d1',
        Size.Word,
        `
* --- XOR: toggles bits ---
move.l #%11110000, d0
move.l #%10101010, d1
eor.b d0, d1 ; d1 = %01011010

* --- XOR with self clears register ---
move.l #$ABCD, d2
eor.l d2, d2 ; d2 = 0
    `
    ),
    eori: makeIns(
        'eori',
        [ONLY_Im, STATUS_DESTINATION],
        ANY_SIZE,
        FLAGS_LOGIC,
        desc.eori,
        'eori.l #1, (sp)+',
        Size.Word,
        `
move.l #%11001100, d0
eori.b #%11110000, d0 ; d0 = %00111100
    `
    ),
    jmp: makeIns(
        'jmp',
        [ONLY_In_OR_Id_OR_Ea],
        NO_SIZE,
        UNAFFECTED,
        desc.jmp,
        'jmp (a0)',
        undefined,
        `
move.l #10, d0
jmp skip
move.l #$DEAD, d1 ; never reached
skip:
    move.l #$FF, d1

* --- Jump through address register ---
lea skip2, a0
jmp (a0)
move.l #$DEAD, d2 ; never reached
skip2:
    move.l #$FF, d2
    `
    ),
    jsr: makeIns(
        'jsr',
        [ONLY_In_OR_Id_OR_Ea],
        NO_SIZE,
        UNAFFECTED,
        desc.jsr,
        'jsr (sp)',
        undefined,
        `
move.l #10, d0
jsr add_two ; pushes return address, jumps to subroutine
move.l d0, d1 ; d1 = 12 (returned from subroutine)

* --- JSR through address register ---
lea add_two, a0
jsr (a0)
move.l d0, d2 ; d2 = 14
bra END

add_two:
    addq.l #2, d0
    rts

END:
    `
    ),
    dbra: makeIns(
        'dbra',
        [ONLY_Da, ONLY_Ea],
        ONLY_WORD,
        UNAFFECTED,
        desc.dbra,
        'dbra d0, label',
        undefined,
        `
* --- Loops d0+1 times (counter goes 5,4,3,2,1,0,-1 then stops) ---
move.l #5, d0
move.l #0, d1
loop:
    addq.l #1, d1
    dbra d0, loop
; d1 = 6 (looped 6 times)
`
    ),
    bra: makeIns(
        'bra',
        [ONLY_Ea],
        BRANCH_SIZES,
        UNAFFECTED,
        desc.bra,
        'bra $2000',
        undefined,
        `
move.l #1, d0
bra skip
move.l #$DEAD, d0 ; never reached
skip:
    move.l #$FF, d1
    `
    ),
    link: makeIns(
        'link',
        [ONLY_Ad, ONLY_Im],
        //written only on the 68020, `link.w` and `link.l`; the 68000's takes none
        ONLY_LONG_OR_WORD,
        UNAFFECTED,
        desc.link,
        'link a0, #-16',
        undefined,
        `
* --- Create stack frame with 8 bytes of local space ---
link a6, #-8
; a6 now points to the old a6 (frame pointer)
; sp = a6 - 8 (room for locals)
move.l #$1234, -4(a6) ; local variable 1
move.l #$5678, -8(a6) ; local variable 2
unlk a6 ; restore sp and a6
`
    ),
    unlk: makeIns(
        'unlk',
        [ONLY_Ad],
        NO_SIZE,
        UNAFFECTED,
        desc.unlk,
        'unlk a0',
        undefined,
        `
* --- Used with link to tear down a stack frame ---
link a6, #-8
move.l #$1234, -4(a6)
move.l #$5678, -8(a6)
unlk a6 ; sp = a6, a6 = (sp)+
`
    ),
    rts: makeIns(
        'rts',
        [],
        NO_SIZE,
        UNAFFECTED,
        desc.rts,
        'rts',
        undefined,
        `
move.l #10, d0
bsr add_two
move.l d0, d1 ; d1 = 12
bsr add_two
move.l d0, d2 ; d2 = 14
bra END

add_two:
    addq.l #2, d0
    rts ; pops return address and jumps back

END:
    `
    ),
    bsr: makeIns(
        'bsr',
        [ONLY_Ea],
        BRANCH_SIZES,
        UNAFFECTED,
        desc.bsr,
        'bsr label',
        undefined,
        `
move.l #10, d0
bsr add_two
move.l d0, d1 ; d1 = 12
bra END

add_two:
    addq.l #2, d0
    rts

END:
    `
    ),
    trap: makeIns(
        'trap',
        [ONLY_Im],
        NO_SIZE,
        UNAFFECTED,
        desc.trap,
        'trap #15',
        undefined,
        `
* --- trap #15: one of the simulator's tasks ---
move.b #4, d0
trap #15 ; task 4: read a number into d1

* --- trap #0 to #14: a handler of your own ---
move.l #double, $80 ; trap #0's vector, number 32, is at $80
trap #0 ; runs double, then carries on below

move.b #3, d0
trap #15 ; task 3: print d1, twice the number read
bra END

double:
    add.l d1, d1
    rte ; back to the instruction after the trap

END:
    `
    ),
    asd: {
        ...makeIns(
            'asd',
            [COUNT, ONLY_Da],
            ANY_SIZE,
            FLAGS_MATH,
            desc.asd,
            '`as<d> d0, d3` or `as<d> (a0)` Where d is either (l)eft or (r)ight',
            Size.Word,
            `
* --- ASR: arithmetic shift right (preserves sign) ---
move.w #$FF00, d0
asr.w #4, d0 ; d0 = $FFF0 (sign bit preserved)

move.w #$0F00, d1
asr.w #4, d1 ; d1 = $00F0 (positive, fills with 0)

* --- ASL: arithmetic shift left ---
move.w #$0001, d2
asl.w #4, d2 ; d2 = $0010

; ASL sets V if the MSB changes during the shift
move.w #$7000, d3
asl.w #1, d3 ; V flag set! MSB changed from 0 to 1

* --- Memory form: shifts word at (a0) left by 1 ---
lea $2000, a0 ; free memory: the program itself is at $1000
move.w #$0001, (a0)
asl (a0) ; (a0) = $0002
    `
        ),
        compundNames: ['asl', 'asr']
    },
    lsd: {
        ...makeIns(
            'lsd',
            [COUNT, ONLY_Da],
            ANY_SIZE,
            FLAGS_LSd,
            desc.lsd,
            '`ls<d> #3, d7` or `ls<d> (a0)` Where d is either (l)eft or (r)ight',
            Size.Word,
            `
* --- LSR: logical shift right (fills with 0) ---
move.w #$FF00, d0
lsr.w #4, d0 ; d0 = $0FF0

* --- LSL: logical shift left (fills with 0) ---
move.w #$000F, d1
lsl.w #4, d1 ; d1 = $00F0

* --- Compare ASR vs LSR on negative value ---
move.w #$FF00, d2
asr.w #4, d2 ; d2 = $FFF0 (sign extended)
move.w #$FF00, d3
lsr.w #4, d3 ; d3 = $0FF0 (zero filled)

* --- Memory form: shifts word at (a0) right by 1 ---
lea $2000, a0 ; free memory: the program itself is at $1000
move.w #$0010, (a0)
lsr (a0) ; (a0) = $0008
    `
        ),
        compundNames: ['lsr', 'lsl']
    },
    rod: {
        ...makeIns(
            'rod',
            [COUNT, ONLY_Da],
            ANY_SIZE,
            FLAGS_ROd,
            desc.rod,
            '`ro<d> d2, d5` or `ro<d> (a0)` Where d is either (l)eft or (r)ight',
            Size.Word,
            `
* --- ROL: rotate left (bits wrap around) ---
move.w #$1234, d0
rol.w #8, d0 ; d0 = $3412

* --- ROR: rotate right ---
move.w #$1234, d1
ror.w #8, d1 ; d1 = $3412

* --- Single bit rotate ---
move.w #%1000000000000001, d2
rol.w #1, d2 ; d2 = %0000000000000011

* --- Memory form: rotates word at (a0) left by 1 ---
lea $2000, a0 ; free memory: the program itself is at $1000
move.w #%1000000000000001, (a0)
rol (a0) ; (a0) = %0000000000000011
`
        ),
        compundNames: ['rol', 'ror']
    },
    btst: makeIns(
        'btst',
        [COUNT, NO_Ad],
        BYTE_OR_LONG,
        FLAGS_BIT,
        desc.btst,
        'btst #4, d0',
        undefined,
        `
* --- Z flag reflects the ORIGINAL bit value ---
move.l #%0101, d0
btst #0, d0 ; bit 0 = 1, Z flag clear
move.l #%0101, d1
btst #1, d1 ; bit 1 = 0, Z flag set

* --- Test higher bits ---
move.l #$80000000, d2
btst #31, d2 ; bit 31 = 1, Z flag clear
    `
    ),
    bchg: makeIns(
        'bchg',
        [COUNT, NO_Ad_AND_NO_Im],
        BYTE_OR_LONG,
        FLAGS_BIT,
        desc.bchg,
        'bchg #%101, d3',
        undefined,
        `
* --- Toggles the specified bit ---
move.l #%0001, d0
bchg #0, d0 ; bit 0 was 1, now 0. Z flag clear (old value)
bchg #0, d0 ; bit 0 was 0, now 1. Z flag set (old value)

move.l #%0000, d1
bchg #3, d1 ; bit 3 was 0, now 1. Z flag set
    `
    ),
    bclr: makeIns(
        'bclr',
        [COUNT, NO_Ad_AND_NO_Im],
        BYTE_OR_LONG,
        FLAGS_BIT,
        desc.bclr,
        'bclr d2, d7',
        undefined,
        `
* --- Clears the specified bit ---
move.l #%1111, d0
bclr #1, d0 ; bit 1 was 1 (Z clear), now 0. d0 = %1101

move.l #%1101, d1
bclr #1, d1 ; bit 1 was already 0 (Z set), no change
    `
    ),
    bset: makeIns(
        'bset',
        [COUNT, NO_Ad_AND_NO_Im],
        BYTE_OR_LONG,
        FLAGS_BIT,
        desc.bset,
        'bset #1, d1',
        undefined,
        `
* --- Sets the specified bit ---
move.l #%0000, d0
bset #2, d0 ; bit 2 was 0 (Z set), now 1. d0 = %0100

move.l #%0100, d1
bset #2, d1 ; bit 2 was already 1 (Z clear), no change
    `
    ),
    movep: makeIns(
        'movep',
        [
            [Da, Id],
            [Da, Id]
        ],
        ONLY_LONG_OR_WORD,
        UNAFFECTED,
        desc.movep,
        'movep.w d0,4(a0)',
        Size.Word
    ),
    addx: makeIns(
        'addx',
        [EXTENDED_PAIR, EXTENDED_PAIR],
        ANY_SIZE,
        FLAGS_MATH,
        desc.addx,
        'addx.l d0,d1',
        Size.Word
    ),
    subx: makeIns(
        'subx',
        [EXTENDED_PAIR, EXTENDED_PAIR],
        ANY_SIZE,
        FLAGS_MATH,
        desc.subx,
        'subx.l -(a0),-(a1)',
        Size.Word
    ),
    negx: makeIns('negx', [NO_IM_OR_Ad], ANY_SIZE, FLAGS_MATH, desc.negx, 'negx.w d0', Size.Word),
    abcd: makeIns(
        'abcd',
        [EXTENDED_PAIR, EXTENDED_PAIR],
        ONLY_BYTE,
        FLAGS_DECIMAL,
        desc.abcd,
        'abcd.b d0,d1',
        Size.Byte
    ),
    sbcd: makeIns(
        'sbcd',
        [EXTENDED_PAIR, EXTENDED_PAIR],
        ONLY_BYTE,
        FLAGS_DECIMAL,
        desc.sbcd,
        'sbcd.b -(a0),-(a1)',
        Size.Byte
    ),
    nbcd: makeIns(
        'nbcd',
        [NO_IM_OR_Ad],
        ONLY_BYTE,
        FLAGS_DECIMAL,
        desc.nbcd,
        'nbcd.b d0',
        Size.Byte
    ),
    //a 68020 instruction, so its example writes the program for the 68020 first
    extb: makeIns(
        'extb',
        [ONLY_Da],
        ONLY_LONG,
        FLAGS_LOGIC,
        desc.extb,
        '    opt p=68020\n    extb.l d0',
        Size.Long
    ),
    roxd: {
        ...makeIns(
            'roxd',
            [COUNT, ONLY_Da],
            ANY_SIZE,
            FLAGS_LSd,
            desc.roxd,
            '`rox<d> #1,d0` or `rox<d> (a0)` where d is (l)eft or (r)ight',
            Size.Word
        ),
        compundNames: ['roxl', 'roxr']
    },
    tas: makeIns('tas', [NO_IM_OR_Ad], ONLY_BYTE, FLAGS_LOGIC, desc.tas, 'tas.b d0', Size.Byte),
    rtr: makeIns('rtr', [], NO_SIZE, FLAGS_MATH, desc.rtr, 'rtr'),
    rte: makeIns(
        'rte',
        [],
        NO_SIZE,
        FLAGS_MATH,
        desc.rte,
        'rte',
        undefined,
        `
* --- A handler for a division by zero ---
move.l #div_zero, $14 ; vector 5 is at $14
move.l #100, d0
moveq #0, d1
divu d1, d0 ; d1 is 0, so div_zero runs
move.l d0, d2 ; rte comes back here: d2 = -1
bra END

div_zero:
    moveq #-1, d0 ; an answer the program can test
    rte ; pops the status register and the return address

END:
    `
    ),
    chk: makeIns(
        'chk',
        [NO_Ad, ONLY_Da],
        ONLY_LONG_OR_WORD,
        FLAGS_CHK,
        desc.chk,
        'chk.w #10,d0',
        Size.Word,
        `
* --- Keep an index between 0 and 9 ---
move.l #out_of_range, $18 ; vector 6 is at $18
moveq #4, d0
chk #9, d0 ; 4 is in range: nothing happens
moveq #12, d0
chk #9, d0 ; 12 is above 9: out_of_range runs
move.w d0, d1 ; rte comes back here: d1 = 9
bra END

out_of_range:
    moveq #9, d0 ; use the last index instead
    rte

END:
    `
    ),
    trapv: makeIns(
        'trapv',
        [],
        NO_SIZE,
        UNAFFECTED,
        desc.trapv,
        'trapv',
        undefined,
        `
* --- Send an overflow to a handler ---
move.l #overflow, $1C ; vector 7 is at $1C
move.b #100, d0
add.b #100, d0 ; 200 does not fit a signed byte: V is set
trapv ; V is set, so overflow runs
move.b d0, d1 ; rte comes back here: d1 = 127
bra END

overflow:
    move.b #127, d0 ; the largest signed byte instead
    rte

END:
    `
    ),
    illegal: makeIns(
        'illegal',
        [],
        NO_SIZE,
        UNAFFECTED,
        desc.illegal,
        'illegal',
        undefined,
        `
* --- Step past an illegal instruction ---
move.l #skip, $10 ; vector 4 is at $10
moveq #1, d0
illegal ; skip runs
moveq #2, d0 ; and the program carries on here
bra END

skip:
    addq.l #2, 2(sp) ; the saved address is the illegal's own: step past it
    rte

END:
    `
    ),
    nop: makeIns(
        'nop',
        [],
        NO_SIZE,
        UNAFFECTED,
        desc.nop,
        'nop',
        undefined,
        `
nop
    `
    ),
    stop: makeIns(
        'stop',
        [ONLY_Im],
        NO_SIZE,
        FLAGS_MATH,
        desc.stop,
        'stop #$2000',
        undefined,
        `
* --- Wait for a timer three times ---
move.l #tick, $68 ; the level-2 autovector is at $68
move.b #32, d0
move.b #6, d1
move.b #$82, d2 ; $80 + 2: a timer at level 2
move.l #100, d3 ; every 100 ms
trap #15
wait:
stop #$2000 ; wait for an interrupt above level 0
cmp.l #3, d6
bne wait ; tick has run three times: 0.3 s
bra END

tick:
    addq.l #1, d6 ; count the ticks
    rte ; back to the instruction after the stop

END:
    `
    ),
    reset: makeIns('reset', [], NO_SIZE, UNAFFECTED, desc.reset, 'reset'),
    //the 68010's, so their examples write the program for the 68010 first
    rtd: makeIns(
        'rtd',
        [ONLY_Im],
        NO_SIZE,
        UNAFFECTED,
        desc.rtd,
        '    opt p=68010\n    rtd #8',
        undefined,
        `
opt p=68010
* --- A subroutine that removes its own arguments ---
move.l #5, -(sp) ; first argument
move.l #7, -(sp) ; second argument
bsr add_args
move.l d0, d1 ; d1 = 12, and sp is back where it was before the pushes
bra END

add_args:
    move.l 4(sp), d0 ; the second argument, just above the return address
    add.l 8(sp), d0 ; plus the first
    rtd #8 ; return, then take the 8 bytes of arguments off the stack

END:
    `
    ),
    bkpt: makeIns(
        'bkpt',
        [ONLY_Im],
        NO_SIZE,
        UNAFFECTED,
        desc.bkpt,
        '    opt p=68010\n    bkpt #0',
        undefined,
        `
opt p=68010
* --- No debugger is attached, so vector 4 takes the breakpoint ---
move.l #met, $10 ; vector 4 is at $10
moveq #1, d0
bkpt #3 ; met runs
moveq #2, d0 ; and the program carries on here
bra END

met:
    addq.l #1, d7 ; count the breakpoints met
    addq.l #2, 2(sp) ; the saved address is the bkpt's own: step past it
    rte

END:
    `
    ),
    movec: makeIns(
        'movec',
        [MOVEC_OPERAND, MOVEC_OPERAND],
        ONLY_LONG,
        UNAFFECTED,
        desc.movec,
        '    opt p=68010\n    movec d0, vbr',
        Size.Long,
        `
opt p=68010
* --- Move the vector table to $8000 ---
move.l #div_zero, $8000+5*4 ; vector 5 of the new table
move.l #$8000, d0
movec d0, vbr ; from now on, vectors are read at $8000
moveq #0, d1
divu d1, d0 ; division by zero: the handler at $8014 runs
movec vbr, d2 ; read it back: d2 = $8000
bra END

div_zero:
    moveq #-1, d0
    rte

END:
    `
    ),
    moves: makeIns(
        'moves',
        [MOVES_OPERAND, MOVES_OPERAND],
        ANY_SIZE,
        UNAFFECTED,
        desc.moves,
        '    opt p=68010\n    moves.w d0, (a0)',
        Size.Word,
        `
opt p=68010
* --- Reach the memory of user data from supervisor code ---
moveq #1, d0 ; function code 1: user data
movec d0, sfc ; moves reads from user data
movec d0, dfc ; and writes to user data
lea buffer, a0
move.w #$1234, d1
moves.w d1, (a0) ; write the word
moves.w (a0), d2 ; read it back: d2 = $1234
bra END

buffer:
    ds.w 1

END:
    `
    ),
    //the 68020's, so their examples write the program for the 68020 first
    trapcc: {
        ...makeIns(
            'trapcc',
            [ONLY_Im],
            TRAPCC_SIZES,
            UNAFFECTED,
            desc.trapcc,
            '    opt p=68020\n    trapeq.w #3',
            Size.Word,
            `
opt p=68020
* --- Send a value that must not be zero to a handler ---
move.l #was_zero, $1C ; vector 7 is at $1C
moveq #5, d0
tst.l d0
trapeq.w #1 ; d0 is not zero: nothing happens
moveq #0, d0
tst.l d0
trapeq.w #2 ; d0 is zero: was_zero runs
move.w d2, d1 ; rte comes back here: d1 = 2
bra END

was_zero:
    move.l 2(sp), a0 ; the address rte returns to, just past the trap's number
    move.w -2(a0), d2 ; the number written after the trapeq: d2 = 2
    rte

END:
    `
        ),
        compundNames: setConditions.map((c) => `trap${c}`)
    },
    chk2: makeIns(
        'chk2',
        [BOUNDS, ONLY_REG],
        ANY_SIZE,
        FLAGS_CMP,
        desc.chk2,
        '    opt p=68020\n    chk2.w (a0), d0',
        Size.Word,
        `
opt p=68020
* --- Keep a row number between 1 and 5 ---
move.l #out_of_range, $18 ; vector 6 is at $18
moveq #3, d0
chk2.w rows, d0 ; 3 is between 1 and 5: nothing happens
moveq #9, d0
chk2.w rows, d0 ; 9 is above 5: out_of_range runs
move.w d0, d1 ; rte comes back here: d1 = 5
bra END

out_of_range:
    moveq #5, d0 ; use the last row instead
    rte

rows:
    dc.w 1, 5 ; the lower bound, then the upper one

END:
    `
    ),
    cmp2: makeIns(
        'cmp2',
        [BOUNDS, ONLY_REG],
        ANY_SIZE,
        FLAGS_CMP,
        desc.cmp2,
        '    opt p=68020\n    cmp2.b (a0), d0',
        Size.Word,
        `
opt p=68020
* --- Count the digits in a string ---
lea text, a0
moveq #0, d1 ; the count
next:
    move.b (a0)+, d0
    beq END ; the 0 that ends the string
    cmp2.b digits, d0 ; C is set when d0 is not from '0' to '9'
    bcs next
    addq.l #1, d1 ; at the end, d1 = 3
    bra next

text:
    dc.b 'a1b22cd', 0
digits:
    dc.b '0', '9' ; the lower bound, then the upper one

END:
    `
    ),
    cas: makeIns(
        'cas',
        [ONLY_Da, ONLY_Da, CAS_OPERAND],
        ANY_SIZE,
        FLAGS_CMP,
        desc.cas,
        '    opt p=68020\n    cas.l d0, d1, (a0)',
        Size.Word,
        `
opt p=68020
* --- Add 5 to a counter that an interrupt handler could also change ---
lea counter, a0
retry:
    move.l (a0), d0 ; the value read
    move.l d0, d1
    addq.l #5, d1 ; the value wanted
    cas.l d0, d1, (a0) ; write d1 only if the counter still holds d0
    bne retry ; it changed in between: try again
move.l counter, d2 ; d2 = 15
bra END

counter:
    dc.l 10

END:
    `
    ),
    cas2: makeIns(
        'cas2',
        [[Rp], [Rp], [Ip]],
        ONLY_LONG_OR_WORD,
        FLAGS_CMP,
        desc.cas2,
        '    opt p=68020\n    cas2.l d0:d1, d2:d3, (a0):(a1)',
        Size.Word,
        `
opt p=68020
* --- Move both ends of a queue, but only if neither has changed ---
lea head, a0
lea tail, a1
move.l (a0), d0 ; the head read: 1
move.l (a1), d1 ; the tail read: 4
moveq #2, d2 ; the new head
moveq #5, d3 ; the new tail
cas2.l d0:d1, d2:d3, (a0):(a1) ; both still hold what was read: both are written
move.l head, d4 ; d4 = 2
move.l tail, d5 ; d5 = 5
bra END

head:
    dc.l 1
tail:
    dc.l 4

END:
    `
    ),
    pack: makeIns(
        'pack',
        [EXTENDED_PAIR, EXTENDED_PAIR, ONLY_Im],
        NO_SIZE,
        UNAFFECTED,
        desc.pack,
        '    opt p=68020\n    pack d0, d1, #0',
        undefined,
        `
opt p=68020
* --- The text "42" as one byte of packed decimal ---
move.w #'42', d0 ; the two ASCII digits: $3432
pack d0, d1, #0 ; d1 = 66, which is $42: a 4 and a 2

* --- A string of digits, packed from its end ---
lea digits+4, a0 ; just past the four digits
lea packed+2, a1 ; just past the two bytes they pack into
pack -(a0), -(a1), #0 ; "34" into $34
pack -(a0), -(a1), #0 ; "12" into $12
move.w packed, d2 ; d2 = 4660, which is $1234
bra END

digits:
    dc.b '1234'
packed:
    ds.b 2

END:
    `
    ),
    unpk: makeIns(
        'unpk',
        [EXTENDED_PAIR, EXTENDED_PAIR, ONLY_Im],
        NO_SIZE,
        UNAFFECTED,
        desc.unpk,
        '    opt p=68020\n    unpk d0, d1, #$3030',
        undefined,
        `
opt p=68020
* --- Print a byte of packed decimal as two digits ---
move.b #$42, d0 ; 42 in packed decimal
unpk d0, d1, #$3030 ; d1 = 13362, which is $3432: the text "42"
lea text, a1
move.w d1, (a1)
move.b #14, d0
trap #15 ; prints "42"
bra END

text:
    dc.b 0, 0, 0, 0 ; the two digits, and the 0 that ends the text

END:
    `
    ),
    divsl: makeIns(
        'divsl',
        [NO_Ad, [Rp]],
        ONLY_LONG,
        FLAGS_DIV,
        desc.divsl,
        '    opt p=68020\n    divsl.l d0, d1:d2',
        Size.Long,
        `
opt p=68020
* --- A quotient and a remainder of 32 bits ---
move.l #-100007, d2 ; the number to divide
divsl.l #10, d1:d2 ; d2 = -10000, and the remainder has its sign: d1 = -7
    `
    ),
    divul: makeIns(
        'divul',
        [NO_Ad, [Rp]],
        ONLY_LONG,
        FLAGS_DIV,
        desc.divul,
        '    opt p=68020\n    divul.l d0, d1:d2',
        Size.Long,
        `
opt p=68020
* --- Seconds as hours and the seconds left over ---
move.l #100000, d2 ; the seconds
divul.l #3600, d1:d2 ; 27 hours, and d1 = 2800 seconds left over
move.l d2, d3 ; d3 = 27
    `
    ),
    //the bit fields, the 68020's, which `opt bit` gives a program for the 68000 or the 68010 too
    bftst: makeIns(
        'bftst',
        [BIT_FIELD_SOURCE],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bftst,
        '    opt p=68020\n    bftst d0{28:4}',
        undefined,
        `
opt p=68020
* --- Is any of the low 4 bits set? ---
move.l #%10110000, d0
bftst d0{28:4} ; bits 3 to 0 are all 0: Z is set
seq d1 ; d1 = 255
    `
    ),
    bfextu: makeIns(
        'bfextu',
        [BIT_FIELD_SOURCE, ONLY_Da],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfextu,
        '    opt p=68020\n    bfextu d0{24:8}, d1',
        undefined,
        `
opt p=68020
* --- The red, green and blue of a 16-bit colour ---
lea color, a0
bfextu (a0){0:5}, d0 ; the first 5 bits, red: d0 = 31
bfextu (a0){5:6}, d1 ; the next 6, green: d1 = 0
bfextu (a0){11:5}, d2 ; the last 5, blue: d2 = 12
bra END

color:
    dc.w %1111100000001100

END:
    `
    ),
    bfexts: makeIns(
        'bfexts',
        [BIT_FIELD_SOURCE, ONLY_Da],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfexts,
        '    opt p=68020\n    bfexts (a0){4:4}, d0',
        undefined,
        `
opt p=68020
* --- Two signed numbers of 4 bits in one byte ---
lea pair, a0
bfexts (a0){0:4}, d0 ; %0011: d0 = 3
bfexts (a0){4:4}, d1 ; %1110, its top bit copied above it: d1 = -2
bfextu (a0){4:4}, d2 ; the same bits as an unsigned number: d2 = 14
bra END

pair:
    dc.b %00111110, 0

END:
    `
    ),
    bfffo: makeIns(
        'bfffo',
        [BIT_FIELD_SOURCE, ONLY_Da],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfffo,
        '    opt p=68020\n    bfffo d0{0:32}, d1',
        undefined,
        `
opt p=68020
* --- The highest bit set in a number ---
move.l #$12345, d0
bfffo d0{0:32}, d1 ; 15 zeros come before the first 1: d1 = 15
moveq #31, d2
sub.l d1, d2 ; d2 = 16: bit 16 is the highest bit set

* --- The first free slot of a bitmap, where 1 is free ---
lea slots, a0
bfffo (a0){0:16}, d3 ; slots 0 to 4 are taken: d3 = 5
bra END

slots:
    dc.w %0000010000000000

END:
    `
    ),
    bfchg: makeIns(
        'bfchg',
        [BIT_FIELD_DESTINATION],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfchg,
        '    opt p=68020\n    bfchg d0{26:4}',
        undefined,
        `
opt p=68020
* --- Invert the middle four bits of a byte ---
move.l #%11110000, d0
bfchg d0{26:4} ; bits 5 to 2: d0 = 204, which is %11001100
    `
    ),
    bfclr: makeIns(
        'bfclr',
        [BIT_FIELD_DESTINATION],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfclr,
        '    opt p=68020\n    bfclr d0{20:12}',
        undefined,
        `
opt p=68020
* --- Round an address down to the start of its 4 KB page ---
move.l #$12345, d0
bfclr d0{20:12} ; the low 12 bits: d0 = 73728, which is $12000
    `
    ),
    bfset: makeIns(
        'bfset',
        [BIT_FIELD_DESTINATION],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfset,
        '    opt p=68020\n    bfset (a0){3:4}',
        undefined,
        `
opt p=68020
* --- Mark slots 3 to 6 of a bitmap as taken ---
lea slots, a0
bfset (a0){3:4} ; bits 4 to 1 of the first byte
move.b (a0), d0 ; d0 = 30, which is %00011110
bra END

slots:
    dc.b 0, 0

END:
    `
    ),
    bfins: makeIns(
        'bfins',
        [ONLY_Da, BIT_FIELD_DESTINATION],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.bfins,
        '    opt p=68020\n    bfins d1, (a0){0:5}',
        undefined,
        `
opt p=68020
* --- Build a 16-bit colour from its red, green and blue ---
lea color, a0
moveq #31, d0
bfins d0, (a0){0:5} ; red, in the first 5 bits
moveq #0, d0
bfins d0, (a0){5:6} ; green, in the next 6
moveq #12, d0
bfins d0, (a0){11:5} ; blue, in the last 5
move.w (a0), d1 ; d1 = 63500, which is %1111100000001100
bra END

color:
    dc.w 0

END:
    `
    )
} satisfies Record<InstructionName, InstructionDocumentation>

export const M68KUncompoundedInstructions = uncompoundInstructions(Object.values(M68kDocumentation))

export function getInstructionDocumentation(
    instructionName: InstructionName
): InstructionDocumentation | undefined {
    if (!instructionName) return undefined
    const ins = M68KUncompoundedInstructions.get(instructionName)
    if (ins) return ins
    if (!hasOwnKey(M68KDirectiveDocumentation, instructionName)) return undefined
    return M68KDirectiveDocumentation[instructionName]
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(value, key)
}

/** "Equal" as it reads inside a sentence: "branches if **equal**". */
function lowerFirst(text: string | undefined): string {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : ''
}

export function uncompoundInstructions(
    instructions: InstructionDocumentation[] | Map<string, InstructionDocumentation>
) {
    const map = new Map<string, InstructionDocumentation>()
    instructions = Array.isArray(instructions) ? instructions : Array.from(instructions.values())
    instructions.forEach((i) => {
        if (i.compundNames) {
            i.compundNames.forEach((n) => {
                let description = i.description
                const name = i.name
                if (name === 'lsd' || name === 'asd' || name === 'rod' || name === 'roxd') {
                    const direction = n.substring(n.length - 1)
                    description = description.replace(
                        '{direction}',
                        `**${lowerFirst(directionsDescriptions.get(direction))}**`
                    )
                }
                if (name === 'bcc' || name === 'dbcc') {
                    const code = name === 'dbcc' ? n.substring(2) : n.substring(1)
                    description = description.replace(
                        '{condition code}',
                        `**${lowerFirst(setConditionsDescriptions.get(code))}**`
                    )
                }
                if (name === 'trapcc') {
                    description = description.replace(
                        '{condition code}',
                        `**${lowerFirst(setConditionsDescriptions.get(n.substring(4)))}**`
                    )
                }
                if (name === 'scc') {
                    let code = n.substring(n.length - 2)
                    if (n === 'st') code = 't'
                    if (n === 'sf') code = 'f'
                    description = description.replace(
                        '{condition code}',
                        `**${lowerFirst(setConditionsDescriptions.get(code))}**`
                    )
                }
                const entry = structuredClone(i)
                entry.name = n
                entry.description = description
                // The family shares ASL's flags, but ASR keeps the sign and so always clears V.
                if (n === 'asr') {
                    entry.affectsFlags = {
                        ...entry.affectsFlags,
                        [M68KFlag.Overflow]: AffectedFlagKind.ToZero
                    }
                }
                map.set(n, entry)
            })
        }
        map.set(i.name, i)
    })
    return map
}

export const instructionsDocumentationList = Object.values(M68kDocumentation).sort((a, b) =>
    a.name.localeCompare(b.name)
)

function makeIns(
    name: string,
    args: AddressingMode[][],
    sizes: Size[],
    affectedFlags: Record<M68KFlag, AffectedFlagKind>,
    description: string,
    example?: string,
    defaultSize?: Size,
    interactiveExample?: string
): InstructionDocumentation {
    const code = (interactiveExample ?? '')
        .split('\n')
        .map((l) => l.replace(/\s{8}/g, ''))
        .join('\n')
        .trim()
    return {
        name,
        args,
        sizes,
        description,
        example,
        defaultSize,
        //none rather than an empty one, so the instruction page says there is no example instead
        //of opening an empty editor
        interactiveExample: code ? { code } : undefined,
        affectsFlags: affectedFlags
    }
}

type DirectiveDocumentation = {
    name: string
    args: AddressingMode[][]
    description: string
    example?: string
    sizes: Size[]
    affectsFlags: Record<M68KFlag, AffectedFlagKind>
}

function makeDirective(
    name: string,
    sizes: Size[],
    description: string,
    example?: string
): DirectiveDocumentation {
    return {
        name,
        args: [],
        description,
        example,
        sizes,
        affectsFlags: UNAFFECTED
    }
}

/*TODO
    spl highlighted wrogn
*/

/** Directives accepted by s68k v2, including the four compatibility no-ops. */
export const M68KDirectives = [
    'dc',
    'dcb',
    'ds',
    'end',
    'equ',
    'fail',
    'incbin',
    'include',
    'list',
    'memory',
    'nolist',
    'offset',
    'opt',
    'org',
    'page',
    'reg',
    'section',
    'set',
    'simhalt'
] satisfies (keyof typeof M68KDirectiveDocumentation)[]

/** Directive names the parser reserves so they receive a useful not-implemented diagnostic. */
export const M68KRefusedDirectives = [
    'macro',
    'endm',
    'mexit',
    'ifeq',
    'ifne',
    'iflt',
    'ifle',
    'ifgt',
    'ifge',
    'ifc',
    'ifnc',
    'ifarg',
    'endc',
    'if',
    'else',
    'endi',
    'while',
    'endw',
    'for',
    'endf',
    'repeat',
    'until',
    'dbloop',
    'unless'
]

/**
 * The 68020's module call, `callm` and `rtm`, which s68k's 68020 leaves out for good: the Core reads
 * them as instructions and refuses them, and the editor colours them as words the assembler refuses.
 * Every other instruction of the 68000, the 68010 and the 68020 is in the Core's table.
 */
export const M68KRefusedInstructions = ['callm', 'rtm']

const documentationFamilyNames = new Set(['asd', 'lsd', 'rod', 'roxd'])
/** Every implemented mnemonic, with documentation-family placeholders removed. */
export const M68kInstructions = Array.from(M68KUncompoundedInstructions.keys()).filter(
    (name) => !documentationFamilyNames.has(name)
)

export const M68KRecognizedInstructions = [...M68kInstructions]
export const M68KRecognizedDirectives = [...M68KDirectives, ...M68KRefusedDirectives]
