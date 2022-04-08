"use strict";

// TODO: Use function class definition fallback since classes support is ECMAScript 6

/* Memory is implemented using a hashmap of addresses to 8-bit unsigned values */
export class MIPSMemory {

    constructor() {
        this.memory = {};
    }

    getMem(address) {
        address = address >>> 0;
        if (this.memory[address] === undefined) {
            return 0x00;
        }
        return this.memory[address] >>> 0;
    }

    setMem(address, value) {
        address = address >>> 0;
        value = value & 0xff; // truncates to 8-bit if needed
        this.memory[address] = value;
    }

    isValidAddress(address) {
        address = address >>> 0;
        return 0 <= address && address <= 0x7fffffff;
    }

}

export class MIPSProgram {

    constructor(instructions) {
        this.errors = [];
        this.pc = 0x0;
        this.line = 0;
        this.registers = new Int32Array(32);
        this.memory = new MIPSMemory();
        this.insns = instructions || ""; // if instructions is undefined, program is empty
        this.insns = this.insns.split('\n').map(function(insn) {
            return insn.trim();
        });
        this.labels = {};
        this.generateLabels();
        this.linkLabels();
        this.delaySlotInsnsPC = [];
        this.TOKEN_TYPE_REG = 0;
        this.TOKEN_TYPE_IMM = 1;
    }

    /** Goes through all the lines and finds the labels and associates pc addresses to them */
    generateLabels() {
        var filteredInstructions = [];
        var filteredIndex = 0;
        for (var i = 0; i < this.insns.length; ++i) {
            var lineNo = i + 1;
            var insn = this.insns[i];
            if (insn.indexOf('#') != -1) { // remove everything after a comment
                insn = insn.substring(0, insn.indexOf('#')).trim();
            }
            if (insn.charAt(insn.length-1) == ':') { // encounter a label which ends with a colon
                var label = insn.substring(0, insn.length-1);
                if (this.labels[label] !== undefined) {
                    this.pushError("Found multiple instances of label: " + label + " [line " + lineNo + "]");
                }
                if (label.charAt(0) >= '0' && label.charAt(0) <= '9') {
                    this.pushError("Label name cannot start with a number: " + label + " [line " + lineNo + "]");
                    continue;
                }
                this.labels[label] = filteredIndex; // make label point to the line after it (also zero-index -> one-index)
            }
            else if (insn != '') { // ignore empty/comment lines
                filteredInstructions.push([insn, lineNo, insn]); // push instruction and line number for debugging purposes
                filteredIndex++;
            }
        }
        this.insns = filteredInstructions;
    }

    /** Converts labels to memory locations */
    linkLabels() {
        for (var i = 0; i < this.insns.length; ++i) {
            var insn = this.insns[i][0];
            var lineNo = this.insns[i][1];
            if (insn.indexOf(' ') != -1) { // ignore changing labels of bad instructions
                var op = insn.substring(0, insn.indexOf(' ')).trim().toLowerCase();
                var tokens = insn.substring(insn.indexOf(' '), insn.length).split(',');
                var label = tokens[tokens.length-1].trim(); // label comes at the very end
                if (op == "j" || op == "jal") {
                    if (this.labels[label] !== undefined) {
                        tokens[tokens.length-1] = (this.labels[label]) << 2; // absolute jump to the label location
                    }
                    else {
                        if (isNaN(parseInt(label))) {
                            this.pushError("Could not find label: " + label + " [line " + lineNo + "]");
                            tokens[tokens.length-1] = 0x2ffffff << 2; // most likely a label issue, so we want it to jump very far to the end
                        }
                    }
                }
                else if (op == "beq" || op == "bne" || op == "bltz" || op == "blez" || op == "bgtz" || op == "bgez") {
                    if (this.labels[label] !== undefined) {
                        tokens[tokens.length-1] = (this.labels[label] - (i + 1)) << 2; // branch offset relative to delay slot instruction
                    }
                    else {
                        if (isNaN(parseInt(label))) {
                            this.pushError("Could not find label: " + label + " [line " + lineNo + "]");
                            tokens[tokens.length-1] = 0x7fff << 2; // most likely a label issue, so we want it to branch very far to the end
                        }
                    }
                }
                this.insns[i][0] = op + " " + tokens.join(', '); // instruction with labels replaced
            }
        }
    }

