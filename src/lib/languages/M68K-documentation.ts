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
}

type InstructionName = string;

const conditions = ["t", "f", "hi", "ls", "cc", "cs", "ne", "eq", "vc", "vs", "pl", "mi", "ge", "lt", "gt", "le"];
const conditionsMap = new Map<string, string>(conditions.map(c => [c, c]));
const conditionsDescriptions = new Map<string, string>([
    ["t", "True"],
    ["f", "False"],
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
const directions = ["l", "r"]
const directionsMap = new Map<string, string>(directions.map(d => [d, d]));
const directionsDescriptions = new Map<string, string>([
    ["l", "Left"],
    ["r", "Right"],
])
const desc = {
    "move": "Moves the value from the first operand to second operand.",
    "add": "Adds the value of the first operand to second operand.",
    "adda": "Adds the value of the first operand to second operand. It does not change the SR",
    "sub": "Subtracts the value of the first operand from second operand and stores in the second.",
    "suba": "Subtracts the value of the first operand from second operand and stores in the second. It does not change the SR",
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
    "bra": "Branches to the specified address unconditionally",
    "jmp": "Jumps to the specified address unconditionally",
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
    "jsr": "Jumps to the specified address and stores the return address in the stack",
    "trap": "Executes a trap, the value of the operand is used as the trap number, only #15 is supported",
}


export function getAddressingModeNames(addressingModes: AddressingMode[]): string {
    const args = addressingModes.map(am => addressingModeToString(am))
    //removes duplicates
    return args.filter((value, index, self) => self.indexOf(value) === index).join("/");
}

export const M68kDocumentation: Record<InstructionName, InstructionDocumentation> = {
    "move": makeIns("move", [ANY, NO_Im], ANY_SIZE, desc.move),
    "add": makeIns("add", [ANY, NO_Im], ANY_SIZE, desc.add),
    "sub": makeIns("sub", [ANY, NO_Im], ANY_SIZE, desc.sub),
    "adda": makeIns("adda", [ANY, ONLY_Ad], ANY_SIZE, desc.adda),
    "suba": makeIns("suba", [ANY, ONLY_Ad], ANY_SIZE, desc.suba),
    "divs": makeIns("divs", [NO_Ad, ONLY_Da], NO_SIZE, desc.divs),
    "divu": makeIns("divu", [NO_Ad, ONLY_Da], NO_SIZE, desc.divu),
    "muls": makeIns("muls", [NO_Ad, ONLY_Da], NO_SIZE, desc.muls),
    "mulu": makeIns("mulu", [NO_Ad, ONLY_Da], NO_SIZE, desc.mulu),
    "swap": makeIns("swap", [ONLY_Da], NO_SIZE, desc.swap),
    "clr": makeIns("clr", [ONLY_Da_OR_In], ANY_SIZE, desc.clr),
    "exg": makeIns("exg", [ONLY_REG, ONLY_REG], NO_SIZE, desc.exg),
    "neg": makeIns("neg", [ONLY_Da_OR_In_OR_Ea], ANY_SIZE, desc.neg),
    "ext": makeIns("ext", [ONLY_Da], ONLY_LONG_OR_WORD, desc.ext),
    "tst": makeIns("tst", [NO_Im], ANY_SIZE, desc.tst),
    "cmp": makeIns("cmp", [ANY, NO_Im], ANY_SIZE, desc.cmp),
    "bcc": makeIns("bcc", [ONLY_Ea], NO_SIZE, desc.bcc),
    "scc": makeIns("scc", [NO_Ad_AND_NO_Im], NO_SIZE, desc.scc),
    "not": makeIns("not", [NO_Ad_AND_NO_Im], ANY_SIZE, desc.not),
    "or": makeIns("or", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.or),
    "and": makeIns("and", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.and),
    "eor": makeIns("eor", [NO_Ad, NO_Ad_AND_NO_Im], ANY_SIZE, desc.eor),
    "jmp": makeIns("jmp", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.jmp),
    "jsr": makeIns("jsr", [ONLY_In_OR_Id_OR_Ea], NO_SIZE, desc.jsr),
    "bra": makeIns("bra", [ONLY_Ea], NO_SIZE, desc.bra),
    "trap": makeIns("trap", [ONLY_Im], NO_SIZE, desc.trap),
    "asd": makeIns("asd", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.asd),
    "lsd": makeIns("lsd", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.lsd),
    "rod": makeIns("rod", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.rod),
    "btst": makeIns("btst", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.btst),
    "bchg": makeIns("bchg", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bchg),
    "bclr": makeIns("bclr", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bclr),
    "bset": makeIns("bset", [NO_Ad, NO_Ad_AND_NO_Im], NO_SIZE, desc.bset),
    "rts": makeIns("rts", [], NO_SIZE, desc.rts),
}



export function getInstructionDocumentation(instructionName: InstructionName): InstructionDocumentation | undefined {
    if (!instructionName) return undefined
    if (instructionName.startsWith("b")) {
        const sub = instructionName.substring(1)
        if (conditionsMap.has(sub)) {
            const ins = M68kDocumentation['bcc']
            if (!ins) return ins
            ins.name = "b" + sub
            ins.description = ins.description.replace("{condition code}", `"${conditionsDescriptions.get(sub)}"`)
            return ins
        }
    }
    if (instructionName.startsWith("s")) {
        const sub = instructionName.substring(1)
        if (conditionsMap.has(sub)) {
            const ins = cloneDeep(M68kDocumentation['scc'])
            if (!ins) return ins
            ins.name = "s" + sub
            ins.description = ins.description.replace("{condition code}", `"${conditionsDescriptions.get(sub)}"`)
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
    return M68kDocumentation[instructionName];
}


export const instructionsDocumentationList = Object.keys(M68kDocumentation).map(k => M68kDocumentation[k as InstructionName])


function makeIns(name: string, args: AddressingMode[][], sizes: Size[], description?: string, example?: string): InstructionDocumentation {
    return { name, args, sizes, description, example };
}

