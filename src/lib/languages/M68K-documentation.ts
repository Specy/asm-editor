import cloneDeep from 'clone-deep'


export enum AddressingMode {
    DataRegister = 1,
    AddressRegister = 2,
    Indirect = 4,
    IndirectWithPostincrement = 8,
    IndirectWithPredecrement = 16,
    IndirectWithDisplacement = 32,
    Immediate = 64,
    EffectiveAddress = 128,
}


export function addressingModeToString(addressingMode: AddressingMode): string {
    switch (addressingMode) {
        case AddressingMode.DataRegister:
            return "Dn";
        case AddressingMode.AddressRegister:
            return "An";

        case AddressingMode.IndirectWithPostincrement:
        case AddressingMode.IndirectWithPredecrement:
        case AddressingMode.Indirect:
        case AddressingMode.IndirectWithDisplacement:
            return "(An)";
        case AddressingMode.Immediate:
            return "Im";
        case AddressingMode.EffectiveAddress:
            return "ea";
        default:
            return "_";
    }
}
export enum Size {
    Byte = 1,
    Word = 2,
    Long = 4,
}
export function fromSizeToString(size: Size, extended = false): string {
    let result = "_"
    switch (size) {
        case Size.Byte:
            result = "byte"
            break;
        case Size.Word:
            result = "word"
            break;
        case Size.Long:
            result = "long"
            break;
        default:
            break;
    }
    return extended ? result : result[0]
}
export function fromSizesToString(sizes: Size[], extended = false): string {
    return sizes.map((e) => fromSizeToString(e, extended)).join(", ");
}


const Da = AddressingMode.DataRegister;
const Ad = AddressingMode.AddressRegister;
const In = AddressingMode.Indirect;
const Ipi = AddressingMode.IndirectWithPostincrement;
const Ipd = AddressingMode.IndirectWithPredecrement;
const Id = AddressingMode.IndirectWithDisplacement;
const Im = AddressingMode.Immediate;
const Ea = AddressingMode.EffectiveAddress;

const ANY = [Da, Ad, In, Ipi, Ipd, Id, Im, Ea];
const NO_Da = [Ad, In, Ipi, Ipd, Id, Im, Ea];
const NO_Ad = [Da, In, Ipi, Ipd, Id, Im, Ea];
const NO_Im = [Da, In, Ad, Ipi, Ipd, Id, Ea];
const NO_IM_OR_Ad = [Da, In, Ipi, Ipd, Id, Ea];
const NO_Ea = [Da, In, Ad, Ipi, Ipd, Im, Id];
const NO_In = [Da, Ad, Ipi, Ipd, Id, Im, Ea];
const NO_Ad_AND_NO_Im = [Da, In, Ipi, Ipd, Id, Ea];
const ONLY_REG = [Da, Ad];
const ONLY_Ad = [Ad];
const ONLY_Da = [Da];
const ONLY_In = [In];
const ONLY_Da_OR_In = [Da, In];
const ONLY_Da_OR_In_OR_Ea = [Da, In, Ea];
const ONLY_Ea = [Ea];
const ONLY_Im = [Im];
const ONLY_In_OR_Id_OR_Ea = [In, Id, Ea];
const ONLY_Ipi = [Ipi]

const NO_SIZE = []
const ANY_SIZE = [Size.Byte, Size.Word, Size.Long];
const ONLY_LONG_OR_WORD = [Size.Long, Size.Word];
export type InstructionDocumentation = {
    name: string;
    compundNames?: string[];
    args: AddressingMode[][];
    sizes: Size[];
    description: string;
    example?: string;
    defaultSize?: Size;
    interactiveExample?: {
        code: string;
    }
}

type InstructionName = string;

export const branchConditions = ["hi", "ls", "cc", "cs", "ne", "eq", "vc", "vs", "pl", "mi", "ge", "lt", "gt", "le", "hs", "lo"];

