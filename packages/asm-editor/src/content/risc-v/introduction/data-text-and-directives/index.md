An assembly source file contains instructions, data declarations and assembler directives. Data
declarations describe bytes the program will use. Directives guide the assembler as it arranges code
and data.

It is useful to separate four jobs a line can do:

| kind of line              | example          | what it does                                    |
| ------------------------- | ---------------- | ----------------------------------------------- |
| instruction               | `addi t0, t0, 1` | becomes code that the processor executes        |
| data declaration          | `.word 25`       | asks the assembler to place bytes in memory     |
| label                     | `total:`         | gives an address a name                         |
| other assembler directive | `.text`          | guides assembly without becoming an instruction |

An **assembler directive** is a command for the assembler. Directives begin with a dot. Some, such
as `.word`, create data bytes. Others, such as `.text`, control how the source file is assembled.
The processor does not fetch or execute directives.

## The text and data sections

Instructions and static data occupy separate regions of memory. A **section** identifies the region
for the following lines:

- `.text` begins a text section, where instructions are assembled.
- `.data` begins a data section, where static data is laid out.

The section lasts until another section directive changes it. A file can switch between the two,
although putting data first and text second is usually easiest to read.

Code and data are both stored as bits. In this editor, the text region holds instructions and the
data region provides storage for loads and stores. Branches can target instruction labels in `.text`.

The addresses below belong to this editor's 32-bit RISC-V simulator. They are its chosen memory
layout, not addresses required by the RISC-V instruction set:

| section | first address in this simulator |
| ------- | ------------------------------- |
| `.text` | `0x00400000`                    |
| `.data` | `0x10010000`                    |

Labels normally save you from writing either address yourself.

## Labels name places

You have already used a label as the destination of a branch. The same notation names data:

```riscv
.data
score:   .word 25
letters: .byte 65, 66, 67

.text
main:
    la t0, score
    la t1, letters
```

`score` is the address where the word begins, and `letters` is the address of the first byte. In the
text section, `main` is the address of the instruction after it. A label creates no bytes or
instruction. It gives a name to the address of whatever comes next.

`la` places such an address in a register. Read the word at `score` with a load:

```riscv
la t0, score
lw t1, 0(t0)
```

After these two instructions, `t0` holds the address of `score` and `t1` holds the value 25.

## Directives that create data

These common data directives are useful reference material.

| directive       | bytes it asks the assembler to place                     |
| --------------- | -------------------------------------------------------- |
| `.byte 1, 2, 3` | one byte for each value                                  |
| `.half 1, 2`    | one two-byte halfword for each value                     |
| `.word 1, 2`    | one four-byte word for each value                        |
| `.space 8`      | eight reserved bytes, initially zero in this editor      |
| `.ascii "Hi"`   | the bytes for `H` and `i`, with no byte added after them |
| `.asciz "Hi"`   | the bytes for `H` and `i`, followed by a zero byte       |

Values separated by commas are placed one after another. Multi-byte numbers use little-endian byte
order. For example, `.word 0x11223344` appears in increasing memory addresses
as `44 33 22 11`.

`.ascii` writes the characters you provide. `.asciz` also appends a zero byte, often called a
**terminator**. Code for a zero-terminated string needs that terminator; without it, the code
continues into the following bytes. A string can instead use `.ascii` with its length stored
separately.

`.space` is useful for a buffer: an area the running program fills. The number after it is a count
of bytes, whatever kind of value the program stores there.

## Aligning the next item

For the positive values used in this course, the `.align n` directive moves the next data item
forward to an address that is a multiple of `2^n`. The `n` is an exponent:

| directive  | required boundary                                |
| ---------- | ------------------------------------------------ |
| `.align 1` | a multiple of `2^1 = 2`, suitable for a halfword |
| `.align 2` | a multiple of `2^2 = 4`, suitable for a word     |
| `.align 3` | a multiple of `2^3 = 8`                          |

Thus `.align 2` advances to the next address that is a multiple of 4. If the current address already
is a multiple of 4, it stays there. Otherwise the assembler inserts enough **padding** bytes to
reach that address.

In this assembler, `.half` and `.word` align their own starting addresses. `.byte`, `.ascii`,
`.asciz` and `.space` do not. Put `.align 2` before a `.space` buffer if the program will access that
buffer with `lw` or `sw`.

