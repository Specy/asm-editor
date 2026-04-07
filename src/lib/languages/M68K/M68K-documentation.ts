import cloneDeep from 'clone-deep'

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
    RegisterRange = 512
}

export function addressingModeToString(addressingMode: AddressingMode): string {
    switch (addressingMode) {
        case AddressingMode.DataRegister:
            return 'Dn'
        case AddressingMode.AddressRegister:
            return 'An'

        case AddressingMode.PostIndirect:
        case AddressingMode.PreIndirect:
        case AddressingMode.Indirect:
        case AddressingMode.IndirectWithDisplacement:
            return '(An)'
        case AddressingMode.Immediate:
            return 'Im'
        case AddressingMode.Absolute:
            return 'ea'
        case AddressingMode.IndirectIndex:
            return '(An, Xn)'
        case AddressingMode.RegisterRange:
            return 'Xn-Xn'
        default:
            return '_'
    }
}

export enum Size {
    Byte = 1,
    Word = 2,
    Long = 4
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

const ANY = [Da, Ad, In, Ipi, Ipd, Id, Im, Ea, Ix]
const NO_Ad = [Da, In, Ipi, Ipd, Id, Im, Ea, Ix]
const NO_Im = [Da, In, Ad, Ipi, Ipd, Id, Ea, Ix]
const NO_IM_OR_Ad = [Da, In, Ipi, Ipd, Id, Ea, Ix]
const NO_Ad_AND_NO_Im = [Da, In, Ipi, Ipd, Id, Ea, Ix]
const ONLY_REG = [Da, Ad]
const ONLY_Ad = [Ad]
const ONLY_Da = [Da]
const ONLY_Da_OR_In_OR_Ea = [Da, In, Ea]
const ONLY_Ea = [Ea]
const ONLY_Im = [Im]
const ONLY_In_OR_Id_OR_Ea = [In, Id, Ea]
const ONLY_Ipi = [Ipi]

const NO_SIZE = []
const ANY_SIZE = [Size.Byte, Size.Word, Size.Long]
const ONLY_LONG_OR_WORD = [Size.Long, Size.Word]

export enum AffectedFlagKind {
    ToZero = 'to-zero',
    ToOne = 'to-one',
    Edits = 'edits',
    Unaffected = 'unaffected',
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

export const branchConditionsMap = new Map<string, string>(branchConditions.map((c) => [c, c]))
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
export const directionsMap = new Map<string, string>(directions.map((d) => [d, d]))
export const directionsDescriptions = new Map<string, string>([
    ['l', 'Left'],
    ['r', 'Right']
])
const desc = {
    move: 'Moves the value from the first operand to second operand. If the second operand is an address register, the [MOVEA](/documentation/m68k/instruction/movea) instruction is used instead.',
    moveq: 'Moves the value from the first operand to second operand. The first operand is read as a byte so only values between -127 and 127.',
    movea: 'Moves the value from the first operand to second operand. If the size is word, it is sign extended to long. It does not change the SR. When using word size, the first operand is sign extended to long and the second is written as a long.',
    movem:
        'Move many, useful when you want to save a bunch of registers, for example to save their value when branching to a function it moves a list of registers to memory, or memory to a list of registers. The first operand is the list of registers, ' +
        'the second operand is the memory region. If you define the registers as the first operand, then it will save the registers to memory, if the first operand is the memory, then it will load the registers from memory. You can write the list of registers by separating them with a "/", ' +
        'and the range between registers by using a dash. ex: a3-a5/d0-d2 will select d0, d1, d2, a3, a4, a5. The order of the register will be converted to first data, then address registers, from 0 to 7. When using the pre-decrement operand, the order of the registers will be reversed, going from a7 to a0, and d7 to d0.',
    add: 'Adds the value of the first operand to second operand. If the second operand is an address register, the [ADDA](/documentation/m68k/instruction/adda) instruction is used instead.',
    addi: 'Adds the immediate value to the second operand',
    adda: 'Adds the value of the first operand to second operand. It does not change the SR.  When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    addq: 'Adds the value of the first operand to second operand. The first operand value must be between 1 and 8. If the destination is a address register, it is always treated as a long, and the condition codes are not affected.',
    sub: 'Subtracts the value of the first operand from second operand and stores in the second. If the second operand is an address register, the [SUBA](/documentation/m68k/instruction/suba) instruction is used instead.',
    suba: 'Subtracts the value of the first operand from second operand and stores in the second. It does not change the SR. When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    subq: 'Subtracts the value of the first operand from second operand and stores in the second. The first operand value must be between 1 and 8. If the destination is a address register, it is always treated as a long, and the condition codes are not affected.',
    subi: 'Subtracts the immediate value to the second operand',
    divs: 'Divides (signed) the value of the second operand by the value of the first operand (op2 / op1). The quotient is stored in the first 16 bits of the destination register and the remainder is stored in the last 16 bits of the destination register. The first operand is read as a word, the second as a long',
    divu: 'Divides (unsigned) the value of the second operand by the value of the first operand (op2 / op1). The quotient is stored in the first 16 bits of the destination register and the remainder is stored in the last 16 bits of the destination register. The first operand is read as a word, the second as a long',
    muls: 'Multiplies the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long',
    mulu: 'Multiplies (unsigned) the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long',
    swap: 'Swaps the two word of the register, you can see the register as [a,b] after the swap it will be [b,a]',
    clr: 'Sets to 0 all the bits of the destination operand, how many bits are set to 0 depends on the specified size, defaults to long',
    exg: 'Exchanges the values of the two operands, only works in 32 bits',
    neg: 'Flips the sign of the operand, depending on the specified size, defaults to word',
    ext: 'Extends the sign of the operand, depending on the specified size. If the part to extend is negative, it will be filled with 1s, otherwise it will be filled with 0s. Defaults to word',
    tst: 'Compares the operand with 0',
    cmp: 'Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions. Works by subtracting the first operand from the second operand and setting the flags. If the second operand is an address register, the [CMPA](/documentation/m68k/instruction/cmpa) instruction is used instead.',
    cmpa: 'Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions. When using word size, the first operand is sign extended to long and the second is read and written as a long.',
    cmpm: 'Compares two memory regions, only valid operand is the post increment, it sets the flags accordingly which will be used by the branchin instructions.',
    cmpi: 'Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions.',
    bcc: 'Branches to the specified address if {condition code}',
    scc: 'Sets the first byte of the destination operand to $FF (-1) if flags {condition code} is true, otherwise it sets it to 0',
    dbcc: 'Decrements the first operand by 1 and branches to the specified address if {condition code} is false and the first operand is not -1. dbra is the same as dbf (will decrement untill it reaches -1). It reads the operand as a word, so it can run at maximum 64k times',
    lea: 'Loads the address of the first operand into the second operand, when using indirect addressing, the value is not read, only the address is loaded. For example "lea 4(a0), a0" will load a0 + 4 in a1',
    pea: 'Same as lea, but it pushes the address to the stack',
    dbra: 'Decrements the first operand by 1 and branches to the specified address if the first operand is not -1. dbcc is the same as dbf (will decrement untill it reaches -1)',
    bra: 'Branches to the specified address unconditionally',
    jmp: 'Jumps to the specified address unconditionally',
    link: 'Pushes to the stack the long content of the address register, sets the address register to the current stack pointer and then decrements the stack pointer by the specified amount',
    unlk: 'Sets the SP to the address register, then Pops a long value from the stack and stores the result in the address register',
    not: 'Inverts the bits of the operand depending on the specified size',
    and: 'Performs a logical AND between the first and second operand, stores the result in the second operand',
    andi: 'Performs a logical AND between the first immediate value and second operand, stores the result in the second operand',
    or: 'Performs a logical OR between the first and second operand, stores the result in the second operand',
    ori: 'Performs a logical OR between the first immediate value and second operand, stores the result in the second operand',
    eor: 'Performs a logical XOR between the first and second operand, stores the result in the second operand',
    eori: 'Performs a logical XOR between the first immediate value and second operand, stores the result in the second operand',
    lsd: 'Shifts the bits of the second operand to the {direction} as many times as the value of the first operand, depending on the specified size. The new bits are filled with 0s. Defaults to word',
    asd: 'Shifts the bits of the second operand to the {direction} as many times as the value of the first operand, depending on the specified size. The new bits are filled with the sign bit. Defaults to word. Note: ASL sets the overflow flag if the MSB changes during the shift, while ASR always clears it',
    rod: 'Rotates the bits of the second operand to the {direction} as many times as the value of the first operand, depending on the specified size. Defaults to word',
    btst: 'Tests the bit of the second operand at the position of the value of the first operand, it changes the Z (zero) flag, the destination operand is not modified',
    bclr: 'Clears the bit of the second operand at the position of the value of the first operand',
    bset: 'Sets to 1 the bit of the second operand at the position of the value of the first operand',
    bchg: 'Inverts the bit of the second operand at the position of the value of the first operand',
    bsr: 'Branches to the specified address and stores the return address in the stack',
    rts: 'Returns from a subroutine, pops the return address from the stack and jumps to it',
    jsr: 'Jumps to the specified address, like the "lea" instruction, when resolving the address, it does not read the memory, so "jsr 4(a0)" will jump to the value of "a0 + 4", the address is loaded and stores the return address in the stack',
    trap: `
Executes a trap, the value of the operand is used as the trap number, only #15 is supported.
The register d0 will be used as the trap type which are: 
| Opcode | Description   |
|:------:|-------------------------------------------------------------------------------------------------------|
| 0      | Print string pointed by a1 with length read in d1.w, null terminated with max of 255, then prints a new line.      |
| 1      | Print string pointed by a1 with length read in d1.w.      |
| 2      | Read string from keyboard, writes the string at address of a1 and overrides the value of d1 with the length of the string.       |
| 3      | Print signed number at d1.  |
| 4      | Read number, writes to d1.   |
| 5      | Read character, writes to d1.|
| 6      | Print character at d1.       |
| 8      | Get time, writes to d1.      |
| 9      | Terminate.     |
| 13     | Prints null terminated string pointed by a1 then prints new line, errors if string is longer than 16kb, to prevent infinite loops.   |
| 14     | Prints null terminated string pointed by a1, errors if string is longer than 16kb, to prevent infinite loops.       |
| 15     | Prints unsigned number at d1 in base (from 2 to 36) specified in d2.b
| 23     | Delays the execution of the simulator by milliseconds of the value in d1.
`.trim()
}
const dirsDesc = {
    dc: 'Defines constants, following the directive there can be a list of constants separated by commas, the size of each constant depends on the selected size. If no size is selected, the size is determined by the value of the constant. If the constant is a string, it will be stored as a sequence of bytes, if it is a number, it will be stored as a sequence of words',
    ds: 'Defines a space in memory of N elements, the size of each element depends on the specified size, the content of the space is undefined',
    dcb: 'Defines a space in memory of N elements, the size of each element depends on the specified size, the content of the space is initialized to the second operand',
    org: 'Sets the current position in memory for the following instructions',
    equ: 'Defines a constant that will be replaced by the value when the program is assembled'
}

export function getAddressingModeNames(addressingModes: AddressingMode[]): string {
    const args = addressingModes.map((am) => addressingModeToString(am))
    //removes duplicates
    return args.filter((value, index, self) => self.indexOf(value) === index).join('/')
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
    equ: makeDirective('equ', NO_SIZE, dirsDesc.equ, 'name equ 10')
}
export const M68KDirectiveDocumentationList = Object.values(M68KDirectiveDocumentation)

export const M68kDocumentation: Record<InstructionName, InstructionDocumentation> = {
    move: makeIns(
        'move',
        [ANY, NO_Im],
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
    `
    ),
    moveq: makeIns(
        'moveq',
        [ONLY_Im, ONLY_Da],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.moveq,
        'moveq #10, d0',
        undefined,
        `
moveq #100, d0
moveq #-1, d1
moveq #127, d2
moveq #-128, d3
; moveq #128, d4 ; error! 128 exceeds signed byte range (-128..127)
    `
    ),
    movem: makeIns(
        'movem',
        [NO_Im, NO_Im],
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
        [NO_Ad, ONLY_Da],
        NO_SIZE,
        FLAGS_DIV,
        desc.divs,
        'divs #2, d1',
        undefined,
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
; divs #0, d6 ; division by zero exception!
    `
    ),
    divu: makeIns(
        'divu',
        [NO_Ad, ONLY_Da],
        NO_SIZE,
        FLAGS_DIV,
        desc.divu,
        'divu #4, d1',
        undefined,
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
        [NO_Ad, ONLY_Da],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.muls,
        'muls d0, d1',
        undefined,
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
        [NO_Ad, ONLY_Da],
        NO_SIZE,
        FLAGS_LOGIC,
        desc.mulu,
        'mulu d5, d2',
        undefined,
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
        NO_SIZE,
        FLAGS_LOGIC,
        desc.swap,
        'swap d0',
        undefined,
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
        NO_SIZE,
        UNAFFECTED,
        desc.exg,
        'exg d0, a1',
        undefined,
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
        NO_SIZE,
        UNAFFECTED,
        desc.lea,
        'lea (a0), a1',
        undefined,
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
        NO_SIZE,
        UNAFFECTED,
        desc.pea,
        'pea (a0)',
        undefined,
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
        [NO_Im],
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
        [ONLY_Im, NO_Im],
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
lea $1000, a0
lea $2000, a1
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
            NO_SIZE,
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
            NO_SIZE,
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
            NO_SIZE,
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
        compundNames: branchConditions.map((c) => `db${c}`)
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
        [ONLY_Im, NO_IM_OR_Ad],
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
        [ONLY_Im, NO_IM_OR_Ad],
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
        [ONLY_Im, NO_IM_OR_Ad],
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
        NO_SIZE,
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
        NO_SIZE,
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
        NO_SIZE,
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
        NO_SIZE,
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
* --- Trap #15 invokes I/O based on d0 ---
move #4, d0
trap #15 ; read input

move #3, d0
trap #15 ; print input

move #6, d0
move #32, d1
trap #15 ; print character (space)
       `
    ),
    asd: {
        ...makeIns(
            'asd',
            [NO_Ad, NO_Ad_AND_NO_Im],
            ANY_SIZE,
            FLAGS_MATH,
            desc.asd,
            '`as<d> d0, d3` Where d is either (l)eft or (r)ight',
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
    `
        ),
        compundNames: ['asl', 'asr']
    },
    lsd: {
        ...makeIns(
            'lsd',
            [NO_Ad, NO_Ad_AND_NO_Im],
            ANY_SIZE,
            FLAGS_LSd,
            desc.lsd,
            '`ls<d> #3, d7` Where d is either (l)eft or (r)ight',
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
    `
        ),
        compundNames: ['lsr', 'lsl']
    },
    rod: {
        ...makeIns(
            'rod',
            [NO_Ad, NO_Ad_AND_NO_Im],
            ANY_SIZE,
            FLAGS_ROd,
            desc.rod,
            '`ro<d> d2, d5` Where d is either (l)eft or (r)ight',
            Size.Word,
            `
* --- ROL: rotate left (bits wrap around) ---
move.w #$1234, d0
rol.w #8, d0 ; d0 = $3412

* --- ROR: rotate right ---
move.w #$1234, d1
ror.w #8, d1 ; d1 = $3412

* --- Single bit rotate ---
move.w #%10000000_00000001, d2
rol.w #1, d2 ; d2 = %00000000_00000011
`
        ),
        compundNames: ['rol', 'ror']
    },
    btst: makeIns(
        'btst',
        [NO_Ad, NO_Ad_AND_NO_Im],
        NO_SIZE,
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
        [NO_Ad, NO_Ad_AND_NO_Im],
        NO_SIZE,
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
        [NO_Ad, NO_Ad_AND_NO_Im],
        NO_SIZE,
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
        [NO_Ad, NO_Ad_AND_NO_Im],
        NO_SIZE,
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
    )
}

export const M68KUncompoundedInstructions = uncompoundInstructions(Object.values(M68kDocumentation))

export function getInstructionDocumentation(
    instructionName: InstructionName
): InstructionDocumentation | undefined {
    if (!instructionName) return undefined
    const ins = M68KUncompoundedInstructions.get(instructionName)
    const directive = M68KDirectiveDocumentation[instructionName]
    if (ins) return ins
    if (directive) return directive
    return undefined
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
                if (name === 'lsd' || name === 'asd' || name === 'rod') {
                    const direction = n.substring(n.length - 1)
                    description = description.replace(
                        '{direction}',
                        `"**${directionsDescriptions.get(direction)}**"`
                    )
                }
                if (name === 'bcc' || name === 'dbcc') {
                    const code = n.substring(n.length - 2)
                    description = description.replace(
                        '{condition code}',
                        `"**${branchConditionsDescriptions.get(code)}**"`
                    )
                }
                if (name === 'scc') {
                    let code = n.substring(n.length - 2)
                    if (n === 'st') code = 't'
                    if (n === 'sf') code = 'f'
                    description = description.replace(
                        '{condition code}',
                        `"**${setConditionsDescriptions.get(code)}**"`
                    )
                }
                const entry = cloneDeep(i)
                entry.name = n
                entry.description = description
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
    description?: string,
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
        interactiveExample: {
            code
        },
        affectsFlags: affectedFlags
    }
}

type DirectiveDocumentation = {
    name: string
    description?: string
    example?: string
    sizes: Size[]
}

function makeDirective(
    name: string,
    sizes: Size[],
    description?: string,
    example?: string
): DirectiveDocumentation {
    return {
        name,
        description,
        example,
        sizes
    }
}

/*TODO
    spl highlighted wrogn
*/

const arithmetic = [
    'add',
    'sub',
    'suba',
    'adda',
    'divs',
    'divu',
    'muls',
    'mulu',
    'addq',
    'subq',
    'addi',
    'subi'
]
const logic = [
    'tst',
    'cmp',
    'cmpa',
    'cmpm',
    'cmpi',
    'not',
    'or',
    'and',
    'eor',
    'lsl',
    'lsr',
    'asr',
    'asl',
    'rol',
    'ror',
    'btst',
    'bclr',
    'bchg',
    'bset',
    'andi',
    'ori',
    'eori',
    'subi'
]
const special = ['clr', 'exg', 'neg', 'ext', 'swap', 'move', 'movea', 'trap', 'movem']
export const M68KDirectives = ['org', 'equ', 'dcb', 'ds', 'dc']
const others = [
    ...setConditions.map((e) => `s${e}`),
    ...branchConditions.map((e) => `b${e}`),
    ...branchConditions.map((e) => `db${e}`),
    'dbra',
    'bsr',
    'bra',
    'jsr',
    'rts',
    'link',
    'unlk',
    'lea',
    'pea',
    'moveq',
    'jmp'
]
export const M68kInstructions = [...arithmetic, ...logic, ...special, ...others]