export const branchConditionsMap = new Map<string, string>(branchConditions.map(c => [c, c]));
export const branchConditionsDescriptions = new Map<string, string>([
    ["hi", "Unsigned higher"],
    ["ls", "Unsigned lower or same"],
    ["cc", "Carry clear"],
    ["cs", "Carry set"],
    ["ne", "Not equal"],
    ["eq", "Equal"],
    ["vc", "Overflow clear"],
    ["vs", "Overflow set"],
    ["pl", "Plus"],
    ["mi", "Minus"],
    ["ge", "Greater or equal"],
    ["lt", "Less than"],
    ["gt", "Greater than"],
    ["le", "Less than or equal"],
    ["hs", "Unsigned higher or same"],
    ["lo", "Unsigned lower"],
])


export const branchConditionsFlags = new Map<string, string>([
    ["hi", "!c && !z"],
    ["ls", "c || z"],
    ["cc", "!c"],
    ["cs", "c"],
    ["ne", "!z"],
    ["eq", "z"],
    ["vc", "!v"],
    ["vs", "v"],
    ["pl", "!n"],
    ["mi", "n"],
    ["ge", "(n && v) || (!n && !v)"],
    ["lt", "(n && !v) || (!n && v)"],
    ["gt", "(n && v && !z) || (!n && !v && !z)"],
    ["le", "z || (n && !v) || (!n && v)"],
    ["hs", "!c"],
    ["lo", "c"],
])