    getRegisters() {
        return this.registers;
    }

    getMemory() {
        return this.memory;
    }

    getErrors() {
        return this.errors;
    }

    pushError(errmsg) {
        console.log(errmsg);
        this.errors.push(errmsg);
    }

    /** Ensures that immediate is 16 bits */
    normalizeImm(imm) {
        if (imm > 0xffff) {
            this.pushError("Immediate is more than 16 bits [line " + this.line + "]: " + imm);
        }
        return imm & 0xffff;
    }

    /** Sign extends a 16-bit immediate if needed */
    immPad(imm) {
        if ((imm & 0x8000) == 0x8000) { // check that 15th bit is 1
            imm |= 0xffff0000; // sign extend 16 bits to 32 bits
        }
        return imm;
    }

    /** Verifies that an offset is valid (multiple of 4) */
    verifyOffset(offset) {
        if (offset % 4 !== 0) {
            this.pushError("Misaligned branch offset (must be a multiple of 4) [line " + this.line + "]: " + offset);
            return false;
        }
        return true;
    }

    /** Sign extends an 18-bit offset if needed */
    offsetPad(offset) {
        if ((offset & 0x20000) == 0x20000) { // check that 17th bit is 1
            offset |= 0xfffc0000; // sign extend 18 bits to 32 bits
        }
        return offset;
    }

    /** Verifies that a pc is valid */
    verifyPC(pc) {
        return (0 <= pc / 4 && pc % 4 == 0);
    }

    /** Verifies that there is another delay slot in progress */
    verifyDelaySlot() {
        if (this.delaySlot) {
            this.pushError("Cannot have a jump/branch instruction in delay slot! [line " + this.line + "]. Ignoring jump/branch in delay slot.");
            return true;
        }
        return false;
    }

    /** Verifies a memory range from loc1 -> loc2 */
    verifyMemory(loc1, loc2) {
        if (!this.memory.isValidAddress(loc1) || !this.memory.isValidAddress(loc2)) {
            this.pushError("Invalid memory location [line " + this.line + "]: 0x" + (loc1 >>> 0).toString(16) +
                    ((loc2 === undefined) ? "" : " to 0x" + (loc2 >>> 0).toString(16)));
        }
    }

    addiu(rt, rs, imm) {
        imm = this.normalizeImm(imm);
        imm = this.immPad(imm);
        this.registers[rt] = this.registers[rs] + imm;
    }

    andi(rt, rs, imm) {
        imm = this.normalizeImm(imm);
        this.registers[rt] = this.registers[rs] & imm;
    }

    ori(rt, rs, imm) {
        imm = this.normalizeImm(imm);
        this.registers[rt] = this.registers[rs] | imm;
    }

    xori(rt, rs, imm) {
        imm = this.normalizeImm(imm);
        this.registers[rt] = this.registers[rs] ^ imm;
    }

    slti(rt, rs, imm) {
        imm = this.normalizeImm(imm);
        imm = this.immPad(imm);
        this.registers[rt] = (this.registers[rs] < imm) ? 1 : 0;
    }

    sltiu(rt, rs, imm) {
        imm = this.normalizeImm(imm);
        imm = this.immPad(imm);
        this.registers[rt] = ( (this.registers[rs] >>> 0) < (imm >>> 0) ) ? 1 : 0;
    }

    addu(rd, rs, rt) {
        this.registers[rd] = this.registers[rs] + this.registers[rt];
    }

    subu(rd, rs, rt) {
        this.registers[rd] = this.registers[rs] - this.registers[rt];
    }

    and(rd, rs, rt) {
        this.registers[rd] = this.registers[rs] & this.registers[rt];
    }

    or(rd, rs, rt) {
        this.registers[rd] = this.registers[rs] | this.registers[rt];
    }

    xor(rd, rs, rt) {
        this.registers[rd] = this.registers[rs] ^ this.registers[rt];
    }

