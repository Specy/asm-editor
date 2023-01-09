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
export function fromSizeToString(size: Size): string {
    switch (size) {
        case Size.Byte:
            return "b";
        case Size.Word:
            return "w";
        case Size.Long:
            return "l";
        default:
            return "_";
    }
}
export function fromSizesToString(sizes: Size[]): string {
    return sizes.map(fromSizeToString).join(",");
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

const NO_SIZE = []
const ANY_SIZE = [Size.Byte, Size.Word, Size.Long];
const ONLY_LONG_OR_WORD = [Size.Long, Size.Word];
export type InstructionDocumentation = {
    name: string;
    args: AddressingMode[][];
    sizes: Size[];
    description?: string;
    example?: string;
    defaultSize?: Size;
}

type InstructionName = string;

export const branchConditions = ["hi", "ls", "cc", "cs", "ne", "eq", "vc", "vs", "pl", "mi", "ge", "lt", "gt", "le"];

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
    "move": "Moves the value from the first operand to second operand.",
    "moveq": "Moves the value from the first operand to second operand. The first operand is read as a byte so only values between -127 and 127.",
    "add": "Adds the value of the first operand to second operand.",
    "adda": "Adds the value of the first operand to second operand. It does not change the SR",
    "addq": "Adds the value of the first operand to second operand. The first operand value must be between 1 and 8. If the destination is a address register, it is always treated as a long, and the condition codes are not affected.",
    "sub": "Subtracts the value of the first operand from second operand and stores in the second.",
    "suba": "Subtracts the value of the first operand from second operand and stores in the second. It does not change the SR",
    "subq": "Subtracts the value of the first operand from second operand and stores in the second. The first operand value must be between 1 and 8. If the destination is a address register, it is always treated as a long, and the condition codes are not affected.",
    "divs": "Divides the value of the first operand by second operand. The quotient is stored in the first 16 bits of the destination register and the remainder is stored in the last 16 bits of the destination register. The first operand is read as a word, the second as a long",
    "divu": "Divides (unsigned) the value of the first operand by second operand. The quotient is stored in the first 16 bits of the destination register and the remainder is stored in the last 16 bits of the destination register. The first operand is read as a word, the second as a long",
    "muls": "Multiplies the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long",
    "mulu": "Multiplies (unsigned) the value of the first operand by the second operand. The result is stored in the second operand. The first operand is read as a word, the second as a long",
    "swap": "Swaps the two word of the register, you can see the register as [a,b] after the swap it will be [b,a]",
    "clr": "Sets to 0 all the bits of the destination operand, how many bits are set to 0 depends on the specified size, defaults to long",
    "exg": "Exchanges the values of the two operands, only works in 32 bits",
    "neg": "Flips the sign of the operand, depending on the specified size, defaults to word",
    "ext": "Extends the sign of the operand, depending on the specified size. If the part to extend is negative, it will be filled with 1s, otherwise it will be filled with 0s. Defaults to word",
    "tst": "Compares the operand with 0",
    "cmp": "Compares the second operand with the first operand",
    "bcc": "Branches to the specified address if {condition code}",
    "scc": "Sets the destination operand to 0 if {condition code} is true, otherwise it sets it to -1",
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
    "or": "Performs a logical OR between the first and second operand, stores the result in the second operand",
    "eor": "Performs a logical XOR between the first and second operand, stores the result in the second operand",
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
        0: Print string at address of a1, then prints a new line.
        1: Print string at address of a1.   
        2: Read string from keyboard, writes at address of a1.
        3: Print number at d1.
        4: Read number, writes to d1.
        5: Read character, writes to d1.
        6: Print character at d1.
        7: Terminate
        8: Get time, writes to d1
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
    "ds": makeDirective("ds",  ANY_SIZE, dirsDesc.ds, "ds.l 100"),
    "dcb": makeDirective("dcb", ANY_SIZE, dirsDesc.dcb, "dcb.b 50, 1"),
    "org": makeDirective("org", NO_SIZE,  dirsDesc.org, "org $1000"),
    "equ": makeDirective("equ", NO_SIZE, dirsDesc.equ, "name equ 10"),
}
export const M68KDirectiveDocumentationList = Object.values(M68KDirectiveDocumentation)
export const M68kDocumentation: Record<InstructionName, InstructionDocumentation> = {
    "move": makeIns("move", [ANY, NO_Im], ANY_SIZE, desc.move, "move.b #10, d0", Size.Word),
    "moveq": makeIns("moveq", [ONLY_Im, ONLY_Da], NO_SIZE, desc.moveq, "moveq #10, d0"),
    "add": makeIns("add", [ANY, NO_Im], ANY_SIZE, desc.add, "add.l (a4, d3), d1", Size.Word),
    "adda": makeIns("adda", [ANY, ONLY_Ad], ANY_SIZE, desc.adda, "adda.l d0, a0", Size.Word),
    "addq": makeIns("addq", [ONLY_Im, NO_Im], ANY_SIZE, desc.addq, "addq.w #4, d1", Size.Word),
    "sub": makeIns("sub", [ANY, NO_Im], ANY_SIZE, desc.sub, "sub.w $1000, d1", Size.Word),
    "suba": makeIns("suba", [ANY, ONLY_Ad], ANY_SIZE, desc.suba, "suba.w #$FF, a1", Size.Word),
    "subq": makeIns("subq", [ONLY_Im, NO_Im], ANY_SIZE, desc.subq, "subq.b #1, d3", Size.Word),
    "divs": makeIns("divs", [NO_Ad, ONLY_Da], NO_SIZE, desc.divs, "divs #%101, d1"),
    "divu": makeIns("divu", [NO_Ad, ONLY_Da], NO_SIZE, desc.divu, "divu #@4, d1"),
    "muls": makeIns("muls", [NO_Ad, ONLY_Da], NO_SIZE, desc.muls, "muls d0, d1"),
    "mulu": makeIns("mulu", [NO_Ad, ONLY_Da], NO_SIZE, desc.mulu, "mulu d5, d2"),
    "swap": makeIns("swap", [ONLY_Da], NO_SIZE, desc.swap, "swap d0"),
    "clr": makeIns("clr", [NO_Ad_AND_NO_Im], ANY_SIZE, desc.clr, "clr.b d0", Size.Word),
    "exg": makeIns("exg", [ONLY_REG, ONLY_REG], NO_SIZE, desc.exg, "exg d0, a1"),
    "neg": makeIns("neg", [ONLY_Da_OR_In_OR_Ea], ANY_SIZE, desc.neg, "neg.l d0", Size.Word),
    "ext": makeIns("ext", [ONLY_Da], ONLY_LONG_OR_WORD, desc.ext, "ext.w d0", Size.Word),
    "lea": makeIns("lea", [ONLY_In_OR_Id_OR_Ea, ONLY_Ad], NO_SIZE, desc.lea, "lea (a0), a1"),
    "pea": makeIns("pea", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.pea, "pea (a0)"),
    "tst": makeIns("tst", [NO_Im], ANY_SIZE, desc.tst, "tst.b (a0)", Size.Word),
    "cmp": makeIns("cmp", [ANY, NO_Im], ANY_SIZE, desc.cmp, "cmp.l -(sp), (a0)", Size.Word),
    "bcc": makeIns("bcc", [ONLY_Ea], NO_SIZE, desc.bcc, "b<cc> label ; where cc is one of the condition codes"),
    "scc": makeIns("scc", [NO_Ad_AND_NO_Im], NO_SIZE, desc.scc, "s<cc> d0 ; where cc is one of the condition codes"),
    "dbcc": makeIns("dbcc", [ONLY_Da, ONLY_Ea], NO_SIZE, desc.dbcc, "db<cc> d0, label ; where cc is one of the condition codes"),
    "not": makeIns("not", [NO_Ad_AND_NO_Im], ANY_SIZE, desc.not, "not.b d0", Size.Word),
    "or": makeIns("or", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.or, "or.l #$FF, d1", Size.Word),
    "and": makeIns("and", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.and, "and.l #%10110, d1", Size.Word),
    "eor": makeIns("eor", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.eor, "eor.l d0, d1", Size.Word),
    "jmp": makeIns("jmp", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.jmp, "jmp (a0)"),
    "jsr": makeIns("jsr", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.jsr, "jsr (sp)"),
    "bra": makeIns("bra", [ONLY_Ea], NO_SIZE, desc.bra, "bra $2000"),
    "dbra": makeIns("dbra", [ONLY_Da, ONLY_Ea], NO_SIZE, desc.dbra, "dbra d0, label"),
    "link": makeIns("link", [ONLY_Ad, ONLY_Im], NO_SIZE, desc.link, "link a0, #-16"),
    "unlk": makeIns("unlk", [ONLY_Ad], NO_SIZE, desc.unlk, "unlk a0"),
    "rts": makeIns("rts", [], NO_SIZE, desc.rts, "rts"),
    "bsr": makeIns("bsr", [ONLY_Ea], NO_SIZE, desc.bsr, "bsr label"),
    "trap": makeIns("trap", [ONLY_Im], NO_SIZE, desc.trap, "trap #15"),
    "asd": makeIns("asd", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.asd, "as<d> d0, d3 ; where d is either (l)eft or (r)ight"),
    "lsd": makeIns("lsd", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.lsd, "ls<d> #3, d7 ; where d is either (l)eft or (r)ight"),
    "rod": makeIns("rod", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.rod, "ro<d> d2, d5 ; where d is either (l)eft or (r)ight"),
    "btst": makeIns("btst", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.btst, "btst #4, d0"),
    "bchg": makeIns("bchg", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bchg, "bchg #%101, d3"),
    "bclr": makeIns("bclr", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bclr, "bclr d2, d7"),
    "bset": makeIns("bset", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bset, "bset #1, d1"),
}



