Let's start with the first component of assembly languages, **registers**.

Registers are _few_, _very small_ but **extremely fast** pieces of memory inside a CPU.

They are usually (depending on the CPU) between **8 and 32** in total, and can hold very few bits
(depends on the CPU, but usually _32-bit CPUs have 32-bit registers_, etc...), but they are **very fast to access** as they
are _physically inside the CPU_ itself (unlike memory, which is further away and _slower_ to access).

Each register has a **name** that identifies it.
For example, in **M68K** there are registers: `d0`, `d1`, ..., `d7`, `a0`, `a1`, ..., `a7`.

In C you write `int x = 10;` and the compiler finds somewhere to keep `x`. Assembly has no `int x`,
the registers are the room you have, they are already named, and you pick which one holds what and
remember it yourself. Most instructions can only compute on registers, so a value that lives in
memory is loaded into a register, worked on there, and written back.

This is what each language of this editor gives you:

- **M68K**: eight data registers, `d0` to `d7`, and eight address registers, `a0` to `a7`, 32 bits each.
- **MIPS**: 32 registers, written with a `$` in front, `$t0`, `$s0`, `$a0`, etc... `$zero` always reads 0.
- **RISC-V**: 32 registers as well, `t0`, `s0`, `a0` and so on, and the one called `zero` always reads 0 here too.
- **Z80**: one 8 bit register `a`, plus the 16 bit pairs `bc`, `de` and `hl`, each of which can also be used as its two 8 bit halves.

## General Purpose Registers

These are the most common type of registers and can be used for a wide variety of tasks, like storing data, addresses, etc...
Some architectures split this category further into:

- **Data registers**: they contain _numeric data_, like numbers, characters, etc...
- **Address registers**: they contain _addresses_ and are used by instructions that _indirectly access memory_
- **Floating point**: they contain _floating point numbers_
- _etc..._

The M68K is one of the ones that split them, and some instructions take only one of the two kinds:
`add.l d1, d0` adds two data registers, `lea` writes an address register and nothing else. MIPS and
RISC-V do not split them at all, any of their 32 registers can hold a number or an address, and
nothing but your own code says which.

## Watching two registers change

Build this program and press **Step** five times, keeping an eye on `d0`, `d1` and `a0` in the
registers panel. `d0` and `d1` hold numbers, `a0` holds the address of `stored` (a label is just the
address of whatever comes after it).

```m68k|playground|no-flags
    move.l #10, d0      ; x = 10
    add.l #5, d0        ; x = x + 5
    lea stored, a0      ; a0 = &stored
    move.l (a0), d1     ; y = *a0
    add.l d1, d0        ; x = x + y

stored: dc.l 100
```

The panel writes the registers in hexadecimal, so what you see is:

| after this line   |       `d0` |       `d1` |       `a0` |
| ----------------- | ---------: | ---------: | ---------: |
| `move.l #10, d0`  | `0000000A` | `00000000` | `00000000` |
| `add.l #5, d0`    | `0000000F` | `00000000` | `00000000` |
| `lea stored, a0`  | `0000000F` | `00000000` | `00001014` |
| `move.l (a0), d1` | `0000000F` | `00000064` | `00001014` |
| `add.l d1, d0`    | `00000073` | `00000064` | `00001014` |

`0000000A` is 10, `0000000F` is 15, `00000064` is 100 and `00000073` is 115. The two data registers
count up, `a0` holds `00001014` instead, which is where the assembler put the `100`: the five
instructions start at `0x1000` and take four bytes each, so the data begins twenty bytes later.

Try changing `dc.l 100` to `dc.l 1000` and stepping through it again. `d1` comes out at `000003E8`
and `a0` does not move, because the address of `stored` is still the same.

## Special Purpose Registers

They are _special registers_ usually managed by the CPU itself and used for **specific purposes**, there will be a more in depth explanation
in future lectures. Three of them exist in one form or another in every architecture:

- **Program counter**: the address of the instruction the CPU runs next. It is written after every instruction, and a jump is nothing more than writing it on purpose.
- **Stack pointer**: the address of the top of the stack. On the M68K it is `a7`, which you can also write as `sp`.
- **Status register**: the flags, one bit each, saying how the last operation came out. Zero, negative, carry, and so on.