## Inspect one data layout

Build this example and open the memory panel at `10010000`. The two instructions place the addresses
of `w` and `room` in `t0` and `t1`, where you can compare them with the table.

```riscv|playground|memory
.data
w:      .word 0x11223344
h:      .half 0x5566
b:      .byte 1, 2, 3
first:  .ascii "Hi"
second: .asciz "Hi"
        .align 2
room:   .space 8

.text
main:
    la t0, w
    la t1, room
```

| label or padding | address range             | bytes            | reason                     |
| ---------------- | ------------------------- | ---------------- | -------------------------- |
| `w`              | `0x10010000`–`0x10010003` | `44 33 22 11`    | one little-endian word     |
| `h`              | `0x10010004`–`0x10010005` | `66 55`          | one little-endian halfword |
| `b`              | `0x10010006`–`0x10010008` | `01 02 03`       | three bytes                |
| `first`          | `0x10010009`–`0x1001000A` | `48 69`          | `H`, `i`, no terminator    |
| `second`         | `0x1001000B`–`0x1001000D` | `48 69 00`       | `H`, `i`, zero terminator  |
| padding          | `0x1001000E`–`0x1001000F` | `00 00`          | added by `.align 2`        |
| `room`           | `0x10010010`–`0x10010017` | eight zero bytes | reserved by `.space 8`     |

The next free address after `second` is `0x1001000E`. That address is not a multiple of 4, so
`.align 2` skips two bytes and `room` begins at `0x10010010`.

## Constants with .eqv

`.eqv` gives a number a name for the assembler to use. It reserves no memory and produces no
instruction. Constants are usually written before the sections so they are easy to find:

```riscv
.eqv SIZE, 4
.eqv LIMIT, 100

.data
values: .word SIZE, LIMIT

.text
main:
    li t0, SIZE
    la t4, values
    lw t2, 0(t4)
```

Here, `SIZE` means the number 4 while the file is assembled, so `li t0, SIZE` places 4 in `t0`.
The label `values` means a memory address, so `la t4, values` places that address in `t4`, and
`lw t2, 0(t4)` reads the word stored there. `t0` receives 4 from the assembled constant. `t2`
receives 4 from the word in memory.

This is the distinction to keep:

- an `.eqv` name stands for a number known while assembling;
- a label stands for an address in the assembled program; and
- a load reads a value from memory at an address.

## Lay out and find a buffer

Write a data section that stores the three words 100, 200 and 300 at `values`, followed by eight
reserved bytes at `room`. Then leave the address of `room` in `t0`.

Three words occupy twelve bytes, so `room` should begin at `0x1001000C` in this simulator. The code
has only one instruction, and the editor stops after executing that last instruction.

```riscv|playground|memory|exercise
.data
    # declare values and room here

.text
main:
    # load the address of room here
```

```testcase
{
    "expectedRegisters": { "t0": "0x1001000C" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [100, 200, 300] }
    ]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
values: .word 100, 200, 300
room:   .space 8

.text
main:
    la t0, room
```

</details>

## A compact program shape for this editor

This is a complete small program for the editor using a constant, static data and run-time code:

```riscv|playground|memory
.eqv STEP, 1

.data
value: .word 41

.text
.globl main
main:
    la   t0, value
    lw   t1, 0(t0)
    addi t1, t1, STEP
    sw   t1, 0(t0)
```

Each piece has one job:

- `.eqv STEP, 1` declares an assembler-time constant. Leave this part out when no named constants
  are needed.
- `.data` switches to static data, and `value: .word 41` creates a named word there. A program with
  no static data can omit this section.
- `.text` switches to instructions.
- `.globl main` tells this editor to use the label `main` as the program's entry point.
- Paired with `.globl main`, `main:` names the intended entry instruction.
- The four instructions find the word, load it, add one and store 42 back. After the final
  instruction, this editor reaches the end of the text and stops.

When `.globl main` is absent, the editor starts at the first instruction in `.text`. `.globl main`
makes the intended entry point explicit.

Instructions do the work at run time. Data directives place initial bytes in memory. Labels name
addresses. Other directives tell the assembler how to arrange the file.
