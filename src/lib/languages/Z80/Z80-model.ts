/**
 * The parts of the Z80 programming model that more than one module has to agree on: the register
 * list the emulator shows, the flag bits, and the console device that programs talk to through
 * `in`/`out`. The emulator adapter, the editor tooling and the documentation pages all read from
 * here so that a port number or a register name is defined exactly once.
 *
 * This module is plain data: no Svelte runes, no imports from the rest of the app, so it can be
 * imported from a `+page.server.ts` during prerendering and probed from node.
 */

/**
 * Registers shown in the register panel and accepted by testcases, in display order. `a` is an
 * 8 bit register, everything else is a 16 bit pair. The other 8 bit halves (b, c, d, e, h, l, f)
 * are visible as the byte groups of their pair, the flags register is rendered as the status
 * flags section (see `Z80_FLAGS`). The alternate set (`af'`, `bc'`, `de'`, `hl'`) is only reachable
 * through `ex af,af'` and `exx`; `i`, `r` and the undocumented `ixh`/`ixl`/`iyh`/`iyl` halves are
 * not shown.
 */
export const Z80_REGISTER_NAMES = [
    'a',
    'bc',
    'de',
    'hl',
    'ix',
    'iy',
    'sp',
    'pc',
    "af'",
    "bc'",
    "de'",
    "hl'"
] as const

export type Z80RegisterName = (typeof Z80_REGISTER_NAMES)[number]

/**
 * The registers a testcase may preset. `pc` is excluded: loading the assembled program decides
 * where execution starts (the `end` directive's address, else the first address with code).
 */
export const Z80_STARTING_REGISTER_NAMES: Z80RegisterName[] = Z80_REGISTER_NAMES.filter(
    (name) => name !== 'pc'
)

/**
 * The documented bits of the F register, in the order the status flags section shows them
 * (most significant first). Bits 3 and 5 are undocumented copies of the result and are not shown.
 */
export const Z80_FLAGS = [
    {
        name: 'S',
        bit: 7,
        description: 'Sign: set when the result is negative (bit 7 of the result).'
    },
    { name: 'Z', bit: 6, description: 'Zero: set when the result is zero.' },
    {
        name: 'H',
        bit: 4,
        description: 'Half carry: carry from bit 3 to bit 4, used by `daa` for BCD arithmetic.'
    },
    {
        name: 'P/V',
        bit: 2,
        description:
            'Parity/overflow: parity of the result for logical and rotate instructions (set when even), signed overflow for arithmetic instructions.'
    },
    {
        name: 'N',
        bit: 1,
        description: 'Add/subtract: set when the last operation was a subtraction, used by `daa`.'
    },
    {
        name: 'C',
        bit: 0,
        description:
            'Carry: carry out of bit 7 (or 15), borrow for subtractions, and the bit shifted out by rotates and shifts.'
    }
] as const

/**
 * The 6 character flag strings in the instruction table (`ClrInstruction.flags` from `@specy/z80`)
 * list the flags in this order: `add a,b` is `+0V+++` (C affected, N reset, P/V holds overflow, H,
 * Z and S affected), `cpl` is `-1-1--` (N and H set, the others untouched).
 */
export const Z80_FLAG_STRING_ORDER = ['C', 'N', 'P/V', 'H', 'Z', 'S'] as const

/**
 * Meaning of one character of a flag string.
 */
export const Z80_FLAG_STRING_LEGEND: Record<string, string> = {
    '-': 'not affected',
    '+': 'affected by the result',
    '0': 'reset',
    '1': 'set',
    '*': 'undefined',
    V: 'holds the signed overflow',
    P: 'holds the parity of the result',
    ' ': 'undefined'
}

/**
 * Where the default program is assembled (`.org 0x8000`) and where the global memory tab opens.
 * The low 64 bytes of a real Z80 hold the reset and `rst` vectors, so programs traditionally live
 * higher up.
 */
export const Z80_DEFAULT_ORG = 0x8000

/**
 * Initial stack pointer. The Z80 decrements SP before writing, so the first push lands at
 * 0xFFFD-0xFFFE and the top of memory is never written by the stack itself.
 */
export const Z80_STACK_TOP = 0xffff

export const Z80_MEMORY_SIZE = 0x10000

/**
 * The console device. A Z80 has no system calls: programs reach the outside world through the
 * `in` and `out` instructions, which address one of 256 ports with the low byte of the address
 * bus. The emulator maps these ports onto the Terminal peripheral; every other port ignores writes
 * and reads as 0xFF, like an empty bus.
 *
 * `out (n),a` and `in a,(n)` put A on the high byte of the address, the `(c)` forms (`out (c),r`,
 * `in r,(c)`) put B there. Only the `WORD` port looks at that high byte.
 */
