A MIPS source file can contain both instructions and data. The assembler places those two kinds of
content in separate areas of memory:

- `.text` selects the area for instructions.
- `.data` selects the area for declared bytes.

These lines are **directives**. A directive is an instruction for the assembler while it builds the
program; it is not an instruction that the processor runs. The assembler gathers the contents of
each section into its own memory area, even if a source file switches between `.data` and `.text`.

When the program runs, the processor's next executed address must point to an instruction in the
text area. The data area is there for the program to use, but it is not part of the instruction
sequence.

## Place instructions and data

Here is a small file with both sections:

```mips|playground|memory
.data
message: .asciiz "Hi"
marker:  .byte 7
         .align 2
values:  .word 10, 20
room:    .space 8

.text
main:
    la $t0, message
    la $t1, values
    la $t2, room
    li $v0, 10
    syscall
```

Build it, then open the memory panel at `0x10010000`. The assembler has placed the declarations one
after another:

| label     | address      | content placed there                     |
| --------- | ------------ | ---------------------------------------- |
| `message` | `0x10010000` | `H`, `i`, and a zero byte                |
| `marker`  | `0x10010003` | one byte containing 7                    |
| `values`  | `0x10010004` | two four-byte words containing 10 and 20 |
| `room`    | `0x1001000C` | eight reserved bytes                     |

A name followed by a colon is a **label**. A label names the address of whatever comes immediately
after it. Here, `message` names the first byte of the text `Hi`, while `values` names the first of
the two words.

The three `la` lines make those addresses visible in registers. `la` means **load address**: for
example, `la $t1, values` puts the address named by `values` into `$t1`. It does not read the word
stored at that address. Compare it with `li`, which puts a number itself into a register:

```mips
la $t0, room       # $t0 gets room's address: 0x1001000C
li $t0, 12         # $t0 gets the number 12
```

The final two lines are the course's standard stop sequence. For now, use them together at the end
of a runnable program:

```mips
li $v0, 10
syscall
```

You will learn what `syscall` does in the module about talking to the outside world.

## Directives for common data

The directives below are enough for the data in this part of the course:

| directive       | what the assembler places in memory                |
| --------------- | -------------------------------------------------- |
| `.word 10, 20`  | two four-byte words                                |
| `.byte 1, 2, 3` | three individual bytes                             |
| `.asciiz "Hi"`  | the bytes for `H` and `i`, followed by a zero byte |
| `.space 8`      | eight bytes of reserved room                       |

Each comma-separated value produces another item. For example, `.word 10, 20` places two words and
therefore uses eight bytes. `.byte 1, 2, 3` uses three bytes.

The `z` in `.asciiz` is a reminder that the assembler adds a zero byte. You may also encounter
`.ascii "Hi"`; it places only the two character bytes. In concrete size terms:

| source         | bytes reserved |
| -------------- | -------------- |
| `.ascii "Hi"`  | 2              |
| `.asciiz "Hi"` | 3              |

Use `.asciiz` for course strings unless an exercise explicitly asks for the version without the
extra zero.

`.space` reserves a number of bytes without giving each byte a separate declaration. In this
Playground those bytes initially appear as zeroes. The important fact is the size: `.space 8`
reserves eight consecutive addresses.

## Keep words aligned

A word occupies four bytes. A word is **aligned** when its first address is a multiple of four.
The directive `.align 2` moves the next declaration forward, if necessary, to such an address.
For this lesson, remember the practical pair:

```mips
.align 2       # next declaration begins at a multiple of 4
.word 99       # a four-byte value
```

The `2` may look surprising. For `.align`, it is an exponent: `2` means a boundary of
2<sup>2</sup>, or 4, bytes.

Try one prediction before building this example:

```mips|playground|memory
.data
tag:    .asciiz "Hi"
        .align 2
value:  .word 99

.text
main:
    la $t0, tag
    la $t1, value
    li $v0, 10
    syscall
```

`tag` starts at `0x10010000` and uses three bytes. Without `.align 2`, the next free address would
be `0x10010003`. Predict where `value` will begin after the alignment, then build and inspect `$t1`.
It begins at `0x10010004`, the next multiple of four. The assembler leaves one padding byte between
the string and the word.

When a `.word` follows bytes or a string, writing `.align 2` makes that boundary visible in the
source instead of asking the reader to infer it. Later memory lessons will explain why aligned
addresses matter to word operations.

## Labels and named numbers

A label and a named number may look similar in source, but they stand for different things:

| source             | meaning                                  | example use      |
| ------------------ | ---------------------------------------- | ---------------- |
| `.eqv SIZE 4`      | `SIZE` becomes the fixed number 4        | `li $t0, SIZE`   |
| `values: .word 10` | `values` becomes the address of the word | `la $t1, values` |

`.eqv` reserves no memory. It simply lets you give a useful name to a fixed number:

```mips|playground
.eqv COUNT 3

.data
values: .word 100, 200, 300

.text
main:
    li $t0, COUNT       # the number 3
    la $t1, values      # an address
    li $v0, 10
    syscall
```

Use the forms shown here: give `.eqv` a name and one number, and list separate data values with
commas. Calculations performed while a program runs belong in instructions, which later lessons
will introduce as they are needed.

## Choose the starting instruction

In the small programs so far, `main` has been the first instruction in `.text`. When it is not,
place `.globl main` directly below `.text`:

```mips|playground
.text
.globl main

unused:
    li $t9, 111

main:
    li $t0, 42
    li $v0, 10
    syscall
```

In this Playground, a global label named `main` selects `main` as the program's starting point.
That is all you need from `.globl` here. Calls between parts of a program and labels shared between
files come later.

## Two to write

Write a data section holding the three words 100, 200, and 300 at `values`, followed by eight bytes
of room at `room`. Then put the address of `room` in `$t0`. The starter already includes the stop
sequence, so you can press Run when you finish.

```mips|playground|memory|exercise
.data
    # declare values and room here

.text
main:
    # put room's address in $t0
    li $v0, 10
    syscall
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
    la $t0, room
    li $v0, 10
    syscall
```

</details>

For the second exercise, `main` is not the first instruction in `.text`. Insert one directive
directly below `.text` so that the Playground starts at `main`. When it works, `$t0` will be 42 and
the earlier instruction will not change `$t9`.

```mips|playground|exercise
.text

unused:
    li $t9, 111

main:
    li $t0, 42
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 42, "$t9": 0 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
.globl main

unused:
    li $t9, 111

main:
    li $t0, 42
    li $v0, 10
    syscall
```

</details>

Keep this short map nearby while writing programs:

- `.data` selects declarations of bytes; `.text` selects instructions.
- A label such as `values:` names an address.
- `.eqv SIZE 4` gives the fixed number 4 a name and reserves no memory.
- `.word`, `.byte`, `.asciiz`, and `.space` place or reserve data.
- `.align 2` moves the next declaration to a multiple-of-four address.
- `.globl main` tells this Playground to start at `main` when it is not the first instruction.