    nor(rd, rs, rt) {
        this.registers[rd] = ~(this.registers[rs] | this.registers[rt]);
    }

    slt(rd, rs, rt) {
        this.registers[rd] = (this.registers[rs] < this.registers[rt]) ? 1 : 0;
    }

    sltu(rd, rs, rt) {
        this.registers[rd] = ( (this.registers[rs] >>> 0) < (this.registers[rt] >>> 0) ) ? 1 : 0;
    }

    movn(rd, rs, rt) {
        if (this.registers[rt] != 0) {
            this.registers[rd] = this.registers[rs];
        }
    }

    movz(rd, rs, rt) {
        if (this.registers[rt] == 0) {
            this.registers[rd] = this.registers[rs];
        }
    }

    sll(rd, rt, sa) {
        this.registers[rd] = this.registers[rt] << sa;
    }

    srl(rd, rt, sa) {
        this.registers[rd] = this.registers[rt] >>> sa;
    }

    sra(rd, rt, sa) {
        this.registers[rd] = this.registers[rt] >> sa;
    }

    sllv(rd, rt, rs) {
        this.registers[rd] = this.registers[rt] << (this.registers[rs] & 0x0000001f);
    }

    srlv(rd, rt, rs) {
        this.registers[rd] = this.registers[rt] >>> (this.registers[rs] & 0x0000001f);
    }

    srav(rd, rt, rs) {
        this.registers[rd] = this.registers[rt] >> (this.registers[rs] & 0x0000001f);
    }

    lui(rt, imm) {
        imm = this.normalizeImm(imm);
        this.registers[rt] = imm << 16;
    }

    j(target) {
        if (!this.verifyDelaySlot()) { // only execute jump if this is not a delay slot instruction
            this.delaySlot = true;
            var newpc = (this.pc & 0xf0000000) + target; // pc already points to instruction in delay slot
            if (!this.verifyPC(newpc)) {
                this.pushError("Misaligned jump target (must be a multiple of 4 and in program range) [line " + this.line + "]: " + target);
            }
            else {
                this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                this.step();
                this.pc = newpc;
            }
            this.delaySlot = false;
        }
    }

    jal(target) {
        if (!this.verifyDelaySlot()) { // only change $ra if this is not a delay slot instruction
            this.registers[31] = this.pc + 4; // pc was already incremented by 4, so $ra is pc + 8 (second instruction after jump)
            this.j(target);
        }
    }

    jr(rs) {
        if (!this.verifyDelaySlot()) { // only execute jump if this is not a delay slot instruction
            this.delaySlot = true;
            var newpc = this.registers[rs] >>> 0;
            if (!this.verifyPC(newpc)) {
                this.pushError("Bad PC value to jump to for register " + rs + " (must be a multiple of 4 and in program range) [line " + this.line + "]: " + newpc);
            }
            else {
                this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                this.step();
                this.pc = newpc;
            }
            this.delaySlot = false;
        }
    }

    jalr(rd, rs) {
        if (!this.verifyDelaySlot()) { // only change $ra if this is not a delay slot instruction
            if (rd === rs) {
                this.pushError("jalr instruction cannot have the same values for rs and rd [line " + this.line + "]");
            }
            this.registers[rd] = this.pc + 4; // pc was already incremented by 4, so $ra is pc + 8 (second instruction after jump)
            this.jr(rs);
        }
    }

    beq(rs, rt, offset) {
        if (this.verifyOffset(offset)) {
            offset = this.offsetPad(offset);
            if (!this.verifyDelaySlot()) {
                this.delaySlot = true;
                var newpc = this.pc + offset; // pc branches relative to instruction in delay slot
                if (!this.verifyPC(newpc)) {
                    this.pushError("Bad branch offset (must be in program range) [line " + this.line + "]: " + offset);
                }
                else {
                    var branch = false;
                    if (this.registers[rs] == this.registers[rt]) {
                        branch = true;
                    }
                    this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                    this.step();
                    if (branch) {
                        this.pc = newpc;
                    }
                }
                this.delaySlot = false;
            }
        }
    }

