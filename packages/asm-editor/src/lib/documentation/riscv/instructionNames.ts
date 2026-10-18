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
    add: { longName: 'Addition', summary: 'Adds t2 and t3 and stores the sum in t1.' },
    'add.uw': {
        longName: 'Add unsigned word',
        summary: 'Sets t1 to the low 32 bits of t2, zero-extended, plus t3 (RV64 only).'
    },
    addi: {
        longName: 'Addition immediate',
        summary: 'Adds a sign-extended 12-bit immediate to t2 and stores the sum in t1.'
    },
    addiw: {
        longName: 'Add immediate word (32-bit)',
        summary:
            'Adds a signed 12-bit immediate to the low 32 bits of t2 and sign-extends the sum into t1 (RV64 only).'
    },
    addw: {
        longName: 'Add word (32-bit)',
        summary:
            'Adds the low 32 bits of t2 and t3 and sign-extends the 32-bit sum into t1 (RV64 only).'
    },
    'amoadd.d': {
        longName: 'Atomic add double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores the sum of that value and t2 back there, atomically (RV64 only).'
    },
    'amoadd.w': {
        longName: 'Atomic add word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores the sum of that value and t2 back there, atomically.'
    },
    'amoand.d': {
        longName: 'Atomic and double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores its bitwise AND with t2 back there, atomically (RV64 only).'
    },
    'amoand.w': {
        longName: 'Atomic and word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores its bitwise AND with t2 back there, atomically.'
    },
    'amomax.d': {
        longName: 'Atomic signed maximum double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores the larger of it and t2 there, compared as signed, atomically (RV64 only).'
    },
    'amomax.w': {
        longName: 'Atomic signed maximum word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores the larger of it and t2 back there, compared as signed, atomically.'
    },
    'amomaxu.d': {
        longName: 'Atomic unsigned maximum double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores the larger of it and t2 there, compared as unsigned, atomically (RV64 only).'
    },
    'amomaxu.w': {
        longName: 'Atomic unsigned maximum word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores the larger of it and t2 back there, compared as unsigned, atomically.'
    },
    'amomin.d': {
        longName: 'Atomic signed minimum double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores the smaller of it and t2 there, compared as signed, atomically (RV64 only).'
    },
    'amomin.w': {
        longName: 'Atomic signed minimum word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores the smaller of it and t2 back there, compared as signed, atomically.'
    },
    'amominu.d': {
        longName: 'Atomic unsigned minimum double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores the smaller of it and t2 there, compared as unsigned, atomically (RV64 only).'
    },
    'amominu.w': {
        longName: 'Atomic unsigned minimum word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores the smaller of it and t2 back there, compared as unsigned, atomically.'
    },
    'amoor.d': {
        longName: 'Atomic or double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores its bitwise OR with t2 there, atomically (RV64 only).'
    },
    'amoor.w': {
        longName: 'Atomic or word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores its bitwise OR with t2 back there, atomically.'
    },
    'amoswap.d': {
        longName: 'Atomic swap double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores t2 there, atomically (RV64 only).'
    },
    'amoswap.w': {
        longName: 'Atomic swap word (32-bit)',
        summary: 'Loads the word at the address in t3 into t1 and stores t2 there, atomically.'
    },
    'amoxor.d': {
        longName: 'Atomic xor double word (64-bit)',
        summary:
            'Loads the double word at the address in t3 into t1 and stores its bitwise XOR with t2 there, atomically (RV64 only).'
    },
    'amoxor.w': {
        longName: 'Atomic xor word (32-bit)',
        summary:
            'Loads the word at the address in t3 into t1 and stores its bitwise XOR with t2 back there, atomically.'
    },
    and: { longName: 'Bitwise AND', summary: 'Sets t1 to the bitwise AND of t2 and t3.' },
    andi: {
        longName: 'Bitwise AND immediate',
        summary: 'Sets t1 to the bitwise AND of t2 and a sign-extended 12-bit immediate.'
    },
    andn: {
        longName: 'AND with inverted operand',
        summary: 'Sets t1 to the bitwise AND of t2 and the bitwise NOT of t3.'
    },
    auipc: {
        longName: 'Add upper immediate to PC',
        summary:
            'Adds an upper 20-bit immediate, shifted left by 12 bits, to the PC and stores the result in t1.'
    },
    b: { longName: 'Branch', summary: 'Branches unconditionally to label.' },
    bclr: {
        longName: 'Clear bit',
        summary: 'Sets t1 to t2 with the bit whose index is in the low bits of t3 cleared.'
    },
    bclri: {
        longName: 'Clear bit by immediate',
        summary: 'Sets t1 to t2 with the bit numbered by the immediate cleared.'
    },
    beq: { longName: 'Branch if equal', summary: 'Branches to label if t1 equals t2.' },
    beqz: { longName: 'Branch if equal to zero', summary: 'Branches to label if t1 is zero.' },
    bext: {
        longName: 'Extract bit',
        summary:
            'Sets t1 to the value, 0 or 1, of the bit of t2 whose index is in the low bits of t3.'
    },
    bexti: {
        longName: 'Extract bit by immediate',
        summary: 'Sets t1 to the value, 0 or 1, of the bit of t2 numbered by the immediate.'
    },
    bge: {
        longName: 'Branch if greater than or equal',
        summary: 'Branches to label if t1 is greater than or equal to t2, comparing as signed.'
    },
    bgeu: {
        longName: 'Branch if greater than or equal (unsigned)',
        summary: 'Branches to label if t1 is greater than or equal to t2, comparing as unsigned.'
    },
    bgez: {
        longName: 'Branch if greater than or equal to zero',
        summary: 'Branches to label if t1 is greater than or equal to zero.'
    },
    bgt: {
        longName: 'Branch if greater than',
        summary: 'Branches to label if t1 is greater than t2, comparing as signed.'
    },
    bgtu: {
        longName: 'Branch if greater than (unsigned)',
        summary: 'Branches to label if t1 is greater than t2, comparing as unsigned.'
    },
    bgtz: {
        longName: 'Branch if greater than zero',
        summary: 'Branches to label if t1 is greater than zero.'
    },
    binv: {
        longName: 'Invert bit',
        summary: 'Sets t1 to t2 with the bit whose index is in the low bits of t3 flipped.'
    },
    binvi: {
        longName: 'Invert bit by immediate',
        summary: 'Sets t1 to t2 with the bit numbered by the immediate flipped.'
    },
    ble: {
        longName: 'Branch if less than or equal',
        summary: 'Branches to label if t1 is less than or equal to t2, comparing as signed.'
    },
    bleu: {
        longName: 'Branch if less than or equal (unsigned)',
        summary: 'Branches to label if t1 is less than or equal to t2, comparing as unsigned.'
    },
    blez: {
        longName: 'Branch if less than or equal to zero',
        summary: 'Branches to label if t1 is less than or equal to zero.'
    },
    blt: {
        longName: 'Branch if less than',
        summary: 'Branches to label if t1 is less than t2, comparing as signed.'
    },
    bltu: {
        longName: 'Branch if less than (unsigned)',
        summary: 'Branches to label if t1 is less than t2, comparing as unsigned.'
    },
    bltz: {
        longName: 'Branch if less than zero',
        summary: 'Branches to label if t1 is less than zero.'
    },
    bne: {
        longName: 'Branch if not equal',
        summary: 'Branches to label if t1 and t2 are not equal.'
    },
    bnez: {
        longName: 'Branch if not equal to zero',
        summary: 'Branches to label if t1 is nonzero.'
    },
    bset: {
        longName: 'Set bit',
        summary: 'Sets t1 to t2 with the bit whose index is in the low bits of t3 set.'
    },
    bseti: {
        longName: 'Set bit by immediate',
        summary: 'Sets t1 to t2 with the bit numbered by the immediate set.'
    },
    call: {
        longName: 'Call',
        summary:
            'Calls the subroutine at label, even when it is too far away for a single jump, and saves the return address in ra.'
    },
    clz: {
        longName: 'Count leading zeros',
        summary:
            'Sets t1 to the number of 0 bits above the most significant 1 bit of t2, or the register width when t2 is zero.'
    },
    clzw: {
        longName: 'Count leading zeros word (32-bit)',
        summary:
            'Sets t1 to the number of 0 bits above the most significant 1 bit of the low 32 bits of t2, or 32 when they are zero (RV64 only).'
    },
    cpop: { longName: 'Count set bits', summary: 'Sets t1 to the number of 1 bits in t2.' },
    cpopw: {
        longName: 'Count set bits word (32-bit)',
        summary: 'Sets t1 to the number of 1 bits in the low 32 bits of t2 (RV64 only).'
    },
    csrc: {
        longName: 'Clear bits in control and status register',
        summary: 'Clears the CSR bits that are set in t1, leaving the other bits unchanged.'
    },
    csrci: {
        longName: 'Clear bits in CSR immediate',
        summary:
            'Clears the CSR bits that are set in a 5-bit constant, leaving the other bits unchanged.'
    },
    csrr: {
        longName: 'Read control and status register',
        summary: 'Reads the CSR into t1 without writing to it.'
    },
    csrrc: {
        longName: 'Atomic read/clear CSR',
        summary:
            'Reads the CSR into t0 and clears the CSR bits that are set in t1, as one atomic step.'
    },
    csrrci: {
        longName: 'Atomic read/clear CSR immediate',
        summary:
            'Reads the CSR into t0 and clears the CSR bits that are set in a 5-bit constant, as one atomic step.'
    },
    csrrs: {
        longName: 'Atomic read/set CSR',
        summary:
            'Reads the CSR into t0 and sets the CSR bits that are set in t1, as one atomic step.'
    },
    csrrsi: {
        longName: 'Atomic read/set CSR immediate',
        summary:
            'Reads the CSR into t0 and sets the CSR bits that are set in a 5-bit constant, as one atomic step.'
    },
    csrrw: {
        longName: 'Atomic read/write CSR',
        summary: 'Reads the CSR into t0 and writes t1 into it, as one atomic step.'
    },
    csrrwi: {
        longName: 'Atomic read/write CSR immediate',
        summary: 'Reads the CSR into t0 and writes a 5-bit constant into it, as one atomic step.'
    },
    csrs: {
        longName: 'Set bits in control and status register',
        summary: 'Sets the CSR bits that are set in t1, leaving the other bits unchanged.'
    },
    csrsi: {
        longName: 'Set bits in CSR immediate',
        summary:
            'Sets the CSR bits that are set in a 5-bit constant, leaving the other bits unchanged.'
    },
    csrw: {
        longName: 'Write control and status register',
        summary: 'Writes t1 into the CSR and discards the value it held before.'
    },
    csrwi: {
        longName: 'Write CSR immediate',
        summary: 'Writes a 5-bit constant into the CSR and discards the value it held before.'
    },
    ctz: {
        longName: 'Count trailing zeros',
        summary:
            'Sets t1 to the number of 0 bits below the least significant 1 bit of t2, or the register width when t2 is zero.'
    },
    ctzw: {
        longName: 'Count trailing zeros word (32-bit)',
        summary:
            'Sets t1 to the number of 0 bits below the least significant 1 bit of the low 32 bits of t2, or 32 when they are zero (RV64 only).'
    },
    div: {
        longName: 'Divide',
        summary: 'Divides t2 by t3 as signed integers and stores the quotient in t1.'
    },
    divu: {
        longName: 'Divide unsigned',
        summary: 'Divides t2 by t3 as unsigned integers and stores the quotient in t1.'
    },
    divuw: {
        longName: 'Divide unsigned word (32-bit)',
        summary:
            'Divides the low 32 bits of t2 by those of t3 as unsigned values and sign-extends the quotient into t1 (RV64 only).'
    },
    divw: {
        longName: 'Divide word (32-bit)',
        summary:
            'Divides the low 32 bits of t2 by those of t3 as signed values and sign-extends the quotient into t1 (RV64 only).'
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
        summary: 'Sets f1 to the absolute value of the double-precision value in f2.'
    },
    'fabs.s': {
        longName: 'FP absolute value (single)',
        summary: 'Sets f1 to the absolute value of the single-precision value in f2.'
    },
    'fadd.d': {
        longName: 'Floating add (64 bit)',
        summary: 'Adds the double-precision values in f2 and f3 and stores the sum in f1.'
    },
    'fadd.s': {
        longName: 'Floating add',
        summary: 'Adds the single-precision values in f2 and f3 and stores the sum in f1.'
    },
    'fclass.d': {
        longName: 'Classify a floating point number (64 bit)',
        summary:
            'Sets t1 to a bit mask that identifies the class of the double-precision value in f1, such as NaN or zero.'
    },
    'fclass.s': {
        longName: 'Classify a floating point number',
        summary:
            'Sets t1 to a bit mask that identifies the class of the single-precision value in f1, such as NaN or zero.'
    },
    'fcvt.d.l': {
        longName: 'Convert double from signed 64 bit integer',
        summary:
            'Converts the signed 64-bit integer in t1 to double precision and stores it in f1 (RV64 only).'
    },
    'fcvt.d.lu': {
        longName: 'Convert double from unsigned 64 bit integer',
        summary:
            'Converts the unsigned 64-bit integer in t1 to double precision and stores it in f1 (RV64 only).'
    },
    'fcvt.d.s': {
        longName: 'Convert a float to a double',
        summary:
            'Converts the single-precision value in f2 to double precision and stores it in f1.'
    },
    'fcvt.d.w': {
        longName: 'Convert double from signed integer',
        summary: 'Converts the signed 32-bit integer in t1 to double precision and stores it in f1.'
    },
    'fcvt.d.wu': {
        longName: 'Convert double from unsigned integer',
        summary:
            'Converts the unsigned 32-bit integer in t1 to double precision and stores it in f1.'
    },
    'fcvt.l.d': {
        longName: 'Convert signed 64 bit integer from double',
        summary:
            'Rounds the double-precision value in f1 to a signed 64-bit integer and stores it in t1 (RV64 only).'
    },
    'fcvt.l.s': {
        longName: 'Convert signed 64 bit integer from float',
        summary:
            'Rounds the single-precision value in f1 to a signed 64-bit integer and stores it in t1 (RV64 only).'
    },
    'fcvt.lu.d': {
        longName: 'Convert unsigned 64 bit integer from double',
        summary:
            'Rounds the double-precision value in f1 to an unsigned 64-bit integer and stores it in t1 (RV64 only).'
    },
    'fcvt.lu.s': {
        longName: 'Convert unsigned 64 bit integer from float',
        summary:
            'Rounds the single-precision value in f1 to an unsigned 64-bit integer and stores it in t1 (RV64 only).'
    },
    'fcvt.s.d': {
        longName: 'Convert a double to a float',
        summary:
            'Converts the double-precision value in f2 to single precision and stores it in f1.'
    },
    'fcvt.s.l': {
        longName: 'Convert float from signed 64 bit integer',
        summary:
            'Converts the signed 64-bit integer in t1 to single precision and stores it in f1 (RV64 only).'
    },
    'fcvt.s.lu': {
        longName: 'Convert float from unsigned 64 bit integer',
        summary:
            'Converts the unsigned 64-bit integer in t1 to single precision and stores it in f1 (RV64 only).'
    },
    'fcvt.s.w': {
        longName: 'Convert float from signed integer',
        summary: 'Converts the signed 32-bit integer in t1 to single precision and stores it in f1.'
    },
    'fcvt.s.wu': {
        longName: 'Convert float from unsigned integer',
        summary:
            'Converts the unsigned 32-bit integer in t1 to single precision and stores it in f1.'
    },
    'fcvt.w.d': {
        longName: 'Convert signed integer from double',
        summary:
            'Rounds the double-precision value in f1 to a signed 32-bit integer and stores it in t1.'
    },
    'fcvt.w.s': {
        longName: 'Convert signed integer from float',
        summary:
            'Rounds the single-precision value in f1 to a signed 32-bit integer and stores it in t1.'
    },
    'fcvt.wu.d': {
        longName: 'Convert unsigned integer from double',
        summary:
            'Rounds the double-precision value in f1 to an unsigned 32-bit integer and stores it in t1.'
    },
    'fcvt.wu.s': {
        longName: 'Convert unsigned integer from float',
        summary:
            'Rounds the single-precision value in f1 to an unsigned 32-bit integer and stores it in t1.'
    },
    'fdiv.d': {
        longName: 'Floating divide (64 bit)',
        summary: 'Divides f2 by f3 in double precision and stores the quotient in f1.'
    },
    'fdiv.s': {
        longName: 'Floating divide',
        summary: 'Divides f2 by f3 in single precision and stores the quotient in f1.'
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
            'Sets t1 to 1 if the double-precision values in f1 and f2 are equal, otherwise to 0.'
    },
    'feq.s': {
        longName: 'Floating equal',
        summary:
            'Sets t1 to 1 if the single-precision values in f1 and f2 are equal, otherwise to 0.'
    },
    'fge.d': {
        longName: 'Floating greater than or equal (64 bit)',
        summary:
            'Sets t1 to 1 if the double-precision value in f2 is greater than or equal to f3, otherwise to 0.'
    },
    'fge.s': {
        longName: 'Floating greater than or equal',
        summary:
            'Sets t1 to 1 if the single-precision value in f2 is greater than or equal to f3, otherwise to 0.'
    },
    'fgt.d': {
        longName: 'Floating greater than (64 bit)',
        summary:
            'Sets t1 to 1 if the double-precision value in f2 is greater than f3, otherwise to 0.'
    },
    'fgt.s': {
        longName: 'Floating greater than',
        summary:
            'Sets t1 to 1 if the single-precision value in f2 is greater than f3, otherwise to 0.'
    },
    fld: {
        longName: 'Load a double from memory',
        summary: 'Loads a double-precision value from the address in t1 plus an offset into f1.'
    },
    'fle.d': {
        longName: 'Floating less than or equal (64 bit)',
        summary:
            'Sets t1 to 1 if the double-precision value in f1 is less than or equal to f2, otherwise to 0.'
    },
    'fle.s': {
        longName: 'Floating less than or equal',
        summary:
            'Sets t1 to 1 if the single-precision value in f1 is less than or equal to f2, otherwise to 0.'
    },
    'flt.d': {
        longName: 'Floating less than (64 bit)',
        summary: 'Sets t1 to 1 if the double-precision value in f1 is less than f2, otherwise to 0.'
    },
    'flt.s': {
        longName: 'Floating less than',
        summary: 'Sets t1 to 1 if the single-precision value in f1 is less than f2, otherwise to 0.'
    },
    flw: {
        longName: 'Load a float from memory',
        summary: 'Loads a single-precision value from the address in t1 plus an offset into f1.'
    },
    'fmadd.d': {
        longName: 'Fused multiply add (64 bit)',
        summary:
            'Computes f2 times f3 plus f4 in double precision, with a single rounding, and stores it in f1.'
    },
    'fmadd.s': {
        longName: 'Fused multiply add',
        summary:
            'Computes f2 times f3 plus f4 in single precision, with a single rounding, and stores it in f1.'
    },
    'fmax.d': {
        longName: 'Floating maximum (64 bit)',
        summary: 'Stores the larger of the double-precision values f2 and f3 in f1.'
    },
    'fmax.s': {
        longName: 'Floating maximum',
        summary: 'Stores the larger of the single-precision values f2 and f3 in f1.'
    },
    'fmin.d': {
        longName: 'Floating minimum (64 bit)',
        summary: 'Stores the smaller of the double-precision values f2 and f3 in f1.'
    },
    'fmin.s': {
        longName: 'Floating minimum',
        summary: 'Stores the smaller of the single-precision values f2 and f3 in f1.'
    },
    'fmsub.d': {
        longName: 'Fused multiply subtract (64 bit)',
        summary:
            'Computes f2 times f3 minus f4 in double precision, with a single rounding, and stores it in f1.'
    },
    'fmsub.s': {
        longName: 'Fused multiply subtract',
        summary:
            'Computes f2 times f3 minus f4 in single precision, with a single rounding, and stores it in f1.'
    },
    'fmul.d': {
        longName: 'Floating multiply (64 bit)',
        summary: 'Multiplies f2 and f3 in double precision and stores the product in f1.'
    },
    'fmul.s': {
        longName: 'Floating multiply',
        summary: 'Multiplies f2 and f3 in single precision and stores the product in f1.'
    },
    'fmv.d': {
        longName: 'Copy FP register (double)',
        summary: 'Copies the double-precision value in f2 into f1.'
    },
    'fmv.d.x': {
        longName: 'Move integer bits to FP register (double)',
        summary: 'Copies the raw 64 bits of t1 into f1 without converting them (RV64 only).'
    },
    'fmv.s': {
        longName: 'Copy FP register (single)',
        summary: 'Copies the single-precision value in f2 into f1.'
    },
    'fmv.s.x': {
        longName: 'Move integer bits to single FP (old name)',
        summary:
            'Copies the raw low 32 bits of t1 into f1 without converting them, as the older name of fmv.w.x.'
    },
    'fmv.w.x': {
        longName: 'Move integer bits to FP register',
        summary: 'Copies the raw low 32 bits of t1 into f1 without converting them.'
    },
    'fmv.x.d': {
        longName: 'Move FP bits to integer register (double)',
        summary: 'Copies the raw 64 bits of f1 into t1 without converting them (RV64 only).'
    },
    'fmv.x.s': {
        longName: 'Move single FP bits to integer (old name)',
        summary:
            'Copies the raw 32 bits of f1 into t1 without converting them, as the older name of fmv.x.w.'
    },
    'fmv.x.w': {
        longName: 'Move FP bits to integer register',
        summary:
            'Copies the raw 32 bits of f1 into t1 without converting them, sign-extending on RV64.'
    },
    'fneg.d': {
        longName: 'FP negate (double)',
        summary: 'Sets f1 to the negation of the double-precision value in f2.'
    },
    'fneg.s': {
        longName: 'FP negate (single)',
        summary: 'Sets f1 to the negation of the single-precision value in f2.'
    },
    'fnmadd.d': {
        longName: 'Fused negate multiply add (64 bit)',
        summary:
            'Computes -(f2 times f3 plus f4) in double precision, with a single rounding, and stores it in f1.'
    },
    'fnmadd.s': {
        longName: 'Fused negate multiply add',
        summary:
            'Computes -(f2 times f3 plus f4) in single precision, with a single rounding, and stores it in f1.'
    },
    'fnmsub.d': {
        longName: 'Fused negated multiply subtract (64 bit)',
        summary:
            'Computes -(f2 times f3 minus f4) in double precision, with a single rounding, and stores it in f1.'
    },
    'fnmsub.s': {
        longName: 'Fused negated multiply subtract',
        summary:
            'Computes -(f2 times f3 minus f4) in single precision, with a single rounding, and stores it in f1.'
    },
    frcsr: {
        longName: 'Read FP CSR',
        summary: 'Reads the FP control and status register (fcsr) into t1.'
    },
    frflags: {
        longName: 'Read FP exception flags',
        summary: 'Reads the FP exception flags into t1.'
    },
    frrm: { longName: 'Read FP rounding mode', summary: 'Reads the FP rounding mode into t1.' },
    frsr: {
        longName: 'Read FP control and status register',
        summary: 'Reads the FP control and status register into t1, as an alias of frcsr.'
    },
    fscsr: {
        longName: 'Swap FP CSR',
        summary:
            'Swaps t2 into the FP control and status register, storing its old value in t1, or only writes t1 when given one register.'
    },
    fsd: {
        longName: 'Store a double to memory',
        summary: 'Stores the double-precision value in f1 at the address in t1 plus an offset.'
    },
    fsflags: {
        longName: 'Swap FP exception flags',
        summary:
            'Swaps t2 into the FP exception flags, storing the old flags in t1, or only writes t1 when given one register.'
    },
    'fsgnj.d': {
        longName: 'Floating point sign injection (64 bit)',
        summary: 'Copies f2 into f1 with the sign bit taken from f3, in double precision.'
    },
    'fsgnj.s': {
        longName: 'Floating point sign injection',
        summary: 'Copies f2 into f1 with the sign bit taken from f3, in single precision.'
    },
    'fsgnjn.d': {
        longName: 'Floating point sign injection (inverted 64 bit)',
        summary: 'Copies f2 into f1 with the sign bit opposite to that of f3, in double precision.'
    },
    'fsgnjn.s': {
        longName: 'Floating point sign injection (inverted)',
        summary: 'Copies f2 into f1 with the sign bit opposite to that of f3, in single precision.'
    },
    'fsgnjx.d': {
        longName: 'Floating point sign injection (xor 64 bit)',
        summary:
            'Copies f2 into f1 with its sign bit XORed with the sign bit of f3, in double precision.'
    },
    'fsgnjx.s': {
        longName: 'Floating point sign injection (xor)',
        summary:
            'Copies f2 into f1 with its sign bit XORed with the sign bit of f3, in single precision.'
    },
    'fsqrt.d': {
        longName: 'Floating square root (64 bit)',
        summary: 'Stores the square root of the double-precision value in f2 in f1.'
    },
    'fsqrt.s': {
        longName: 'Floating square root',
        summary: 'Stores the square root of the single-precision value in f2 in f1.'
    },
    fsrm: {
        longName: 'Swap FP rounding mode',
        summary:
            'Swaps t2 into the FP rounding mode, storing the old mode in t1, or only writes t1 when given one register.'
    },
    fssr: {
        longName: 'Swap FP control and status register',
        summary:
            'Swaps t2 into the FP control and status register, storing its old value in t1, as an alias of fscsr.'
    },
    'fsub.d': {
        longName: 'Floating subtract (64 bit)',
        summary: 'Subtracts f3 from f2 in double precision and stores the difference in f1.'
    },
    'fsub.s': {
        longName: 'Floating subtract',
        summary: 'Subtracts f3 from f2 in single precision and stores the difference in f1.'
    },
    fsw: {
        longName: 'Store a float to memory',
        summary: 'Stores the single-precision value in f1 at the address in t1 plus an offset.'
    },
    j: { longName: 'Jump', summary: 'Jumps to label.' },
    jal: {
        longName: 'Jump and link',
        summary:
            'Saves the return address in t1 and jumps to label, or saves it in ra when only a label is given.'
    },
    jalr: {
        longName: 'Jump and link register',
        summary:
            'Saves the return address in t1 and jumps to the address in t2 plus an offset, or with one register links through ra.'
    },
    jr: { longName: 'Jump register', summary: 'Jumps to the address held in t0.' },
    la: { longName: 'Load address', summary: 'Loads the address of label into t1.' },
    lb: {
        longName: 'Load byte',
        summary:
            'Loads the byte at the address in t2 plus an offset into t1, sign-extended to the register width.'
    },
    lbu: {
        longName: 'Load byte unsigned',
        summary:
            'Loads the byte at the address in t2 plus an offset into t1, zero-extended to the register width.'
    },
    ld: {
        longName: 'Load double word',
        summary:
            'Loads the 64-bit double word at the address in t2 plus an offset into t1 (RV64 only).'
    },
    lh: {
        longName: 'Load halfword',
        summary:
            'Loads the 16-bit halfword at the address in t2 plus an offset into t1, sign-extended to the register width.'
    },
    lhu: {
        longName: 'Load halfword unsigned',
        summary:
            'Loads the 16-bit halfword at the address in t2 plus an offset into t1, zero-extended to the register width.'
    },
    li: {
        longName: 'Load immediate',
        summary:
            'Loads an immediate constant into t1, using as many instructions as the value needs.'
    },
    'lr.d': {
        longName: 'Load reserved (double word)',
        summary:
            'Loads the double word at the address in t2 into t1 and reserves that address for a following sc.d (RV64 only).'
    },
    'lr.w': {
        longName: 'Load reserved (word)',
        summary:
            'Loads the word at the address in t2 into t1 and reserves that address for a following sc.w.'
    },
    lui: {
        longName: 'Load upper immediate',
        summary: 'Sets t1 to a 20-bit immediate followed by 12 zero bits.'
    },
    lw: {
        longName: 'Load word',
        summary:
            'Loads the 32-bit word at the address in t2 plus an offset into t1, sign-extended on RV64.'
    },
    lwu: {
        longName: 'Load word unsigned',
        summary:
            'Loads the 32-bit word at the address in t2 plus an offset into t1, zero-extended to 64 bits (RV64 only).'
    },
    max: {
        longName: 'Maximum (signed)',
        summary: 'Sets t1 to the larger of t2 and t3, comparing as signed.'
    },
    maxu: {
        longName: 'Maximum (unsigned)',
        summary: 'Sets t1 to the larger of t2 and t3, comparing as unsigned.'
    },
    min: {
        longName: 'Minimum (signed)',
        summary: 'Sets t1 to the smaller of t2 and t3, comparing as signed.'
    },
    minu: {
        longName: 'Minimum (unsigned)',
        summary: 'Sets t1 to the smaller of t2 and t3, comparing as unsigned.'
    },
    mul: {
        longName: 'Multiply',
        summary: 'Multiplies t2 by t3 and stores the low register-width bits of the product in t1.'
    },
    mulh: {
        longName: 'Multiply high (signed × signed)',
        summary:
            'Multiplies t2 by t3, both signed, and stores the high register-width bits of the product in t1.'
    },
    mulhsu: {
        longName: 'Multiply high (signed × unsigned)',
        summary:
            'Multiplies signed t2 by unsigned t3 and stores the high register-width bits of the product in t1.'
    },
    mulhu: {
        longName: 'Multiply high (unsigned × unsigned)',
        summary:
            'Multiplies unsigned t2 by unsigned t3 and stores the high register-width bits of the product in t1.'
    },
    mulw: {
        longName: 'Multiply word (32-bit)',
        summary:
            'Multiplies the low 32 bits of t2 and t3 and sign-extends the low 32 bits of the product into t1 (RV64 only).'
    },
    mv: { longName: 'Move', summary: 'Copies the value of t2 into t1.' },
    neg: { longName: 'Negate', summary: 'Sets t1 to the arithmetic negation of t2.' },
    negw: {
        longName: 'Negate word (32-bit)',
        summary: 'Sets t1 to the negation of the low 32 bits of t2, sign-extended (RV64 only).'
    },
    nop: {
        longName: 'No operation',
        summary: 'Does nothing and moves on to the next instruction.'
    },
    not: {
        longName: 'Bitwise NOT (bit inversion)',
        summary: 'Sets t1 to the bitwise NOT of t2, flipping every bit.'
    },
    or: { longName: 'Bitwise OR', summary: 'Sets t1 to the bitwise OR of t2 and t3.' },
    'orc.b': {
        longName: 'Bitwise OR combine within bytes',
        summary:
            'Sets each byte of t1 to all 1 bits if the matching byte of t2 is nonzero, and to 0 otherwise.'
    },
    ori: {
        longName: 'Bitwise OR immediate',
        summary: 'Sets t1 to the bitwise OR of t2 and a sign-extended 12-bit immediate.'
    },
    orn: {
        longName: 'OR with inverted operand',
        summary: 'Sets t1 to the bitwise OR of t2 and the bitwise NOT of t3.'
    },
    rdcycle: { longName: 'Read cycle counter', summary: 'Reads the cycle counter into t1.' },
    rdcycleh: {
        longName: 'Read cycle counter (upper 32 bits)',
        summary: 'Reads the upper 32 bits of the cycle counter into t1 (RV32 only).'
    },
    rdinstret: {
        longName: 'Read instructions retired',
        summary: 'Reads the count of retired instructions into t1.'
    },
    rdinstreth: {
        longName: 'Read instructions retired (upper 32 bits)',
        summary: 'Reads the upper 32 bits of the retired-instruction count into t1 (RV32 only).'
    },
    rdtime: { longName: 'Read time counter', summary: 'Reads the real-time counter into t1.' },
    rdtimeh: {
        longName: 'Read time counter (upper 32 bits)',
        summary: 'Reads the upper 32 bits of the real-time counter into t1 (RV32 only).'
    },
    rem: {
        longName: 'Remainder',
        summary: 'Sets t1 to the remainder of t2 divided by t3, as signed integers.'
    },
    remu: {
        longName: 'Remainder unsigned',
        summary: 'Sets t1 to the remainder of t2 divided by t3, as unsigned integers.'
    },
    remuw: {
        longName: 'Remainder unsigned word (32-bit)',
        summary:
            'Sets t1 to the remainder of the low 32 bits of t2 divided by those of t3, as unsigned values, sign-extended (RV64 only).'
    },
    remw: {
        longName: 'Remainder word (32-bit)',
        summary:
            'Sets t1 to the remainder of the low 32 bits of t2 divided by those of t3, as signed values, sign-extended (RV64 only).'
    },
    ret: {
        longName: 'Return',
        summary: 'Returns from a subroutine by jumping to the address in ra.'
    },
    rev8: {
        longName: 'Reverse bytes',
        summary:
            'Sets t1 to t2 with its bytes in reverse order, converting between little and big endian.'
    },
    rol: {
        longName: 'Rotate left',
        summary: 'Rotates t2 left by the amount in the low bits of t3 and stores the result in t1.'
    },
    rolw: {
        longName: 'Rotate left word (32-bit)',
        summary:
            'Rotates the low 32 bits of t2 left by the low 5 bits of t3 and sign-extends the result into t1 (RV64 only).'
    },
    ror: {
        longName: 'Rotate right',
        summary: 'Rotates t2 right by the amount in the low bits of t3 and stores the result in t1.'
    },
    rori: {
        longName: 'Rotate right by immediate',
        summary: 'Rotates t2 right by an immediate amount and stores the result in t1.'
    },
    roriw: {
        longName: 'Rotate right immediate word (32-bit)',
        summary:
            'Rotates the low 32 bits of t2 right by an immediate amount and sign-extends the result into t1 (RV64 only).'
    },
    rorw: {
        longName: 'Rotate right word (32-bit)',
        summary:
            'Rotates the low 32 bits of t2 right by the low 5 bits of t3 and sign-extends the result into t1 (RV64 only).'
    },
    sb: {
        longName: 'Store byte',
        summary: 'Stores the low 8 bits of t1 at the address in t2 plus an offset.'
    },
    'sc.d': {
        longName: 'Store conditional (double word)',
        summary:
            'Stores t2 at the address in t3 only if the reservation from lr.d still holds, and sets t1 to 0 on success or 1 on failure (RV64 only).'
    },
    'sc.w': {
        longName: 'Store conditional (word)',
        summary:
            'Stores t2 at the address in t3 only if the reservation from lr.w still holds, and sets t1 to 0 on success or 1 on failure.'
    },
    sd: {
        longName: 'Store double word',
        summary: 'Stores the 64-bit value of t1 at the address in t2 plus an offset (RV64 only).'
    },
    seqz: { longName: 'Set equal to zero', summary: 'Sets t1 to 1 if t2 is zero, otherwise to 0.' },
    'sext.b': {
        longName: 'Sign extend byte',
        summary: 'Sets t1 to the low byte of t2, sign-extended to the register width.'
    },
    'sext.h': {
        longName: 'Sign extend halfword',
        summary: 'Sets t1 to the low 16 bits of t2, sign-extended to the register width.'
    },
    'sext.w': {
        longName: 'Sign extend word',
        summary: 'Sets t1 to the low 32 bits of t2, sign-extended to 64 bits (RV64 only).'
    },
    sgt: {
        longName: 'Set greater than',
        summary: 'Sets t1 to 1 if t2 is greater than t3 as signed integers, otherwise to 0.'
    },
    sgtu: {
        longName: 'Set greater than unsigned',
        summary: 'Sets t1 to 1 if t2 is greater than t3 as unsigned integers, otherwise to 0.'
    },
    sgtz: {
        longName: 'Set greater than zero',
        summary: 'Sets t1 to 1 if t2 is greater than zero, otherwise to 0.'
    },
    sh: {
        longName: 'Store halfword',
        summary: 'Stores the low 16 bits of t1 at the address in t2 plus an offset.'
    },
    sh1add: {
        longName: 'Shift left by 1 and add',
        summary: 'Sets t1 to t2 shifted left by 1, plus t3.'
    },
    'sh1add.uw': {
        longName: 'Shift unsigned word left by 1 and add',
        summary:
            'Sets t1 to the low 32 bits of t2, zero-extended and shifted left by 1, plus t3 (RV64 only).'
    },
    sh2add: {
        longName: 'Shift left by 2 and add',
        summary: 'Sets t1 to t2 shifted left by 2, plus t3.'
    },
    'sh2add.uw': {
        longName: 'Shift unsigned word left by 2 and add',
        summary:
            'Sets t1 to the low 32 bits of t2, zero-extended and shifted left by 2, plus t3 (RV64 only).'
    },
    sh3add: {
        longName: 'Shift left by 3 and add',
        summary: 'Sets t1 to t2 shifted left by 3, plus t3.'
    },
    'sh3add.uw': {
        longName: 'Shift unsigned word left by 3 and add',
        summary:
            'Sets t1 to the low 32 bits of t2, zero-extended and shifted left by 3, plus t3 (RV64 only).'
    },
    sll: {
        longName: 'Shift left logical',
        summary:
            'Shifts t2 left by the amount in the low 5 bits of t3 (6 on RV64) and stores the result in t1.'
    },
    slli: {
        longName: 'Shift left logical immediate',
        summary: 'Shifts t2 left by an immediate amount and stores the result in t1.'
    },
    'slli.uw': {
        longName: 'Shift unsigned word left by immediate',
        summary:
            'Sets t1 to the low 32 bits of t2, zero-extended and shifted left by an immediate amount (RV64 only).'
    },
    slliw: {
        longName: 'Shift left logical immediate word (32-bit)',
        summary:
            'Shifts the low 32 bits of t2 left by an immediate amount and sign-extends the result into t1 (RV64 only).'
    },
    sllw: {
        longName: 'Shift left logical word (32-bit)',
        summary:
            'Shifts the low 32 bits of t2 left by the amount in the low 5 bits of t3 and sign-extends the result into t1 (RV64 only).'
    },
    slt: {
        longName: 'Set less than',
        summary: 'Sets t1 to 1 if t2 is less than t3 as signed integers, otherwise to 0.'
    },
    slti: {
        longName: 'Set less than immediate',
        summary:
            'Sets t1 to 1 if t2 is less than a sign-extended 12-bit immediate as signed, otherwise to 0.'
    },
    sltiu: {
        longName: 'Set less than immediate unsigned',
        summary:
            'Sets t1 to 1 if t2 is less than a sign-extended 12-bit immediate as unsigned, otherwise to 0.'
    },
    sltu: {
        longName: 'Set if less than unsigned',
        summary: 'Sets t1 to 1 if t2 is less than t3 as unsigned integers, otherwise to 0.'
    },
    sltz: {
        longName: 'Set less than zero',
        summary: 'Sets t1 to 1 if t2 is less than zero, otherwise to 0.'
    },
    snez: {
        longName: 'Set not equal to zero',
        summary: 'Sets t1 to 1 if t2 is nonzero, otherwise to 0.'
    },
    sra: {
        longName: 'Shift right arithmetic',
        summary:
            'Shifts t2 right by the amount in the low 5 bits of t3 (6 on RV64), filling with the sign bit, and stores the result in t1.'
    },
    srai: {
        longName: 'Shift right arithmetic immediate',
        summary:
            'Shifts t2 right by an immediate amount, filling with the sign bit, and stores the result in t1.'
    },
    sraiw: {
        longName: 'Shift right arithmetic immediate word (32-bit)',
        summary:
            'Shifts the low 32 bits of t2 right by an immediate amount, filling with the sign bit, and sign-extends into t1 (RV64 only).'
    },
    sraw: {
        longName: 'Shift right arithmetic word (32-bit)',
        summary:
            'Shifts the low 32 bits of t2 right by the amount in the low 5 bits of t3, filling with the sign bit, and sign-extends into t1 (RV64 only).'
    },
    srl: {
        longName: 'Shift right logical',
        summary:
            'Shifts t2 right by the amount in the low 5 bits of t3 (6 on RV64), filling with zeros, and stores the result in t1.'
    },
    srli: {
        longName: 'Shift right logical immediate',
        summary:
            'Shifts t2 right by an immediate amount, filling with zeros, and stores the result in t1.'
    },
    srliw: {
        longName: 'Shift right logical immediate word (32-bit)',
        summary:
            'Shifts the low 32 bits of t2 right by an immediate amount, filling with zeros, and sign-extends the result into t1 (RV64 only).'
    },
    srlw: {
        longName: 'Shift right logical word (32-bit)',
        summary:
            'Shifts the low 32 bits of t2 right by the amount in the low 5 bits of t3, filling with zeros, and sign-extends into t1 (RV64 only).'
    },
    sub: {
        longName: 'Subtraction',
        summary: 'Subtracts t3 from t2 and stores the difference in t1.'
    },
    subw: {
        longName: 'Subtract word (32-bit)',
        summary:
            'Subtracts t3 from the low 32 bits of t2 and sign-extends the 32-bit difference into t1 (RV64 only).'
    },
    sw: {
        longName: 'Store word',
        summary: 'Stores the low 32 bits of t1 at the address in t2 plus an offset.'
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
            'Waits for an interrupt, a hint that lets the processor pause until one is pending.'
    },
    xnor: {
        longName: 'Exclusive NOR',
        summary:
            'Sets t1 to the bitwise NOT of the XOR of t2 and t3, so each bit is 1 where t2 and t3 agree.'
    },
    xor: { longName: 'Bitwise XOR', summary: 'Sets t1 to the bitwise XOR of t2 and t3.' },
    xori: {
        longName: 'Bitwise XOR immediate',
        summary: 'Sets t1 to the bitwise XOR of t2 and a sign-extended 12-bit immediate.'
    },
    'zext.b': {
        longName: 'Zero extend byte',
        summary: 'Sets t1 to the low byte of t2, with the rest of the register cleared.'
    },
    'zext.h': {
        longName: 'Zero extend halfword',
        summary: 'Sets t1 to the low 16 bits of t2, with the rest of the register cleared.'
    },
    'zext.w': {
        longName: 'Zero extend word',
        summary: 'Sets t1 to the low 32 bits of t2, zero-extended (RV64 only).'
    }
}
