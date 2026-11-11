/**
 * Long names and summaries of the RISC-V instructions ([the design record](../../../../../../docs/design/instruction-layout.md),
 * decision 6), written for every mnemonic: RARS titles only some of its forms, shares one title
 * across `div`, `divu` and `divw`, and gets a few wrong (`sraw` and `srlw` say "Shift left"). The
 * derivation in `mars/instructionDocument.ts`, the main form's "Title :" and the first sentence
 * after it, stands in for a mnemonic the table leaves out.
 */
export const riscvInstructionNames: Readonly<
    Record<string, { longName?: string; summary?: string }>
> = {
    add: {
        longName: 'Addition',
        summary: 'Adds the second and third registers and stores the sum in the first.'
    },
    'add.uw': {
        longName: 'Add unsigned word',
        summary:
            'Sets the first register to the low 32 bits of the second, zero-extended, plus the third.'
    },
    addi: {
        longName: 'Addition immediate',
        summary:
            'Adds a sign-extended 12-bit immediate to the second register and stores the sum in the first.'
    },
    addiw: {
        longName: 'Add immediate word (32-bit)',
        summary:
            'Adds a signed 12-bit immediate to the low 32 bits of the second register and sign-extends the sum into the first.'
    },
    addw: {
        longName: 'Add word (32-bit)',
        summary:
            'Adds the low 32 bits of the second and third registers and sign-extends the 32-bit sum into the first.'
    },
    'amoadd.d': {
        longName: 'Atomic add double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores the sum of that value and the second register back there, atomically.'
    },
    'amoadd.w': {
        longName: 'Atomic add word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores the sum of that value and the second register back there, atomically.'
    },
    'amoand.d': {
        longName: 'Atomic and double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores its bitwise AND with the second register back there, atomically.'
    },
    'amoand.w': {
        longName: 'Atomic and word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores its bitwise AND with the second register back there, atomically.'
    },
    'amomax.d': {
        longName: 'Atomic signed maximum double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores the larger of it and the second register there, compared as signed, atomically.'
    },
    'amomax.w': {
        longName: 'Atomic signed maximum word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores the larger of it and the second register back there, compared as signed, atomically.'
    },
    'amomaxu.d': {
        longName: 'Atomic unsigned maximum double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores the larger of it and the second register there, compared as unsigned, atomically.'
    },
    'amomaxu.w': {
        longName: 'Atomic unsigned maximum word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores the larger of it and the second register back there, compared as unsigned, atomically.'
    },
    'amomin.d': {
        longName: 'Atomic signed minimum double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores the smaller of it and the second register there, compared as signed, atomically.'
    },
    'amomin.w': {
        longName: 'Atomic signed minimum word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores the smaller of it and the second register back there, compared as signed, atomically.'
    },
    'amominu.d': {
        longName: 'Atomic unsigned minimum double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores the smaller of it and the second register there, compared as unsigned, atomically.'
    },
    'amominu.w': {
        longName: 'Atomic unsigned minimum word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores the smaller of it and the second register back there, compared as unsigned, atomically.'
    },
    'amoor.d': {
        longName: 'Atomic or double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores its bitwise OR with the second register there, atomically.'
    },
    'amoor.w': {
        longName: 'Atomic or word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores its bitwise OR with the second register back there, atomically.'
    },
    'amoswap.d': {
        longName: 'Atomic swap double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores the second register there, atomically.'
    },
    'amoswap.w': {
        longName: 'Atomic swap word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores the second register there, atomically.'
    },
    'amoxor.d': {
        longName: 'Atomic xor double word (64-bit)',
        summary:
            'Loads the double word at the address in the third register into the first and stores its bitwise XOR with the second register there, atomically.'
    },
    'amoxor.w': {
        longName: 'Atomic xor word (32-bit)',
        summary:
            'Loads the word at the address in the third register into the first and stores its bitwise XOR with the second register back there, atomically.'
    },
    and: {
        longName: 'Bitwise AND',
        summary: 'Sets the first register to the bitwise AND of the second and third.'
    },
    andi: {
        longName: 'Bitwise AND immediate',
        summary:
            'Sets the first register to the bitwise AND of the second and a sign-extended 12-bit immediate.'
    },
    andn: {
        longName: 'AND with inverted operand',
        summary:
            'Sets the first register to the bitwise AND of the second and the bitwise NOT of the third.'
    },
    auipc: {
        longName: 'Add upper immediate to PC',
        summary:
            'Adds an upper 20-bit immediate, shifted left by 12 bits, to the PC and stores the result in a register.'
    },
    b: { longName: 'Branch', summary: 'Branches unconditionally to label.' },
    bclr: {
        longName: 'Clear bit',
        summary:
            'Copies the second register into the first with one bit cleared: the bit whose index is in the low bits of the third.'
    },
    bclri: {
        longName: 'Clear bit by immediate',
        summary:
            'Copies the second register into the first with the bit numbered by the immediate cleared.'
    },
    beq: {
        longName: 'Branch if equal',
        summary: 'Branches to label if the two registers are equal.'
    },
    beqz: {
        longName: 'Branch if equal to zero',
        summary: 'Branches to label if the register is zero.'
    },
    bext: {
        longName: 'Extract bit',
        summary:
            'Sets the first register to the value, 0 or 1, of one bit of the second: the bit whose index is in the low bits of the third.'
    },
    bexti: {
        longName: 'Extract bit by immediate',
        summary:
            'Sets the first register to the value, 0 or 1, of the bit of the second numbered by the immediate.'
    },
    bge: {
        longName: 'Branch if greater than or equal',
        summary:
            'Branches to label if the first register is greater than or equal to the second, comparing as signed.'
    },
    bgeu: {
        longName: 'Branch if greater than or equal (unsigned)',
        summary:
            'Branches to label if the first register is greater than or equal to the second, comparing as unsigned.'
    },
    bgez: {
        longName: 'Branch if greater than or equal to zero',
        summary: 'Branches to label if the register is greater than or equal to zero.'
    },
    bgt: {
        longName: 'Branch if greater than',
        summary:
            'Branches to label if the first register is greater than the second, comparing as signed.'
    },
    bgtu: {
        longName: 'Branch if greater than (unsigned)',
        summary:
            'Branches to label if the first register is greater than the second, comparing as unsigned.'
    },
    bgtz: {
        longName: 'Branch if greater than zero',
        summary: 'Branches to label if the register is greater than zero.'
    },
    binv: {
        longName: 'Invert bit',
        summary:
            'Copies the second register into the first with one bit flipped: the bit whose index is in the low bits of the third.'
    },
    binvi: {
        longName: 'Invert bit by immediate',
        summary:
            'Copies the second register into the first with the bit numbered by the immediate flipped.'
    },
    ble: {
        longName: 'Branch if less than or equal',
        summary:
            'Branches to label if the first register is less than or equal to the second, comparing as signed.'
    },
    bleu: {
        longName: 'Branch if less than or equal (unsigned)',
        summary:
            'Branches to label if the first register is less than or equal to the second, comparing as unsigned.'
    },
    blez: {
        longName: 'Branch if less than or equal to zero',
        summary: 'Branches to label if the register is less than or equal to zero.'
    },
    blt: {
        longName: 'Branch if less than',
        summary:
            'Branches to label if the first register is less than the second, comparing as signed.'
    },
    bltu: {
        longName: 'Branch if less than (unsigned)',
        summary:
            'Branches to label if the first register is less than the second, comparing as unsigned.'
    },
    bltz: {
        longName: 'Branch if less than zero',
        summary: 'Branches to label if the register is less than zero.'
    },
    bne: {
        longName: 'Branch if not equal',
        summary: 'Branches to label if the two registers are not equal.'
    },
    bnez: {
        longName: 'Branch if not equal to zero',
        summary: 'Branches to label if the register is nonzero.'
    },
    bset: {
        longName: 'Set bit',
        summary:
            'Copies the second register into the first with one bit set: the bit whose index is in the low bits of the third.'
    },
    bseti: {
        longName: 'Set bit by immediate',
        summary:
            'Copies the second register into the first with the bit numbered by the immediate set.'
    },
    call: {
        longName: 'Call',
        summary:
            'Calls the subroutine at label, even when it is too far away for a single jump, and saves the return address in ra.'
    },
    clz: {
        longName: 'Count leading zeros',
        summary:
            'Sets the first register to the number of 0 bits above the most significant 1 bit of the second, or the register width when the second is zero.'
    },
    clzw: {
        longName: 'Count leading zeros word (32-bit)',
        summary:
            'Sets the first register to the number of 0 bits above the most significant 1 bit of the low 32 bits of the second, or 32 when they are zero.'
    },
    cpop: {
        longName: 'Count set bits',
        summary: 'Sets the first register to the number of 1 bits in the second.'
    },
    cpopw: {
        longName: 'Count set bits word (32-bit)',
        summary: 'Sets the first register to the number of 1 bits in the low 32 bits of the second.'
    },
    csrc: {
        longName: 'Clear bits in control and status register',
        summary: 'Clears the CSR bits that are set in a register, leaving the other bits unchanged.'
    },
    csrci: {
        longName: 'Clear bits in CSR immediate',
        summary:
            'Clears the CSR bits that are set in a 5-bit constant, leaving the other bits unchanged.'
    },
    csrr: {
        longName: 'Read control and status register',
        summary: 'Reads the CSR into a register without writing to the CSR.'
    },
    csrrc: {
        longName: 'Atomic read/clear CSR',
        summary:
            'Reads the CSR into the first register and clears the CSR bits that are set in the last register, as one atomic step.'
    },
    csrrci: {
        longName: 'Atomic read/clear CSR immediate',
        summary:
            'Reads the CSR into a register and clears the CSR bits that are set in a 5-bit constant, as one atomic step.'
    },
    csrrs: {
        longName: 'Atomic read/set CSR',
        summary:
            'Reads the CSR into the first register and sets the CSR bits that are set in the last register, as one atomic step.'
    },
    csrrsi: {
        longName: 'Atomic read/set CSR immediate',
        summary:
            'Reads the CSR into a register and sets the CSR bits that are set in a 5-bit constant, as one atomic step.'
    },
    csrrw: {
        longName: 'Atomic read/write CSR',
        summary:
            'Reads the CSR into the first register and writes the last register into the CSR, as one atomic step.'
    },
    csrrwi: {
        longName: 'Atomic read/write CSR immediate',
        summary:
            'Reads the CSR into a register and writes a 5-bit constant into the CSR, as one atomic step.'
    },
    csrs: {
        longName: 'Set bits in control and status register',
        summary: 'Sets the CSR bits that are set in a register, leaving the other bits unchanged.'
    },
    csrsi: {
        longName: 'Set bits in CSR immediate',
        summary:
            'Sets the CSR bits that are set in a 5-bit constant, leaving the other bits unchanged.'
    },
    csrw: {
        longName: 'Write control and status register',
        summary: 'Writes a register into the CSR and discards the value the CSR held before.'
    },
    csrwi: {
        longName: 'Write CSR immediate',
        summary: 'Writes a 5-bit constant into the CSR and discards the value it held before.'
    },
    ctz: {
        longName: 'Count trailing zeros',
        summary:
            'Sets the first register to the number of 0 bits below the least significant 1 bit of the second, or the register width when the second is zero.'
    },
    ctzw: {
        longName: 'Count trailing zeros word (32-bit)',
        summary:
            'Sets the first register to the number of 0 bits below the least significant 1 bit of the low 32 bits of the second, or 32 when they are zero.'
    },
    div: {
        longName: 'Divide',
        summary:
            'Divides the second register by the third as signed integers and stores the quotient in the first.'
    },
    divu: {
        longName: 'Divide unsigned',
        summary:
            'Divides the second register by the third as unsigned integers and stores the quotient in the first.'
    },
    divuw: {
        longName: 'Divide unsigned word (32-bit)',
        summary:
            'Divides the low 32 bits of the second register by those of the third as unsigned values and sign-extends the quotient into the first.'
    },
    divw: {
        longName: 'Divide word (32-bit)',
        summary:
            'Divides the low 32 bits of the second register by those of the third as signed values and sign-extends the quotient into the first.'
    },
    ebreak: {
        longName: 'Environment break (breakpoint)',
        summary: 'Pauses execution so that a debugger or the simulator can take control.'
    },
    ecall: {
        longName: 'Environment call (system call)',
        summary: 'Executes the system call specified by the value in a7.'
    },
    'fabs.d': {
        longName: 'FP absolute value (double)',
        summary:
            'Sets the first register to the absolute value of the double-precision value in the second.'
    },
    'fabs.s': {
        longName: 'FP absolute value (single)',
        summary:
            'Sets the first register to the absolute value of the single-precision value in the second.'
    },
    'fadd.d': {
        longName: 'Floating add (64 bit)',
        summary:
            'Adds the double-precision values in the second and third registers and stores the sum in the first.'
    },
    'fadd.s': {
        longName: 'Floating add',
        summary:
            'Adds the single-precision values in the second and third registers and stores the sum in the first.'
    },
    'fclass.d': {
        longName: 'Classify a floating point number (64 bit)',
        summary:
            'Sets the first register to a bit mask that identifies the class of the double-precision value in the second, such as NaN or zero.'
    },
    'fclass.s': {
        longName: 'Classify a floating point number',
        summary:
            'Sets the first register to a bit mask that identifies the class of the single-precision value in the second, such as NaN or zero.'
    },
    'fcvt.d.l': {
        longName: 'Convert double from signed 64 bit integer',
        summary:
            'Converts the signed 64-bit integer in the second register to double precision and stores it in the first.'
    },
    'fcvt.d.lu': {
        longName: 'Convert double from unsigned 64 bit integer',
        summary:
            'Converts the unsigned 64-bit integer in the second register to double precision and stores it in the first.'
    },
    'fcvt.d.s': {
        longName: 'Convert a float to a double',
        summary:
            'Converts the single-precision value in the second register to double precision and stores it in the first.'
    },
    'fcvt.d.w': {
        longName: 'Convert double from signed integer',
        summary:
            'Converts the signed 32-bit integer in the second register to double precision and stores it in the first.'
    },
    'fcvt.d.wu': {
        longName: 'Convert double from unsigned integer',
        summary:
            'Converts the unsigned 32-bit integer in the second register to double precision and stores it in the first.'
    },
    'fcvt.l.d': {
        longName: 'Convert signed 64 bit integer from double',
        summary:
            'Rounds the double-precision value in the second register to a signed 64-bit integer and stores it in the first.'
    },
    'fcvt.l.s': {
        longName: 'Convert signed 64 bit integer from float',
        summary:
            'Rounds the single-precision value in the second register to a signed 64-bit integer and stores it in the first.'
    },
    'fcvt.lu.d': {
        longName: 'Convert unsigned 64 bit integer from double',
        summary:
            'Rounds the double-precision value in the second register to an unsigned 64-bit integer and stores it in the first.'
    },
    'fcvt.lu.s': {
        longName: 'Convert unsigned 64 bit integer from float',
        summary:
            'Rounds the single-precision value in the second register to an unsigned 64-bit integer and stores it in the first.'
    },
    'fcvt.s.d': {
        longName: 'Convert a double to a float',
        summary:
            'Converts the double-precision value in the second register to single precision and stores it in the first.'
    },
    'fcvt.s.l': {
        longName: 'Convert float from signed 64 bit integer',
        summary:
            'Converts the signed 64-bit integer in the second register to single precision and stores it in the first.'
    },
    'fcvt.s.lu': {
        longName: 'Convert float from unsigned 64 bit integer',
        summary:
            'Converts the unsigned 64-bit integer in the second register to single precision and stores it in the first.'
    },
    'fcvt.s.w': {
        longName: 'Convert float from signed integer',
        summary:
            'Converts the signed 32-bit integer in the second register to single precision and stores it in the first.'
    },
    'fcvt.s.wu': {
        longName: 'Convert float from unsigned integer',
        summary:
            'Converts the unsigned 32-bit integer in the second register to single precision and stores it in the first.'
    },
    'fcvt.w.d': {
        longName: 'Convert signed integer from double',
        summary:
            'Rounds the double-precision value in the second register to a signed 32-bit integer and stores it in the first.'
    },
    'fcvt.w.s': {
        longName: 'Convert signed integer from float',
        summary:
            'Rounds the single-precision value in the second register to a signed 32-bit integer and stores it in the first.'
    },
    'fcvt.wu.d': {
        longName: 'Convert unsigned integer from double',
        summary:
            'Rounds the double-precision value in the second register to an unsigned 32-bit integer and stores it in the first.'
    },
    'fcvt.wu.s': {
        longName: 'Convert unsigned integer from float',
        summary:
            'Rounds the single-precision value in the second register to an unsigned 32-bit integer and stores it in the first.'
    },
    'fdiv.d': {
        longName: 'Floating divide (64 bit)',
        summary:
            'Divides the second register by the third in double precision and stores the quotient in the first.'
    },
    'fdiv.s': {
        longName: 'Floating divide',
        summary:
            'Divides the second register by the third in single precision and stores the quotient in the first.'
    },
    fence: {
        longName: 'Memory fence',
        summary:
            'Makes memory and I/O accesses before the fence take effect before those after it, as other threads see them.'
    },
    'fence.i': {
        longName: 'Instruction fence',
        summary: 'Ensures that stores to instruction memory are visible to instruction fetches.'
    },
    'feq.d': {
        longName: 'Floating equal (64 bit)',
        summary:
            'Sets the first register to 1 if the double-precision values in the second and third are equal, otherwise to 0.'
    },
    'feq.s': {
        longName: 'Floating equal',
        summary:
            'Sets the first register to 1 if the single-precision values in the second and third are equal, otherwise to 0.'
    },
    'fge.d': {
        longName: 'Floating greater than or equal (64 bit)',
        summary:
            'Sets the first register to 1 if the double-precision value in the second is greater than or equal to the value in the third, otherwise to 0.'
    },
    'fge.s': {
        longName: 'Floating greater than or equal',
        summary:
            'Sets the first register to 1 if the single-precision value in the second is greater than or equal to the value in the third, otherwise to 0.'
    },
    'fgt.d': {
        longName: 'Floating greater than (64 bit)',
        summary:
            'Sets the first register to 1 if the double-precision value in the second is greater than the value in the third, otherwise to 0.'
    },
    'fgt.s': {
        longName: 'Floating greater than',
        summary:
            'Sets the first register to 1 if the single-precision value in the second is greater than the value in the third, otherwise to 0.'
    },
    fld: {
        longName: 'Load a double from memory',
        summary:
            'Loads a double-precision value from the address in the second register plus an offset into the first.'
    },
    'fle.d': {
        longName: 'Floating less than or equal (64 bit)',
        summary:
            'Sets the first register to 1 if the double-precision value in the second is less than or equal to the value in the third, otherwise to 0.'
    },
    'fle.s': {
        longName: 'Floating less than or equal',
        summary:
            'Sets the first register to 1 if the single-precision value in the second is less than or equal to the value in the third, otherwise to 0.'
    },
    'flt.d': {
        longName: 'Floating less than (64 bit)',
        summary:
            'Sets the first register to 1 if the double-precision value in the second is less than the value in the third, otherwise to 0.'
    },
    'flt.s': {
        longName: 'Floating less than',
        summary:
            'Sets the first register to 1 if the single-precision value in the second is less than the value in the third, otherwise to 0.'
    },
    flw: {
        longName: 'Load a float from memory',
        summary:
            'Loads a single-precision value from the address in the second register plus an offset into the first.'
    },
    'fmadd.d': {
        longName: 'Fused multiply add (64 bit)',
        summary:
            'Multiplies the second and third registers and adds the fourth, in double precision with a single rounding, and stores the result in the first.'
    },
    'fmadd.s': {
        longName: 'Fused multiply add',
        summary:
            'Multiplies the second and third registers and adds the fourth, in single precision with a single rounding, and stores the result in the first.'
    },
    'fmax.d': {
        longName: 'Floating maximum (64 bit)',
        summary:
            'Stores the larger of the double-precision values in the second and third registers in the first.'
    },
    'fmax.s': {
        longName: 'Floating maximum',
        summary:
            'Stores the larger of the single-precision values in the second and third registers in the first.'
    },
    'fmin.d': {
        longName: 'Floating minimum (64 bit)',
        summary:
            'Stores the smaller of the double-precision values in the second and third registers in the first.'
    },
    'fmin.s': {
        longName: 'Floating minimum',
        summary:
            'Stores the smaller of the single-precision values in the second and third registers in the first.'
    },
    'fmsub.d': {
        longName: 'Fused multiply subtract (64 bit)',
        summary:
            'Multiplies the second and third registers and subtracts the fourth, in double precision with a single rounding, and stores the result in the first.'
    },
    'fmsub.s': {
        longName: 'Fused multiply subtract',
        summary:
            'Multiplies the second and third registers and subtracts the fourth, in single precision with a single rounding, and stores the result in the first.'
    },
    'fmul.d': {
        longName: 'Floating multiply (64 bit)',
        summary:
            'Multiplies the second and third registers in double precision and stores the product in the first.'
    },
    'fmul.s': {
        longName: 'Floating multiply',
        summary:
            'Multiplies the second and third registers in single precision and stores the product in the first.'
    },
    'fmv.d': {
        longName: 'Copy FP register (double)',
        summary: 'Copies the double-precision value in the second register into the first.'
    },
    'fmv.d.x': {
        longName: 'Move integer bits to FP register (double)',
        summary:
            'Copies the raw 64 bits of the second register into the first without converting them.'
    },
    'fmv.s': {
        longName: 'Copy FP register (single)',
        summary: 'Copies the single-precision value in the second register into the first.'
    },
    'fmv.s.x': {
        longName: 'Move integer bits to single FP (old name)',
        summary:
            'Copies the raw low 32 bits of the second register into the first without converting them, as the older name of fmv.w.x.'
    },
    'fmv.w.x': {
        longName: 'Move integer bits to FP register',
        summary:
            'Copies the raw low 32 bits of the second register into the first without converting them.'
    },
    'fmv.x.d': {
        longName: 'Move FP bits to integer register (double)',
        summary:
            'Copies the raw 64 bits of the second register into the first without converting them.'
    },
    'fmv.x.s': {
        longName: 'Move single FP bits to integer (old name)',
        summary:
            'Copies the raw 32 bits of the second register into the first without converting them, as the older name of fmv.x.w.'
    },
    'fmv.x.w': {
        longName: 'Move FP bits to integer register',
        summary:
            'Copies the raw 32 bits of the second register into the first without converting them, sign-extending on RV64.'
    },
    'fneg.d': {
        longName: 'FP negate (double)',
        summary:
            'Sets the first register to the negation of the double-precision value in the second.'
    },
    'fneg.s': {
        longName: 'FP negate (single)',
        summary:
            'Sets the first register to the negation of the single-precision value in the second.'
    },
    'fnmadd.d': {
        longName: 'Fused negate multiply add (64 bit)',
        summary:
            'Multiplies the second and third registers, adds the fourth and negates the sum, in double precision with a single rounding, and stores the result in the first.'
    },
    'fnmadd.s': {
        longName: 'Fused negate multiply add',
        summary:
            'Multiplies the second and third registers, adds the fourth and negates the sum, in single precision with a single rounding, and stores the result in the first.'
    },
    'fnmsub.d': {
        longName: 'Fused negated multiply subtract (64 bit)',
        summary:
            'Multiplies the second and third registers, subtracts the fourth and negates the difference, in double precision with a single rounding, and stores the result in the first.'
    },
    'fnmsub.s': {
        longName: 'Fused negated multiply subtract',
        summary:
            'Multiplies the second and third registers, subtracts the fourth and negates the difference, in single precision with a single rounding, and stores the result in the first.'
    },
    frcsr: {
        longName: 'Read FP CSR',
        summary: 'Reads the FP control and status register (fcsr) into a register.'
    },
    frflags: {
        longName: 'Read FP exception flags',
        summary: 'Reads the FP exception flags into a register.'
    },
    frrm: {
        longName: 'Read FP rounding mode',
        summary: 'Reads the FP rounding mode into a register.'
    },
    frsr: {
        longName: 'Read FP control and status register',
        summary: 'Reads the FP control and status register into a register, as an alias of frcsr.'
    },
    fscsr: {
        longName: 'Swap FP CSR',
        summary:
            'Swaps the second register into the FP control and status register, storing its old value in the first, or, when given one register, only writes that register.'
    },
    fsd: {
        longName: 'Store a double to memory',
        summary:
            'Stores the double-precision value in the first register at the address in the second plus an offset.'
    },
    fsflags: {
        longName: 'Swap FP exception flags',
        summary:
            'Swaps the second register into the FP exception flags, storing the old flags in the first, or, when given one register, only writes that register.'
    },
    'fsgnj.d': {
        longName: 'Floating point sign injection (64 bit)',
        summary:
            'Copies the second register into the first with the sign bit taken from the third, in double precision.'
    },
    'fsgnj.s': {
        longName: 'Floating point sign injection',
        summary:
            'Copies the second register into the first with the sign bit taken from the third, in single precision.'
    },
    'fsgnjn.d': {
        longName: 'Floating point sign injection (inverted 64 bit)',
        summary:
            'Copies the second register into the first with the sign bit opposite to that of the third, in double precision.'
    },
    'fsgnjn.s': {
        longName: 'Floating point sign injection (inverted)',
        summary:
            'Copies the second register into the first with the sign bit opposite to that of the third, in single precision.'
    },
    'fsgnjx.d': {
        longName: 'Floating point sign injection (xor 64 bit)',
        summary:
            'Copies the second register into the first with its sign bit XORed with the sign bit of the third, in double precision.'
    },
    'fsgnjx.s': {
        longName: 'Floating point sign injection (xor)',
        summary:
            'Copies the second register into the first with its sign bit XORed with the sign bit of the third, in single precision.'
    },
    'fsqrt.d': {
        longName: 'Floating square root (64 bit)',
        summary:
            'Stores the square root of the double-precision value in the second register in the first.'
    },
    'fsqrt.s': {
        longName: 'Floating square root',
        summary:
            'Stores the square root of the single-precision value in the second register in the first.'
    },
    fsrm: {
        longName: 'Swap FP rounding mode',
        summary:
            'Swaps the second register into the FP rounding mode, storing the old mode in the first, or, when given one register, only writes that register.'
    },
    fssr: {
        longName: 'Swap FP control and status register',
        summary:
            'Swaps the second register into the FP control and status register, storing its old value in the first, as an alias of fscsr.'
    },
    'fsub.d': {
        longName: 'Floating subtract (64 bit)',
        summary:
            'Subtracts the third register from the second in double precision and stores the difference in the first.'
    },
    'fsub.s': {
        longName: 'Floating subtract',
        summary:
            'Subtracts the third register from the second in single precision and stores the difference in the first.'
    },
    fsw: {
        longName: 'Store a float to memory',
        summary:
            'Stores the single-precision value in the first register at the address in the second plus an offset.'
    },
    j: { longName: 'Jump', summary: 'Jumps to label.' },
    jal: {
        longName: 'Jump and link',
        summary:
            'Saves the return address in a register and jumps to label, or saves it in ra when only a label is given.'
    },
    jalr: {
        longName: 'Jump and link register',
        summary:
            'Saves the return address in the first register and jumps to the address in the second plus an offset, or with one register links through ra.'
    },
    jr: { longName: 'Jump register', summary: 'Jumps to the address held in a register.' },
    la: { longName: 'Load address', summary: 'Loads the address of label into a register.' },
    lb: {
        longName: 'Load byte',
        summary:
            'Loads the byte at the address in the second register plus an offset into the first, sign-extended to the register width.'
    },
    lbu: {
        longName: 'Load byte unsigned',
        summary:
            'Loads the byte at the address in the second register plus an offset into the first, zero-extended to the register width.'
    },
    ld: {
        longName: 'Load double word',
        summary:
            'Loads the 64-bit double word at the address in the second register plus an offset into the first.'
    },
    lh: {
        longName: 'Load halfword',
        summary:
            'Loads the 16-bit halfword at the address in the second register plus an offset into the first, sign-extended to the register width.'
    },
    lhu: {
        longName: 'Load halfword unsigned',
        summary:
            'Loads the 16-bit halfword at the address in the second register plus an offset into the first, zero-extended to the register width.'
    },
    li: {
        longName: 'Load immediate',
        summary:
            'Loads an immediate constant into a register, using as many instructions as the value needs.'
    },
    'lr.d': {
        longName: 'Load reserved (double word)',
        summary:
            'Loads the double word at the address in the second register into the first and reserves that address for a following sc.d.'
    },
    'lr.w': {
        longName: 'Load reserved (word)',
        summary:
            'Loads the word at the address in the second register into the first and reserves that address for a following sc.w.'
    },
    lui: {
        longName: 'Load upper immediate',
        summary: 'Sets a register to a 20-bit immediate followed by 12 zero bits.'
    },
    lw: {
        longName: 'Load word',
        summary:
            'Loads the 32-bit word at the address in the second register plus an offset into the first, sign-extended on RV64.'
    },
    lwu: {
        longName: 'Load word unsigned',
        summary:
            'Loads the 32-bit word at the address in the second register plus an offset into the first, zero-extended to 64 bits.'
    },
    max: {
        longName: 'Maximum (signed)',
        summary:
            'Sets the first register to the larger of the second and third, comparing as signed.'
    },
    maxu: {
        longName: 'Maximum (unsigned)',
        summary:
            'Sets the first register to the larger of the second and third, comparing as unsigned.'
    },
    min: {
        longName: 'Minimum (signed)',
        summary:
            'Sets the first register to the smaller of the second and third, comparing as signed.'
    },
    minu: {
        longName: 'Minimum (unsigned)',
        summary:
            'Sets the first register to the smaller of the second and third, comparing as unsigned.'
    },
    mul: {
        longName: 'Multiply',
        summary:
            'Multiplies the second register by the third and stores the low register-width bits of the product in the first.'
    },
    mulh: {
        longName: 'Multiply high (signed × signed)',
        summary:
            'Multiplies the second register by the third, both signed, and stores the high register-width bits of the product in the first.'
    },
    mulhsu: {
        longName: 'Multiply high (signed × unsigned)',
        summary:
            'Multiplies the second register, as signed, by the third, as unsigned, and stores the high register-width bits of the product in the first.'
    },
    mulhu: {
        longName: 'Multiply high (unsigned × unsigned)',
        summary:
            'Multiplies the second register by the third, both unsigned, and stores the high register-width bits of the product in the first.'
    },
    mulw: {
        longName: 'Multiply word (32-bit)',
        summary:
            'Multiplies the low 32 bits of the second and third registers and sign-extends the low 32 bits of the product into the first.'
    },
    mv: { longName: 'Move', summary: 'Copies the value of the second register into the first.' },
    neg: {
        longName: 'Negate',
        summary: 'Sets the first register to the arithmetic negation of the second.'
    },
    negw: {
        longName: 'Negate word (32-bit)',
        summary:
            'Sets the first register to the negation of the low 32 bits of the second, sign-extended.'
    },
    nop: {
        longName: 'No operation',
        summary: 'Does nothing and moves on to the next instruction.'
    },
    not: {
        longName: 'Bitwise NOT (bit inversion)',
        summary: 'Sets the first register to the bitwise NOT of the second, flipping every bit.'
    },
    or: {
        longName: 'Bitwise OR',
        summary: 'Sets the first register to the bitwise OR of the second and third.'
    },
    'orc.b': {
        longName: 'Bitwise OR combine within bytes',
        summary:
            'Sets each byte of the first register to all 1 bits if the matching byte of the second is nonzero, and to 0 otherwise.'
    },
    ori: {
        longName: 'Bitwise OR immediate',
        summary:
            'Sets the first register to the bitwise OR of the second and a sign-extended 12-bit immediate.'
    },
    orn: {
        longName: 'OR with inverted operand',
        summary:
            'Sets the first register to the bitwise OR of the second and the bitwise NOT of the third.'
    },
    rdcycle: {
        longName: 'Read cycle counter',
        summary: 'Reads the cycle counter into a register.'
    },
    rdcycleh: {
        longName: 'Read cycle counter (upper 32 bits)',
        summary: 'Reads the upper 32 bits of the cycle counter into a register (RV32 only).'
    },
    rdinstret: {
        longName: 'Read instructions retired',
        summary: 'Reads the count of retired instructions into a register.'
    },
    rdinstreth: {
        longName: 'Read instructions retired (upper 32 bits)',
        summary:
            'Reads the upper 32 bits of the retired-instruction count into a register (RV32 only).'
    },
    rdtime: {
        longName: 'Read time counter',
        summary: 'Reads the real-time counter into a register.'
    },
    rdtimeh: {
        longName: 'Read time counter (upper 32 bits)',
        summary: 'Reads the upper 32 bits of the real-time counter into a register (RV32 only).'
    },
    rem: {
        longName: 'Remainder',
        summary:
            'Sets the first register to the remainder of the second divided by the third, as signed integers.'
    },
    remu: {
        longName: 'Remainder unsigned',
        summary:
            'Sets the first register to the remainder of the second divided by the third, as unsigned integers.'
    },
    remuw: {
        longName: 'Remainder unsigned word (32-bit)',
        summary:
            'Sets the first register to the remainder of the low 32 bits of the second divided by those of the third, as unsigned values, sign-extended.'
    },
    remw: {
        longName: 'Remainder word (32-bit)',
        summary:
            'Sets the first register to the remainder of the low 32 bits of the second divided by those of the third, as signed values, sign-extended.'
    },
    ret: {
        longName: 'Return',
        summary: 'Returns from a subroutine by jumping to the address in ra.'
    },
    rev8: {
        longName: 'Reverse bytes',
        summary:
            'Copies the second register into the first with its bytes in reverse order, converting between little and big endian.'
    },
    rol: {
        longName: 'Rotate left',
        summary:
            'Rotates the second register left by the amount in the low bits of the third and stores the result in the first.'
    },
    rolw: {
        longName: 'Rotate left word (32-bit)',
        summary:
            'Rotates the low 32 bits of the second register left by the low 5 bits of the third and sign-extends the result into the first.'
    },
    ror: {
        longName: 'Rotate right',
        summary:
            'Rotates the second register right by the amount in the low bits of the third and stores the result in the first.'
    },
    rori: {
        longName: 'Rotate right by immediate',
        summary:
            'Rotates the second register right by an immediate amount and stores the result in the first.'
    },
    roriw: {
        longName: 'Rotate right immediate word (32-bit)',
        summary:
            'Rotates the low 32 bits of the second register right by an immediate amount and sign-extends the result into the first.'
    },
    rorw: {
        longName: 'Rotate right word (32-bit)',
        summary:
            'Rotates the low 32 bits of the second register right by the low 5 bits of the third and sign-extends the result into the first.'
    },
    sb: {
        longName: 'Store byte',
        summary:
            'Stores the low 8 bits of the first register at the address in the second plus an offset.'
    },
    'sc.d': {
        longName: 'Store conditional (double word)',
        summary:
            'Stores the second register at the address in the third only if the reservation from lr.d still holds, and sets the first to 0 on success or 1 on failure.'
    },
    'sc.w': {
        longName: 'Store conditional (word)',
        summary:
            'Stores the second register at the address in the third only if the reservation from lr.w still holds, and sets the first to 0 on success or 1 on failure.'
    },
    sd: {
        longName: 'Store double word',
        summary:
            'Stores the 64-bit value of the first register at the address in the second plus an offset.'
    },
    seqz: {
        longName: 'Set equal to zero',
        summary: 'Sets the first register to 1 if the second is zero, otherwise to 0.'
    },
    'sext.b': {
        longName: 'Sign extend byte',
        summary:
            'Sets the first register to the low byte of the second, sign-extended to the register width.'
    },
    'sext.h': {
        longName: 'Sign extend halfword',
        summary:
            'Sets the first register to the low 16 bits of the second, sign-extended to the register width.'
    },
    'sext.w': {
        longName: 'Sign extend word',
        summary:
            'Sets the first register to the low 32 bits of the second, sign-extended to 64 bits.'
    },
    sgt: {
        longName: 'Set greater than',
        summary:
            'Sets the first register to 1 if the second is greater than the third as signed integers, otherwise to 0.'
    },
    sgtu: {
        longName: 'Set greater than unsigned',
        summary:
            'Sets the first register to 1 if the second is greater than the third as unsigned integers, otherwise to 0.'
    },
    sgtz: {
        longName: 'Set greater than zero',
        summary: 'Sets the first register to 1 if the second is greater than zero, otherwise to 0.'
    },
    sh: {
        longName: 'Store halfword',
        summary:
            'Stores the low 16 bits of the first register at the address in the second plus an offset.'
    },
    sh1add: {
        longName: 'Shift left by 1 and add',
        summary: 'Sets the first register to the second shifted left by 1, plus the third.'
    },
    'sh1add.uw': {
        longName: 'Shift unsigned word left by 1 and add',
        summary:
            'Sets the first register to the low 32 bits of the second, zero-extended and shifted left by 1, plus the third.'
    },
    sh2add: {
        longName: 'Shift left by 2 and add',
        summary: 'Sets the first register to the second shifted left by 2, plus the third.'
    },
    'sh2add.uw': {
        longName: 'Shift unsigned word left by 2 and add',
        summary:
            'Sets the first register to the low 32 bits of the second, zero-extended and shifted left by 2, plus the third.'
    },
    sh3add: {
        longName: 'Shift left by 3 and add',
        summary: 'Sets the first register to the second shifted left by 3, plus the third.'
    },
    'sh3add.uw': {
        longName: 'Shift unsigned word left by 3 and add',
        summary:
            'Sets the first register to the low 32 bits of the second, zero-extended and shifted left by 3, plus the third.'
    },
    sll: {
        longName: 'Shift left logical',
        summary:
            'Shifts the second register left by the amount in the low 5 bits of the third (6 on RV64) and stores the result in the first.'
    },
    slli: {
        longName: 'Shift left logical immediate',
        summary:
            'Shifts the second register left by an immediate amount and stores the result in the first.'
    },
    'slli.uw': {
        longName: 'Shift unsigned word left by immediate',
        summary:
            'Sets the first register to the low 32 bits of the second, zero-extended and shifted left by an immediate amount.'
    },
    slliw: {
        longName: 'Shift left logical immediate word (32-bit)',
        summary:
            'Shifts the low 32 bits of the second register left by an immediate amount and sign-extends the result into the first.'
    },
    sllw: {
        longName: 'Shift left logical word (32-bit)',
        summary:
            'Shifts the low 32 bits of the second register left by the amount in the low 5 bits of the third and sign-extends the result into the first.'
    },
    slt: {
        longName: 'Set less than',
        summary:
            'Sets the first register to 1 if the second is less than the third as signed integers, otherwise to 0.'
    },
    slti: {
        longName: 'Set less than immediate',
        summary:
            'Sets the first register to 1 if the second is less than a sign-extended 12-bit immediate as signed, otherwise to 0.'
    },
    sltiu: {
        longName: 'Set less than immediate unsigned',
        summary:
            'Sets the first register to 1 if the second is less than a sign-extended 12-bit immediate as unsigned, otherwise to 0.'
    },
    sltu: {
        longName: 'Set if less than unsigned',
        summary:
            'Sets the first register to 1 if the second is less than the third as unsigned integers, otherwise to 0.'
    },
    sltz: {
        longName: 'Set less than zero',
        summary: 'Sets the first register to 1 if the second is less than zero, otherwise to 0.'
    },
    snez: {
        longName: 'Set not equal to zero',
        summary: 'Sets the first register to 1 if the second is nonzero, otherwise to 0.'
    },
    sra: {
        longName: 'Shift right arithmetic',
        summary:
            'Shifts the second register right by the amount in the low 5 bits of the third (6 on RV64), filling with the sign bit, and stores the result in the first.'
    },
    srai: {
        longName: 'Shift right arithmetic immediate',
        summary:
            'Shifts the second register right by an immediate amount, filling with the sign bit, and stores the result in the first.'
    },
    sraiw: {
        longName: 'Shift right arithmetic immediate word (32-bit)',
        summary:
            'Shifts the low 32 bits of the second register right by an immediate amount, filling with the sign bit, and sign-extends into the first.'
    },
    sraw: {
        longName: 'Shift right arithmetic word (32-bit)',
        summary:
            'Shifts the low 32 bits of the second register right by the amount in the low 5 bits of the third, filling with the sign bit, and sign-extends into the first.'
    },
    srl: {
        longName: 'Shift right logical',
        summary:
            'Shifts the second register right by the amount in the low 5 bits of the third (6 on RV64), filling with zeros, and stores the result in the first.'
    },
    srli: {
        longName: 'Shift right logical immediate',
        summary:
            'Shifts the second register right by an immediate amount, filling with zeros, and stores the result in the first.'
    },
    srliw: {
        longName: 'Shift right logical immediate word (32-bit)',
        summary:
            'Shifts the low 32 bits of the second register right by an immediate amount, filling with zeros, and sign-extends the result into the first.'
    },
    srlw: {
        longName: 'Shift right logical word (32-bit)',
        summary:
            'Shifts the low 32 bits of the second register right by the amount in the low 5 bits of the third, filling with zeros, and sign-extends into the first.'
    },
    sub: {
        longName: 'Subtraction',
        summary:
            'Subtracts the third register from the second and stores the difference in the first.'
    },
    subw: {
        longName: 'Subtract word (32-bit)',
        summary:
            'Subtracts the third register from the low 32 bits of the second and sign-extends the 32-bit difference into the first.'
    },
    sw: {
        longName: 'Store word',
        summary:
            'Stores the low 32 bits of the first register at the address in the second plus an offset.'
    },
    tail: {
        longName: 'Tail call',
        summary: 'Jumps to the far-away subroutine at label without saving a return address.'
    },
    uret: {
        longName: 'User-mode trap return',
        summary: 'Returns from a user-mode interrupt or exception handler to the address in uepc.'
    },
    wfi: {
        longName: 'Wait for interrupt',
        summary:
            'Waits for an interrupt enabled in uie, such as the timer reaching timecmp or a keyboard interrupt. Executes no instructions while waiting.'
    },
    xnor: {
        longName: 'Exclusive NOR',
        summary:
            'Sets the first register to the bitwise NOT of the XOR of the second and third, so each bit is 1 where they agree.'
    },
    xor: {
        longName: 'Bitwise XOR',
        summary: 'Sets the first register to the bitwise XOR of the second and third.'
    },
    xori: {
        longName: 'Bitwise XOR immediate',
        summary:
            'Sets the first register to the bitwise XOR of the second and a sign-extended 12-bit immediate.'
    },
    'zext.b': {
        longName: 'Zero extend byte',
        summary:
            'Sets the first register to the low byte of the second, with the rest of the register cleared.'
    },
    'zext.h': {
        longName: 'Zero extend halfword',
        summary:
            'Sets the first register to the low 16 bits of the second, with the rest of the register cleared.'
    },
    'zext.w': {
        longName: 'Zero extend word',
        summary: 'Sets the first register to the low 32 bits of the second, zero-extended.'
    }
}
