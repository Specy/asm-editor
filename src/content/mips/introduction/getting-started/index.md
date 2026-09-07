[Assembly basics](/learn/courses/assembly-basics) went through registers, memory, branching and the
stack once, using whichever language made each point clearest. From here on there is one language,
MIPS.

## The machine

**MIPS** is short for Microprocessor without Interlocked Pipeline Stages, a design that came out of
John Hennessy's group at Stanford between 1981 and 1984 and was sold from 1985 as the R2000. It ran
Silicon Graphics workstations, the PlayStation and the Nintendo 64, and it is the architecture most
university courses teach, because it was drawn to be small enough to explain. It works with:

- **32 registers**, 32 bits each, written with a `$` in front. They have numbers, `$0` to `$31`, and
  names, `$t0`, `$s0`, `$a0` and so on. Every one of them can hold a number or an address.
- **`$zero`**, which is `$0`, always reads 0 and cannot be written. It is a register in the sense
  that you can name it in any instruction, and the hardware answers 0 whatever you do to it.
- **`hi` and `lo`**, two registers of their own that only multiplication and division write.
- **Memory**, one large array of bytes, reached with a 32 bit address. This editor puts your code at
  `0x00400000` and your data at `0x10010000`, and the stack pointer starts at `0x7fffeffc`.
- **No flags.** There is no zero bit, no carry bit and no status register. The flags panel the M68K
  and Z80 courses show you is missing here because there is nothing to put in it, and comparisons
  are done differently, which is a lecture of its own later on.

MIPS is a **load/store architecture**: arithmetic works on registers and nothing else, and the only
instructions that touch memory are the loads and the stores. `lw $t0, 0($t1)` reads a word into a
register and `sw $t0, 0($t1)` writes one back, and there is no `add` that reads memory.

It is also **little endian**: the lowest byte of a number goes at the lowest address, so a word you
wrote as `0x12345678` reads in memory as `78 56 34 12`.

## The simulator

There is no MIPS chip in your browser, there is a simulator, and this one follows **MARS**, the MIPS
Assembler and Runtime Simulator written by Pete Sanderson and Ken Vollmar. Printing, reading input
and asking for the time go through the instruction `syscall`, which is taught in the "Talking to the
outside world" module of this course. Until then, programs show what they did in the registers and
the memory.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing.

- A **comment** starts at a `#` and runs to the end of the line.
- A **label** goes at the start of the line and ends with a colon: `main:`. It is a name for the
  address of whatever comes next, code or data. The colon is required.
- A **directive** starts with a dot and is addressed to the assembler instead of the CPU. `.data`
  and `.text` open the two sections, `.word` writes data, `.space` reserves room. They get a lecture
  of their own, ".data, .text and directives", later in this course.
- Everything else is **indented**, one instruction per line. Four spaces is what these courses use.
- **Case does not matter** for the instruction names, and register names are lower case.

Numbers can be written in three ways, and there is no `#` in front of them: an operand that is a
number is a number, and an operand that is a register has a `$`.

| written | means                 |
| ------- | --------------------- |
| `100`   | decimal 100           |
| `0x64`  | hex, the same 100     |
| `'d'`   | the ASCII code of `d` |

There is no binary literal: `0b1100100` does not assemble. Negative numbers are written with a
minus, `-1`.

## Your first program

This one puts two numbers in registers and adds them. Press **Build**, then **Run**, and read the
answer in `$t2` in the registers panel.

```mips|playground
.text
main:
    li $t0, 10          # x = 10
    li $t1, 32          # y = 32
    add $t2, $t0, $t1   # z = x + y
```

`li $t0, 10` loads the number 10 into `$t0`, and the line under it does the same with 32 and `$t1`.
`add $t2, $t0, $t1` reads the two registers on the right, adds them, and writes the answer into the
one on the left, so `$t2` comes out at 42 and neither of the other two is touched.

**Build** assembles what you wrote and points the simulator at the first instruction, **Run** runs
the program to the end, and **Step** runs one instruction at a time. The `pc` register at the bottom
of the panel is the address of the instruction that runs next, and it starts at `0x00400000`.

Nothing in the program says "stop". The simulator ends a program when there is no next instruction
to run, which here is the end of what you wrote. Real MIPS programs end with a `syscall`, which the
outside-world module teaches.