export const setConditions = [...branchConditions, "t", "f"];
const setConditionsDescriptions = new Map<string, string>([
    ["t", "True"],
    ["f", "False"],
    ...branchConditionsDescriptions.entries(),
])
export const directions = ["l", "r"]
export const directionsMap = new Map<string, string>(directions.map(d => [d, d]));
export const directionsDescriptions = new Map<string, string>([
    ["l", "Left"],
    ["r", "Right"],
])
const desc = {
    "move": "Moves the value from the first operand to second operand. If the second operand is an address register, the [MOVEA](/documentation/m68k/instruction/movea) instruction is used instead.",
    "moveq": "Moves the value from the first operand to second operand. The first operand is read as a byte so only values between -127 and 127.",
    "movea": "Moves the value from the first operand to second operand. If the size is word, it is sign extended to long. It does not change the SR. When using word size, the first operand is sign extended to long and the second is written as a long.",
    "add": "Adds the value of the first operand to second operand. If the second operand is an address register, the [ADDA](/documentation/m68k/instruction/adda) instruction is used instead.",
    "addi": "Adds the immediate value to the second operand",
    "adda": "Adds the value of the first operand to second operand. It does not change the SR.  When using word size, the first operand is sign extended to long and the second is read and written as a long.",
    "addq": "Adds the value of the first operand to second operand. The first operand value must be between 1 and 8. If the destination is a address register, it is always treated as a long, and the condition codes are not affected.",
    "sub": "Subtracts the value of the first operand from second operand and stores in the second. If the second operand is an address register, the [SUBA](/documentation/m68k/instruction/suba) instruction is used instead.",
    "suba": "Subtracts the value of the first operand from second operand and stores in the second. It does not change the SR. When using word size, the first operand is sign extended to long and the second is read and written as a long.",
    "subq": "Subtracts the value of the first operand from second operand and stores in the second. The first operand value must be between 1 and 8. If the destination is a address register, it is always treated as a long, and the condition codes are not affected.",
    "subi": "Subtracts the immediate value to the second operand",
    "divs": "Divides (signed) the value of the first operand by second operand. The quotient is stored in the first 16 bits of the destination register and the remainder is stored in the last 16 bits of the destination register. The first operand is read as a word, the second as a long",
    "divu": "Divides (unsigned) the value of the first operand by second operand. The quotient is stored in the first 16 bits of the destination register and the remainder is stored in the last 16 bits of the destination register. The first operand is read as a word, the second as a long",
    "muls": "Multiplies the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long",
    "mulu": "Multiplies (unsigned) the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long",
    "swap": "Swaps the two word of the register, you can see the register as [a,b] after the swap it will be [b,a]",
    "clr": "Sets to 0 all the bits of the destination operand, how many bits are set to 0 depends on the specified size, defaults to long",
    "exg": "Exchanges the values of the two operands, only works in 32 bits",
    "neg": "Flips the sign of the operand, depending on the specified size, defaults to word",
    "ext": "Extends the sign of the operand, depending on the specified size. If the part to extend is negative, it will be filled with 1s, otherwise it will be filled with 0s. Defaults to word",
    "tst": "Compares the operand with 0",
    "cmp": "Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions. Works by subtracting the first operand from the second operand and setting the flags. If the second operand is an address register, the [CMPA](/documentation/m68k/instruction/cmpa) instruction is used instead.",
    "cmpa": "Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions. When using word size, the first operand is sign extended to long and the second is read and written as a long.",
    "cmpm": "Compares two memory regions, only valid operand is the post increment, it sets the flags accordingly which will be used by the branchin instructions.",
    "cmpi": "Compares the second operand with the first operand, it sets the flags accordingly which will be used by the branching instructions.",
    "bcc": "Branches to the specified address if {condition code}",
    "scc": "Sets the first byte of the destination operand to $FF (-1) if flags {condition code} is true, otherwise it sets it to 0",
    "dbcc": "Decrements the first operand by 1 and branches to the specified address if {condition code} is false and the first operand is not -1. dbra is the same as dbf (will decrement untill it reaches -1). It reads the operand as a word, so it can run at maximum 64k times",
    "lea": "Loads the address of the first operand into the second operand, when using indirect addressing, the value is not read, only the address is loaded. For example \"lea 4(a0), a0\" will load a0 + 4 in a1",
    "pea": "Same as lea, but it pushes the address to the stack",
    "dbra": "Decrements the first operand by 1 and branches to the specified address if the first operand is not -1. dbcc is the same as dbf (will decrement untill it reaches -1)",
    "bra": "Branches to the specified address unconditionally",
    "jmp": "Jumps to the specified address unconditionally",
    "link": "Pushes to the stack the long content of the address register, sets the address register to the current stack pointer and then decrements the stack pointer by the specified amount",
    "unlk": "Sets the SP to the address register, then Pops a long value from the stack and stores the result in the address register",
    "not": "Inverts the bits of the operand depending on the specified size",
    "and": "Performs a logical AND between the first and second operand, stores the result in the second operand",
    "andi": "Performs a logical AND between the first immediate value and second operand, stores the result in the second operand",
    "or": "Performs a logical OR between the first and second operand, stores the result in the second operand",
    "ori": "Performs a logical OR between the first immediate value and second operand, stores the result in the second operand",
    "eor": "Performs a logical XOR between the first and second operand, stores the result in the second operand",
    "eori": "Performs a logical XOR between the first immediate value and second operand, stores the result in the second operand",
    "lsd": "Shifts the bits of the second operand to the {direction} as many times as the value of the first operand, depending on the specified size. The new bits are filled with 0s. Defaults to word",
    "asd": "Shifts the bits of the second operand to the {direction} as many times as the value of the first operand, depending on the specified size. The new bits are filled with the sign bit. Defaults to word",
    "rod": "Rotates the bits of the second operand to the {direction} as many times as the value of the first operand, depending on the specified size. Defaults to word",
    "btst": "Tests the bit of the second operand at the position of the value of the first operand, it changes the Z (zero) flag, the destination operand is not modified",
    "bclr": "Clears the bit of the second operand at the position of the value of the first operand",
    "bset": "Sets to 1 the bit of the second operand at the position of the value of the first operand",
    "bchg": "Inverts the bit of the second operand at the position of the value of the first operand",
    "bsr": "Branches to the specified address and stores the return address in the stack",
    "rts": "Returns from a subroutine, pops the return address from the stack and jumps to it",
    "jsr": "Jumps to the specified address, like the \"lea\" instruction, when resolving the address, it does not read the memory, so \"jsr 4(a0)\" will jump to the value of \"a0 + 4\", the address is loaded and stores the return address in the stack",
    "trap": `
        Executes a trap, the value of the operand is used as the trap number, only #15 is supported.
        The register d0 will be used as the trap type which are: 
| Opcode | Description                                                                                           |
|:------:|-------------------------------------------------------------------------------------------------------|
| 0      | Print string pointed by a1 with length read in d1.w, null terminated with max of 255, then prints a new line.              |
| 1      | Print string pointed by a1 with length read in d1.w.                                              |
| 2      | Read string from keyboard, writes at address of a1.                                               |
| 3      | Print number at d1.                                                                                  |
| 4      | Read number, writes to d1.                                                                           |
| 5      | Read character, writes to d1.                                                                        |
| 6      | Print character at d1.                                                                               |
| 8      | Get time, writes to d1.                                                                              |
| 9      | Terminate.                                                                                             |
| 13     | Prints null terminated string pointed by a1 then prints new line, errors if string is longer than 16kb, to prevent infinite loops.   |
| 14     | Prints null terminated string pointed by a1, errors if string is longer than 16kb, to prevent infinite loops.                       |
`.trim(),
}
const dirsDesc = {
    "dc": "Defines constants, following the directive there can be a list of constants separated by commas, the size of each constant depends on the selected size. If no size is selected, the size is determined by the value of the constant. If the constant is a string, it will be stored as a sequence of bytes, if it is a number, it will be stored as a sequence of words",
    "ds": "Defines a space in memory of N elements, the size of each element depends on the specified size, the content of the space is undefined",
    "dcb": "Defines a space in memory of N elements, the size of each element depends on the specified size, the content of the space is initialized to the second operand",
    "org": "Sets the current position in memory for the following instructions",
    "equ": "Defines a constant that will be replaced by the value when the program is assembled",
}