    bne(rs, rt, offset) {
        if (this.verifyOffset(offset)) {
            offset = this.offsetPad(offset);
            if (!this.verifyDelaySlot()) {
                this.delaySlot = true;
                var newpc = this.pc + offset; // pc branches relative to instruction in delay slot
                if (!this.verifyPC(newpc)) {
                    this.pushError("Bad branch offset (must be in program range) [line " + this.line + "]: " + offset);
                }
                else {
                    var branch = false;
                    if (this.registers[rs] != this.registers[rt]) {
                        branch = true;
                    }
                    this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                    this.step();
                    if (branch) {
                        this.pc = newpc;
                    }
                }
                this.delaySlot = false;
            }
        }
    }

    bltz(rs, offset) {
        if (this.verifyOffset(offset)) {
            offset = this.offsetPad(offset);
            if (!this.verifyDelaySlot()) {
                this.delaySlot = true;
                var newpc = this.pc + offset; // pc branches relative to instruction in delay slot
                if (!this.verifyPC(newpc)) {
                    this.pushError("Bad branch offset (must be in program range) [line " + this.line + "]: " + offset);
                }
                else {
                    var branch = false;
                    if (this.registers[rs] < 0) {
                        branch = true;
                    }
                    this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                    this.step();
                    if (branch) {
                        this.pc = newpc;
                    }
                }
                this.delaySlot = false;
            }
        }
    }

    blez(rs, offset) {
        if (this.verifyOffset(offset)) {
            offset = this.offsetPad(offset);
            if (!this.verifyDelaySlot()) {
                this.delaySlot = true;
                var newpc = this.pc + offset; // pc branches relative to instruction in delay slot
                if (!this.verifyPC(newpc)) {
                    this.pushError("Bad branch offset (must be in program range) [line " + this.line + "]: " + offset);
                }
                else {
                    var branch = false;
                    if (this.registers[rs] <= 0) {
                        branch = true;
                    }
                    this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                    this.step();
                    if (branch) {
                        this.pc = newpc;
                    }
                }
                this.delaySlot = false;
            }
        }
    }

    bgtz(rs, offset) {
        if (this.verifyOffset(offset)) {
            offset = this.offsetPad(offset);
            if (!this.verifyDelaySlot()) {
                this.delaySlot = true;
                var newpc = this.pc + offset; // pc branches relative to instruction in delay slot
                if (!this.verifyPC(newpc)) {
                    this.pushError("Bad branch offset (must be in program range) [line " + this.line + "]: " + offset);
                }
                else {
                    var branch = false;
                    if (this.registers[rs] > 0) {
                        branch = true;
                    }
                    this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                    this.step();
                    if (branch) {
                        this.pc = newpc;
                    }
                }
                this.delaySlot = false;
            }
        }
    }

    bgez(rs, offset) {
        if (this.verifyOffset(offset)) {
            offset = this.offsetPad(offset);
            if (!this.verifyDelaySlot()) {
                this.delaySlot = true;
                var newpc = this.pc + offset; // pc branches relative to instruction in delay slot
                if (!this.verifyPC(newpc)) {
                    this.pushError("Bad branch offset (must be in program range) [line " + this.line + "]: " + offset);
                }
                else {
                    var branch = false;
                    if (this.registers[rs] >= 0) {
                        branch = true;
                    }
                    this.delaySlotInsnsPC.push(this.pc); // note that a delay slot was executed for the client view
                    this.step();
                    if (branch) {
                        this.pc = newpc;
                    }
                }
                this.delaySlot = false;
            }
        }
    }

    lw(rt, offset, base) {
        offset = this.normalizeImm(offset);
        offset = this.immPad(offset);
        var loc = offset + this.registers[base];
        if (loc % 4 != 0 ) {
            this.pushError("Address Error: loading from non-aligned word [line " + this.line + "]: " + loc);
        }
        this.verifyMemory(loc, loc+3);
        var lsb = this.memory.getMem(loc);
        var byte2 = this.memory.getMem(loc+1) << 8;
        var byte3 = this.memory.getMem(loc+2) << 16;
        var msb = this.memory.getMem(loc+3) << 24;
        this.registers[rt] = msb + byte3 + byte2 + lsb;
    }