Try changing `add $t2, $t0, $t1` to `add $t0, $t0, $t1` and see the answer come out in `$t0`
instead, on top of the 10 that was there.

## Three operands, destination first

Nearly every MIPS instruction names three registers: the one it writes and the two it reads. That is
the biggest difference from the M68K, where `add.l d1, d0` overwrites `d0` because one of the two
operands has to be the destination. Here nothing is overwritten unless you name it.

The destination is the **first** operand, and the order of the other two matters for anything that
is not addition.

```mips|playground
.text
main:
    li $t0, 10
    li $t1, 3
    sub $t2, $t0, $t1       # z = x - y
    sub $t3, $t1, $t0       # and the other way round
    add $t4, $t0, $zero     # a copy of x, since $zero always reads 0
    li $t5, 7
    add $zero, $t5, $t5     # this write goes nowhere
    add $t6, $zero, $zero   # so $zero is still 0
```

`$t2` comes out at 7 and `$t3` at `0xFFFFFFF9`, which is -7: the same two numbers subtracted the
other way round. `$t4` is 10, because adding `$zero` to a register copies it, which is how you move
a value from one register to another. `$t6` is 0, because the `add $zero, $t5, $t5` above it was
carried out and its answer thrown away.

`$zero` is not in the registers panel, since a row that always reads `00000000` tells you nothing.

## Memory needs a load and a store

A number in memory is not an operand. To work on it you load it into a register, do the arithmetic
there, and store it back. Build this one with the memory panel next to it, type `10010000` in its
address box, then Run.

```mips|playground|memory
.data
total:  .word 25

.text
main:
    li $t0, 100         # x = 100
    la $t1, total       # p = &total
    lw $t2, 0($t1)      # y = *p
    add $t0, $t0, $t2   # x = x + y
    sw $t0, 0($t1)      # *p = x
```

`la $t1, total` (load address) puts the **address** of `total` in `$t1`, which comes out at
`0x10010000`, the first address of the data section. `lw $t2, 0($t1)` reads the word 4 bytes long at
that address, so `$t2` is 25. After the `sw` the four bytes at `0x10010000` read `7D 00 00 00`,
which is 125 written the little endian way round.

The `0($t1)` is the only addressing mode the loads and stores have: a register plus a constant. The
constant is a byte offset, so `4($t1)` is the next word along and `-4($t1)` the one before it.

Try changing `sw $t0, 0($t1)` to `sw $t0, 4($t1)` and watching which four bytes change in the panel.

## The panels

The **registers panel** lists all 32 by name, with `pc`, `hi` and `lo` under them. The **B**, **W**
and **L** buttons in its header cut each register into bytes, halves or one word, and hovering a
value shows its signed and unsigned readings.

The **memory panel** shows the bytes at whatever address you type into it. `0x00400000` is the code,
`0x10010000` is the data, and the stack is at the top of the address space.

The **screen panel** is a grid of pixels that a MIPS program draws on by writing to memory, and a
comment line beginning `# @screen` in your program says how big it is and where it lives. Both of
those are the "The bitmap display and the keyboard registers" lecture. The **console** below the
editor is where a program prints, which needs `syscall` and waits for the outside-world module.

## Your turn

The test starts `$t0` at `0x2A`, which is 42. Leave the number 100 in `$t1`, and `$t0` plus 100 in
`$t2`, which comes out at `0x8E`.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": "0x2A" },
    "expectedRegisters": { "$t1": 100, "$t2": "0x8E" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t1, 100             # the number itself
    add $t2, $t0, $t1       # both operands read, a third register written
```

</details>

The second one has a word holding 10 at `value`, which the `.data` section puts at `0x10010000`. Add
32 to it, write the answer back to the same place and leave it in `$t0` as well.

```mips|playground|memory|exercise
.data
value:  .word 10

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": 42 },
    "expectedMemory": [{ "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [42] }]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
value:  .word 10

.text
main:
    la $t1, value       # p = &value
    lw $t0, 0($t1)      # x = *p
    addi $t0, $t0, 32   # x = x + 32
    sw $t0, 0($t1)      # *p = x
```

</details>
