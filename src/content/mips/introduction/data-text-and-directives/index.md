A program is two different things written in one file: instructions, and the data those
instructions work on. They want to live in different parts of memory, and they cannot simply take
turns down the page, because the CPU runs whatever it finds next and a word of data would be run as
an instruction.

So the assembler wants to be told which is which, and the way you tell it is with **sections**.

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

Open the memory panel at `10010000` and the first four bytes are `48 69 00 00`: the two characters
of `"Hi"`, the zero byte that ends the string, and one spare byte the `.align 2` skipped over to get
back to a multiple of four. The three addresses in `$t0`, `$t1` and `$t2` are where the three labels
landed.

The last two lines are how a MIPS program stops. `li $v0, 10` puts the number 10 in `$v0` and
`syscall` hands control to the environment, which reads that 10 as "this program is finished". The
"Talking to the outside world" module explains the mechanism; until then, treat those two lines as
the way you end a program.

## The data directives

| directive           | what it writes                                           |
| ------------------- | -------------------------------------------------------- |
| `.word 1, 2, 3`     | one 4 byte word per value, aligned to a multiple of 4    |
| `.half 1, 2`        | one 2 byte half per value, aligned to a multiple of 2    |
| `.byte 1, 2, 3`     | one byte per value, anywhere                             |
| `.ascii "Hi"`       | the characters, with **no** terminator                   |
| `.asciiz "Hi"`      | the characters and a zero byte after them                |
| `.space 8`          | that many bytes, left at zero and not aligned            |
| `.align n`          | moves the next thing up to a multiple of 2 to the `n`    |
| `.float`, `.double` | one 4 byte or one 8 byte floating point number per value |

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

`$t0` and `$t2` both end up holding 4, and they got there in completely different ways. `SIZE`
became a literal `4` sitting inside the `li` instruction, so nothing was read from anywhere.
`values` became the address `0x10010000`, and the `lw` went out to memory to see what was there.
One of those numbers is in your program and the other is in your data, and `.eqv` is how you choose.

The assembler does no arithmetic. `li $t0, SIZE*4` is a build error and `.word 2+3` writes two words,
a 2 and a 3, so a name multiplied by something has to be multiplied by the program, as the `sll`
above does. The one exception is an address: `lw $t2, values+4` means four bytes past the label, and
that the assembler will work out.

`.eqv` is for anything that is a fixed number your program should not have scattered through it in
raw form: the length of an array, the size of one element, a service number, the width of the
screen. Change the number at the top and every use of it changes.

## Where a program starts, and where it stops

Execution begins at the **first instruction in `.text`**, whatever that instruction happens to be.
Put a subroutine at the top of your file and the program runs the subroutine, which is not what you
meant, and then runs off the end of it in an interesting way.

`.globl main` fixes it. It marks the label `main` as global, and a global `main` becomes the entry
point wherever in the file you wrote it.

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

`jal helper` is a call: it jumps to `helper` and leaves behind the address to come back to, in the
register called `$ra`. `jr $ra` at the end of `helper` jumps to that address. Both of those get a
lecture of their own later; here they are just something for `main` to do.

`$t0` is 1, `$t9` is 111 and `$t1` is 2, so `main` ran first and `helper` ran when it was called.

Now delete the `.globl main` line and press Run. The program starts at `helper` instead, and nobody
called it, so `$ra` is still 0, and its `jr $ra` jumps to address 0. The run ends with
`invalid program counter value: 0x00000000`, which is the message you get whenever a program returns
to a place it was never called from.

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
  is where an exception handler goes. "Exceptions and coprocessor 0" uses them.
- **`.macro`** and **`.end_macro`** define a name that expands into the lines between them, with `%`
  in front of each parameter.
- **`.include "file.asm"`** pastes in another source file at that point.

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

`$t0` finishes at 20, doubled twice. A macro is **copied** into the program at every use, so those
two `double($t0)` lines are two `add` instructions sitting in memory, and a macro of ten lines used
five times is fifty instructions. A subroutine is the other way round: one copy of the body, and the
cost of a call each time you use it.

## Two to write

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