    lb(rt, offset, base) {
        offset = this.normalizeImm(offset);
        offset = this.immPad(offset);
        var loc = offset + this.registers[base];
        this.verifyMemory(loc);
        var byteValue = this.memory.getMem(loc);
        if ((byteValue & 0x80) == 0x80) { // sign extend 8-bit -> 32-bit
            byteValue |= 0xffffff00;
        }
        this.registers[rt] = byteValue;
    }

    lbu(rt, offset, base) {
        offset = this.normalizeImm(offset);
        offset = this.immPad(offset);
        var loc = offset + this.registers[base];
        this.verifyMemory(loc);
        this.registers[rt] = this.memory.getMem(loc);
    }

    sw(rt, offset, base) {
        offset = this.normalizeImm(offset);
        offset = this.immPad(offset);
        var registerValue = this.registers[rt];
        var loc = offset + this.registers[base];
        if (loc % 4 != 0 ) {
            this.pushError("Address Error: storing to non-aligned word [line " + this.line + "]: " + loc);
        }
        this.verifyMemory(loc, loc+3);
        this.memory.setMem(loc, registerValue & 0x000000ff);
        this.memory.setMem(loc+1, (registerValue >>> 8) & 0x000000ff);
        this.memory.setMem(loc+2, (registerValue >>> 16) & 0x000000ff);
        this.memory.setMem(loc+3, (registerValue >>> 24) & 0x000000ff);
    }

    sb(rt, offset, base) {
        offset = this.normalizeImm(offset);
        offset = this.immPad(offset);
        var registerValue = this.registers[rt];
        var loc = offset + this.registers[base];
        this.verifyMemory(loc);
        this.memory.setMem(loc, registerValue & 0x000000ff);
    }

    /* Checks that the instruction has the correct number and type of arguments
     * NOTE: Strips type information from the type-annotated tokens array */
    verifyTokenTypes(tokens, types, format) {
        if (tokens.length < types.length) {
            this.pushError("Too few arguments [line " + this.line + "] for '" + format + "'");
        }
        if (tokens.length > types.length) {
            this.pushError("Extra arguments [line " + this.line + "] for '" + format + "': " + tokens.slice(types.length, tokens.length).join(', '));
        }
        for (var i = 0; i < tokens.length; ++i) {
            if (tokens[i].type !== types[i]) {
                this.pushError("Incorrect argument type [line " + this.line + "] for '" + format + "'");
            }
            tokens[i] = tokens[i].value;
        }
    }

    parseRegister(tok) {
        switch(tok) {
            case "$zero":
            case "$0":
                return 0;
            case "$at":
            case "$1":
                return 1;
            case "$v0":
            case "$2":
                return 2;
            case "$v1":
            case "$3":
                return 3;
            case "$a0":
            case "$4":
                return 4;
            case "$a1":
            case "$5":
                return 5;
            case "$a2":
            case "$6":
                return 6;
            case "$a3":
            case "$7":
                return 7;
            case "$t0":
            case "$8":
                return 8;
            case "$t1":
            case "$9":
                return 9;
            case "$t2":
            case "$10":
                return 10;
            case "$t3":
            case "$11":
                return 11;
            case "$t4":
            case "$12":
                return 12;
            case "$t5":
            case "$13":
                return 13;
            case "$t6":
            case "$14":
                return 14;
            case "$t7":
            case "$15":
                return 15;
            case "$s0":
            case "$16":
                return 16;
            case "$s1":
            case "$17":
                return 17;
            case "$s2":
            case "$18":
                return 18;
            case "$s3":
            case "$19":
                return 19;
            case "$s4":
            case "$20":
                return 20;
            case "$s5":
            case "$21":
                return 21;
            case "$s6":
            case "$22":
                return 22;
            case "$s7":
            case "$23":
                return 23;
            case "$t8":
            case "$24":
                return 24;
            case "$t9":
            case "$25":
                return 25;
            case "$k0":
            case "$26":
                return 26;
            case "$k1":
            case "$27":
                return 27;
            case "$gp":
            case "$28":
                return 28;
            case "$sp":
            case "$29":
                return 29;
            case "$fp":
            case "$s8":
            case "$30":
                return 30;
            case "$ra":
            case "$31":
                return 31;
        }
        this.pushError("Invalid register [line " + this.line + "]: " + tok);
        return undefined; // invalid register
    }