export const Z80_PORTS = {
    /**
     * Character port. Writing sends the byte to the terminal as a character (Latin-1: 0x41 prints
     * "A", 0x0A is a newline). Reading returns the next character of the current input line; when
     * no input is buffered the program pauses until a line has been typed (or, during testcases,
     * taken from the testcase input). The line is delivered with a trailing newline (0x0A) so a
     * program can read until it sees one. Reads never fail: end of input only pauses the program.
     */
    CHAR: 0x00,
    /**
     * Number port. Writing prints the byte as an unsigned decimal number (0 to 255). Reading asks
     * for a whole line, parses it as a decimal number (a leading minus sign is accepted) and
     * returns its low byte; a line that is not a number stops the program with an error.
     */
    NUMBER: 0x01,
    /**
     * Signed number port. Writing prints the byte as a signed decimal number (-128 to 127).
     * Reading behaves like the `NUMBER` port.
     */
    SIGNED: 0x02,
    /**
     * Hexadecimal port. Writing prints the byte as two upper case hexadecimal digits (no prefix).
     * Reading asks for a line, parses it as hexadecimal (an optional `0x`, `$` prefix or `h`
     * suffix is accepted) and returns its low byte; an invalid line stops the program with an error.
     */
    HEX: 0x03,
    /**
     * 16 bit number port. Writing prints the unsigned decimal value of the 16 bit number whose
     * high byte is the high byte of the port address and whose low byte is the byte written. With
     * `ld b,h` / `ld c,4` / `out (c),l` that prints HL. Reading behaves like the `NUMBER` port
     * (only the low byte can be returned).
     */
    WORD: 0x04
} as const

export type Z80PortName = keyof typeof Z80_PORTS

/**
 * Human descriptions of the console ports, for the I/O documentation page, the hover provider and
 * the coding agent's prompt. Every entry has a program that exercises the port and the text it
 * prints, so the documentation examples are runnable in the interactive editor.
 */
export const Z80_PORT_DOCS: {
    name: Z80PortName
    port: number
    title: string
    write: string
    read: string
    example: string
    exampleOutput: string
}[] = [
    {
        name: 'CHAR',
        port: Z80_PORTS.CHAR,
        title: 'Character',
        write: 'Prints the byte as a character (Latin-1). 0x0A prints a newline.',
        read: 'Returns the next character of the input line, pausing for input when the line has been consumed. The line ends with a newline character (0x0A).',
        example: `        .org 0x8000
        ld hl, msg
loop:   ld a, (hl)
        or a
        jr z, done
        out (0), a
        inc hl
        jr loop
done:   halt
msg:    .asciz "Hello!", 10   ; 10 is the newline: strings keep \\n literally`,
        exampleOutput: 'Hello!\n'
    },
    {
        name: 'NUMBER',
        port: Z80_PORTS.NUMBER,
        title: 'Unsigned number',
        write: 'Prints the byte as an unsigned decimal number, 0 to 255.',
        read: 'Reads a line, parses it as a decimal number and returns its low byte. Stops the program with an error when the line is not a number.',
        example: `        .org 0x8000
        in a, (1)       ; ask for a number
        add a, a        ; double it
        out (1), a      ; print it
        halt`,
        exampleOutput: '42 (when 21 is entered)'
    },
    {
        name: 'SIGNED',
        port: Z80_PORTS.SIGNED,
        title: 'Signed number',
        write: 'Prints the byte as a signed decimal number, -128 to 127.',
        read: 'Same as the unsigned number port.',
        example: `        .org 0x8000
        ld a, 5
        sub 10
        out (2), a
        halt`,
        exampleOutput: '-5'
    },
    {
        name: 'HEX',
        port: Z80_PORTS.HEX,
        title: 'Hexadecimal',
        write: 'Prints the byte as two upper case hexadecimal digits.',
        read: 'Reads a line, parses it as a hexadecimal number (`0x`, `$` prefix or `h` suffix accepted) and returns its low byte.',
        example: `        .org 0x8000
        ld a, 255
        out (3), a
        halt`,
        exampleOutput: 'FF'
    },
    {
        name: 'WORD',
        port: Z80_PORTS.WORD,
        title: '16 bit number',
        write: 'Prints the 16 bit number made of the high byte of the port address (register B when using `out (c),r`) and the byte written, as an unsigned decimal number.',
        read: 'Same as the unsigned number port.',
        example: `        .org 0x8000
        ld hl, 1000
        ld b, h         ; high byte goes on the address bus
        ld c, 4         ; port number
        out (c), l      ; prints HL
        halt`,
        exampleOutput: '1000'
    }
]
