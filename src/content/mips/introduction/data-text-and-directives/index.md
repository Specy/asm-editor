A program is instructions and the data they work on, and something has to say which lines are which.
The M68K assembler has no answer to that: it walks your source from top to bottom and puts each line
at the next free address. MIPS has **sections**, so the two are separated by name and land in
different parts of memory.

## .data and .text

`.data` opens a data section and `.text` opens a code section. Everything after one of them belongs
to it until the next one, and the assembler collects all the `.data` in your file into one block and
all the `.text` into another.

- **`.text`** goes at `0x00400000`, four bytes per instruction.
- **`.data`** goes at `0x10010000`, as many bytes as each directive asks for.

`.data 0x10008000` with an address after it puts that section somewhere else, which is what a program
that wants its data at a fixed place does.

```mips|playground|memory
.eqv COUNT 4

.data
message: .asciiz "Hi"
        .align 2
numbers: .word 10, 20, 30, 40
buffer:  .space 8

.text
.globl main
main:
    la $t0, message
    la $t1, numbers
    la $t2, buffer
    li $t3, COUNT
    li $v0, 10          # service 10: end the program
    syscall
```

`$t0` comes out at `10010000`, `$t1` at `10010004` and `$t2` at `10010014`. Open the memory panel at
`10010000` and the first bytes are `48 69 00 00`, the two characters of `"Hi"`, its terminator and
the byte the `.align 2` skipped over.

That is the shape of every MIPS program in this course: constants at the top, a data section, then a
text section with `main` in it and a `syscall` at the end.

## The data directives

| directive           | what it writes                                         |
| ------------------- | ------------------------------------------------------ |
| `.word 1, 2, 3`     | one 4 byte word per value, aligned to a multiple of 4  |
| `.half 1, 2`        | one 2 byte half per value, aligned to a multiple of 2  |
| `.byte 1, 2, 3`     | one byte per value, anywhere                           |
| `.ascii "Hi"`       | the characters, with **no** terminator                 |
| `.asciiz "Hi"`      | the characters and a zero byte after them              |
| `.space 8`          | that many bytes, left at zero and not aligned          |
| `.align n`          | moves the next thing up to a multiple of 2 to the `n`  |
| `.float`, `.double` | floating point numbers, which this course does not use |

```mips|playground|memory
.data
w:      .word 0x11223344
h:      .half 0x5566
b:      .byte 1, 2, 3
s1:     .ascii "Hi"
s2:     .asciiz "Hi"
        .align 2
room:   .space 8

.text
main:
    la $t0, w
    la $t1, h
    la $t2, b
    la $t3, s1
    la $t4, s2
    la $t5, room
    li $v0, 10
    syscall
```

| label  | address      | bytes         | what it is                          |
| ------ | ------------ | ------------- | ----------------------------------- |
| `w`    | `0x10010000` | `44 33 22 11` | one word, lowest byte first         |
| `h`    | `0x10010004` | `66 55`       | one half                            |
| `b`    | `0x10010006` | `01 02 03`    | three single bytes                  |
| `s1`   | `0x10010009` | `48 69`       | `H` and `i`, and nothing after them |
| `s2`   | `0x1001000B` | `48 69 00`    | the same two, terminated            |
| `room` | `0x10010010` | eight zeroes  | reserved, and word aligned          |

`s1` runs straight into `s2`, so a program that prints `s1` prints `HiHi`: `.ascii` writes what you
gave it and no more, and a string with nothing marking its end is a string nothing can find the end
of. `.asciiz` is the one to use, and the `z` is for the zero.

`room` would have started at `0x1001000E` without the `.align 2`, which is even but not a multiple of
four, so the first `sw` into it would have ended the run. `.word` and `.half` align themselves;
`.space` and the two string directives do not.

## Labels and .eqv

A label goes at the start of a line and ends with a colon. It is a name for the address of whatever
comes next, and nothing distinguishes a label on an instruction from a label on a `.word`: both are
addresses, and `la $t0, main` is as legal as `la $t0, numbers`.

`.eqv` gives a name to a number, without a colon and without a comma, and the assembler replaces the
name with the number everywhere it appears. It reserves no memory and produces no instruction.