    parseToken(tok) {
        var value;
        var type;
        if (tok.charAt(0) == '$') {
            value = this.parseRegister(tok);
            type = this.TOKEN_TYPE_REG;
        }
        else {
            value = parseInt(tok);
            type = this.TOKEN_TYPE_IMM;
            if (value === undefined) {
                this.pushError("Unknown value [line " + this.line + "]: " + tok);
            }
        }
        return {value: value, type: type};
    }

    step() {
        if (!this.verifyPC(this.pc) || this.pc / 4 >= this.insns.length ) {
            console.log("PC is invalid!! PC = " + this.pc);
            return;
        }
        var insn = this.insns[this.pc / 4][0];
        this.line = this.insns[this.pc / 4][1];
        this.pc += 4;
        if (insn.indexOf(' ') != -1) { // if not bad format, since all instructions have a space after the op
            var op = insn.substring(0, insn.indexOf(' '));
            var stringTokens = insn.substring(insn.indexOf(' '), insn.length).split(",");
            var tokens = [];
            var tokensIndex = 0;
            for (var i = 0; i < stringTokens.length; ++i) {
                var trimmed = stringTokens[i].trim();
                if (trimmed.indexOf('#') != -1) { // remove end of line comments
                    trimmed = trimmed.substring(0, trimmed.indexOf('#')).trim();
                    tokens[tokensIndex] = this.parseToken(trimmed);
                    break;
                }
                else if (trimmed.indexOf('(') != -1 && trimmed.indexOf(')') != -1) { // location of memory for load/store operations: offset($register)
                    tokens[tokensIndex] = this.parseToken(trimmed.substring(0, trimmed.indexOf('('))); // parse the offset
                    tokensIndex++;
                    tokens[tokensIndex] = this.parseToken(trimmed.substring(trimmed.indexOf('(')+1, trimmed.indexOf(')'))); // parse the register
                }
                else { // parses a single register or immediate value
                    tokens[tokensIndex] = this.parseToken(trimmed);
                }
                tokensIndex++;
            }
            switch(op.trim().toLowerCase()) {
                case "addiu":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "addiu $rt, $rs, immediate");
                    this.addiu(tokens[0], tokens[1], tokens[2]);
                    break;
                case "andi":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "andi $rt, $rs, immediate");
                    this.andi(tokens[0], tokens[1], tokens[2]);
                    break;
                case "ori":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "ori $rt, $rs, immediate");
                    this.ori(tokens[0], tokens[1], tokens[2]);
                    break;
                case "xori":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "xori $rt, $rs, immediate");
                    this.xori(tokens[0], tokens[1], tokens[2]);
                    break;
                case "slti":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "slti $rt, $rs, immediate");
                    this.slti(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sltiu":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "sltiu $rt, $rs, immediate");
                    this.sltiu(tokens[0], tokens[1], tokens[2]);
                    break;
                case "addu":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "addu $rd, $rs, $rt");
                    this.addu(tokens[0], tokens[1], tokens[2]);
                    break;
                case "subu":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "subu $rd, $rs, $rt");
                    this.subu(tokens[0], tokens[1], tokens[2]);
                    break;
                case "and":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "and $rd, $rs, $rt");
                    this.and(tokens[0], tokens[1], tokens[2]);
                    break;
                case "or":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "or $rd, $rs, $rt");
                    this.or(tokens[0], tokens[1], tokens[2]);
                    break;
                case "xor":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "xor $rd, $rs, $rt");
                    this.xor(tokens[0], tokens[1], tokens[2]);
                    break;
                case "nor":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "nor $rd, $rs, $rt");
                    this.nor(tokens[0], tokens[1], tokens[2]);
                    break;
                case "slt":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "slt $rd, $rs, $rt");
                    this.slt(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sltu":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "sltu $rd, $rs, $rt");
                    this.sltu(tokens[0], tokens[1], tokens[2]);
                    break;
                case "movn":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "movn $rd, $rs, $rt");
                    this.movn(tokens[0], tokens[1], tokens[2]);
                    break;
                case "movz":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "movz $rd, $rs, $rt");
                    this.movz(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sll":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "sll $rd, $rt, sa");
                    this.sll(tokens[0], tokens[1], tokens[2]);
                    break;
                case "srl":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "srl $rd, $rt, sa");
                    this.srl(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sra":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "sra $rd, $rt, sa");
                    this.sra(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sllv":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "sllv $rd, $rt, $rs");
                    this.sllv(tokens[0], tokens[1], tokens[2]);
                    break;
                case "srlv":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "srlv $rd, $rt, $rs");
                    this.srlv(tokens[0], tokens[1], tokens[2]);
                    break;
                case "srav":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "srav $rd, $rt, $rs");
                    this.srav(tokens[0], tokens[1], tokens[2]);
                    break;
                case "lui":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "lui $rt, immediate");
                    this.lui(tokens[0], tokens[1]);
                    break;
                case "j":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_IMM], "j target");
                    this.j(tokens[0]);
                    break;
                case "jr":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG], "jr $rs");
                    this.jr(tokens[0]);
                    break;
                case "jal":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_IMM], "jal target");
                    this.jal(tokens[0]);
                    break;
                case "jalr":
                    if (tokens.length == 1) {
                        tokens.unshift({value: 31, type: this.TOKEN_TYPE_REG}); // use $31 as $rd
                    }
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG], "jalr $rd, $rs");
                    this.jalr(tokens[0], tokens[1]);
                    break;
                case "beq":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "beq $rs, $rt, offset");
                    this.beq(tokens[0], tokens[1], tokens[2]);
                    break;
                case "bne":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "bne $rs, $rt, offset");
                    this.bne(tokens[0], tokens[1], tokens[2]);
                    break;
                case "bltz":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "bltz $rs, offset");
                    this.bltz(tokens[0], tokens[1]);
                    break;
                case "blez":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "blez $rs, offset");
                    this.blez(tokens[0], tokens[1]);
                    break;
                case "bgtz":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "bgtz $rs, offset");
                    this.bgtz(tokens[0], tokens[1]);
                    break;
                case "bgez":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM], "bgez $rs, offset");
                    this.bgez(tokens[0], tokens[1]);
                    break;
                case "lw":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM, this.TOKEN_TYPE_REG], "lw $rt, offset(base $rs)");
                    this.lw(tokens[0], tokens[1], tokens[2]);
                    break;
                case "lb":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM, this.TOKEN_TYPE_REG], "lb $rt, offset(base $rs)");
                    this.lb(tokens[0], tokens[1], tokens[2]);
                    break;
                case "lbu":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM, this.TOKEN_TYPE_REG], "lbu $rt, offset(base $rs)");
                    this.lbu(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sw":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM, this.TOKEN_TYPE_REG], "sw $rt, offset(base $rs)");
                    this.sw(tokens[0], tokens[1], tokens[2]);
                    break;
                case "sb":
                    this.verifyTokenTypes(tokens, [this.TOKEN_TYPE_REG, this.TOKEN_TYPE_IMM, this.TOKEN_TYPE_REG], "sb $rt, offset(base $rs)");
                    this.sb(tokens[0], tokens[1], tokens[2]);
                    break;
                default:
                    this.pushError("Unsupported Op [line " + this.line +"]: " + op);
            }
            this.registers[0] = 0; // MIPS register 0 is hard-wired to 0
        }
        else {
            if (insn.toLowerCase() != "nop") { // nops are valid instructions!
                this.pushError("Invalid instruction [line " + this.line + "]: " + insn);
            }
        }
    }

    /** Not used in the main browser runner */
    run() {
        while ((this.pc / 4) < this.insns.length) {
            this.step();
        }
    }
}