export function getAddressingModeNames(addressingModes: AddressingMode[]): string {
    const args = addressingModes.map(am => addressingModeToString(am))
    //removes duplicates
    return args.filter((value, index, self) => self.indexOf(value) === index).join("/");
}

export const M68KDirectiveDocumentation = {
    "dc": makeDirective("dc", ANY_SIZE, dirsDesc.dc, "dc.b 'Hello world!', 4, %10, $F, @8, 'a', some_label"),
    "ds": makeDirective("ds", ANY_SIZE, dirsDesc.ds, "ds.l 100"),
    "dcb": makeDirective("dcb", ANY_SIZE, dirsDesc.dcb, "dcb.b 50, 1"),
    "org": makeDirective("org", NO_SIZE, dirsDesc.org, "org $1000"),
    "equ": makeDirective("equ", NO_SIZE, dirsDesc.equ, "name equ 10"),
}
export const M68KDirectiveDocumentationList = Object.values(M68KDirectiveDocumentation)



export const M68kDocumentation: Record<InstructionName, InstructionDocumentation> = {
    "move": makeIns("move", [ANY, NO_Im], ANY_SIZE, desc.move, "move.b #10, d0", Size.Word, `move.b #10, d0`),
    "moveq": makeIns("moveq", [ONLY_Im, ONLY_Da], NO_SIZE, desc.moveq, "moveq #10, d0", undefined,
        `
        moveq #100, d0
        moveq #-20, d1
        moveq #128, d2 ;error 128 is not a valid 8 bit number
    `),
    "movea": makeIns("movea", [ANY, ONLY_Ad], ONLY_LONG_OR_WORD, desc.movea, "movea.l d0, a0", Size.Word,
        `
        move.l #10, d0        
        movea.w d0, a0
    `),
    "add": makeIns("add", [ANY, NO_Im], ANY_SIZE, desc.add, "add.l (a4, d3), d1", Size.Word,
        `
        move #10, d0
        move.l #20, d1
        add.w d0, d1
    `),
    "adda": makeIns("adda", [ANY, ONLY_Ad], ONLY_LONG_OR_WORD, desc.adda, "adda.l d0, a0", Size.Word,
        `
        move #10, d0
        move.l #20, a0
        adda.w d0, a0

        move.l	#$1C000, d1
        move.l	#$1C000, d2
        move.l	#$1C000, a1
        move.l	#$1C000, a2
	    adda.l	#$6000, d1
	    adda.l	#$6000, a1
	    adda.w	#$6000, d2
	    adda.w	#$6000, a2 ;!
    `),
    "addq": makeIns("addq", [ONLY_Im, NO_Im], ANY_SIZE, desc.addq, "addq.w #4, d1", Size.Word,
        `
        move.l #20, d1
        addq.w #4, d1
        addq.w #9, d1 ; error! exceeds 8
    `),
    "addi": makeIns("addi", [ONLY_Im, NO_IM_OR_Ad], ANY_SIZE, desc.addi, "addi.w #4, d1", Size.Word,
        `
        move.l #20, d1
        addi.w #100, d1
    `),
    "sub": makeIns("sub", [ANY, NO_Im], ANY_SIZE, desc.sub, "sub.w $1000, d1", Size.Word,
        `
        move.l #20, d1
        sub.w #10, d1   
    `),
    "suba": makeIns("suba", [ANY, ONLY_Ad], ONLY_LONG_OR_WORD, desc.suba, "suba.w #$FF, a1", Size.Word,
        `
        move.l #20, a1
        suba.w #10, a1
    `),
    "subi": makeIns("subi", [ONLY_Im, NO_IM_OR_Ad], ANY_SIZE, desc.subi, "subi #1, d3", Size.Word,
        `
        move.l #20, d3
        subi.l #$FFFF, d3
    `),
    "subq": makeIns("subq", [ONLY_Im, NO_Im], ANY_SIZE, desc.subq, "subq.b #1, d3", Size.Word,
        `
        move.l #20, d3
        subq.l #1, d3
        subq #9, d3 ; error! exceeds 8
    `),
    "divs": makeIns("divs", [NO_Ad, ONLY_Da], NO_SIZE, desc.divs, "divs #%101, d1", undefined,
        `
        move.l #21, d1
        divs #2, d1
        move.w d1, d2 ; quotient
        ; clr.w d1 ; optional, clear quotient part
        swap d1 ; swapping to get the remainder
        move.w d0, d3 ; remainder
    `),
    "divu": makeIns("divu", [NO_Ad, ONLY_Da], NO_SIZE, desc.divu, "divu #@4, d1", undefined,
        `
        move.l #21, d1
        divu #2, d1
        move.w d1, d2 ; quotient
        ; clr.w d1 ; optional, clear quotient part
        swap d1 ; swapping to get the remainder
        move.w d0, d3 ; remainder
    `),
    "muls": makeIns("muls", [NO_Ad, ONLY_Da], NO_SIZE, desc.muls, "muls d0, d1", undefined,
        `
        move.l #2, d1
        muls #4, d1
    `),
    "mulu": makeIns("mulu", [NO_Ad, ONLY_Da], NO_SIZE, desc.mulu, "mulu d5, d2", undefined,
        `
        move.l #2, d2
        mulu #4, d2
    `),
    "swap": makeIns("swap", [ONLY_Da], NO_SIZE, desc.swap, "swap d0", undefined,
        `
        move.l #$12345678, d0
        swap d0
    `),
    "clr": makeIns("clr", [NO_Ad_AND_NO_Im], ANY_SIZE, desc.clr, "clr.b d0", Size.Word,
        `
        move.l #$ffff, d0
        clr.b d0
        move.l #$ffff, d1
        clr.w d1
        move.l #$ffff, d2
        clr.l d2
    `),
    "exg": makeIns("exg", [ONLY_REG, ONLY_REG], NO_SIZE, desc.exg, "exg d0, a1", undefined,
        `
        move.l #$ff, d0
        move.l #$aa, a0
        exg d0, a0
    `),
    "neg": makeIns("neg", [ONLY_Da_OR_In_OR_Ea], ANY_SIZE, desc.neg, "neg.l d0", Size.Word,
        `
        move.b #1, d0 ; 1, 0x01
        neg.b d0 ; -1, 0xff
    `),
    "ext": makeIns("ext", [ONLY_Da], ONLY_LONG_OR_WORD, desc.ext, "ext.w d0", Size.Word,
        `
        move.b #8, d0
        ext.w d0 
        move.b #-8, d1
        ext.w d1
    `),
    "lea": makeIns("lea", [ONLY_In_OR_Id_OR_Ea, ONLY_Ad], NO_SIZE, desc.lea, "lea (a0), a1", undefined,
        `
        org $2000
        someLabel: dc.l 0

        START:
        lea someLabel, a0
        lea (a0), a1
        lea $3000, a2
    `),
    "pea": makeIns("pea", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.pea, "pea (a0)", undefined,
        `
        move.l (sp), d0
        pea $2000
        move.l (sp), d1
    `

    ),
    "tst": makeIns("tst", [NO_Im], ANY_SIZE, desc.tst, "tst.b (a0)", Size.Word,
        `
        move #$ff, d0
        tst.b d0
        smi d1 ; set if minus
        seq d2 ; set if equal
    `),
    "cmp": makeIns("cmp", [ANY, ONLY_REG], ANY_SIZE, desc.cmp, "cmp.l -(sp), d0", Size.Word,
        `
        move.l #10, d0
        move.l #11, d1
        ; compare d0 to d1
        cmp.l d1, d0 
        sgt d2 ; if d0 > d1
        slt d3 ; if d0 < d1
        ;...etc
    `),
    "cmpi": makeIns("cmpi", [ONLY_Im, NO_Im], ANY_SIZE, desc.cmpi, "cmpi.w #10, d3", Size.Word,
        `
        move.l #10, d0
        cmpi.w #11, d0
        ; compare d0 to 11
        sgt d2 ; if d0 > 11
        slt d3 ; if d0 < 11
        ;...etc
    `),
    "cmpa": makeIns("cmpa", [ANY, ONLY_Ad], ONLY_LONG_OR_WORD, desc.cmpa, "cmpa.l $1000, a0", Size.Word,
        `
        lea $1000, a0 ; loads address of $1000 into a0
        cmpa #$1000, a0
        ; compare a0 t0 1000
        seq d0 ; if a0 == 1000
    `),
    "cmpm": makeIns("cmpm", [ONLY_Ipi, ONLY_Ipi], ANY_SIZE, desc.cmpm, "cmpm.b (a0)+, (a1)+", Size.Word,
        `
        lea $1000, a0
        lea $2000, a1
        move.l #10, (a0)
        move.l #10, (a1)
        cmpm.b (a0)+, (a1)+
        ; compare (a0) to (a1)
        seq d0 ; if (a0) == (a1)
    `
    ),
    "bcc": {
        ...makeIns("bcc", [ONLY_Ea], NO_SIZE, desc.bcc, "`b<cc> label` Where cc is one of the condition codes", undefined,
            `
        move.l #10, d0
        move.l #2, d2
        for_start:
            subq.l #1, d0
            add #1, d2
            tst d0
            ;if d0 != 0, branch to for_start 
            bne for_start
    `),
        compundNames: branchConditions.map(c => `b${c}`),
    },
    "scc": {
        ...makeIns("scc", [NO_Ad_AND_NO_Im], NO_SIZE, desc.scc, "`s<cc> d0` Where cc is one of the condition codes", undefined,
            `
        move.l #10, d0
        tst d0 
        spl d1 ; set if plus
        sne d2 ; set if not equal
        smi d3 ; set if minus
        sgt d4 ; set if greater than
        ; ...etc
    `),
        compundNames: setConditions.map(c => `s${c}`),
    },
    "dbcc": {
        ...makeIns("dbcc", [ONLY_Da, ONLY_Ea], NO_SIZE, desc.dbcc, "`db<cc> d0, label` Where cc is one of the condition codes", undefined,
            `
        move.l #10, d0
        move.l #2, d2
        for_start:
            add #1, d2
            ; decrements and tests if d0 != 0
            dbne d0, for_start
    `),
        compundNames: branchConditions.map(c => `db${c}`),
    },
    "not": makeIns("not", [NO_Ad_AND_NO_Im], ANY_SIZE, desc.not, "not.b d0", Size.Word,
        `
        move.l #%10110100, d0
        not.w d0 ;01001011
        move.l #$01001011, d1
    `),
    "or": makeIns("or", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.or, "or.l #$FF, d1", Size.Word,
        `
        move.l #$F00F, d0
        move.l #$0F00, d1
        or.l d1, d0
    `),
    "ori": makeIns("ori", [ONLY_Im, NO_IM_OR_Ad], ANY_SIZE, desc.ori, "ori.l #%1100, (a0)", Size.Word,
        `
        move.l #$F00F, d0
        ori.l #$FF00, d0
    `),
    "and": makeIns("and", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.and, "and.l d0, d1", Size.Word,
        `
        move.l #$FF0F, d0
        move.l #$00FF, d1
        and.l d1, d0
    `), //destination should only be register
    "andi": makeIns("andi", [ONLY_Im, NO_IM_OR_Ad], ANY_SIZE, desc.andi, "andi.l #$FF, (a0)", Size.Word,
        `
        move.l #$FF0F, d0
        andi.l #$00FF, d0
    `),
    "eor": makeIns("eor", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.eor, "eor.l d0, d1", Size.Word,
        `   
        move.l #$F00F, d0
        move.l #$FF00, d1
    `),
    "eori": makeIns("eori", [ONLY_Im, NO_IM_OR_Ad], ANY_SIZE, desc.eori, "eori.l #1, (sp)+", Size.Word,
        `
        move.l #$F00F, d0
        eori.l #$FF00, d0
    `),
    "jmp": makeIns("jmp", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.jmp, "jmp (a0)", undefined,
        `
        move.l #10, d0
        lea fn1, a0
        jmp (a0)
        ; won't reach because it jumps to fn1
        move.l #'no', d1

        fn1: 
            move.l #$FF, d0
    `),
    "jsr": makeIns("jsr", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.jsr, "jsr (sp)", undefined,
        `
        move.l #10, d0
        lea add_two_to_d0, a0
        jsr (a0)
        jsr add_two_to_d0
        bra END

        add_two_to_d0: 
            add.l #2, d0    
            rts        

        END:
    `),
    "bra": makeIns("bra", [ONLY_Ea], NO_SIZE, desc.bra, "bra $2000", undefined,
        `
        move.l #10, d1
        bra branch_here

        branch_here:
            move.l #ff, d1
        add #1, d0
    `),
    "dbra": makeIns("dbra", [ONLY_Da, ONLY_Ea], NO_SIZE, desc.dbra, "dbra d0, label"),
    "link": makeIns("link", [ONLY_Ad, ONLY_Im], NO_SIZE, desc.link, "link a0, #-16"),
    "unlk": makeIns("unlk", [ONLY_Ad], NO_SIZE, desc.unlk, "unlk a0"),
    "rts": makeIns("rts", [], NO_SIZE, desc.rts, "rts", undefined,
        `
        move.l #10, d0
        lea add_two_to_d0, a0
        jsr (a0)
        jsr add_two_to_d0
        bra END

        add_two_to_d0: 
            add.l #2, d0    
            rts        

        END:
    `),
    "bsr": makeIns("bsr", [ONLY_Ea], NO_SIZE, desc.bsr, "bsr label", undefined,
        `
        move.l #10, d0
        bsr add_two_to_d0
        bra END

        add_two_to_d0: 
            add.l #2, d0    
            rts        

        END:
    `),
    "trap": makeIns("trap", [ONLY_Im], NO_SIZE, desc.trap, "trap #15"),
    "asd": {
        ...makeIns("asd", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.asd, "`as<d> d0, d3` Where d is either (l)eft or (r)ight", Size.Word,
            `
        move.w #$FF00, d0
        asr.w #4, d0
        move.w #$0F00, d1
        asr.w #4, d1
        move.w #$0FF0, d2
        asr.w #4, d2
    `),
        compundNames: ["asl", "asr"]
    },
    "lsd": {
        ...makeIns("lsd", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.lsd, "`ls<d> #3, d7` Where d is either (l)eft or (r)ight", Size.Word,
            `
        move.w #$FF00, d0
        lsr.w #4, d0
        move.w #$0F00, d1
        lsr.w #4, d1
        move.w #$0FF0, d2
        asr.w #4, d2 
    `),
        compundNames: ["lsr", "lsl"]
    },
    "rod": {
        ...makeIns("rod", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.rod, "`ro<d> d2, d5` Where d is either (l)eft or (r)ight", Size.Word,
            `
        move.w #$1234, d0
        rol.w #8, d0
        move.w #$1234, d1
        ror.w #8, d1
        `),
        compundNames: ["rol", "ror"]
    },
    "btst": makeIns("btst", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.btst, "btst #4, d0", undefined,
        `
        move #1, d0
        btst #0, d0
        sne d1
    `),
    "bchg": makeIns("bchg", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bchg, "bchg #%101, d3", undefined,
        `
        move #3, d0
        bchg #0, d0
        sne d1
    `),
    "bclr": makeIns("bclr", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bclr, "bclr d2, d7", undefined,
        `
        move #3, d0
        bclr #1, d0
    `),
    "bset": makeIns("bset", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bset, "bset #1, d1", undefined,
        `
        move #1, d0
        bset #2, d0
    `),
}

