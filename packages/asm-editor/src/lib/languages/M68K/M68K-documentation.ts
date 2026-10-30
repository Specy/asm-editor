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
    [M68KFlag.Zero]: E,
    [M68KFlag.Overflow]: E,
    [M68KFlag.Carry]: E
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
    'The size sets the branch’s reach: about 128 bytes in either direction for `.s` (or `.b`), and 32 KB for `.w`. With no size, the assembler chooses `.s` for a known target when the short encoding can reach it. On the 68020, it chooses `.l` for a known target beyond `.w` reach. All other cases use `.w`, including forward references. On the 68020, `.l` reaches anywhere in memory. See [long branches](/documentation/m68k/addressing-mode#long-branches). On the 68000 and 68010, `.l` is treated as `.w`, as in EASy68K.'

/** The 68020's long multiplies, which `muls` and `mulu` say after the 68000's. */
function longMultiply(name: 'muls' | 'mulu'): string {
    return `On the 68020, \`${name}.l\` multiplies two 32-bit values. In both \`${name}.l d0, d1\` and \`${name}.l d0, d2:d1\`, the inputs are \`d0\` and \`d1\`. The old value of \`d2\` is not used. The single-register form keeps the low 32 bits in \`d1\` and sets V if the product does not fit in ${name === 'muls' ? 'a signed' : 'an unsigned'} 32-bit result. The pair form keeps all 64 bits, with the high long in \`d2\` and the low long in \`d1\`, and clears V. Use different registers for the high and low halves.\n\nN and Z describe the result kept: 32 bits for word multiplication or a single-register long result, and 64 bits for a register-pair result. C is cleared and X is unchanged.`
}

/** The 68020's long divides, which `divs` and `divu` say after the 68000's. */
function longDivide(name: 'divs' | 'divu', withRemainder: 'divsl' | 'divul'): string {
    return `On the 68020, \`${name}.l\` uses a 32-bit divisor. \`${name}.l d0, d1\` divides the 32-bit value in \`d1\` by \`d0\` and keeps only the quotient. \`${name}.l d0, d2:d1\` divides a 64-bit value, with its high long in \`d2\` and low long in \`d1\`, by \`d0\`. It writes the quotient to \`d1\` and the remainder to \`d2\`. A quotient too large for 32 bits sets V and leaves the registers unchanged. After a successful division, N and Z describe the quotient. Use different registers to keep both results. If both names refer to the same register, only the quotient remains.\n\n[${withRemainder}](/documentation/m68k/instruction/${withRemainder}) divides a 32-bit value and keeps the remainder too.`
}

/** How `chk2` and `cmp2` read their bounds, and how they compare the register with them. */
const BOUNDS_OPERAND =
    'The memory operand names two consecutive bounds, lower first, each stored at the instruction’s size. A data register is compared at that size. An address register is compared as a full long, with byte or word bounds sign-extended to long. Both endpoints are included in the range.'
const BOUNDS_COMPARISON =
    'Interpret the bounds and value as signed numbers. If the lower bound is at or below the upper bound, the range includes every value between them. If the lower bound is above the upper bound, the range wraps: a value is in range when it is at or above the lower bound, or at or below the upper bound. For example, `dc.b 16, 240` stores the signed bounds 16 and -16. Its accepted byte values are 16 through 127 and -128 through -16, which are the unsigned values 16 through 240.'

/** What a bit field is, which each bit-field instruction says after what it does. */
const BIT_FIELD =
    'Write the field as `{offset:width}` immediately after its operand. It selects 1 to 32 bits, counted from bit 31 of a data register or bit 7 of the byte at the memory address. The offset and width may each be a constant or a data register. See [bit fields](/documentation/m68k/addressing-mode#bit-fields) for their ranges, register values and wrapping rules.'

/** The flags of the bit-field instructions that change the field, from the field as it was. */
const BIT_FIELD_FLAGS_BEFORE =
    'N copies the field’s highest bit before the change, and Z is set if that field was zero. V and C are cleared. X is unchanged.'
