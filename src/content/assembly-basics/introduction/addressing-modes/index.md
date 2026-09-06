We saw in the previous lecture that the syntax of an instruction is:

```
<instruction mnemonic> <operand1>, <operand2>, ...
```

Where operands can be registers, memory addresses, immediate values (a constant value), etc...
These different kinds of operands are called _addressing modes_, they determine how the CPU interprets the operands of an instruction.

Each CPU has its own set of addressing modes, and each assembly language has its own syntax for them.
But it generally boils down to:

- **Immediate**: The operand is a constant value, for example a number, character, etc...
- **Register**: The operand is the name of a register, depending on the CPU architecture, this register addressing mode can be further divided, for example for address and data registers
- **Direct**: The operand is a memory address, represented by the number of the memory location. This can be either a constant value or a label. The assembler will replace the label with the actual address during assembly.
- **Indirect**: The operand is a memory address, but the address is stored in a register. This means that the CPU will first read the value of the register, and then use that value as the address to access memory.
- **Indexed**: The operand is a memory address, but the address is calculated by adding an offset to the value of a register. This means that the CPU will first read the value of the register, add the offset to it, and then use that value as the address to access memory.
- **Implicit**: The operand is implied by the instruction itself and does not need to be specified.
  etc...

## The same modes in C

You write every one of them in C already, without giving them a name:

- **Immediate** is the literal in `x = 7`. The 7 travels inside the instruction.
- **Register** is `x = y`, when `y` is a variable the compiler decided to keep in a register.
- **Direct** is a global read by its name, `x = total`, where `total` sits at an address the assembler knows while it assembles.
- **Indirect** is `x = *p`. The pointer is in a register, and the CPU goes and reads whatever it points at.
- **Indexed** is `x = p[i]`. The address is the pointer plus the index, worked out while the instruction runs.

In M68K syntax that is `#7`, `d0`, `numbers`, `(a0)` and `(a0, d4)`, in that order.

## One program, five modes

Build this one, open the memory panel next to it and press **Step** eight times. The five modes are
in the five `move` instructions that read something, and the ninth line writes back through the
indexed mode, which is the change you can watch in memory.

```m68k|playground|memory|no-flags
    move.l #7, d0           ; x = 7
    move.l d0, d1           ; y = x
    move.l numbers, d2      ; z = numbers[0]
    lea numbers, a0         ; p = &numbers
    move.l (a0), d3         ; w = *p
    move.l #8, d4           ; i = the byte offset of numbers[2], two longs of 4 bytes
    move.l (a0, d4), d5     ; v = numbers[2]
    move.l d0, (a0, d4)     ; numbers[2] = x

numbers: dc.l 10, 20, 30, 40
```

| line                  | mode      | where the address comes from                                      |
| --------------------- | --------- | ----------------------------------------------------------------- |
| `move.l #7, d0`       | immediate | there is no address, the 7 is part of the instruction             |
| `move.l d0, d1`       | register  | there is no address either, the value is in the register          |
| `move.l numbers, d2`  | direct    | the assembler wrote the address of `numbers` into the instruction |
| `move.l (a0), d3`     | indirect  | the address is whatever is in `a0` when the line runs             |
| `move.l (a0, d4), d5` | indexed   | the address is `a0` plus `d4`, added while the line runs          |

The four longs are written by the assembler right after the code. The eight instructions start at
`0x1000` and take four bytes each, so `numbers` begins at `0x1020`, which is also where `a0` ends up.
Click `a0` in the registers panel and the memory panel jumps to that address, where the four longs
are:

|  address |   value    |
| -------: | :--------: |
| `0x1020` | `0000000A` |
| `0x1024` | `00000014` |
| `0x1028` | `0000001E` |
| `0x102C` | `00000028` |

`0000000A` is 10, `00000014` is 20, `0000001E` is 30 and `00000028` is 40. After the last
instruction the long at `0x1028` reads `00000007`, because `(a0, d4)` with `a0` at `0x1020` and `d4`
at 8 is the address `0x1028`, and this time it was the destination.

The reads land in the registers the same way: `d2` and `d3` both come out at `0000000A`, one through
the address the assembler knew and one through the address in `a0`, and `d5` comes out at `0000001E`.

Try changing `move.l #8, d4` to `move.l #12, d4`. The same two instructions now read and write
`numbers[3]`, and `0x102C` is the long that changes.
