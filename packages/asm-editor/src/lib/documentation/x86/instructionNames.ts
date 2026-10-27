/**
 * Long names and summaries of the documented x86 instructions
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 6). Every
 * long name is written here in sentence case, one per mnemonic so a family's members are told
 * apart (`loopz` is "Loop while zero", not the appendix's "Loop with Counter"), and so is every
 * summary, in one voice and for 64-bit code where NASM's appendix still speaks of `SP` and `ESP`.
 */
export const x86InstructionNames: Readonly<Record<string, { longName: string; summary: string }>> =
    {
        aaa: {
            longName: 'ASCII adjust after addition',
            summary:
                'Adjusts al after an unpacked BCD addition so it holds one decimal digit, carrying into ah when the low digit overflows.'
        },
        aad: {
            longName: 'ASCII adjust ax before division',
            summary:
                'Converts unpacked BCD digits in ah and al into one binary value in al, with ah as the tens digit, and zeroes ah.'
        },
        aam: {
            longName: 'ASCII adjust ax after multiply',
            summary:
                'Divides al by 10, or by an imm8 base, leaving the quotient in ah and the remainder in al.'
        },
        aas: {
            longName: 'ASCII adjust after subtraction',
            summary:
                'Adjusts al after an unpacked BCD subtraction so it holds one decimal digit, borrowing from ah when the low digit underflows.'
        },
        adc: {
            longName: 'Add with carry',
            summary:
                'Adds the source and the carry flag to the destination, leaving the sum in the destination.'
        },
        add: {
            longName: 'Add',
            summary:
                'Adds the source (second) operand to the destination (first) operand and leaves the sum in the destination.'
        },
        and: {
            longName: 'Logical AND',
            summary:
                'Combines the destination and source bit by bit with AND, storing the result in the destination.'
        },
        bound: {
            longName: 'Check array index against bounds',
            summary:
                'Raises a BR exception when the signed index in the register lies outside the two signed bounds stored in memory.'
        },
        brkpt: {
            longName: 'Breakpoint trap (interrupt 3)',
            summary:
                'Raises interrupt 3, the breakpoint trap, using the one-byte encoding that debuggers insert.'
        },
        bsf: {
            longName: 'Bit scan forward',
            summary:
                'Searches the source for its least significant set bit and, if one is found, stores its index in the destination.'
        },
        bsr: {
            longName: 'Bit scan reverse',
            summary:
                'Stores the index of the most significant set bit of the source in the destination, or sets ZF when the source is zero.'
        },
        bswap: {
            longName: 'Byte swap',
            summary:
                'Reverses the byte order of a 32-bit or 64-bit register, so the lowest byte swaps places with the highest.'
        },
        bt: {
            longName: 'Bit test',
            summary:
                'Copies the bit at the index given by the second operand into CF, leaving the operand unchanged.'
        },
        btc: {
            longName: 'Bit test and complement',
            summary: 'Copies the selected bit into CF, then complements that bit in the operand.'
        },
        btr: {
            longName: 'Bit test and reset',
            summary: 'Copies the selected bit into CF, then clears that bit in the operand.'
        },
        bts: {
            longName: 'Bit test and set',
            summary: 'Copies the selected bit into CF, then sets that bit in the operand.'
        },
        call: {
            longName: 'Call procedure',
            summary:
                'Calls a subroutine by pushing the return address onto the stack (with cs for a far call), then jumps to the given address.'
        },
        cbw: {
            longName: 'Sign-extend al into ax',
            summary: 'Sign-extends al into ax, filling ah with copies of the sign bit of al.'
        },
        cdq: {
            longName: 'Sign-extend eax into edx:eax',
            summary:
                'Sign-extends eax into edx:eax, filling edx with copies of the sign bit of eax.'
        },
        cdqe: {
            longName: 'Sign-extend eax into rax',
            summary:
                "Sign-extends eax into rax, filling the upper 32 bits with copies of eax's sign bit so 32-bit signed values work in 64-bit arithmetic."
        },
        clc: { longName: 'Clear carry flag', summary: 'Clears the carry flag (CF) to 0.' },
        cld: {
            longName: 'Clear direction flag',
            summary:
                'Clears the direction flag (DF), so string instructions step upward through memory.'
        },
        cli: {
            longName: 'Clear interrupt flag',
            summary: 'Clears the interrupt flag, disabling maskable interrupts.'
        },
        cmc: {
            longName: 'Complement carry flag',
            summary: 'Complements the carry flag, setting it to 1 if it was 0 and to 0 if it was 1.'
        },
        cmova: {
            longName: 'Move if above (CF == 0 and ZF == 0)',
            summary:
                'Copies the source into the destination when the last comparison found above (CF is 0 and ZF is 0).'
        },
        cmovae: {
            longName: 'Move if above or equal (CF == 0)',
            summary:
                'Copies the source into the destination when the last comparison found above or equal (CF is 0).'
        },
        cmovb: {
            longName: 'Move if below (CF == 1)',
            summary:
                'Copies the source into the destination when the last comparison found below (CF is 1).'
        },
        cmovbe: {
            longName: 'Move if below or equal (CF == 1 or ZF == 1)',
            summary:
                'Copies the source into the destination when the last comparison found below or equal (CF is 1 or ZF is 1).'
        },
        cmovc: {
            longName: 'Move if carry (CF == 1)',
            summary: 'Copies the source into the destination when the carry flag is set (CF is 1).'
        },
        cmove: {
            longName: 'Move if equal (ZF == 1)',
            summary:
                'Copies the source into the destination when the last comparison found equal (ZF is 1).'
        },
        cmovg: {
            longName: 'Move if greater (ZF == 0 and SF == OF)',
            summary:
                'Copies the source into the destination when the last comparison found greater (ZF is 0 and SF equals OF).'
        },
        cmovge: {
            longName: 'Move if greater or equal (SF == OF)',
            summary:
                'Copies the source into the destination when the last comparison found greater or equal (SF equals OF).'
        },
        cmovl: {
            longName: 'Move if less (SF != OF)',
            summary:
                'Copies the source into the destination when the last comparison found less (SF differs from OF).'
        },
        cmovle: {
            longName: 'Move if less or equal (ZF == 1 or SF != OF)',
            summary:
                'Copies the source into the destination when the last comparison found less or equal (ZF is 1 or SF differs from OF).'
        },
        cmovna: {
            longName: 'Move if not above (CF == 1 or ZF == 1)',
            summary:
                'Copies the source into the destination when the last comparison found not above (CF is 1 or ZF is 1).'
        },
        cmovnae: {
            longName: 'Move if not above or equal (CF == 1)',
            summary:
                'Copies the source into the destination when the last comparison found not above or equal (CF is 1).'
        },
        cmovnb: {
            longName: 'Move if not below (CF == 0)',
            summary:
                'Copies the source into the destination when the last comparison found not below (CF is 0).'
        },
        cmovnbe: {
            longName: 'Move if not below or equal (CF == 0 and ZF == 0)',
            summary:
                'Copies the source into the destination when the last comparison found not below or equal (CF is 0 and ZF is 0).'
        },
        cmovnc: {
            longName: 'Move if not carry (CF == 0)',
            summary:
                'Copies the source into the destination when the carry flag is clear (CF is 0).'
        },
        cmovne: {
            longName: 'Move if not equal (ZF == 0)',
            summary:
                'Copies the source into the destination when the last comparison found not equal (ZF is 0).'
        },
        cmovng: {
            longName: 'Move if not greater (ZF == 1 or SF != OF)',
            summary:
                'Copies the source into the destination when the last comparison found not greater (ZF is 1 or SF differs from OF).'
        },
        cmovnge: {
            longName: 'Move if not greater or equal (SF != OF)',
            summary:
                'Copies the source into the destination when the last comparison found not greater or equal (SF differs from OF).'
        },
        cmovnl: {
            longName: 'Move if not less (SF == OF)',
            summary:
                'Copies the source into the destination when the last comparison found not less (SF equals OF).'
        },
        cmovnle: {
            longName: 'Move if not less or equal (ZF == 0 and SF == OF)',
            summary:
                'Copies the source into the destination when the last comparison found not less or equal (ZF is 0 and SF equals OF).'
        },
        cmovno: {
            longName: 'Move if not overflow (OF == 0)',
            summary:
                'Copies the source into the destination when the overflow flag is clear (OF is 0).'
        },
        cmovnp: {
            longName: 'Move if not parity (PF == 0)',
            summary:
                'Copies the source into the destination when the parity flag is clear (PF is 0).'
        },
        cmovns: {
            longName: 'Move if not sign (SF == 0)',
            summary: 'Copies the source into the destination when the sign flag is clear (SF is 0).'
        },
        cmovnz: {
            longName: 'Move if not zero (ZF == 0)',
            summary: 'Copies the source into the destination when the zero flag is clear (ZF is 0).'
        },
        cmovo: {
            longName: 'Move if overflow (OF == 1)',
            summary:
                'Copies the source into the destination when the overflow flag is set (OF is 1).'
        },
        cmovp: {
            longName: 'Move if parity (PF == 1)',
            summary: 'Copies the source into the destination when the parity flag is set (PF is 1).'
        },
        cmovpe: {
            longName: 'Move if parity even (PF == 1)',
            summary: 'Copies the source into the destination when parity is even (PF is 1).'
        },
        cmovpo: {
            longName: 'Move if parity odd (PF == 0)',
            summary: 'Copies the source into the destination when parity is odd (PF is 0).'
        },
        cmovs: {
            longName: 'Move if sign (SF == 1)',
            summary: 'Copies the source into the destination when the sign flag is set (SF is 1).'
        },
        cmovz: {
            longName: 'Move if zero (ZF == 1)',
            summary: 'Copies the source into the destination when the zero flag is set (ZF is 1).'
        },
        cmp: {
            longName: 'Compare two operands',
            summary:
                'Subtracts the source from the destination and sets the flags, discarding the result.'
        },
        cmpsb: {
            longName: 'Compare string bytes',
            summary:
                'Compares the byte at [rsi] with the byte at [rdi] and sets the flags accordingly.'
        },
        cmpsd: {
            longName: 'Compare string doublewords',
            summary:
                'Compares the doubleword at [rsi] with the doubleword at [rdi], sets the flags, then advances rsi and rdi by 4, backward when DF is set.'
        },
        cmpsq: {
            longName: 'Compare string quadwords',
            summary:
                'Compares the quadword at [rsi] with the quadword at [rdi], sets the flags, then advances rsi and rdi by 8, backward when DF is set.'
        },
        cmpsw: {
            longName: 'Compare string words',
            summary:
                'Compares the word at [rsi] with the word at [rdi], sets the flags, then advances rsi and rdi by 2, backward when DF is set.'
        },
        cmpxchg: {
            longName: 'Compare and exchange',
            summary:
                'Compares the accumulator (al, ax, eax or rax) with the destination; if equal, stores the source there and sets ZF, else clears ZF and loads the destination into the accumulator.'
        },
        cmpxchg16b: {
            longName: 'Compare and exchange 16 bytes',
            summary:
                'Compares rdx:rax with a 16-byte memory operand; if they match, stores rcx:rbx there, otherwise loads the operand into rdx:rax.'
        },
        cmpxchg486: {
            longName: 'Compare and exchange, 486 opcode',
            summary:
                'Performs the cmpxchg compare-and-exchange under a non-standard opcode that some 486 processors accepted.'
        },
        cmpxchg8b: {
            longName: 'Compare and exchange 8 bytes',
            summary:
                'Compares the 8-byte value in memory with edx:eax; if equal, stores ecx:ebx there and sets ZF, otherwise loads it into edx:eax.'
        },
        cqo: {
            longName: 'Sign-extend rax into rdx:rax',
            summary:
                'Sign-extends rax into rdx:rax, filling rdx with copies of the sign bit of rax.'
        },
        cwd: {
            longName: 'Sign-extend ax into dx:ax',
            summary: 'Sign-extends ax into dx:ax, filling dx with copies of the sign bit of ax.'
        },
        cwde: {
            longName: 'Sign-extend ax into eax',
            summary:
                'Sign-extends ax into eax, filling the upper 16 bits with copies of the sign bit of ax.'
        },
        daa: {
            longName: 'Packed BCD adjust after addition',
            summary:
                'Adjusts al after a packed BCD addition so each nibble holds one decimal digit, setting CF and AF as needed.'
        },
        das: {
            longName: 'Packed BCD adjust after subtraction',
            summary:
                'Adjusts al after a packed BCD subtraction so each nibble holds one decimal digit, setting CF and AF as needed.'
        },
        dec: {
            longName: 'Decrement by 1',
            summary:
                'Subtracts 1 from the operand and stores the result there, leaving the carry flag unchanged.'
        },
        div: {
            longName: 'Unsigned divide',
            summary:
                'Divides the implicit unsigned dividend selected by the operand width, producing a quotient and remainder.'
        },
        enter: {
            longName: 'Create stack frame',
            summary:
                'Constructs a stack frame for a high-level language procedure call, saving rbp and reserving space for its local variables.'
        },
        enterd: {
            longName: 'Create 32-bit stack frame',
            summary: 'Creates a frame with 32-bit frame pointers; unavailable in 64-bit mode.'
        },
        enterq: {
            longName: 'Create 64-bit stack frame',
            summary:
                'Creates a 64-bit stack frame for a procedure call: pushes rbp, sets rbp to rsp, and reserves the local bytes.'
        },
        enterw: {
            longName: 'Create 16-bit stack frame',
            summary: 'Creates a frame with 16-bit frame pointers and reserves local storage.'
        },
        ibts: {
            longName: 'Insert bit string',
            summary: 'Inserts a bit string from the source operand into the destination.'
        },
        icebp: {
            longName: 'Debug trap for in-circuit emulators (interrupt 1)',
            summary:
                'Raises interrupt 1, the debug trap, using the one-byte encoding that in-circuit emulators use.'
        },
        idiv: {
            longName: 'Signed divide',
            summary:
                'Divides the implicit signed dividend selected by the operand width, producing a quotient and remainder.'
        },
        imul: {
            longName: 'Signed multiply',
            summary:
                'Multiplies signed integers, producing a full implicit product with one operand or a destination-width result with two or three.'
        },
        inc: {
            longName: 'Increment by 1',
            summary:
                'Adds 1 to the operand and stores the result there, leaving the carry flag unchanged.'
        },
        insb: {
            longName: 'Input string bytes from I/O port',
            summary: 'Reads a byte from the I/O port numbered in dx and stores it at [rdi].'
        },
        insd: {
            longName: 'Input string doublewords from I/O port',
            summary:
                'Reads a doubleword from port dx into [es:rdi], then advances rdi by 4, backward when DF is set.'
        },
        insw: {
            longName: 'Input string words from I/O port',
            summary:
                'Reads a word from port dx into [es:rdi], then advances rdi by 2, backward when DF is set.'
        },
        int: {
            longName: 'Call to interrupt procedure',
            summary: 'Causes a software interrupt through the given vector number, from 0 to 255.'
        },
        int01: {
            longName: 'Debug trap (interrupt 1)',
            summary: 'Raises interrupt 1, the debug trap, using the one-byte encoding.'
        },
        int03: {
            longName: 'Breakpoint trap (interrupt 3)',
            summary:
                'Raises interrupt 3, the breakpoint trap, using the one-byte encoding that debuggers insert.'
        },
        int1: {
            longName: 'Debug trap (interrupt 1)',
            summary: 'Raises interrupt 1, the debug trap, using the one-byte encoding.'
        },
        int3: {
            longName: 'Breakpoint trap (interrupt 3)',
            summary:
                'Raises interrupt 3, the breakpoint trap, using the one-byte encoding that debuggers insert.'
        },
        into: {
            longName: 'Interrupt if overflow',
            summary: 'Raises an INT 4 software interrupt if and only if the overflow flag is set.'
        },
        iret: {
            longName: 'Interrupt return, default size',
            summary:
                'Returns from an interrupt by popping the instruction pointer, cs and the flags, and in 64-bit mode the stack pointer and ss as well, then continuing at the popped address.'
        },
        iretd: {
            longName: 'Interrupt return, 32-bit',
            summary:
                'Returns from an interrupt by popping eip, cs and eflags as 4-byte values, and in 64-bit mode esp and ss as well.'
        },
        iretq: {
            longName: 'Interrupt return, 64-bit',
            summary:
                'Returns from an interrupt by popping rip, cs, rflags, rsp and ss, the 64-bit form.'
        },
        iretw: {
            longName: 'Interrupt return, 16-bit',
            summary:
                'Returns from an interrupt by popping ip, cs and the flags as 2-byte words, and in 64-bit mode sp and ss as well.'
        },
        ja: {
            longName: 'Jump if above (CF == 0 and ZF == 0)',
            summary:
                'Jumps to the target when the last comparison found above (CF is 0 and ZF is 0).'
        },
        jae: {
            longName: 'Jump if above or equal (CF == 0)',
            summary: 'Jumps to the target when the last comparison found above or equal (CF is 0).'
        },
        jb: {
            longName: 'Jump if below (CF == 1)',
            summary: 'Jumps to the target when the last comparison found below (CF is 1).'
        },
        jbe: {
            longName: 'Jump if below or equal (CF == 1 or ZF == 1)',
            summary:
                'Jumps to the target when the last comparison found below or equal (CF is 1 or ZF is 1).'
        },
        jc: {
            longName: 'Jump if carry (CF == 1)',
            summary: 'Jumps to the target when the carry flag is set (CF is 1).'
        },
        jcxz: {
            longName: 'Jump if cx register is 0',
            summary:
                'Jumps a short distance when the selected counter is zero; the cx form is unavailable in 64-bit mode.'
        },
        je: {
            longName: 'Jump if equal (ZF == 1)',
            summary: 'Jumps to the target when the last comparison found equal (ZF is 1).'
        },
        jecxz: {
            longName: 'Jump if ecx register is 0',
            summary:
                'Jumps when ecx is zero, using an 8-bit displacement from the end of the instruction.'
        },
        jg: {
            longName: 'Jump if greater (ZF == 0 and SF == OF)',
            summary:
                'Jumps to the target when the last comparison found greater (ZF is 0 and SF equals OF).'
        },
        jge: {
            longName: 'Jump if greater or equal (SF == OF)',
            summary:
                'Jumps to the target when the last comparison found greater or equal (SF equals OF).'
        },
        jl: {
            longName: 'Jump if less (SF != OF)',
            summary: 'Jumps to the target when the last comparison found less (SF differs from OF).'
        },
        jle: {
            longName: 'Jump if less or equal (ZF == 1 or SF != OF)',
            summary:
                'Jumps to the target when the last comparison found less or equal (ZF is 1 or SF differs from OF).'
        },
        jmp: {
            longName: 'Jump unconditionally',
            summary: 'Jumps unconditionally to the given address.'
        },
        jmpe: {
            longName: 'Jump to IA-64 instruction set',
            summary:
                'On an Itanium running IA-32 code, jumped to the target and switched to the IA-64 instruction set; x86 processors raise an invalid-opcode fault instead.'
        },
        jna: {
            longName: 'Jump if not above (CF == 1 or ZF == 1)',
            summary:
                'Jumps to the target when the last comparison found not above (CF is 1 or ZF is 1).'
        },
        jnae: {
            longName: 'Jump if not above or equal (CF == 1)',
            summary:
                'Jumps to the target when the last comparison found not above or equal (CF is 1).'
        },
        jnb: {
            longName: 'Jump if not below (CF == 0)',
            summary: 'Jumps to the target when the last comparison found not below (CF is 0).'
        },
        jnbe: {
            longName: 'Jump if not below or equal (CF == 0 and ZF == 0)',
            summary:
                'Jumps to the target when the last comparison found not below or equal (CF is 0 and ZF is 0).'
        },
        jnc: {
            longName: 'Jump if not carry (CF == 0)',
            summary: 'Jumps to the target when the carry flag is clear (CF is 0).'
        },
        jne: {
            longName: 'Jump if not equal (ZF == 0)',
            summary: 'Jumps to the target when the last comparison found not equal (ZF is 0).'
        },
        jng: {
            longName: 'Jump if not greater (ZF == 1 or SF != OF)',
            summary:
                'Jumps to the target when the last comparison found not greater (ZF is 1 or SF differs from OF).'
        },
        jnge: {
            longName: 'Jump if not greater or equal (SF != OF)',
            summary:
                'Jumps to the target when the last comparison found not greater or equal (SF differs from OF).'
        },
        jnl: {
            longName: 'Jump if not less (SF == OF)',
            summary: 'Jumps to the target when the last comparison found not less (SF equals OF).'
        },
        jnle: {
            longName: 'Jump if not less or equal (ZF == 0 and SF == OF)',
            summary:
                'Jumps to the target when the last comparison found not less or equal (ZF is 0 and SF equals OF).'
        },
        jno: {
            longName: 'Jump if not overflow (OF == 0)',
            summary: 'Jumps to the target when the overflow flag is clear (OF is 0).'
        },
        jnp: {
            longName: 'Jump if not parity (PF == 0)',
            summary: 'Jumps to the target when the parity flag is clear (PF is 0).'
        },
        jns: {
            longName: 'Jump if not sign (SF == 0)',
            summary: 'Jumps to the target when the sign flag is clear (SF is 0).'
        },
        jnz: {
            longName: 'Jump if not zero (ZF == 0)',
            summary: 'Jumps to the target when the zero flag is clear (ZF is 0).'
        },
        jo: {
            longName: 'Jump if overflow (OF == 1)',
            summary: 'Jumps to the target when the overflow flag is set (OF is 1).'
        },
        jp: {
            longName: 'Jump if parity (PF == 1)',
            summary: 'Jumps to the target when the parity flag is set (PF is 1).'
        },
        jpe: {
            longName: 'Jump if parity even (PF == 1)',
            summary: 'Jumps to the target when parity is even (PF is 1).'
        },
        jpo: {
            longName: 'Jump if parity odd (PF == 0)',
            summary: 'Jumps to the target when parity is odd (PF is 0).'
        },
        jrcxz: {
            longName: 'Jump if rcx register is 0',
            summary:
                'Jumps when rcx is zero, using an 8-bit displacement from the end of the instruction.'
        },
        js: {
            longName: 'Jump if sign (SF == 1)',
            summary: 'Jumps to the target when the sign flag is set (SF is 1).'
        },
        jz: {
            longName: 'Jump if zero (ZF == 1)',
            summary: 'Jumps to the target when the zero flag is set (ZF is 1).'
        },
        lahf: { longName: 'Load ah from flags', summary: 'Copies the low byte of rflags into ah.' },
        lea: {
            longName: 'Load effective address',
            summary:
                'Computes the effective address of the memory operand and stores it in the destination register, without accessing memory.'
        },
        leave: {
            longName: 'Destroy stack frame',
            summary:
                'Destroys the stack frame made by enter by setting rsp to rbp and popping the saved rbp.'
        },
        leaved: {
            longName: 'Destroy 32-bit stack frame',
            summary: 'Dismantles a 32-bit frame; unavailable in 64-bit mode.'
        },
        leaveq: {
            longName: 'Destroy 64-bit stack frame',
            summary:
                'Releases a 64-bit stack frame by setting rsp to rbp and popping the saved rbp, undoing enter.'
        },
        leavew: {
            longName: 'Destroy 16-bit stack frame',
            summary: 'Dismantles a frame using a 16-bit saved frame pointer.'
        },
        lodsb: { longName: 'Load byte from string', summary: 'Loads the byte at [rsi] into al.' },
        lodsd: {
            longName: 'Load doubleword from string',
            summary:
                'Loads the doubleword at [rsi] into eax, then advances rsi by 4, backward when DF is set.'
        },
        lodsq: {
            longName: 'Load quadword from string',
            summary:
                'Loads the quadword at [rsi] into rax, then advances rsi by 8, backward when DF is set.'
        },
        lodsw: {
            longName: 'Load word from string',
            summary:
                'Loads the word at [rsi] into ax, then advances rsi by 2, backward when DF is set.'
        },
        loop: {
            longName: 'Loop with default counter',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero.'
        },
        loopd: {
            longName: 'Loop with ecx as the counter',
            summary:
                'Decrements ecx by one and jumps to the short target if the counter is non-zero.'
        },
        loope: {
            longName: 'Loop while equal',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 1.'
        },
        looped: {
            longName: 'Loop while equal, ecx as the counter',
            summary:
                'Decrements ecx by one and jumps to the short target if the counter is non-zero and ZF is 1.'
        },
        loopeq: {
            longName: 'Loop while equal, rcx as the counter',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 1.'
        },
        loopew: {
            longName: 'Loop while equal, cx as the counter',
            summary:
                'Decrements cx by one and jumps to the short target if the counter is non-zero and ZF is 1; unavailable in 64-bit mode.'
        },
        loopne: {
            longName: 'Loop while not equal',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 0.'
        },
        loopned: {
            longName: 'Loop while not equal, ecx as the counter',
            summary:
                'Decrements ecx by one and jumps to the short target if the counter is non-zero and ZF is 0.'
        },
        loopneq: {
            longName: 'Loop while not equal, rcx as the counter',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 0.'
        },
        loopnew: {
            longName: 'Loop while not equal, cx as the counter',
            summary:
                'Decrements cx by one and jumps to the short target if the counter is non-zero and ZF is 0; unavailable in 64-bit mode.'
        },
        loopnz: {
            longName: 'Loop while not zero',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 0.'
        },
        loopnzd: {
            longName: 'Loop while not zero, ecx as the counter',
            summary:
                'Decrements ecx by one and jumps to the short target if the counter is non-zero and ZF is 0.'
        },
        loopnzq: {
            longName: 'Loop while not zero, rcx as the counter',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 0.'
        },
        loopnzw: {
            longName: 'Loop while not zero, cx as the counter',
            summary:
                'Decrements cx by one and jumps to the short target if the counter is non-zero and ZF is 0; unavailable in 64-bit mode.'
        },
        loopq: {
            longName: 'Loop with rcx as the counter',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero.'
        },
        loopw: {
            longName: 'Loop with cx as the counter',
            summary:
                'Decrements cx by one and jumps to the short target if the counter is non-zero; unavailable in 64-bit mode.'
        },
        loopz: {
            longName: 'Loop while zero',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 1.'
        },
        loopzd: {
            longName: 'Loop while zero, ecx as the counter',
            summary:
                'Decrements ecx by one and jumps to the short target if the counter is non-zero and ZF is 1.'
        },
        loopzq: {
            longName: 'Loop while zero, rcx as the counter',
            summary:
                'Decrements rcx by one and jumps to the short target if the counter is non-zero and ZF is 1.'
        },
        loopzw: {
            longName: 'Loop while zero, cx as the counter',
            summary:
                'Decrements cx by one and jumps to the short target if the counter is non-zero and ZF is 1; unavailable in 64-bit mode.'
        },
        mov: {
            longName: 'Move',
            summary:
                'Copies the contents of the source (second) operand into the destination (first) operand.'
        },
        movabs: {
            longName: 'Move with explicit immediate or absolute offset',
            summary:
                'Copies a full-width immediate into a register, or transfers accumulator data using an absolute memory offset.'
        },
        movbe: {
            longName: 'Move data after swapping bytes',
            summary:
                'Moves data between a register and memory, reversing the byte order as it is copied.'
        },
        movrs: {
            longName: 'Move with read-shared hint',
            summary:
                'Loads a register from memory using the MOVRS encoding, which hints that the data is read-shared.'
        },
        movsb: { longName: 'Move string bytes', summary: 'Copies the byte at [rsi] to [rdi].' },
        movsq: {
            longName: 'Move string quadwords',
            summary:
                'Copies the quadword at [rsi] to [rdi], then advances rsi and rdi by 8, backward when DF is set.'
        },
        movsw: {
            longName: 'Move string words',
            summary:
                'Copies the word at [rsi] to [rdi], then advances rsi and rdi by 2, backward when DF is set.'
        },
        movsx: {
            longName: 'Move with sign extension',
            summary:
                'Copies a source into a register, sign-extending when the destination is wider.'
        },
        movsxb: {
            longName: 'Move byte with sign extension',
            summary:
                'Sign-extends the byte source to the width of the destination register and copies the result there.'
        },
        movsxd: {
            longName: 'Move doubleword with sign extension',
            summary:
                'Copies a 32-bit source into a register, sign-extending for a 64-bit destination.'
        },
        movsxw: {
            longName: 'Move word with sign extension',
            summary:
                'Copies a word source into a register, sign-extending when the destination is wider.'
        },
        movzx: {
            longName: 'Move with zero extension',
            summary:
                'Copies a source into a register, filling added high bits with zeros when the destination is wider.'
        },
        movzxb: {
            longName: 'Move byte with zero extension',
            summary:
                'Zero-extends the byte source to the width of the destination register, filling the high bits with zero.'
        },
        movzxd: {
            longName: 'Move doubleword with zero extension',
            summary:
                'Copies a doubleword source into the destination, zeroing the high bits when the destination is wider.'
        },
        movzxw: {
            longName: 'Move word with zero extension',
            summary:
                'Copies a word source into a register, filling added high bits with zeros when the destination is wider.'
        },
        mul: {
            longName: 'Unsigned multiply',
            summary:
                'Multiplies unsigned integers into the full implicit product in the one-operand form.'
        },
        neg: {
            longName: "Two's complement negation",
            summary:
                "Replaces the operand with its two's complement, which inverts every bit and then adds one."
        },
        nop: {
            longName: 'No operation',
            summary: 'Performs no operation, and execution continues with the next instruction.'
        },
        nop2: {
            longName: 'Two-byte no operation',
            summary: 'Executes no operation, using the two-byte 66 90 encoding.'
        },
        not: {
            longName: "One's complement negation",
            summary:
                'Inverts every bit of the operand to give its ones complement, leaving the flags unchanged.'
        },
        or: {
            longName: 'Logical inclusive OR',
            summary:
                'Combines the destination and source bit by bit with OR, storing the result in the destination.'
        },
        outsb: {
            longName: 'Output string bytes to I/O port',
            summary: 'Loads a byte from [rsi] and writes it to the I/O port numbered in dx.'
        },
        outsd: {
            longName: 'Output string doublewords to I/O port',
            summary:
                'Loads a doubleword from [rsi] and writes it to port dx, then advances rsi by 4, backward when DF is set.'
        },
        outsw: {
            longName: 'Output string words to I/O port',
            summary:
                'Loads a word from [rsi] and writes it to port dx, then advances rsi by 2, backward when DF is set.'
        },
        pop: {
            longName: 'Pop a value from the stack',
            summary:
                'Pops a 64-bit value using rsp by default, or a 16-bit value when a word operand is selected.'
        },
        popa: {
            longName: 'Pop all general-purpose registers (default size)',
            summary:
                'Pops the general registers that pusha saved, discarding the saved sp; not valid in 64-bit mode.'
        },
        popad: {
            longName: 'Pop all general-purpose registers, 32-bit',
            summary:
                'Pops eight 32-bit values into edi, esi, ebp, ebx, edx, ecx and eax, discarding the saved esp.'
        },
        popaw: {
            longName: 'Pop all general-purpose registers, 16-bit',
            summary:
                'Pops eight 16-bit words into di, si, bp, bx, dx, cx and ax, discarding the saved sp.'
        },
        popf: {
            longName: 'Pop flags (default size)',
            summary:
                'Consumes an 8-byte stack value to restore writable flags, subject to privilege restrictions.'
        },
        popfd: {
            longName: 'Pop eflags',
            summary:
                'Restores writable flags from a 32-bit stack value; unavailable in 64-bit mode.'
        },
        popfq: {
            longName: 'Pop rflags',
            summary:
                'Consumes an 8-byte stack value to restore writable flags, subject to privilege restrictions.'
        },
        popfw: {
            longName: 'Pop flags, 16-bit',
            summary:
                'Consumes a 2-byte stack value to restore writable low flags, subject to privilege restrictions.'
        },
        push: {
            longName: 'Push value onto the stack',
            summary:
                'Pushes a 64-bit value using rsp by default, or a 16-bit value when a word operand is selected.'
        },
        pusha: {
            longName: 'Push all general-purpose registers (default size)',
            summary:
                "Pushes ax, cx, dx, bx, sp, bp, si and di onto the stack in turn, at the mode's default operand size."
        },
        pushad: {
            longName: 'Push all general-purpose registers, 32-bit',
            summary:
                'Pushes eax, ecx, edx, ebx, the original esp, ebp, esi and edi, lowering esp by 32 bytes.'
        },
        pushaw: {
            longName: 'Push all general-purpose registers, 16-bit',
            summary:
                'Pushes the 16-bit registers ax, cx, dx, bx, sp, bp, si and di onto the stack in turn, lowering sp by a total of 16.'
        },
        pushf: {
            longName: 'Push flags (default size)',
            summary: 'Pushes rflags onto the stack as an 8-byte value and decrements rsp by 8.'
        },
        pushfd: {
            longName: 'Push eflags',
            summary: 'Pushes a 32-bit flags image; unavailable in 64-bit mode.'
        },
        pushfq: {
            longName: 'Push rflags',
            summary: 'Pushes the 64-bit rflags register onto the stack, lowering rsp by 8.'
        },
        pushfw: {
            longName: 'Push flags, 16-bit',
            summary:
                'Pushes the low 16 bits of rflags onto the stack as a word and decrements rsp by 2.'
        },
        rcl: {
            longName: 'Rotate left through carry flag',
            summary:
                'Rotates the destination (first) operand left through the carry flag, treating CF as one extra bit in the rotation.'
        },
        rcr: {
            longName: 'Rotate right through carry flag',
            summary:
                'Rotates the destination right by the given count through CF; the low bit moves into CF each step.'
        },
        ret: {
            longName: 'Near return, default size',
            summary:
                'Pops the 8-byte return address from the stack into rip and transfers control to it.'
        },
        retd: {
            longName: 'Return, 32-bit',
            summary: 'Returns to a 32-bit near offset; unavailable in 64-bit mode.'
        },
        retf: {
            longName: 'Far return',
            summary:
                'Returns across a code-segment boundary, using a 32-bit offset by default in 64-bit mode.'
        },
        retfd: {
            longName: 'Far return, 32-bit',
            summary:
                'Makes a far return using a 32-bit offset and an optional unsigned cleanup byte count.'
        },
        retfq: {
            longName: 'Far return, 64-bit',
            summary:
                'Makes a 64-bit far return: pops rip, then cs, then adds the optional imm16 to rsp.'
        },
        retfw: {
            longName: 'Far return, 16-bit',
            summary:
                'Makes a far return using a 16-bit offset and an optional unsigned cleanup byte count.'
        },
        retn: {
            longName: 'Near return, default size',
            summary:
                'Pops the return address into rip and jumps there, then adds the optional imm16 to rsp.'
        },
        retnd: {
            longName: 'Near return, 32-bit',
            summary: 'Returns to a 32-bit near offset; unavailable in 64-bit mode.'
        },
        retnq: {
            longName: 'Near return, 64-bit',
            summary:
                'Pops a 64-bit near return address into rip and jumps there, then adds the optional imm16 to rsp.'
        },
        retnw: {
            longName: 'Near return, 16-bit',
            summary:
                'Requests the 16-bit near-return encoding, with an optional unsigned cleanup byte count.'
        },
        retq: {
            longName: 'Return, 64-bit',
            summary:
                'Pops a 64-bit return address into rip and jumps there, then adds the optional imm16 to rsp.'
        },
        retw: {
            longName: 'Return, 16-bit',
            summary:
                'Requests the 16-bit near-return encoding, with an optional unsigned cleanup byte count.'
        },
        rol: {
            longName: 'Rotate left',
            summary:
                'Rotates the destination (first) operand left by the given count, moving bits that leave the top back in at the bottom.'
        },
        ror: {
            longName: 'Rotate right',
            summary:
                'Rotates the destination right by the given count; bits shifted out of the bottom re-enter at the top.'
        },
        sahf: {
            longName: 'Store ah into flags',
            summary: 'Loads SF, ZF, AF, PF and CF from bits 7, 6, 4, 2 and 0 of ah.'
        },
        sal: {
            longName: 'Arithmetic shift left',
            summary:
                'Shifts the destination (first) operand left, filling the vacated low bits with zeros; this is the same operation as shl.'
        },
        salc: {
            longName: 'Set al from carry flag',
            summary: 'Sets al to 0xff (all ones) if the carry flag is set, and to 0x00 otherwise.'
        },
        sar: {
            longName: 'Arithmetic shift right',
            summary:
                'Shifts the destination right arithmetically by the given count, filling the top bits with copies of the sign bit.'
        },
        sbb: {
            longName: 'Subtract with borrow',
            summary:
                'Subtracts the source and CF from the destination, storing the result there and setting the flags.'
        },
        scasb: {
            longName: 'Scan string for a byte',
            summary: 'Compares al with the byte at [rdi] and sets the flags accordingly.'
        },
        scasd: {
            longName: 'Scan string for a doubleword',
            summary:
                'Compares eax with the doubleword at [rdi], sets the flags, then advances rdi by 4, backward when DF is set.'
        },
        scasq: {
            longName: 'Scan string for a quadword',
            summary:
                'Compares rax with the quadword at [rdi], sets the flags, then advances rdi by 8, backward when DF is set.'
        },
        scasw: {
            longName: 'Scan string for a word',
            summary:
                'Compares ax with the word at [rdi], sets the flags, then advances rdi by 2, backward when DF is set.'
        },
        seta: {
            longName: 'Set byte if above (CF == 0 and ZF == 0)',
            summary:
                'Sets the destination byte to 1 when the last comparison found above (CF is 0 and ZF is 0), otherwise to 0.'
        },
        setae: {
            longName: 'Set byte if above or equal (CF == 0)',
            summary:
                'Sets the destination byte to 1 when the last comparison found above or equal (CF is 0), otherwise to 0.'
        },
        setb: {
            longName: 'Set byte if below (CF == 1)',
            summary:
                'Sets the destination byte to 1 when the last comparison found below (CF is 1), otherwise to 0.'
        },
        setbe: {
            longName: 'Set byte if below or equal (CF == 1 or ZF == 1)',
            summary:
                'Sets the destination byte to 1 when the last comparison found below or equal (CF is 1 or ZF is 1), otherwise to 0.'
        },
        setc: {
            longName: 'Set byte if carry (CF == 1)',
            summary: 'Sets the 8-bit operand to 1 if the carry flag is set, and to 0 otherwise.'
        },
        sete: {
            longName: 'Set byte if equal (ZF == 1)',
            summary:
                'Sets the destination byte to 1 when the last comparison found equal (ZF is 1), otherwise to 0.'
        },
        setg: {
            longName: 'Set byte if greater (ZF == 0 and SF == OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found greater (ZF is 0 and SF equals OF), otherwise to 0.'
        },
        setge: {
            longName: 'Set byte if greater or equal (SF == OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found greater or equal (SF equals OF), otherwise to 0.'
        },
        setl: {
            longName: 'Set byte if less (SF != OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found less (SF differs from OF), otherwise to 0.'
        },
        setle: {
            longName: 'Set byte if less or equal (ZF == 1 or SF != OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found less or equal (ZF is 1 or SF differs from OF), otherwise to 0.'
        },
        setna: {
            longName: 'Set byte if not above (CF == 1 or ZF == 1)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not above (CF is 1 or ZF is 1), otherwise to 0.'
        },
        setnae: {
            longName: 'Set byte if not above or equal (CF == 1)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not above or equal (CF is 1), otherwise to 0.'
        },
        setnb: {
            longName: 'Set byte if not below (CF == 0)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not below (CF is 0), otherwise to 0.'
        },
        setnbe: {
            longName: 'Set byte if not below or equal (CF == 0 and ZF == 0)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not below or equal (CF is 0 and ZF is 0), otherwise to 0.'
        },
        setnc: {
            longName: 'Set byte if not carry (CF == 0)',
            summary:
                'Sets the destination byte to 1 when the carry flag is clear (CF is 0), otherwise to 0.'
        },
        setne: {
            longName: 'Set byte if not equal (ZF == 0)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not equal (ZF is 0), otherwise to 0.'
        },
        setng: {
            longName: 'Set byte if not greater (ZF == 1 or SF != OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not greater (ZF is 1 or SF differs from OF), otherwise to 0.'
        },
        setnge: {
            longName: 'Set byte if not greater or equal (SF != OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not greater or equal (SF differs from OF), otherwise to 0.'
        },
        setnl: {
            longName: 'Set byte if not less (SF == OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not less (SF equals OF), otherwise to 0.'
        },
        setnle: {
            longName: 'Set byte if not less or equal (ZF == 0 and SF == OF)',
            summary:
                'Sets the destination byte to 1 when the last comparison found not less or equal (ZF is 0 and SF equals OF), otherwise to 0.'
        },
        setno: {
            longName: 'Set byte if not overflow (OF == 0)',
            summary:
                'Sets the destination byte to 1 when the overflow flag is clear (OF is 0), otherwise to 0.'
        },
        setnp: {
            longName: 'Set byte if not parity (PF == 0)',
            summary:
                'Sets the destination byte to 1 when the parity flag is clear (PF is 0), otherwise to 0.'
        },
        setns: {
            longName: 'Set byte if not sign (SF == 0)',
            summary:
                'Sets the destination byte to 1 when the sign flag is clear (SF is 0), otherwise to 0.'
        },
        setnz: {
            longName: 'Set byte if not zero (ZF == 0)',
            summary:
                'Sets the destination byte to 1 when the zero flag is clear (ZF is 0), otherwise to 0.'
        },
        seto: {
            longName: 'Set byte if overflow (OF == 1)',
            summary:
                'Sets the destination byte to 1 when the overflow flag is set (OF is 1), otherwise to 0.'
        },
        setp: {
            longName: 'Set byte if parity (PF == 1)',
            summary:
                'Sets the destination byte to 1 when the parity flag is set (PF is 1), otherwise to 0.'
        },
        setpe: {
            longName: 'Set byte if parity even (PF == 1)',
            summary: 'Sets the destination byte to 1 when parity is even (PF is 1), otherwise to 0.'
        },
        setpo: {
            longName: 'Set byte if parity odd (PF == 0)',
            summary: 'Sets the destination byte to 1 when parity is odd (PF is 0), otherwise to 0.'
        },
        sets: {
            longName: 'Set byte if sign (SF == 1)',
            summary:
                'Stores 1 in the destination byte when the sign flag is set (SF is 1), otherwise 0.'
        },
        setz: {
            longName: 'Set byte if zero (ZF == 1)',
            summary:
                'Sets the destination byte to 1 when the zero flag is set (ZF is 1), otherwise to 0.'
        },
        shl: {
            longName: 'Logical shift left',
            summary:
                'Shifts the destination (first) operand left by the given count, filling the vacated low bits with zeros.'
        },
        shld: {
            longName: 'Integer double precision shift left',
            summary:
                'Performs a double-precision left shift, filling the vacated low bits of the destination with high bits from the source (second) operand.'
        },
        shr: {
            longName: 'Logical shift right',
            summary:
                'Shifts the destination right logically by the given count, filling the top bits with zeros.'
        },
        shrd: {
            longName: 'Integer double precision shift right',
            summary:
                'Shifts the destination right by the given count, filling its top bits from the low bits of the source, which stays unchanged.'
        },
        stc: { longName: 'Set carry flag', summary: 'Sets the carry flag (CF) to 1.' },
        std: {
            longName: 'Set direction flag',
            summary:
                'Sets the direction flag (DF), so string instructions step downward through memory.'
        },
        sti: {
            longName: 'Set interrupt flag',
            summary: 'Sets the interrupt flag, enabling maskable interrupts.'
        },
        stosb: {
            longName: 'Store byte to string',
            summary: 'Stores the byte in al at [rdi] and leaves the flags unchanged.'
        },
        stosd: {
            longName: 'Store doubleword to string',
            summary: 'Stores eax at [rdi], then advances rdi by 4, backward when DF is set.'
        },
        stosq: {
            longName: 'Store quadword to string',
            summary: 'Stores rax at [rdi], then advances rdi by 8, backward when DF is set.'
        },
        stosw: {
            longName: 'Store word to string',
            summary: 'Stores ax at [rdi], then advances rdi by 2, backward when DF is set.'
        },
        sub: {
            longName: 'Subtract',
            summary:
                'Subtracts the source (second) operand from the destination (first) operand and leaves the difference in the destination.'
        },
        syscall: {
            longName: 'Fast system call to the operating system',
            summary: 'Asks the operating system to do something.'
        },
        sysenter: {
            longName: 'Fast call to a level 0 system procedure',
            summary: 'Executes a fast call to a level 0 system procedure or routine.'
        },
        sysexit: {
            longName: 'Fast return from system call',
            summary: 'Executes a fast return to privilege level 3 user code.'
        },
        sysret: {
            longName: 'Return from operating system',
            summary:
                'Returns to user code from the operating system, as the counterpart of syscall for fast entry and exit.'
        },
        test: {
            longName: 'Logical compare',
            summary:
                'Sets the flags from a bitwise AND of the two operands, without storing the result.'
        },
        xadd: {
            longName: 'Exchange and add',
            summary:
                'Exchanges the two operands, then stores their sum in the destination (first) operand.'
        },
        xbts: {
            longName: 'Extract bit string',
            summary: 'Extracts a bit string from the source operand into the destination.'
        },
        xchg: {
            longName: 'Exchange register/memory with register',
            summary: 'Exchanges the values of its two operands.'
        },
        xor: {
            longName: 'Logical exclusive OR',
            summary:
                'Combines the destination and source bit by bit with XOR, storing the result in the destination.'
        }
    }