export function getInstructionDocumentation(instructionName: InstructionName): InstructionDocumentation | undefined {
    if (!instructionName) return undefined
    if (instructionName.startsWith("b")) {
        const sub = instructionName.substring(1)
        if (branchConditionsMap.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['bcc'])
            if (!ins) return ins
            ins.name = "b" + sub
            ins.description = ins.description.replace("{condition code}", `"${branchConditionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    if (instructionName.startsWith("s")) {
        const sub = instructionName.substring(1)
        if (setConditionsDescriptions.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['scc'])
            if (!ins) return ins
            ins.name = "s" + sub
            ins.description = ins.description.replace("{condition code}", `"${branchConditionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    if (instructionName.startsWith("as")) {
        const sub = instructionName.substring(2)
        if (directionsMap.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['asd'])
            if (!ins) return ins
            ins.name = "as" + sub
            ins.description = ins.description.replace("{direction}", `"${directionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    if (instructionName.startsWith("ls")) {
        const sub = instructionName.substring(2)
        if (directionsMap.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['lsd'])
            if (!ins) return ins
            ins.name = "ls" + sub
            ins.description = ins.description.replace("{direction}", `"${directionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    if (instructionName.startsWith("ro")) {
        const sub = instructionName.substring(2)
        if (directionsMap.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['rod'])
            if (!ins) return ins
            ins.name = "ro" + sub
            ins.description = ins.description.replace("{direction}", `"${directionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    if (instructionName.startsWith("db")){
        const sub = instructionName.substring(2)
        if (branchConditionsMap.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['dbcc'])
            if (!ins) return ins
            ins.name = "db" + sub
            ins.description = ins.description.replace("{condition code}", `"${branchConditionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    return M68kDocumentation[instructionName];
}


export const instructionsDocumentationList = Object.values(M68kDocumentation)


function makeIns(name: string, args: AddressingMode[][], sizes: Size[], description?: string, example?: string, defaultSize?: Size): InstructionDocumentation {
    return { name, args, sizes, description, example, defaultSize };
}

type DirectiveDocumentation = {
    name: string;
    description?: string;
    example?: string;
    sizes: Size[];
}
function makeDirective(name: string, sizes:Size[], description?: string, example?: string): DirectiveDocumentation {
    return { name, description, example, sizes };
}