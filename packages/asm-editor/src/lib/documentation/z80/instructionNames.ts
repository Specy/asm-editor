/**
 * Long names and summaries of the Z80 mnemonics ([the design record](../../../../../../docs/design/instruction-layout.md),
 * decision 6). The Z80's data has neither, so every mnemonic is written here, the long names after
 * Zilog's manual; a test checks that none is missing.
 */
export const z80InstructionNames: Readonly<Record<string, { longName: string; summary: string }>> =
    {
        adc: {
            longName: 'Add with carry',
            summary: 'Adds a value and the carry flag C to A, or a register pair and C to HL.'
        },
        add: { longName: 'Add', summary: 'Adds a value to A, or a register pair to HL, IX or IY.' },
        and: {
            longName: 'Logical AND',
            summary:
                'Sets A to the bitwise AND of A and a register, memory byte or immediate value.'
        },
        bit: {
            longName: 'Test bit',
            summary: 'Tests one bit of a register or memory byte and sets Z when that bit is zero.'
        },
        call: {
            longName: 'Call',
            summary:
                'Pushes the return address onto the stack and jumps to a 16-bit address, either always or only when a flag condition is met.'
        },
        ccf: {
            longName: 'Complement carry flag',
            summary: 'Inverts C, copying its old value into H and clearing N.'
        },
        cp: {
            longName: 'Compare',
            summary:
                'Compares A with a register, memory byte or immediate value, setting flags as for subtraction without changing A.'
        },
        cpd: {
            longName: 'Compare and decrement',
            summary:
                'Compares A with the byte at (HL), then decrements HL and BC, setting P/V while BC is not zero.'
        },
        cpdr: {
            longName: 'Compare, decrement and repeat',
            summary:
                'Repeats CPD, scanning down memory from HL for a byte equal to A, until a match is found or BC is zero.'
        },
        cpi: {
            longName: 'Compare and increment',
            summary:
                'Compares A with the byte at (HL), then increments HL and decrements BC, setting P/V while BC is not zero.'
        },
        cpir: {
            longName: 'Compare, increment and repeat',
            summary:
                'Repeats CPI, scanning up memory from HL for a byte equal to A, until a match is found or BC is zero.'
        },
        cpl: {
            longName: 'Complement A',
            summary: "Inverts every bit of A, giving its one's complement."
        },
        daa: {
            longName: 'Decimal adjust A',
            summary:
                'Adjusts A after a BCD addition or subtraction so that each nibble holds a decimal digit.'
        },
        dec: {
            longName: 'Decrement',
            summary:
                'Subtracts one from a register, register pair or the byte at (HL), leaving C unchanged.'
        },
        di: {
            longName: 'Disable interrupts',
            summary:
                'Resets both interrupt flip-flops, preventing maskable interrupts from triggering.'
        },
        djnz: {
            longName: 'Decrement B and jump if not zero',
            summary: 'Decrements B and jumps to the target when B is not zero.'
        },
        ei: {
            longName: 'Enable interrupts',
            summary:
                'Sets both interrupt flip-flops, allowing maskable interrupts to occur after the next instruction.'
        },
        ex: {
            longName: 'Exchange',
            summary: "Swaps AF with AF', DE with HL, or the word at (SP) with HL, IX or IY."
        },
        exx: {
            longName: 'Exchange register sets',
            summary: "Swaps BC, DE and HL with BC', DE' and HL', the alternate register set."
        },
        halt: {
            longName: 'Halt',
            summary: 'Suspends CPU operation until an interrupt or reset occurs.'
        },
        im: {
            longName: 'Set interrupt mode',
            summary:
                'Selects interrupt mode 0, 1 or 2, which sets how the CPU responds to maskable interrupts.'
        },
        in: {
            longName: 'Input',
            summary:
                'Reads a byte from an I/O port into a register, with the port addressed by BC or by A and nn.'
        },
        inc: {
            longName: 'Increment',
            summary:
                'Adds one to a register, register pair or the byte at (HL), leaving C unchanged.'
        },
        ind: {
            longName: 'Input and decrement',
            summary:
                'Reads a byte from the port addressed by BC into (HL), then decrements HL and B.'
        },
        indr: {
            longName: 'Input, decrement and repeat',
            summary: 'Repeats IND, reading port bytes into memory downward from HL until B is zero.'
        },
        ini: {
            longName: 'Input and increment',
            summary:
                'Reads a byte from the port addressed by BC into (HL), then increments HL and decrements B.'
        },
        inir: {
            longName: 'Input, increment and repeat',
            summary: 'Repeats INI, reading port bytes into memory upward from HL until B is zero.'
        },
        jp: {
            longName: 'Jump',
            summary:
                'Jumps to a 16-bit address, or to the address held in HL, IX or IY, either always or only when a flag condition is met.'
        },
        jr: {
            longName: 'Jump relative',
            summary:
                'Jumps to a target up to 128 bytes away, either always or only when a flag condition is met.'
        },
        ld: {
            longName: 'Load',
            summary:
                'Copies a value between registers, memory and immediate data, 8 or 16 bits at a time.'
        },
        ldd: {
            longName: 'Load and decrement',
            summary:
                'Copies the byte at (HL) to (DE), then decrements HL, DE and BC, setting P/V while BC is not zero.'
        },
        lddr: {
            longName: 'Load, decrement and repeat',
            summary: 'Copies bytes from (HL) to (DE), decrementing HL, DE and BC, until BC is zero.'
        },
        ldi: {
            longName: 'Load and increment',
            summary:
                'Copies the byte at (HL) to (DE), increments HL and DE and decrements BC, setting P/V while BC is not zero.'
        },
        ldir: {
            longName: 'Load, increment and repeat',
            summary: 'Copies BC bytes from (HL) to (DE), incrementing both, until BC is zero.'
        },
        neg: {
            longName: 'Negate',
            summary:
                "Negates A, giving its two's complement, which is the same as subtracting A from zero."
        },
        nop: {
            longName: 'No operation',
            summary: 'Performs no operation, leaving registers and flags unchanged.'
        },
        or: {
            longName: 'Logical OR',
            summary: 'Sets A to the bitwise OR of A and a register, memory byte or immediate value.'
        },
        otdr: {
            longName: 'Output, decrement and repeat',
            summary:
                'Repeats OUTD, writing bytes from memory downward from HL to the port at BC until B is zero.'
        },
        otir: {
            longName: 'Output, increment and repeat',
            summary:
                'Repeats OUTI, writing bytes from memory upward from HL to the port at BC until B is zero.'
        },
        out: {
            longName: 'Output',
            summary: 'Writes A or another register to an I/O port, addressed by BC or by A and nn.'
        },
        outd: {
            longName: 'Output and decrement',
            summary:
                'Decrements B, writes the byte at (HL) to the port addressed by BC, then decrements HL.'
        },
        outi: {
            longName: 'Output and increment',
            summary:
                'Decrements B, writes the byte at (HL) to the port addressed by BC, then increments HL.'
        },
        pop: {
            longName: 'Pop from stack',
            summary:
                'Loads BC, DE, HL, AF, IX or IY from the stack, incrementing SP once for each byte.'
        },
        push: {
            longName: 'Push onto stack',
            summary:
                'Stores BC, DE, HL, AF, IX or IY on the stack, decrementing SP once for each byte.'
        },
        res: {
            longName: 'Reset bit',
            summary:
                'Clears one bit of a register or memory byte to zero, leaving the other bits unchanged.'
        },
        ret: {
            longName: 'Return',
            summary:
                'Pops the top stack entry into PC, either always or only when a flag condition is met.'
        },
        reti: {
            longName: 'Return from interrupt',
            summary:
                'Returns from a maskable interrupt routine by popping PC and signaling the device that the interrupt has finished.'
        },
        retn: {
            longName: 'Return from non-maskable interrupt',
            summary:
                'Returns from a non-maskable interrupt routine by popping PC and copying IFF2 into IFF1.'
        },
        rl: {
            longName: 'Rotate left through carry',
            summary:
                'Rotates a register or memory byte left one bit, moving C into bit 0 and bit 7 into C.'
        },
        rla: {
            longName: 'Rotate A left through carry',
            summary: 'Rotates A left one bit, moving C into bit 0 and bit 7 into C.'
        },
        rlc: {
            longName: 'Rotate left circular',
            summary:
                'Rotates a register or memory byte left one bit, copying bit 7 to C and to bit 0.'
        },
        rlca: {
            longName: 'Rotate A left circular',
            summary: 'Rotates A left one bit, copying bit 7 to C and to bit 0.'
        },
        rld: {
            longName: 'Rotate digit left',
            summary:
                'Rotates the low nibble of A and both nibbles of (HL) left by one digit, leaving the high nibble of A unchanged.'
        },
        rr: {
            longName: 'Rotate right through carry',
            summary:
                'Rotates a register or memory byte right one bit, moving C into bit 7 and bit 0 into C.'
        },
        rra: {
            longName: 'Rotate A right through carry',
            summary: 'Rotates A right one bit, moving C into bit 7 and bit 0 into C.'
        },
        rrc: {
            longName: 'Rotate right circular',
            summary:
                'Rotates a register or memory byte right one bit, copying bit 0 to C and to bit 7.'
        },
        rrca: {
            longName: 'Rotate A right circular',
            summary: 'Rotates A right one bit, copying bit 0 to C and to bit 7.'
        },
        rrd: {
            longName: 'Rotate digit right',
            summary:
                'Rotates the low nibble of A and both nibbles of (HL) right by one digit, leaving the high nibble of A unchanged.'
        },
        rst: {
            longName: 'Restart',
            summary:
                'Pushes the return address onto the stack and jumps to a fixed address from 00h to 38h in steps of 8.'
        },
        sbc: {
            longName: 'Subtract with carry',
            summary:
                'Subtracts a value and the carry flag C from A, or a register pair and C from HL.'
        },
        scf: { longName: 'Set carry flag', summary: 'Sets C and clears H and N.' },
        set: {
            longName: 'Set bit',
            summary:
                'Sets one bit of a register or memory byte to one, leaving the other bits unchanged.'
        },
        sla: {
            longName: 'Shift left arithmetic',
            summary:
                'Shifts a register or memory byte left one bit, copying bit 7 to C and putting zero into bit 0.'
        },
        sll: {
            longName: 'Shift left logical',
            summary:
                'Shifts a register or memory byte left one bit, copying bit 7 to C and putting one into bit 0.'
        },
        sra: {
            longName: 'Shift right arithmetic',
            summary:
                'Shifts a register or memory byte right one bit, keeping bit 7 and copying bit 0 to C.'
        },
        srl: {
            longName: 'Shift right logical',
            summary:
                'Shifts a register or memory byte right one bit, copying bit 0 to C and putting zero into bit 7.'
        },
        sub: {
            longName: 'Subtract',
            summary: 'Subtracts a register, memory byte or immediate value from A.'
        },
        xor: {
            longName: 'Logical exclusive OR',
            summary:
                'Sets A to the bitwise exclusive OR of A and a register, memory byte or immediate value.'
        }
    }