export const M68KUncompoundedInstructions = uncompoundInstructions(Object.values(M68kDocumentation))


export function getInstructionDocumentation(instructionName: InstructionName): InstructionDocumentation | undefined {
    if (!instructionName) return undefined
    const ins = M68KUncompoundedInstructions.get(instructionName)
    const directive = M68KDirectiveDocumentation[instructionName]
    if (ins) return ins
    if (directive) return directive
    return undefined
}

export function uncompoundInstructions(instructions: InstructionDocumentation[] | Map<string, InstructionDocumentation>) {
    const map = new Map<string, InstructionDocumentation>()
    instructions = Array.isArray(instructions) ? instructions : Array.from(instructions.values())
    instructions.forEach(i => {
        if (i.compundNames) {
            i.compundNames.forEach(n => {
                let description = i.description
                const name = i.name
                if(name === "lsd" || name === "asd" || name === "rod") {
                    const direction = n.substring(n.length - 1)
                    description = description.replace("{direction}", `"**${directionsDescriptions.get(direction)}"**"`)
                }
                if(name === "bcc" || name === "dbcc") {
                    const code = n.substring(n.length - 2)
                    description = description.replace("{condition code}", `"**${branchConditionsDescriptions.get(code)}**"`)
                }
                if(name === "scc") {
                    let code = n.substring(n.length - 2)
                    if(n === "st") code = "t"
                    if(n === "sf") code = "f"
                    description = description.replace("{condition code}", `"**${setConditionsDescriptions.get(code)}**"`)
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


export const instructionsDocumentationList = Object.values(M68kDocumentation).sort((a, b) => a.name.localeCompare(b.name))


function makeIns(name: string, args: AddressingMode[][], sizes: Size[], description?: string, example?: string, defaultSize?: Size, interactiveExample?: string,): InstructionDocumentation {
    const code = (interactiveExample ?? "")
        .split("\n")
        .map(l => l.replace(/\s{8}/g, ""))
        .join("\n")
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
        }
    };
}

type DirectiveDocumentation = {
    name: string;
    description?: string;
    example?: string;
    sizes: Size[];
}
function makeDirective(name: string, sizes: Size[], description?: string, example?: string): DirectiveDocumentation {
    return {
        name,
        description,
        example,
        sizes
    };
}



/*TODO
    spl highlighted wrogn
*/