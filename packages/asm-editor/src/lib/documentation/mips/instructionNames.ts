/**
 * Long names and summaries of the MIPS instructions ([the design record](../../../../../../docs/design/instruction-layout.md),
 * decision 6), written for every mnemonic: MARS titles its forms unevenly ("ADDition", "Branch if
 * EQual") and a pseudo-only mnemonic's first form is often a corner case (`la $t1,($t2)`). The
 * derivation in `mars/instructionDocument.ts`, the main form's "Title :" and the first sentence
 * after it, stands in for a mnemonic the table leaves out.
 */
export const mipsInstructionNames: Readonly<
    Record<string, { longName?: string; summary?: string }>
> = {
    abs: { longName: 'Absolute value', summary: 'Sets $t1 to the absolute value of $t2.' },
    'abs.d': {
        longName: 'Floating-point absolute value (double precision)',
        summary: 'Sets $f2 to the absolute value of $f4 (double-precision).'
    },
    'abs.s': {
        longName: 'Floating-point absolute value (single precision)',
        summary: 'Sets $f0 to the absolute value of $f1 (single-precision).'
    },
    add: {
        longName: 'Add with overflow trap',
        summary:
            'Adds $t2 and $t3, or $t2 and an immediate, into $t1 and traps if the signed result overflows.'
    },
    'add.d': {
        longName: 'Floating-point add (double precision)',
        summary: 'Sets $f2 = $f4 + $f6 using IEEE 754 double-precision (64-bit) arithmetic.'
    },
    'add.s': {
        longName: 'Floating-point add (single precision)',
        summary: 'Sets $f0 = $f1 + $f3 using IEEE 754 single-precision (32-bit) arithmetic.'
    },
    addi: {
        longName: 'Add immediate with overflow trap',
        summary:
            'Adds an immediate to $t2 and puts the sum in $t1, trapping if the signed result overflows.'
    },
    addiu: {
        longName: 'Add immediate unsigned (no overflow trap)',
        summary:
            'Adds a sign-extended immediate to $t2 and puts the sum in $t1, wrapping on overflow instead of trapping.'
    },
    addu: {
        longName: 'Add unsigned (no overflow trap)',
        summary:
            'Adds $t2 and $t3, or $t2 and an immediate, into $t1 and wraps on overflow instead of trapping.'
    },
    and: {
        longName: 'Bitwise AND',
        summary:
            'Sets $t1 to $t2 AND $t3, or an immediate, so each result bit is 1 only where both inputs are 1.'
    },
    andi: {
        longName: 'Bitwise AND immediate',
        summary:
            'Sets $t1 to $t2 AND an immediate, with the immediate zero-extended instead of sign-extended.'
    },
    b: { longName: 'Branch', summary: 'Branches unconditionally to label.' },
    bal: {
        longName: 'Branch and link',
        summary: 'Branches unconditionally to label and saves the return address in $ra.'
    },
    bc1f: {
        longName: 'Branch if FP condition false',
        summary:
            'Branches to label if the FP condition flag (flag 0 by default) is false, as set by a preceding compare instruction.'
    },
    bc1t: {
        longName: 'Branch if FP condition true',
        summary:
            'Branches to label if the FP condition flag (flag 0 by default) is true, as set by a preceding compare instruction.'
    },
    beq: {
        longName: 'Branch on equal',
        summary: 'Branches to label if $t1 equals $t2, or an immediate.'
    },
    beqz: { longName: 'Branch if equal to zero', summary: 'Branches to label if $t1 is zero.' },
    bge: {
        longName: 'Branch if greater or equal',
        summary:
            'Branches to label if $t1 is greater than or equal to $t2, or an immediate, as signed values.'
    },
    bgeu: {
        longName: 'Branch if greater or equal unsigned',
        summary:
            'Branches to label if $t1 is greater than or equal to $t2, or an immediate, as unsigned values.'
    },
    bgez: {
        longName: 'Branch on greater than or equal to zero',
        summary:
            'Branches to label if $t1 is greater than or equal to zero, as a signed comparison.'
    },
    bgezal: {
        longName: 'Branch on greater than or equal to zero and link',
        summary:
            'Branches to label if $t1 is greater than or equal to zero, saving the return address in $ra.'
    },
    bgt: {
        longName: 'Branch if greater than',
        summary: 'Branches to label if $t1 is greater than $t2, or an immediate, as signed values.'
    },
    bgtu: {
        longName: 'Branch if greater than unsigned',
        summary:
            'Branches to label if $t1 is greater than $t2, or an immediate, as unsigned values.'
    },
    bgtz: {
        longName: 'Branch on greater than zero',
        summary: 'Branches to label if $t1 is greater than zero, as a signed comparison.'
    },
    ble: {
        longName: 'Branch if less or equal',
        summary:
            'Branches to label if $t1 is less than or equal to $t2, or an immediate, as signed values.'
    },
    bleu: {
        longName: 'Branch if less or equal unsigned',
        summary:
            'Branches to label if $t1 is less than or equal to $t2, or an immediate, as unsigned values.'
    },
    blez: {
        longName: 'Branch on less than or equal to zero',
        summary: 'Branches to label if $t1 is less than or equal to zero, as a signed comparison.'
    },
    blt: {
        longName: 'Branch if less than',
        summary: 'Branches to label if $t1 is less than $t2, or an immediate, as signed values.'
    },
    bltu: {
        longName: 'Branch if less than unsigned',
        summary: 'Branches to label if $t1 is less than $t2, or an immediate, as unsigned values.'
    },
    bltz: {
        longName: 'Branch on less than zero',
        summary: 'Branches to label if $t1 is less than zero, as a signed comparison.'
    },
    bltzal: {
        longName: 'Branch on less than zero and link',
        summary: 'Branches to label if $t1 is less than zero, saving the return address in $ra.'
    },
    bne: {
        longName: 'Branch on not equal',
        summary: 'Branches to label if $t1 does not equal $t2, or an immediate.'
    },
    bnez: {
        longName: 'Branch if not equal to zero',
        summary: 'Branches to label if $t1 is not zero.'
    },
    break: {
        longName: 'Breakpoint',
        summary:
            'Raises a breakpoint exception, with an optional code, that halts execution in this simulator.'
    },
    'c.eq.d': {
        longName: 'Compare equal (double precision)',
        summary: 'Sets FP condition flag 0 to true if $f2 equals $f4.'
    },
    'c.eq.s': {
        longName: 'Compare equal (single precision)',
        summary: 'Sets FP condition flag 0 to true if $f0 equals $f1.'
    },
    'c.f.d': {
        longName: 'Compare false (double precision)',
        summary: 'Sets FP condition flag 0 to false, since this compare is never true.'
    },
    'c.f.s': {
        longName: 'Compare false (single precision)',
        summary: 'Sets FP condition flag 0 to false, since this compare is never true.'
    },
    'c.le.d': {
        longName: 'Compare less or equal (double precision)',
        summary:
            'Sets FP condition flag 0 to true if $f2 is less than or equal to $f4; the signaling form acts like c.ole.d here.'
    },
    'c.le.s': {
        longName: 'Compare less or equal (single precision)',
        summary:
            'Sets FP condition flag 0 to true if $f0 is less than or equal to $f1; the signaling form acts like c.ole.s here.'
    },
    'c.lt.d': {
        longName: 'Compare less than (double precision)',
        summary:
            'Sets FP condition flag 0 to true if $f2 is less than $f4; the signaling form acts like c.olt.d here.'
    },
    'c.lt.s': {
        longName: 'Compare less than (single precision)',
        summary:
            'Sets FP condition flag 0 to true if $f0 is less than $f1; the signaling form acts like c.olt.s here.'
    },
    'c.nge.d': {
        longName: 'Compare unordered or less than (double precision)',
        summary:
            'Sets FP condition flag 0 to true if either is NaN or $f2 is less than $f4; the signaling form acts like c.ult.d here.'
    },
    'c.nge.s': {
        longName: 'Compare unordered or less than (single precision)',
        summary:
            'Sets FP condition flag 0 to true if either is NaN or $f0 is less than $f1; the signaling form acts like c.ult.s here.'
    },
    'c.ngl.d': {
        longName: 'Compare unordered or equal (double precision)',
        summary:
            'Sets FP condition flag 0 to true if $f2 equals $f4 or either is NaN; the signaling form acts like c.ueq.d here.'
    },
    'c.ngl.s': {
        longName: 'Compare unordered or equal (single precision)',
        summary:
            'Sets FP condition flag 0 to true if $f0 equals $f1 or either is NaN; the signaling form acts like c.ueq.s here.'
    },
    'c.ngle.d': {
        longName: 'Compare unordered (double precision)',
        summary:
            'Sets FP condition flag 0 to true if either $f2 or $f4 is NaN; the signaling form acts like c.un.d here.'
    },
    'c.ngle.s': {
        longName: 'Compare unordered (single precision)',
        summary:
            'Sets FP condition flag 0 to true if either $f0 or $f1 is NaN; the signaling form acts like c.un.s here.'
    },
    'c.ngt.d': {
        longName: 'Compare not greater (double precision)',
        summary:
            'Sets FP condition flag 0 to true if either is NaN or $f2 is less than or equal to $f4; the signaling form acts like c.ule.d here.'
    },
    'c.ngt.s': {
        longName: 'Compare not greater (single precision)',
        summary:
            'Sets FP condition flag 0 to true if either is NaN or $f0 is less than or equal to $f1; the signaling form acts like c.ule.s here.'
    },
    'c.ole.d': {
        longName: 'Compare ordered, less or equal (double precision)',
        summary:
            'Sets FP condition flag 0 to true if neither is NaN and $f2 is less than or equal to $f4.'
    },
    'c.ole.s': {
        longName: 'Compare ordered, less or equal (single precision)',
        summary:
            'Sets FP condition flag 0 to true if neither is NaN and $f0 is less than or equal to $f1.'
    },
    'c.olt.d': {
        longName: 'Compare ordered less than (double precision)',
        summary: 'Sets FP condition flag 0 to true if neither is NaN and $f2 is less than $f4.'
    },
    'c.olt.s': {
        longName: 'Compare ordered less than (single precision)',
        summary: 'Sets FP condition flag 0 to true if neither is NaN and $f0 is less than $f1.'
    },
    'c.seq.d': {
        longName: 'Compare equal (double precision)',
        summary:
            'Sets FP condition flag 0 to true if $f2 equals $f4; the signaling form acts like c.eq.d here.'
    },
    'c.seq.s': {
        longName: 'Compare equal (single precision)',
        summary:
            'Sets FP condition flag 0 to true if $f0 equals $f1; the signaling form acts like c.eq.s here.'
    },
    'c.sf.d': {
        longName: 'Compare false (double precision)',
        summary:
            'Sets FP condition flag 0 to false, since this compare is never true; the signaling form acts like c.f.d here.'
    },
    'c.sf.s': {
        longName: 'Compare false (single precision)',
        summary:
            'Sets FP condition flag 0 to false, since this compare is never true; the signaling form acts like c.f.s here.'
    },
    'c.ueq.d': {
        longName: 'Compare unordered or equal (double precision)',
        summary: 'Sets FP condition flag 0 to true if $f2 equals $f4 or either is NaN.'
    },
    'c.ueq.s': {
        longName: 'Compare unordered or equal (single precision)',
        summary: 'Sets FP condition flag 0 to true if $f0 equals $f1 or either is NaN.'
    },
    'c.ule.d': {
        longName: 'Compare unordered or less/equal (double precision)',
        summary:
            'Sets FP condition flag 0 to true if either is NaN or $f2 is less than or equal to $f4.'
    },
    'c.ule.s': {
        longName: 'Compare unordered or less/equal (single precision)',
        summary:
            'Sets FP condition flag 0 to true if either is NaN or $f0 is less than or equal to $f1.'
    },
    'c.ult.d': {
        longName: 'Compare unordered or less than (double precision)',
        summary: 'Sets FP condition flag 0 to true if either is NaN or $f2 is less than $f4.'
    },
    'c.ult.s': {
        longName: 'Compare unordered or less than (single precision)',
        summary: 'Sets FP condition flag 0 to true if either is NaN or $f0 is less than $f1.'
    },
    'c.un.d': {
        longName: 'Compare unordered (double precision)',
        summary: 'Sets FP condition flag 0 to true if either $f2 or $f4 is NaN.'
    },
    'c.un.s': {
        longName: 'Compare unordered (single precision)',
        summary: 'Sets FP condition flag 0 to true if either $f0 or $f1 is NaN.'
    },
    'ceil.w.d': {
        longName: 'Ceiling double-precision to word',
        summary:
            'Converts the double-precision value in $f2 to a 32-bit integer in $f1, rounding toward positive infinity.'
    },
    'ceil.w.s': {
        longName: 'Ceiling single-precision to word',
        summary:
            'Converts the single-precision value in $f1 to a 32-bit integer in $f0, rounding toward positive infinity.'
    },
    cfc1: {
        longName: 'Move control word from FPU',
        summary: 'Copies an FPU control register into integer register $t1.'
    },
    clo: {
        longName: 'Count leading ones',
        summary:
            'Sets $t1 to the number of consecutive 1 bits in $t2, counted from the most-significant bit downward.'
    },
    clz: {
        longName: 'Count leading zeros',
        summary:
            'Sets $t1 to the number of consecutive 0 bits in $t2, counted from the most-significant bit downward.'
    },
    ctc1: {
        longName: 'Move control word to FPU',
        summary: 'Copies integer register $t1 into an FPU control register.'
    },
    'cvt.d.s': {
        longName: 'Convert single-precision to double-precision',
        summary:
            'Converts the single-precision float in $f1 to double-precision (64-bit IEEE 754) and stores the result in $f2.'
    },
    'cvt.d.w': {
        longName: 'Convert integer word to double-precision',
        summary:
            'Treats the 32-bit integer stored in $f1 as a signed integer and converts it to a double-precision float stored in $f2.'
    },
    'cvt.s.d': {
        longName: 'Convert double-precision to single-precision',
        summary:
            'Converts the double-precision float in $f2 to single-precision and stores the result in $f1.'
    },
    'cvt.s.w': {
        longName: 'Convert integer word to single-precision',
        summary:
            'Treats the 32-bit integer stored in $f1 as a signed integer and converts it to a single-precision float stored in $f0.'
    },
    'cvt.w.d': {
        longName: 'Convert double-precision to integer word',
        summary:
            'Converts the double-precision float in $f2 to a signed 32-bit integer by truncation and stores the result in $f1.'
    },
    'cvt.w.s': {
        longName: 'Convert single-precision to integer word',
        summary:
            'Converts the single-precision float in $f1 to a signed 32-bit integer by truncation and stores the result in $f0.'
    },
    div: {
        longName: 'Divide signed',
        summary:
            'Divides signed integers: with three operands the quotient goes to $t1, with two it goes to LO and the remainder to HI.'
    },
    'div.d': {
        longName: 'Floating-point divide (double precision)',
        summary: 'Sets $f2 = $f4 / $f6 using IEEE 754 double-precision (64-bit) arithmetic.'
    },
    'div.s': {
        longName: 'Floating-point divide (single precision)',
        summary: 'Sets $f0 = $f1 / $f3 using IEEE 754 single-precision (32-bit) arithmetic.'
    },
    divu: {
        longName: 'Divide unsigned',
        summary:
            'Divides unsigned integers: with three operands the quotient goes to $t1, with two it goes to LO and the remainder to HI.'
    },
    eret: {
        longName: 'Exception return',
        summary:
            'Returns from an exception or interrupt handler by restoring the PC from EPC and clearing the exception level bit.'
    },
    'floor.w.d': {
        longName: 'Floor double-precision to word',
        summary:
            'Converts the double-precision value in $f2 to a 32-bit integer in $f1, rounding toward negative infinity.'
    },
    'floor.w.s': {
        longName: 'Floor single-precision to word',
        summary:
            'Converts the single-precision value in $f1 to a 32-bit integer in $f0, rounding toward negative infinity.'
    },
    j: {
        longName: 'Jump',
        summary:
            'Jumps unconditionally to label, which must lie in the same 256 MB region as the instruction after the jump.'
    },
    jal: {
        longName: 'Jump and link',
        summary:
            'Saves the return address in $ra and jumps to label, the usual way to call a function.'
    },
    jalr: {
        longName: 'Jump and link register',
        summary:
            'Saves the return address in $t1 and jumps to the address in $t2; with one register, the return address goes to $ra.'
    },
    jr: { longName: 'Jump register', summary: 'Transfers execution to the address stored in $t1.' },
    'l.d': {
        longName: 'Load floating point double precision',
        summary:
            'Loads a double-precision value into the FP register pair $f2 and $f3, from an address or a label.'
    },
    'l.s': {
        longName: 'Load floating point single precision',
        summary:
            'Loads a single-precision value from memory into $f1, from a register-plus-offset address or a label.'
    },
    la: {
        longName: 'Load address',
        summary: 'Puts the address of a label, or a computed address, into a register.'
    },
    lb: {
        longName: 'Load byte (sign-extended)',
        summary:
            'Loads one byte from the address $t2 plus an offset into $t1, sign-extended to 32 bits.'
    },
    lbu: {
        longName: 'Load byte unsigned (zero-extended)',
        summary:
            'Loads one byte from the address $t2 plus an offset into $t1, zero-extended to 32 bits.'
    },
    ld: {
        longName: 'Load doubleword',
        summary: 'Loads the 64 bits at an address into $t1 and the next register, as a doubleword.'
    },
    ldc1: {
        longName: 'Load doubleword to FP register pair',
        summary:
            'Loads a 64-bit value from memory at address ($t2 + offset) into the even FP register pair $f2/$f3.'
    },
    lh: {
        longName: 'Load halfword (sign-extended)',
        summary:
            'Loads a 16-bit halfword from the address $t2 plus an offset into $t1, sign-extended; the address must be halfword-aligned.'
    },
    lhu: {
        longName: 'Load halfword unsigned (zero-extended)',
        summary:
            'Loads a 16-bit halfword from the address $t2 plus an offset into $t1, zero-extended to 32 bits.'
    },
    li: {
        longName: 'Load immediate',
        summary:
            'Puts an immediate value into a register, using one or two instructions as its size needs.'
    },
    ll: {
        longName: 'Load linked',
        summary:
            'Loads a 32-bit word into $t1 like lw; paired with sc, it forms an atomic read-modify-write on multiprocessor hardware.'
    },
    lui: {
        longName: 'Load upper immediate',
        summary:
            'Puts a 16-bit immediate into the upper half of $t1 and clears the lower half, often as the first step of a 32-bit constant.'
    },
    lw: {
        longName: 'Load word',
        summary:
            'Loads the 32-bit word at the address $t2 plus an offset into $t1; the address must be word-aligned.'
    },
    lwc1: {
        longName: 'Load word to FP register',
        summary:
            'Loads a 32-bit value from memory at address ($t2 + offset) directly into FP register $f1.'
    },
    lwl: {
        longName: 'Load word left (unaligned)',
        summary:
            'Loads 1 to 4 bytes from an unaligned address into the high-order end of $t1, up to the end of that word.'
    },
    lwr: {
        longName: 'Load word right (unaligned)',
        summary:
            'Loads 1 to 4 bytes from the start of a word up to an unaligned address into the low-order end of $t1.'
    },
    madd: {
        longName: 'Multiply-accumulate signed',
        summary:
            'Multiplies $t1 by $t2 (signed) to form a 64-bit product, then adds that product to the current 64-bit value in HI:LO.'
    },
    maddu: {
        longName: 'Multiply-accumulate unsigned',
        summary:
            'Multiplies $t1 by $t2 treating both as unsigned 32-bit integers, then adds the 64-bit product to HI:LO.'
    },
    mfc0: {
        longName: 'Move from coprocessor 0',
        summary:
            'Reads a Coprocessor 0 (CP0) control register and places its value in general-purpose register $t1.'
    },
    mfc1: {
        longName: 'Move from FP register to integer register',
        summary:
            'Copies the raw 32-bit bit-pattern stored in FP register $f1 into integer register $t1.'
    },
    'mfc1.d': {
        longName: 'Move FP register pair to integer register pair',
        summary:
            'Copies the FP register pair starting at $f2 into the integer register pair starting at $t1.'
    },
    mfhi: { longName: 'Move from HI', summary: 'Copies the special HI register into $t1.' },
    mflo: { longName: 'Move from LO', summary: 'Copies the special LO register into $t1.' },
    'mov.d': {
        longName: 'Move double-precision FP register',
        summary: 'Copies the double-precision value in $f4 into $f2.'
    },
    'mov.s': {
        longName: 'Move single-precision FP register',
        summary: 'Copies the single-precision value in $f1 into $f0.'
    },
    move: { longName: 'Move', summary: 'Copies the contents of $t2 into $t1.' },
    movf: {
        longName: 'Move if FP condition false',
        summary: 'Copies $t2 into $t1 if the FP condition flag (flag 0 by default) is false.'
    },
    'movf.d': {
        longName: 'Move double-precision if FP condition false',
        summary:
            'Copies the double-precision value in $f4 into $f2 if the FP condition flag (flag 0 by default) is false.'
    },
    'movf.s': {
        longName: 'Move single-precision if FP condition false',
        summary:
            'Copies the single-precision value in $f1 into $f0 if the FP condition flag (flag 0 by default) is false.'
    },
    movn: {
        longName: 'Move if not zero',
        summary: 'Copies $t2 into $t1 if $t3 is not zero, without a branch.'
    },
    'movn.d': {
        longName: 'Move double-precision if integer register not zero',
        summary:
            'Copies the double-precision value in $f4 into $f2 if the integer register $t3 is not zero.'
    },
    'movn.s': {
        longName: 'Move single-precision if integer register not zero',
        summary:
            'Copies the single-precision value in $f1 into $f0 if the integer register $t3 is not zero.'
    },
    movt: {
        longName: 'Move if FP condition true',
        summary: 'Copies $t2 into $t1 if the FP condition flag (flag 0 by default) is true.'
    },
    'movt.d': {
        longName: 'Move double-precision if FP condition true',
        summary:
            'Copies the double-precision value in $f4 into $f2 if the FP condition flag (flag 0 by default) is true.'
    },
    'movt.s': {
        longName: 'Move single-precision if FP condition true',
        summary:
            'Copies the single-precision value in $f1 into $f0 if the FP condition flag (flag 0 by default) is true.'
    },
    movz: {
        longName: 'Move if zero',
        summary: 'Copies $t2 into $t1 if $t3 is zero, without a branch.'
    },
    'movz.d': {
        longName: 'Move double-precision if integer register is zero',
        summary:
            'Copies the double-precision value in $f4 into $f2 if the integer register $t3 is zero.'
    },
    'movz.s': {
        longName: 'Move single-precision if integer register is zero',
        summary:
            'Copies the single-precision value in $f1 into $f0 if the integer register $t3 is zero.'
    },
    msub: {
        longName: 'Multiply-subtract signed',
        summary:
            'Multiplies $t1 by $t2 (signed) to form a 64-bit product, then subtracts that product from the current 64-bit value in HI:LO.'
    },
    msubu: {
        longName: 'Multiply-subtract unsigned',
        summary:
            'Multiplies $t1 by $t2 treating both as unsigned 32-bit integers, then subtracts the 64-bit product from HI:LO.'
    },
    mtc0: {
        longName: 'Move to coprocessor 0',
        summary:
            'Writes the value of general-purpose register $t1 into a Coprocessor 0 (CP0) control register.'
    },
    mtc1: {
        longName: 'Move from integer register to FP register',
        summary:
            'Copies the 32-bit value in integer register $t1 into FP register $f1 without any conversion.'
    },
    'mtc1.d': {
        longName: 'Move integer register pair to FP register pair',
        summary:
            'Copies the integer register pair starting at $t1 into the FP register pair starting at $f2.'
    },
    mthi: {
        longName: 'Move to HI',
        summary:
            'Copies $t1 into the special HI register, overwriting any prior multiply or divide result stored there.'
    },
    mtlo: {
        longName: 'Move to LO',
        summary:
            'Copies $t1 into the special LO register, overwriting any prior multiply or divide result stored there.'
    },
    mul: {
        longName: 'Multiply (low 32-bit result to register)',
        summary:
            'Multiplies $t2 by $t3, or an immediate, as signed values and puts the low 32 bits of the product in $t1.'
    },
    'mul.d': {
        longName: 'Floating-point multiply (double precision)',
        summary: 'Sets $f2 to $f4 times $f6 using IEEE 754 double-precision (64-bit) arithmetic.'
    },
    'mul.s': {
        longName: 'Floating-point multiply (single precision)',
        summary: 'Sets $f0 to $f1 times $f3 using IEEE 754 single-precision (32-bit) arithmetic.'
    },
    mulo: {
        longName: 'Multiplication with overflow',
        summary:
            'Multiplies $t2 by $t3, or an immediate, as signed values and puts the low 32 bits of the product in $t1.'
    },
    mulou: {
        longName: 'Multiplication with overflow unsigned',
        summary:
            'Multiplies $t2 by $t3, or an immediate, as unsigned values and puts the low 32 bits of the product in $t1.'
    },
    mult: {
        longName: 'Multiply signed',
        summary:
            'Multiplies $t1 by $t2 as signed 32-bit integers and leaves the 64-bit product in HI and LO.'
    },
    multu: {
        longName: 'Multiply unsigned',
        summary:
            'Multiplies $t1 by $t2 as unsigned 32-bit integers and leaves the 64-bit product in HI and LO.'
    },
    mulu: {
        longName: 'Multiplication unsigned',
        summary:
            'Multiplies $t2 by $t3, or an immediate, as unsigned values, putting the low 32 bits in $t1 and the high 32 bits in HI.'
    },
    neg: { longName: 'Negate', summary: 'Sets $t1 to the negation of $t2.' },
    'neg.d': {
        longName: 'Floating-point negate (double precision)',
        summary: 'Sets $f2 to the negation of $f4 (double-precision) by flipping the sign bit.'
    },
    'neg.s': {
        longName: 'Floating-point negate (single precision)',
        summary: 'Sets $f0 to the negation of $f1 (single-precision) by flipping the sign bit.'
    },
    negu: {
        longName: 'Negate unsigned (no overflow trap)',
        summary: 'Sets $t1 to the negation of $t2, wrapping on overflow instead of trapping.'
    },
    nop: {
        longName: 'No operation',
        summary: 'Does nothing; the processor simply advances to the next instruction.'
    },
    nor: {
        longName: 'Bitwise NOR',
        summary:
            'Sets $t1 to the bitwise NOR of $t2 and $t3, so each result bit is 1 only where both inputs are 0.'
    },
    not: {
        longName: 'Bitwise NOT (bit inversion)',
        summary: 'Sets $t1 to the bitwise complement of $t2, flipping every bit.'
    },
    or: {
        longName: 'Bitwise OR',
        summary:
            'Sets $t1 to $t2 OR $t3, or an immediate, so each result bit is 1 where either input is 1.'
    },
    ori: {
        longName: 'Bitwise OR immediate',
        summary:
            'Sets $t1 to $t2 OR an immediate, with the immediate zero-extended instead of sign-extended.'
    },
    pref: {
        longName: 'Prefetch',
        summary:
            'Hints that the data at address ($t2 + offset) will be needed soon, so the hardware can begin moving it into cache.'
    },
    rem: {
        longName: 'Remainder signed',
        summary:
            'Sets $t1 to the remainder of $t2 divided by $t3, or an immediate, as signed values.'
    },
    remu: {
        longName: 'Remainder unsigned',
        summary:
            'Sets $t1 to the remainder of $t2 divided by $t3, or an immediate, as unsigned values.'
    },
    rol: {
        longName: 'Rotate left (register or immediate)',
        summary: 'Sets $t1 to $t2 rotated left by the amount in $t3, or by a 5-bit immediate.'
    },
    ror: {
        longName: 'Rotate right (register or immediate)',
        summary: 'Sets $t1 to $t2 rotated right by the amount in $t3, or by a 5-bit immediate.'
    },
    rotr: {
        longName: 'Rotate right',
        summary:
            'Sets $t1 to $t2 rotated right by a fixed amount of 0 to 31 bits, with bits leaving the right end re-entering on the left.'
    },
    rotrv: {
        longName: 'Rotate right variable',
        summary: 'Sets $t1 to $t2 rotated right by the amount in the low 5 bits of $t3.'
    },
    'round.w.d': {
        longName: 'Round double-precision to word',
        summary:
            'Converts the double-precision value in $f2 to the nearest 32-bit integer in $f1, rounding half to even.'
    },
    'round.w.s': {
        longName: 'Round single-precision to word',
        summary:
            'Converts the single-precision value in $f1 to the nearest 32-bit integer in $f0, rounding half to even.'
    },
    's.d': {
        longName: 'Store floating point double precision',
        summary:
            'Stores the double-precision value in the FP register pair $f2 and $f3 to memory, at an address or a label.'
    },
    's.s': {
        longName: 'Store floating point single precision',
        summary:
            'Stores the single-precision value in $f1 to memory, at a register-plus-offset address or a label.'
    },
    sb: {
        longName: 'Store byte',
        summary: 'Stores the lowest 8 bits of $t1 at the address $t2 plus an offset.'
    },
    sc: {
        longName: 'Store conditional',
        summary:
            'Stores $t1 at the address $t2 plus an offset and sets $t1 to 1 if the store succeeds, or 0 if it fails.'
    },
    sd: {
        longName: 'Store doubleword',
        summary: 'Stores $t1 and the next register as a 64-bit doubleword at an address.'
    },
    sdc1: {
        longName: 'Store doubleword from FP register pair',
        summary:
            'Writes the 64-bit value in the even FP register pair $f2/$f3 to memory at address ($t2 + offset).'
    },
    seb: {
        longName: 'Sign extend byte',
        summary:
            'Copies the low 8 bits of $t2 into $t1, with bit 7 replicated through the upper 24 bits.'
    },
    seh: {
        longName: 'Sign extend halfword',
        summary:
            'Copies the low 16 bits of $t2 into $t1, with bit 15 replicated through the upper 16 bits.'
    },
    seq: {
        longName: 'Set if equal',
        summary: 'Sets $t1 to 1 if $t2 equals $t3, or an immediate, otherwise to 0.'
    },
    sge: {
        longName: 'Set if greater or equal',
        summary:
            'Sets $t1 to 1 if $t2 is greater than or equal to $t3, or an immediate, as signed values, otherwise to 0.'
    },
    sgeu: {
        longName: 'Set if greater or equal unsigned',
        summary:
            'Sets $t1 to 1 if $t2 is greater than or equal to $t3, or an immediate, as unsigned values, otherwise to 0.'
    },
    sgt: {
        longName: 'Set if greater than',
        summary:
            'Sets $t1 to 1 if $t2 is greater than $t3, or an immediate, as signed values, otherwise to 0.'
    },
    sgtu: {
        longName: 'Set if greater than unsigned',
        summary:
            'Sets $t1 to 1 if $t2 is greater than $t3, or an immediate, as unsigned values, otherwise to 0.'
    },
    sh: {
        longName: 'Store halfword',
        summary:
            'Stores the lowest 16 bits of $t1 at the address $t2 plus an offset; the address must be halfword-aligned.'
    },
    sle: {
        longName: 'Set if less or equal',
        summary:
            'Sets $t1 to 1 if $t2 is less than or equal to $t3, or an immediate, as signed values, otherwise to 0.'
    },
    sleu: {
        longName: 'Set if less or equal unsigned',
        summary:
            'Sets $t1 to 1 if $t2 is less than or equal to $t3, or an immediate, as unsigned values, otherwise to 0.'
    },
    sll: {
        longName: 'Shift left logical',
        summary:
            'Sets $t1 to $t2 shifted left by a fixed amount of 0 to 31 bits, filling vacated bits with zeros.'
    },
    sllv: {
        longName: 'Shift left logical variable',
        summary:
            'Sets $t1 to $t2 shifted left by the amount in the low 5 bits of $t3, filling vacated bits with zeros.'
    },
    slt: {
        longName: 'Set on less than (signed)',
        summary: 'Sets $t1 to 1 if $t2 is less than $t3 as signed integers, otherwise to 0.'
    },
    slti: {
        longName: 'Set on less than immediate (signed)',
        summary:
            'Sets $t1 to 1 if $t2 is less than an immediate as signed integers, otherwise to 0.'
    },
    sltiu: {
        longName: 'Set on less than immediate unsigned',
        summary:
            'Sets $t1 to 1 if $t2 is less than an immediate as unsigned integers, otherwise to 0.'
    },
    sltu: {
        longName: 'Set on less than unsigned',
        summary: 'Sets $t1 to 1 if $t2 is less than $t3 as unsigned integers, otherwise to 0.'
    },
    sne: {
        longName: 'Set if not equal',
        summary: 'Sets $t1 to 1 if $t2 does not equal $t3, or an immediate, otherwise to 0.'
    },
    'sqrt.d': {
        longName: 'Floating-point square root (double precision)',
        summary:
            'Sets $f2 to the square root of $f4 in double precision, or NaN if $f4 is negative.'
    },
    'sqrt.s': {
        longName: 'Floating-point square root (single precision)',
        summary:
            'Sets $f0 to the square root of $f1 in single precision, or NaN if $f1 is negative.'
    },
    sra: {
        longName: 'Shift right arithmetic',
        summary:
            'Sets $t1 to $t2 shifted right by a fixed amount of 0 to 31 bits, filling vacated bits with copies of the sign bit.'
    },
    srav: {
        longName: 'Shift right arithmetic variable',
        summary:
            'Sets $t1 to $t2 shifted right by the amount in the low 5 bits of $t3, filling vacated bits with the sign bit.'
    },
    srl: {
        longName: 'Shift right logical',
        summary:
            'Sets $t1 to $t2 shifted right by a fixed amount of 0 to 31 bits, filling vacated bits with zeros.'
    },
    srlv: {
        longName: 'Shift right logical variable',
        summary:
            'Sets $t1 to $t2 shifted right by the amount in the low 5 bits of $t3, filling vacated bits with zeros.'
    },
    sub: {
        longName: 'Subtract with overflow trap',
        summary:
            'Subtracts $t3, or an immediate, from $t2 into $t1 and traps if the signed result overflows.'
    },
    'sub.d': {
        longName: 'Floating-point subtract (double precision)',
        summary: 'Sets $f2 = $f4 - $f6 using IEEE 754 double-precision (64-bit) arithmetic.'
    },
    'sub.s': {
        longName: 'Floating-point subtract (single precision)',
        summary: 'Sets $f0 = $f1 - $f3 using IEEE 754 single-precision (32-bit) arithmetic.'
    },
    subi: {
        longName: 'Subtract immediate with overflow trap',
        summary:
            'Subtracts an immediate from $t2 into $t1 and traps if the signed result overflows.'
    },
    subiu: {
        longName: 'Subtract immediate unsigned (no overflow trap)',
        summary:
            'Subtracts an immediate from $t2 into $t1 and wraps on overflow instead of trapping.'
    },
    subu: {
        longName: 'Subtract unsigned (no overflow trap)',
        summary:
            'Subtracts $t3, or an immediate, from $t2 into $t1 and wraps on overflow instead of trapping.'
    },
    sw: {
        longName: 'Store word',
        summary:
            'Stores the 32-bit value in $t1 at the address $t2 plus an offset; the address must be word-aligned.'
    },
    swc1: {
        longName: 'Store word from FP register',
        summary: 'Writes the 32-bit value in FP register $f1 to memory at address ($t2 + offset).'
    },
    swl: {
        longName: 'Store word left (unaligned)',
        summary:
            'Stores the high-order 1 to 4 bytes of $t1 at an unaligned address, up to the end of that word.'
    },
    swr: {
        longName: 'Store word right (unaligned)',
        summary:
            'Stores the low-order 1 to 4 bytes of $t1 from the start of a word up to an unaligned address.'
    },
    sync: {
        longName: 'Synchronize shared memory',
        summary:
            'Orders the loads and stores around it, so that another processor observes them in program order.'
    },
    syscall: {
        longName: 'System call',
        summary: 'Invokes an OS service identified by the integer in $v0.'
    },
    teq: {
        longName: 'Trap if equal',
        summary:
            'Raises a trap exception if $t1 equals $t2, which halts execution in this simulator.'
    },
    teqi: {
        longName: 'Trap if equal to immediate',
        summary: 'Raises a trap exception if $t1 equals an immediate, sign-extended to 32 bits.'
    },
    tge: {
        longName: 'Trap if greater or equal (signed)',
        summary: 'Raises a trap exception if $t1 is greater than or equal to $t2, as signed values.'
    },
    tgei: {
        longName: 'Trap if greater or equal to immediate (signed)',
        summary:
            'Raises a trap exception if $t1 is greater than or equal to an immediate, as signed values.'
    },
    tgeiu: {
        longName: 'Trap if greater or equal to immediate (unsigned)',
        summary:
            'Raises a trap exception if $t1 is greater than or equal to an immediate, as unsigned values.'
    },
    tgeu: {
        longName: 'Trap if greater or equal (unsigned)',
        summary:
            'Raises a trap exception if $t1 is greater than or equal to $t2, as unsigned values.'
    },
    tlt: {
        longName: 'Trap if less than (signed)',
        summary: 'Raises a trap exception if $t1 is less than $t2, as signed values.'
    },
    tlti: {
        longName: 'Trap if less than immediate (signed)',
        summary: 'Raises a trap exception if $t1 is less than an immediate, as signed values.'
    },
    tltiu: {
        longName: 'Trap if less than immediate (unsigned)',
        summary: 'Raises a trap exception if $t1 is less than an immediate, as unsigned values.'
    },
    tltu: {
        longName: 'Trap if less than (unsigned)',
        summary: 'Raises a trap exception if $t1 is less than $t2, as unsigned values.'
    },
    tne: {
        longName: 'Trap if not equal',
        summary:
            'Raises a trap exception if $t1 does not equal $t2, which halts execution in this simulator.'
    },
    tnei: {
        longName: 'Trap if not equal to immediate',
        summary:
            'Raises a trap exception if $t1 does not equal an immediate, sign-extended to 32 bits.'
    },
    'trunc.w.d': {
        longName: 'Truncate double-precision to word',
        summary:
            'Converts the double-precision value in $f2 to a 32-bit integer in $f1, rounding toward zero.'
    },
    'trunc.w.s': {
        longName: 'Truncate single-precision to word',
        summary:
            'Converts the single-precision value in $f1 to a 32-bit integer in $f0, rounding toward zero.'
    },
    ulh: {
        longName: 'Unaligned load halfword',
        summary: 'Loads a 16-bit halfword from any byte address into $t1, sign-extended.'
    },
    ulhu: {
        longName: 'Unaligned load halfword unsigned',
        summary: 'Loads a 16-bit halfword from any byte address into $t1, zero-extended.'
    },
    ulw: {
        longName: 'Unaligned load word',
        summary:
            'Loads a 32-bit word from any byte address into $t1, whether or not the address is word-aligned.'
    },
    ush: {
        longName: 'Unaligned store halfword',
        summary:
            'Stores the low 16 bits of $t1 at any byte address, whether or not the address is halfword-aligned.'
    },
    usw: {
        longName: 'Unaligned store word',
        summary:
            'Stores the 32 bits of $t1 at any byte address, whether or not the address is word-aligned.'
    },
    wait: {
        longName: 'Wait for interrupt',
        summary: 'Halts the processor until an interrupt arrives.'
    },
    wsbh: {
        longName: 'Word swap bytes within halfwords',
        summary:
            'Sets $t1 to $t2 with the two bytes of each halfword exchanged, so 0xAABBCCDD becomes 0xBBAADDCC.'
    },
    xor: {
        longName: 'Bitwise XOR (exclusive OR)',
        summary:
            'Sets $t1 to $t2 XOR $t3, or an immediate, so each result bit is 1 where the inputs differ.'
    },
    xori: {
        longName: 'Bitwise XOR immediate',
        summary:
            'Sets $t1 to $t2 XOR an immediate, with the immediate zero-extended instead of sign-extended.'
    }
}