const desc = {
    move: 'Copies the first operand to the second operand. An address-register destination uses [movea](/documentation/m68k/instruction/movea). `move.l a0, usp` writes the user stack pointer, and `move.l usp, a0` reads it. Both forms require supervisor mode. See [user and supervisor mode](/documentation/m68k/exceptions#modes).\n\n`move.w sr, d0` copies the status register. This is allowed in user mode on the 68000, but requires supervisor mode on the 68010 and 68020. Those processors also provide `move.w ccr, d0`, which lets user code read the condition codes.',
    moveq: 'Moves an 8-bit encoded value from -128 through 255 into a data register and sign extends it to 32 bits. Values 128 through 255 are the unsigned spellings of -128 through -1.',
    movea: 'Moves the value from the first operand to second operand. If the size is word, it is sign extended to long. It does not change the SR. When using word size, the first operand is sign extended to long and the second is written as a long.',
    movem: 'Moves a list of registers to memory, or loads a list of registers from memory. Put the register list first to store the registers and second to load them. This is useful for saving registers before a subroutine uses them and restoring them afterward.\n\nUse `/` between registers and `-` for a range. For example, `a3-a5/d0-d2` selects `d0`, `d1`, `d2`, `a3`, `a4` and `a5`. The written order does not control the transfer order: selected data registers are processed from `d0` to `d7`, then selected address registers from `a0` to `a7`. A predecrement store processes them in reverse order, from `a7` to `a0`, then `d7` to `d0`.',
    add: 'Adds the value of the first operand to second operand. If the second operand is an address register, the [ADDA](/documentation/m68k/instruction/adda) instruction is used instead.',
    addi: 'Adds the immediate value to the second operand',
    adda: 'Adds the value of the first operand to second operand. It does not change the SR.  When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    addq: 'Adds the value of the first operand to second operand. The first operand value must be between 1 and 8. If the destination is an address register, it is always treated as a long, and the condition codes are not affected.',
    sub: 'Subtracts the value of the first operand from second operand and stores in the second. If the second operand is an address register, the [SUBA](/documentation/m68k/instruction/suba) instruction is used instead.',
    suba: 'Subtracts the value of the first operand from second operand and stores in the second. It does not change the SR. When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    subq: 'Subtracts the value of the first operand from second operand and stores in the second. The first operand value must be between 1 and 8. If the destination is an address register, it is always treated as a long, and the condition codes are not affected.',
    subi: 'Subtracts the immediate value to the second operand',
    divs: `The default word form divides a signed 32-bit dividend by a signed 16-bit divisor. The destination data register supplies the dividend. The source supplies the divisor. The quotient replaces the destination’s low word, and the remainder replaces its high word. The remainder has the dividend’s sign.\n\nA zero divisor raises a division-by-zero exception through vector 5 at \`$14\`, leaving the destination unchanged. Without a handler, the program ends at \`divs\`. See [writing a handler](/documentation/m68k/exceptions#handlers). A quotient outside the signed 16-bit range sets V and leaves the destination unchanged. Test V with \`bvs\` before using the result.\n\n${longDivide('divs', 'divsl')}`,
    divu: `The default word form divides an unsigned 32-bit dividend by an unsigned 16-bit divisor. The destination data register supplies the dividend. The source supplies the divisor. The quotient replaces the destination’s low word, and the remainder replaces its high word.\n\nA zero divisor raises a division-by-zero exception through vector 5 at \`$14\`, leaving the destination unchanged. Without a handler, the program ends at \`divu\`. See [writing a handler](/documentation/m68k/exceptions#handlers). A quotient above 65535 sets V and leaves the destination unchanged. Test V with \`bvs\` before using the result.\n\n${longDivide('divu', 'divul')}`,
    muls: `The default word form multiplies two signed 16-bit values and stores the 32-bit product in a data register. The source and the destination’s low word supply the inputs; the destination’s old upper word is ignored. Word multiplication clears V.\n\n${longMultiply('muls')}`,
    mulu: `The default word form multiplies two unsigned 16-bit values and stores the 32-bit product in a data register. The source and the destination’s low word supply the inputs; the destination’s old upper word is ignored. Word multiplication clears V.\n\n${longMultiply('mulu')}`,
    swap: 'Swaps the two words of the register, you can see the register as [a,b] after the swap it will be [b,a]',
    clr: 'Sets to 0 all the bits of the destination operand, how many bits are set to 0 depends on the specified size, defaults to word',
    exg: 'Exchanges the values of the two operands, only works in 32 bits',
    neg: 'Flips the sign of the operand, depending on the specified size, defaults to word',
    ext: 'Sign-extends a data register’s low byte to word or its low word to long. `ext.w`, the default, copies the byte’s sign bit into bits 8 through 15 and leaves the upper word unchanged. `ext.l` copies the word’s sign bit into bits 16 through 31. The newly filled bits are 1 for a negative input and 0 for a nonnegative input.',
    tst: 'Sets the condition codes from the operand as if comparing it with zero. The operand and X are unchanged.\n\nOn the 68020, `tst` also accepts an address register at word or long size, an immediate value, or PC-relative memory such as `tst.w count(pc)`.',
    cmp: 'Subtracts the first operand from the second to set N, Z, V and C, leaving both operands unchanged. An address-register destination uses [cmpa](/documentation/m68k/instruction/cmpa).\n\nOn the 68020, an immediate source may also be compared with PC-relative memory, as in `cmp.w #1, flag(pc)`. That form assembles as [cmpi](/documentation/m68k/instruction/cmpi).',
    cmpa: 'Compares an address register with the first operand and sets N, Z, V and C from the subtraction of the first operand from the register. Neither operand changes. With `.w`, the first operand is sign-extended to long before the 32-bit comparison. With `.l`, both operands are read as longs. X is unchanged.',
    cmpm: 'Compares two memory regions, only valid operand is the postincrement, it sets the flags accordingly which will be used by the branching instructions.',
    cmpi: 'Compares the second operand with an immediate value, setting N, Z, V and C from the second operand minus the immediate. The operand and X are unchanged.\n\nOn the 68020, the second operand may also be PC-relative memory, as in `cmpi.w #1, flag(pc)`.',
    bcc: `Branches to the specified address if {condition code}.\n\nThe suffix selects the condition. See [condition codes](/documentation/m68k/condition-codes). ${BRANCH_REACH}`,
    scc: 'Sets the destination byte to $FF (-1) if {condition code}, or to 0 otherwise. The suffix selects the condition. See [condition codes](/documentation/m68k/condition-codes).',
    dbcc: 'Tests {condition code} before deciding whether to decrement the counter and branch. If the condition is true, execution continues at the next instruction and the counter is unchanged. If it is false, the low word of the data register is decremented; the branch is taken unless that word becomes -1. The upper word is unchanged, and `dbcc` does not change the flags.\n\nThe suffix selects the condition. See [condition codes](/documentation/m68k/condition-codes). `dbf` and `dbra` always take the decrement path. Starting the low word at N repeats a loop body N + 1 times, up to 65,536 times when it starts at $FFFF.',
    lea: 'Computes the effective address of the first operand and stores it in the address register. `lea 4(a0), a1` sets `a1` to `a0 + 4`. It does not read the data at the resulting address. A 68020 [memory indirect operand](/documentation/m68k/addressing-mode#memory-indirect) does read a pointer while computing that address: `lea ([a0]), a1` loads the long pointer stored at `a0`.',
    pea: 'Computes the operand’s effective address and pushes that address onto the stack as a long. Like [lea](/documentation/m68k/instruction/lea), it does not read data at the final address, but a 68020 memory indirect operand reads a pointer while computing it.',
    dbra: 'Decrements the first operand by 1 and branches to the specified address if the first operand is not -1. dbra is the same as dbf (will decrement until it reaches -1)',
    bra: `Branches to the specified address unconditionally.\n\n${BRANCH_REACH}`,
    jmp: 'Jumps to the specified address unconditionally',
    link: 'Pushes the address register onto the stack, copies the stack pointer into that register, then adds the signed displacement to the stack pointer. Use a negative displacement to reserve space for local values.\n\nOn the 68020, `link.w` is the same instruction as `link`, and `link.l` accepts a signed 32-bit displacement. On the 68000 and 68010, write `link` without a size suffix.',
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
    jsr: 'Pushes the return address onto the stack and jumps to the operand’s effective address. For example, `jsr 4(a0)` calls the code at `a0 + 4`. Like [lea](/documentation/m68k/instruction/lea), it computes the destination address without reading data there; a 68020 [memory indirect operand](/documentation/m68k/addressing-mode#memory-indirect) reads a pointer while computing it.',
    trap: 'Raises a software trap or calls a simulator task. `trap #0` through `trap #14` run handlers installed by the program. `trap #15` runs an EASy68K simulator task.\n\nFor a software trap, the processor saves the next instruction’s address and the status register on the supervisor stack, enters supervisor mode, and runs the handler from vector 32 + n. The vector entry for `trap #n` is at `$80` + 4 × n. For example, `move.l #service, $8C` installs `service` as the handler for `trap #3`. The handler returns to the next instruction with [rte](/documentation/m68k/instruction/rte). Without a handler, the program ends at the trap and reports the missing vector. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nFor `trap #15`, the low byte of `d0` selects a simulator task. Task 13, for example, prints the null-terminated string at `a1`. Execution continues after the trap, and the call is available in user mode. The [trap task reference](/documentation/m68k/traps) lists each task and its registers.',
    nop: 'This instruction is a no-operation, it does not do anything.',
    movep: 'Moves a word or long between a data register and alternate memory bytes starting at a signed displacement from an address register.',
    addx: 'Adds the source, destination and X flag, and stores the result in the destination. Both operands must be data registers, or both must use predecrement addressing. The registers need not be the same. For a value split across several registers or memory units, start with the least significant part and use X to carry into the next part.\n\nZ is cumulative: a zero result preserves its previous value, and a nonzero result clears it. Set Z and clear X before starting a sequence, for example with `move.w #4, ccr`. Z then remains set only if every part of the result is zero. C and X report the carry from the current part.',
    subx: 'Subtracts the source and X flag from the destination, and stores the result in the destination. Both operands must be data registers, or both must use predecrement addressing. The registers need not be the same. For a value split into several parts, start with the least significant part so X carries each borrow into the next subtraction.\n\nZ is cumulative: a zero result preserves its previous value, and a nonzero result clears it. Set Z and clear X before the first part, for example with `move.w #4, ccr`. Z then remains set only if every result part is zero. C and X report the borrow from the current part.',
    negx: 'Replaces the destination with zero minus its value minus X, at the instruction’s size. To negate a value split into several parts, process the least significant part first so X carries a borrow into the next part.\n\nZ is cumulative: a zero result preserves its previous value, and a nonzero result clears it. Set Z and clear X before the first part, for example with `move.w #4, ccr`. Z then remains set only if the whole result is zero.',
    abcd: 'Adds two packed decimal bytes and X, and stores the packed decimal result in the destination. Each byte holds two decimal digits, one in each half: `$42` represents 42. Both operands must be data registers, or both must use predecrement addressing. The registers need not be the same.\n\nFor a decimal number stored in several bytes, start with its least significant pair of digits. C and X carry a result above 99 into the next byte. Set Z and clear X before the first byte, for example with `move.w #4, ccr`: each zero result preserves Z, and each nonzero result clears it, so the final Z tests the whole number.',
    sbcd: 'Subtracts the source packed decimal byte and X from the destination, storing the packed decimal result there. Each byte holds two decimal digits, one in each half. Both operands must be data registers, or both must use predecrement addressing. The registers need not be the same.\n\nFor a decimal number stored in several bytes, start with its least significant pair of digits. C and X carry a borrow into the next byte. Set Z and clear X before the first byte, for example with `move.w #4, ccr`: each zero result preserves Z, and each nonzero result clears it, so the final Z tests the whole number.',
    nbcd: 'Subtracts the packed decimal byte and X from zero and stores the packed decimal result in the operand. Each half of the byte holds one decimal digit. To negate a decimal number stored in several bytes, process its least significant pair of digits first. C and X carry a borrow into the next byte.\n\nSet Z and clear X before the first byte, for example with `move.w #4, ccr`. Each zero result preserves Z, and each nonzero result clears it, so the final Z tests the whole result.',
    extb: 'Sign-extends the low byte of a data register to a full long. For example, if `d0` is `$12345680`, `extb.l d0` makes it `$FFFFFF80` (-128). N and Z describe the long result, V and C are cleared, and X is unchanged.',
    tas: 'Tests the original byte into the condition codes, then sets its top bit.',
    rtr: 'Returns by popping the condition-code byte and then the program counter from the stack.',
    chk: 'Checks whether a data register is between zero and an upper bound, with both endpoints included. `chk.w` reads the bound and the register’s low word as signed words. A value below zero or above the bound raises a CHK exception through vector 6 at `$18`. The handler returns to the instruction after `chk` with `rte`. N is set for a value below zero and cleared for a value above the bound. Z, V and C are undefined by the instruction and may change. X is unchanged.\n\nWithout a handler, the program ends at `chk`. See [writing a handler](/documentation/m68k/exceptions#handlers). On the 68020, `chk.l` checks the whole register against a signed long bound. [chk2](/documentation/m68k/instruction/chk2) lets you supply both bounds.',
    trapv: 'Raises an overflow exception through vector 7 at `$1C` if V is set, and continues normally otherwise. Place it after arithmetic to handle an overflow with an exception handler. The handler’s `rte` returns to the instruction after `trapv`. Without a handler, an overflow ends the program there. See [writing a handler](/documentation/m68k/exceptions#handlers).',
    illegal:
        'Raises an illegal-instruction exception through vector 4 at `$10`. Programs can use it to mark code that must never execute.\n\nThe exception saves the address of `illegal` itself. A handler that resumes at the next instruction must add 2 to the saved address before `rte`. Without a handler, the program ends at `illegal`. See [writing a handler](/documentation/m68k/exceptions#handlers).',
    rte: 'Returns from an exception handler by restoring the saved status register and program counter. It restores the whole status register, including S. Returning to user mode therefore makes `a7` the user stack pointer again. `rte` requires supervisor mode and raises a privilege violation in user mode. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nOn the 68010 and 68020, the saved frame also contains a format word. `rte` uses it to determine the frame’s size and removes the whole frame. An unsupported format raises a [format error](/documentation/m68k/exceptions#format-error).\n\nOn the 68020, an interrupt taken while using the master stack leaves a throwaway frame on the interrupt stack. `rte` removes that frame, switches back to the master stack, and then restores the original frame there. See [the throwaway frame](/documentation/m68k/exceptions#throwaway-frame).',
    stop: 'Loads the status register from an immediate word and waits for an eligible interrupt. An interrupt is eligible if its level is above the new interrupt mask, or if it is level 7. The processor then runs the handler at that level’s autovector; the handler’s `rte` returns to the instruction after `stop`.\n\n`stop #$2000` keeps supervisor mode and sets the mask to zero, allowing every interrupt level. A program can use it to wait for a timer or key without a polling loop. While the processor waits, Run stays active, the status line shows the wait, and Step executes nothing. `stop` requires supervisor mode and raises a privilege violation in user mode. See [interrupts](/documentation/m68k/exceptions#interrupts).',
    rtd: 'Returns from a subroutine and removes arguments from the stack. It pops the return address, as [rts](/documentation/m68k/instruction/rts) does, then adds a signed 16-bit byte count to the stack pointer. If the caller pushed 8 bytes of arguments, `rtd #8` removes them before returning, so the caller needs no stack adjustment after the call.',
    bkpt: 'Marks a breakpoint for a hardware debugger. In this editor, no hardware debugger is attached, so `bkpt` raises an illegal-instruction exception through vector 4 at `$10`. The number from 0 to 7 identifies the breakpoint to hardware; it does not select an editor breakpoint.\n\nThe exception saves the address of `bkpt` itself. A handler that resumes after it must add 2 to the saved address before `rte`. Without a handler, the program ends at `bkpt`. See [writing a handler](/documentation/m68k/exceptions#handlers). To pause during debugging here, set a breakpoint beside the line numbers.',
    movec: 'Copies a control register to a data or address register, or copies a data or address register to a control register. On the 68010, it accesses `vbr` (vector base), `sfc` and `dfc` (function codes), and `usp` (user stack pointer). After `movec d0, vbr`, exception vectors are read from VBR + 4 × the vector number. See [the 68010 vector table](/documentation/m68k/exceptions#68010). The transfer is always long, preserves the flags and requires supervisor mode.\n\nThe 68020 adds `msp` and `isp`, the master and interrupt stack pointers. In supervisor mode, the M bit of `sr` selects which one is `a7`. Initialize `msp` with `movec` before setting M. It starts at zero. See [master and interrupt stacks](/documentation/m68k/exceptions#master-stack).\n\nThe 68020 also adds `cacr` and `caar`, the cache control and cache address registers. The editor does not simulate a cache. `cacr` retains only bits 0 and 1 of a written value. `caar` retains all 32 bits.',
    moves: 'Moves a byte, word or long between a register and memory in a selected address space. On the 68010 and 68020, each memory access has a three-bit function code: `moves` reads using `sfc` and writes using `dfc`, which [movec](/documentation/m68k/instruction/movec) sets. An operating system can use this to access a user program’s separate address space.\n\nThe editor has a single address space, so `moves` accesses the same bytes as `move` for every `sfc` or `dfc` value. One operand must be a data or address register and the other writable memory. A byte or word loaded into an address register is sign-extended to long. A data-register destination keeps the bits above the selected size unchanged. The flags are unchanged. `moves` requires supervisor mode and raises a privilege violation in user mode.',
    reset: 'Asserts the processor’s external reset signal, then continues at the next instruction with its own registers unchanged. The editor has no external devices to reset, so this has no device effect, as in EASy68K. It does not restart the program or read the startup vectors at `$0` and `$4`. `reset` requires supervisor mode and raises a privilege violation in user mode.',
    trapcc: 'Raises an exception if {condition code}, and continues normally otherwise. Write the condition as a suffix, as in `trapeq` for Z set or `trapvs` for V set. `trapt` always traps, and `trapf` never does. See the [condition suffix table](/documentation/m68k/condition-codes).\n\nThe exception uses vector 7 at `$1C`, as [trapv](/documentation/m68k/instruction/trapv) does. The handler’s `rte` returns to the instruction after the trap. Without a handler, a true condition ends the program there. See [writing a handler](/documentation/m68k/exceptions#handlers).\n\nAn optional word or long immediate can identify the trap to its handler, as in `trapeq.w #3`. The processor ignores its value. The handler can read it from the instruction bytes immediately before the saved return PC. With no operand, omit the size suffix.',
    chk2: `Checks whether a register is within a range defined by two bounds in memory. ${BOUNDS_OPERAND}\n\n${BOUNDS_COMPARISON}\n\nZ is set when the value equals either bound. C is set when it is outside the range. N and V are undefined, and X is unchanged. An out-of-range value raises a CHK exception through vector 6 at \`$18\`. The handler returns to the next instruction with \`rte\`. Without a handler, the program ends at \`chk2\`. See [writing a handler](/documentation/m68k/exceptions#handlers). [cmp2](/documentation/m68k/instruction/cmp2) performs the same comparison without raising an exception.`,
    cmp2: `Compares a register with two bounds in memory and sets Z for an endpoint or C for a value outside the range. ${BOUNDS_OPERAND}\n\n${BOUNDS_COMPARISON}\n\nZ is set when the value equals either bound and cleared otherwise. C is set outside the range and cleared inside it. N and V are undefined, and X is unchanged. Use \`bcs\` after the comparison to branch on an out-of-range value. [chk2](/documentation/m68k/instruction/chk2) performs the same comparison and also raises an exception when the value is outside.`,
    cas: 'Compares a data register with memory and writes an update register to memory only if the values are equal. `cas.l d0, d1, (a0)` compares `d0` with the long at `a0`. If they match, it writes `d1` there. Otherwise, it copies the memory value into `d0` and leaves memory unchanged.\n\nN, Z, V and C describe memory minus the compare register, at the selected size. X is unchanged. Z is set on success, so `beq` after `cas` branches when the update was written. On failure, a byte or word copied into the compare register preserves its upper bits.\n\nThe read, comparison and write form one indivisible step, including with respect to interrupts. To update a shared value, read it into the compare register, calculate a new value in the update register, then use `cas` to store it only if memory still holds the value read. If it fails, retry with the value returned in the compare register. [cas2](/documentation/m68k/instruction/cas2) updates two values together.',
    cas2: 'Compares two data registers with two memory operands and writes both updates only if both comparisons are equal. The operands are a pair of compare registers `Dc1:Dc2`, a pair of update registers `Du1:Du2`, and two addresses `(Rn1):(Rn2)`. Each address may be held in a data or address register.\n\nFor example, `cas2.l d0:d1, d2:d3, (a0):(a1)` compares `d0` with the long at `a0`, then `d1` with the long at `a1`. On success, it writes `d2` at `a0` and `d3` at `a1`. If either comparison fails, it writes neither update and copies the two memory values into `d0` and `d1`.\n\nN, Z, V and C describe memory minus its compare register for the first comparison, or for the second if the first was equal. X is unchanged. Z is set only if both comparisons succeed, so `beq` branches when both updates were written. The entire operation is indivisible, as with [cas](/documentation/m68k/instruction/cas). This lets a program update two related values together.',
    pack: "Packs two decimal digits from a word into one packed decimal byte. Each digit occupies the low four bits of a byte in the source word. The ASCII text `'42'`, for example, is `$3432`; packing it with adjustment `#0` gives `$42`.\n\n`pack` adds the 16-bit adjustment to the source word, then copies bits 11–8 to the high digit and bits 3–0 to the low digit. With data-register operands, it reads the source’s low word and writes the destination’s low byte, leaving the destination’s upper bits unchanged. With two predecrement operands, it decreases the source address by 2 and reads those two bytes, then decreases the destination address by 1 and writes one byte. If the byte destination is `sp`, it decreases by 2 to keep the stack pointer even. This processes a string from its end. The flags are unchanged.\n\n[unpk](/documentation/m68k/instruction/unpk) reverses the packing, and [abcd](/documentation/m68k/instruction/abcd) adds packed decimal values.",
    unpk: "Unpacks a packed decimal byte into a word with one digit in the low four bits of each byte, then adds a 16-bit adjustment. `unpk d0, d1, #$3030` converts `$42` to `$3432`, the ASCII text `'42'`.\n\nWith data-register operands, it reads the source’s low byte and writes the destination’s low word, leaving the upper word unchanged. With two predecrement operands, it decreases the source address by 1 and reads one byte (by 2 when the source is `sp`), then decreases the destination address by 2 and writes two bytes. The flags are unchanged. [pack](/documentation/m68k/instruction/pack) performs the reverse conversion.",
    divsl: 'Divides a signed 32-bit dividend by a signed 32-bit divisor, keeping both quotient and remainder. In `divsl.l <ea>, Dr:Dq`, `Dq` supplies the dividend. The old value of `Dr` is not used. The quotient replaces `Dq` and the remainder replaces `Dr`. The remainder has the dividend’s sign: -7 divided by 2 gives quotient -3 and remainder -1.\n\nUse different registers to keep both results. If `Dr` and `Dq` name the same register, only the quotient remains. This uses the same 32-bit dividend as the single-register form of [divs.l](/documentation/m68k/instruction/divs). The register-pair form of `divs.l` takes a 64-bit dividend instead.\n\nA zero divisor raises a division-by-zero exception through vector 5 at `$14`. The only signed 32-bit quotient overflow, -2147483648 divided by -1, sets V and leaves the registers unchanged. Otherwise V is cleared and N and Z describe the quotient. C is cleared and X is unchanged.',
    divul: 'Divides an unsigned 32-bit dividend by an unsigned 32-bit divisor, keeping both quotient and remainder. In `divul.l <ea>, Dr:Dq`, `Dq` supplies the dividend. The old value of `Dr` is not used. The quotient replaces `Dq` and the remainder replaces `Dr`.\n\nUse different registers to keep both results. If `Dr` and `Dq` name the same register, only the quotient remains. This uses the same 32-bit dividend as the single-register form of [divu.l](/documentation/m68k/instruction/divu). The register-pair form of `divu.l` takes a 64-bit dividend instead.\n\nA zero divisor raises a division-by-zero exception through vector 5 at `$14`. After a successful division, N and Z describe the quotient and V is cleared. C is cleared and X is unchanged.',
    bftst: `Tests a bit field and sets the condition codes without changing the field. N copies the field’s highest bit, and Z is set if the field is zero. V and C are cleared, and X is unchanged.\n\n${BIT_FIELD}`,
    bfextu: `Copies a bit field into a data register as an unsigned value. The field is placed in the register’s low bits, and all higher bits are cleared. For example, \`bfextu d0{24:8}, d1\` copies the low byte of \`d0\` into \`d1\`. This can extract a packed value such as the 5-bit red component of a colour.\n\nN copies the field’s highest bit, even though the extracted value is unsigned. Z is set if the field is zero. V and C are cleared, and X is unchanged. [bfexts](/documentation/m68k/instruction/bfexts) sign-extends the extracted value instead.\n\n${BIT_FIELD}`,
    bfexts: `Copies a bit field into a data register as a signed value. The field is placed in the register’s low bits and sign-extended to long. For example, a 4-bit field containing \`%1110\` becomes \`$FFFFFFFE\` (-2).\n\nN copies the field’s highest bit, and Z is set if the field is zero. V and C are cleared, and X is unchanged. [bfextu](/documentation/m68k/instruction/bfextu) fills the higher bits with zeros instead.\n\n${BIT_FIELD}`,
    bfffo: `Finds the first 1 in a bit field and writes its bit offset to a data register. The search starts at the field’s highest bit. The result is the supplied field offset plus the number of leading zero bits in the field. If the field is all zeros, the result is offset + width, the position just after the field.\n\n\`bfffo d0{0:32}, d1\` counts the leading zeros of \`d0\`. Subtract that count from 31 to obtain the highest set bit’s usual bit number. For a bitmap, the returned offset can identify the first slot marked by a 1.\n\nN copies the field’s highest bit, and Z is set if no 1 was found. V and C are cleared, and X is unchanged.\n\n${BIT_FIELD}`,
    bfchg: `Inverts every bit in a bit field. ${BIT_FIELD_FLAGS_BEFORE}\n\n${BIT_FIELD}`,
    bfclr: `Clears every bit in a bit field. For example, \`bfclr d0{20:12}\` clears the low 12 bits of \`d0\`. ${BIT_FIELD_FLAGS_BEFORE}\n\n${BIT_FIELD}`,
    bfset: `Sets every bit in a bit field to 1. For example, \`bfset (a0){3:4}\` sets bits 4 through 1 of the byte at \`a0\`. ${BIT_FIELD_FLAGS_BEFORE}\n\n${BIT_FIELD}`,
    bfins: `Copies the low bits of a data register into a bit field, preserving the bits around the field. The field’s width determines how many source bits are used. For example, \`bfins d1, (a0){0:5}\` writes the low 5 bits of \`d1\` into the highest 5 bits of the byte at \`a0\`.\n\nN copies the highest bit of the value inserted, and Z is set if that value is zero. V and C are cleared, and X is unchanged. [bfextu](/documentation/m68k/instruction/bfextu) extracts the value again.\n\n${BIT_FIELD}`
}
const dirsDesc = {
    dc: 'Stores a comma-separated list of values in memory. `.b`, `.w` and `.l` select 1, 2 or 4 bytes per numeric value. The default is `.w`, regardless of the value. Bare quoted text is stored as consecutive character bytes, padded with zeros to a multiple of the selected size. Use `dc.b` for text without padding. Word and long data start at an even address.',
    ds: 'Reserves the given number of elements in memory without initializing them. `.b`, `.w` and `.l` select 1, 2 or 4 bytes per element. The default is `.w`. Word and long regions start at an even address.',
    dcb: 'Stores the given number of copies of the second operand in memory. `.b`, `.w` and `.l` select 1, 2 or 4 bytes per copy. The default is `.w`. For example, `dcb.b 50, 1` writes fifty bytes, each containing 1.',
    org: 'Sets the address where the following instructions or data are assembled. For example, `org $2000` places the next item at `$2000`. Within a section, it changes that section’s location counter.',
    equ: 'Defines a constant expression. The symbol cannot be redefined later.',
    set: 'Defines a symbol’s value, which later `set` lines may replace. References use its most recent definition in assembly order, including across included Files. Define it before using it in its own next value: `count set 0` followed by `count set count+1` makes `count` equal to 1.',
    end: 'Stops assembly and optionally selects the program entry point. Code after it is ignored.',
    reg: 'Names a register list for use by `movem`.',
    fail: 'Raises an assembly error with the rest of the line as its message.',
    simhalt:
        'Pauses execution until Run or Step resumes it at the next instruction. It assembles as `$FFFF $FFFF`, the two words EASy68K recognizes as a pause. Put it before data or after a finished example to keep execution from continuing into the following bytes. To end execution instead, use simulator task 9.',
    section:
        'Selects one of sixteen location counters, numbered 0 through 15. Assembly starts in section 0 at `$1000`. The other sections start at zero, so use `org` to give them suitable addresses. Returning to a section resumes where its previous item ended. All sections share the same memory.\n\nFor example, `section 1` followed by `org $4000` and `dc.l 10` places a long at `$4000`. Switch to section 0 to continue its code, then use `section 1` again to place the next item at `$4004`.',
    offset: 'Assigns offsets to labels without emitting bytes, starting at the given value. Data directives advance this offset so you can describe a structure’s fields. `org` ends the region and resumes placing bytes. `org *` restores the address that was current before the region.\n\n```m68k\n    offset 0\nkind:   ds.w 1       ; offset 0\nvalue:  ds.l 1       ; offset 2\nlength: ds.b 0       ; total size: 6 bytes\n    org *\n```\n\nWith `a0` pointing to a structure, `move.l value(a0), d0` reads its long field.',
    include:
        'Assembles another text File at this point. The path is relative to the including File, then the Project root.',
    incbin: 'Copies the exact bytes of another File into memory at this point.',
    memory: 'Applies an access rule to an inclusive memory range. For example, `memory rom $8000,$8FFF` covers every address from `$8000` through `$8FFF`.\n\n- `rom`: code and data may be read. Program writes are ignored.\n- `read`: code and data may be read. A program write causes a bus error.\n- `protected`: only supervisor code may read, write or execute here. Any access from user mode causes a bus error.\n- `invalid`: every program access causes a bus error.\n\nA bus error raises exception vector 2, at `$8` with the default vector table. Without a handler, the program ends and the Log identifies the refused access. See [writing an exception handler](/documentation/m68k/exceptions#handlers).\n\nThere can be one range of each kind. A second `memory` directive for the same kind replaces its previous range. These rules apply to the running program. The debugger can still inspect and change the bytes, and the memory view displays the ranges as regions.',
    opt: 'Selects the processor and optional assembler features for the whole assembled program. Without a processor option, the target is the 68000. Write `opt p=68010` or `opt p=68020` before any code or data to enable that processor’s instructions and addressing modes. The choice also applies to included Files. Included Files do not have independent processor settings.\n\nThe editor supports the 68010 instruction set and the 68020 instruction set except `callm` and `rtm`. The 68020 additions include [scaled indexes and memory indirect addressing](/documentation/m68k/addressing-mode#68020), long branches, long multiplication and division, `cas`, `chk2`, [conditional traps](/documentation/m68k/instruction/trapcc), and [bit fields](/documentation/m68k/addressing-mode#bit-fields).\n\n`opt bit` enables bit-field instructions for a 68000 or 68010 program, as in EASy68K. Its addressing modes remain those of the chosen processor. A 68020 program already has bit fields. Write this option before any code or data too.\n\nEASy68K’s listing options `cre`, `mex`, `sex`, `war` and `cex`, including their `no` forms, are accepted and have no effect.',
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
        "dc.b 'Hello world!', 4, %10, $F, @10, 'a', some_label"
    ),
    ds: makeDirective('ds', ANY_SIZE, dirsDesc.ds, 'ds.l 100'),
    dcb: makeDirective('dcb', ANY_SIZE, dirsDesc.dcb, 'dcb.b 50, 1'),
    org: makeDirective('org', NO_SIZE, dirsDesc.org, 'org $1000'),
    equ: makeDirective('equ', NO_SIZE, dirsDesc.equ, 'name equ 10'),
    set: makeDirective('set', NO_SIZE, dirsDesc.set, 'count set 0\ncount set count+1'),
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
move.l #$10000000, d0
move.l #$10000000, a2
add.l #$F0000000, d0 ; wraps to zero and sets carry
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
        FLAGS_DIV,
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
        FLAGS_DIV,
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

move.l #$80, d1
neg.b d1 ; $80 stays $80: +128 does not fit in a signed byte, so V is set

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

* --- Stop early when the tested value reaches zero ---
move.l #10, d2
move.l #3, d3
loop2:
    subq.l #1, d3
    tst d3
    dbeq d2, loop2 ; Z set: stop with d3 = 0 and d2 = 8
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
        '    opt p=68020\n    move.l #$12345680, d0\n    extb.l d0 ; d0 = $FFFFFF80 (-128)\n    simhalt',
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