```mips|playground|memory
.eqv SIZE 4
.eqv LIMIT 100

.data
values: .word SIZE, LIMIT

.text
main:
    li $t0, SIZE            # the number 4, inside the instruction
    li $t1, LIMIT
    lw $t2, values          # the word at values, read from memory
    sll $t3, $t0, 2         # SIZE * 4, done by the program
    li $v0, 10
    syscall
```

`$t0` and `$t2` both come out at 4, and they got there in completely different ways: `SIZE` became a
`4` inside the instruction, while `values` became the address `0x10010000` and the instruction went
to memory for what was there. `$t3` is 16.

The assembler does no arithmetic. `li $t0, SIZE*4` is a build error and `.word 2+3` writes two words,
a 2 and a 3, so a name multiplied by something has to be multiplied by the program, as the `sll`
above does. The one exception is an address: `lw $t2, values+4` means four bytes past the label, and
that the assembler will work out.

Use `.eqv` for anything you would write as a `#define` in C: the length of an array, the size of an
element, a syscall number, a screen width.

## Where a program starts, and where it stops

Execution begins at the **first instruction in `.text`**, whatever it is called. Put a subroutine at
the top of your file and the program runs the subroutine, hits its `jr $ra` with `$ra` still 0, and
ends with `invalid program counter value: 0x00000000`.

`.globl main` fixes that. It marks the label `main` as global, and a global `main` becomes the entry
point wherever in the file it is written.

```mips|playground
.text
.globl main

helper:
    li $t9, 111
    jr $ra

main:
    li $t0, 1
    jal helper          # call it, so $ra holds somewhere to come back to
    li $t1, 2
    li $v0, 10
    syscall
```

`$t0` is 1, `$t9` is 111 and `$t1` is 2, so `main` ran first and `helper` ran when it was called.
Delete the `.globl main` line and press Run: the program starts at `helper`, and the `jr $ra` on its
second line jumps to address 0.

The other end matters as much. **A MIPS program ends with `li $v0, 10` and `syscall`**, and without
it execution carries straight on into whatever is written next. If that is a subroutine, the program
runs it, returns to the middle of `main` through the `$ra` the last call left there, and goes round
until the Playground's instruction budget runs out. Every program in this course that has a
subroutine ends with those two lines before the first one.

## The rest of the directives

- **`.globl name`** makes a label visible outside the file. `main` is the one that matters here.
- **`.extern name size`** declares a label defined somewhere else and reserves `size` bytes for it in
  the global data area, which is what `$gp` points near.
- **`.ktext`** and **`.kdata`** are the kernel forms of `.text` and `.data`, and `.ktext 0x80000180`
  is where an exception handler goes. "Exceptions, coprocessor 0 and interrupts" uses them.
- **`.macro`** and **`.end_macro`** define a name that expands into the lines between them, with `%`
  in front of each parameter.
- **`.include "file.asm"`** pulls in another file, which this editor's single-file projects have no
  use for.

```mips|playground
.macro double(%reg)
    add %reg, %reg, %reg
.end_macro

.text
main:
    li $t0, 5
    double($t0)
    double($t0)
    li $v0, 10
    syscall
```

`$t0` comes out at 20. A macro is copied into the program at every use, so those two lines are two
`add` instructions, and a macro that took ten lines would be ten instructions each time. A
subroutine is the alternative that costs one call.

## Your turn

Write a data section holding the three words 100, 200 and 300 at `values`, followed by eight bytes of
room at `room`, and leave the address of `room` in `$t0`. Three words take twelve bytes, so it comes
out at `0x1001000C`.

```mips|playground|memory|exercise
.data
    # your data here

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": "0x1001000C" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [100, 200, 300] }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
values: .word 100, 200, 300
room:   .space 8

.text
main:
    la $t0, room        # the address of the reserved bytes
    li $v0, 10
    syscall
```

</details>

The second one has the subroutine written above `main`, so the program starts in the wrong place and
ends on a jump to address 0. Add the one line that makes `main` the entry point.

```mips|playground|exercise
.text

helper:
    li $t9, 111
    jr $ra

main:
    li $t0, 1
    jal helper
    li $t1, 2
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 1, "$t1": 2, "$t9": 111 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
.globl main

helper:
    li $t9, 111
    jr $ra

main:
    li $t0, 1
    jal helper
    li $t1, 2
    li $v0, 10
    syscall
```

</details>
