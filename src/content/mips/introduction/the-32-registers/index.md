Getting started said MIPS has 32 registers, all 32 bits wide, and that every one of them can hold a
number or an address. That is the whole of what the hardware knows about them, with two exceptions.
Everything else on this page is a **convention**: a set of names people agreed on, which the
assembler and every compiler follow, and which nothing in the machine enforces.

## The numbers and the names

Each register has a number, `$0` to `$31`, and that number is what goes into the instruction. The
names are the assembler's, and `$t0` and `$8` are two spellings of one register.

| number      | name        | what it is for                                            |
| ----------- | ----------- | --------------------------------------------------------- |
| `$0`        | `$zero`     | always reads 0                                            |
| `$1`        | `$at`       | the assembler's scratch register                          |
| `$2`-`$3`   | `$v0`-`$v1` | values returned from a subroutine, and the syscall number |
| `$4`-`$7`   | `$a0`-`$a3` | the first four arguments to a subroutine                  |
| `$8`-`$15`  | `$t0`-`$t7` | temporaries, which a subroutine may destroy               |
| `$16`-`$23` | `$s0`-`$s7` | saved, which a subroutine must give back unchanged        |
| `$24`-`$25` | `$t8`-`$t9` | two more temporaries                                      |
| `$26`-`$27` | `$k0`-`$k1` | the exception handler's, which it takes without asking    |
| `$28`       | `$gp`       | global pointer                                            |
| `$29`       | `$sp`       | stack pointer                                             |
| `$30`       | `$fp`       | frame pointer                                             |
| `$31`       | `$ra`       | return address, written by `jal`                          |

Build this one and step through it. Every line names a register twice over, once by number and once
by name.

```mips|playground
.text
main:
    li $t0, 5
    add $8, $8, $8      # $8 is $t0, so this doubles it
    li $9, 7            # $9 is $t1
    add $t2, $t1, $t1   # so this reads the 7 that line put there
    move $t3, $29       # $29 is $sp
    move $t4, $sp       # the same register under its other name
```

`$t0` comes out at 10, `$t1` at 7 and `$t2` at 14, because `$8` and `$9` wrote the two registers
`$t0` and `$t1` name. `$t3` and `$t4` are both `7FFFEFFC`, the stack pointer, read twice under its
two spellings. Writing register numbers is legal and unreadable, and the reason to know it is that a
MIPS instruction encoding has five bits per register and no idea what a `$t0` is.

## $zero, the one that reads 0

`$zero` is the first exception the hardware makes. It answers 0 to every read, and every write to it
is carried out and thrown away.

That sounds like a wasted register until you count what it saves. A machine with a register that is
always 0 needs no move instruction, no negate, no clear, no compare with zero and no unconditional
jump, because all of them are the general instruction with `$zero` in one operand. The assembler
gives you the short names and writes the real instruction underneath:

| you write         | the assembler writes      |
| ----------------- | ------------------------- |
| `move $t1, $t0`   | `addu $t1, $zero, $t0`    |
| `neg $t1, $t0`    | `sub $t1, $zero, $t0`     |
| `not $t1, $t0`    | `nor $t1, $t0, $zero`     |
| `b label`         | `beq $zero, $zero, label` |
| `beqz $t0, label` | `beq $t0, $zero, label`   |

```mips|playground
.text
main:
    li $t0, 5
    move $t1, $t0           # a copy
    not $t2, $t0            # every bit flipped
    neg $t3, $t0            # 0 - 5
    sub $t4, $zero, $t0     # the same instruction, written out
    li $t6, 9
    add $zero, $t6, $t6     # this write goes nowhere
    add $t7, $zero, $zero   # so $zero still reads 0
    b onwards               # beq $zero, $zero, which is always taken
    li $s0, 99              # jumped over
onwards:
    li $s1, 1
```

`$t1` is 5, `$t2` is `FFFFFFFA`, `$t3` and `$t4` are both `FFFFFFFB`, which is -5, and `$t7` is 0.
`$s0` stays 0 and `$s1` comes out at 1, because the `b` jumped over the line between them.

`$zero` is not in the registers panel: a row that always reads `00000000` says nothing.

## $at, which the assembler is using

`$at` is the second exception, and this one is the assembler's rather than the hardware's. A
pseudo-instruction that needs a register to hold something halfway takes `$at`, without telling you
and without putting anything back.

```mips|playground
.data
value:  .word 7

.text
main:
    li $at, 0x11111111  # a value of your own, in $at
    move $t0, $at       # still there
    li $t1, 100000      # a constant too big for one instruction
    move $t2, $at       # and yours is gone
    la $t3, value       # an address, which is also too big
    move $t4, $at
    lui $t5, 0x1234     # the two real instructions li was assembled into
    ori $t5, $t5, 0x5678
    move $t6, $at       # these two leave $at alone
```

`$t0` comes out at `11111111` and `$t2` at `00010000`, which is the top half of 100000 that the
assembler left behind. `$t4` is `10010000`, the address of `value`, because the `la` used `$at` the
same way. `$t5` is `12345678`, put together by hand out of `lui` and `ori`, and `$t6` is still
`10010000`, because those two real instructions touch nothing but what you named.

Click on the line `li $t1, 100000` after building: the editor prints the instructions it was
assembled into underneath, which is where `lui $at, 0x1` and `ori $t1, $at, 0x86a0` come from. It
does that for every line that turned into more than one instruction, which is how you find out that
a line you wrote is using `$at`.

So `$at` is not yours. Use it and the next `li`, `la`, `blt`, `mul` or `rem` in the program takes it
away. The `.set noat` directive tells the assembler to stop using it, and every pseudo-instruction
that needs it stops working, so what people do instead is leave it alone.

## Temporaries and saved registers

`$t0` to `$t9` and `$s0` to `$s7` are eighteen registers with identical hardware and opposite
agreements about what happens across a subroutine call.

- A **temporary** may be destroyed by anything you call. If you have something in `$t3` and you call
  a subroutine, assume `$t3` is rubbish afterwards. Keeping it is the **caller's** job, which is why
  these are also called caller-saved.
- A **saved** register must come back unchanged. A subroutine that wants `$s3` for its own work
  saves the caller's `$s3` on the stack on entry and puts it back before returning, which makes
  these callee-saved.

In C those two categories are invisible: the compiler puts a variable that is only used between two
calls in a temporary, and one that has to survive a call in a saved register, and it emits the saves
for you. Here it is your agreement to keep, and there is nothing in the machine that will stop you
breaking it. The "jal, jr and the calling convention" lecture writes both sides out.

The rest of the list divides the same way:

- **`$a0` to `$a3`** carry the first four arguments into a subroutine, and anything past four goes on
  the stack. They are temporaries: a subroutine is free to use them for its own work once it has read
  them.
- **`$v0` and `$v1`** carry the answer back out. `$v0` alone for anything that fits in 32 bits, both
  for a 64 bit answer. `$v0` also carries the service number into a `syscall`, which the outside-world
  module uses on every line that prints.
- **`$k0` and `$k1`** belong to the exception handler, which can start running between any two of
  your instructions and uses them without saving them. A program that keeps something in `$k0` is
  keeping it in a register somebody else writes at a time nobody chose.

## The four the environment set up

`$gp`, `$sp`, `$fp` and `$ra` are ordinary registers that already hold something when your program
starts, or that one instruction writes for you.

```mips|playground
.text
main:
    move $t0, $sp       # where the stack pointer starts
    move $t1, $gp       # and the global pointer
    move $t2, $ra       # nothing has called us, so this is 0
    addi $sp, $sp, -8   # take eight bytes of stack
    move $t3, $sp
```

`$t0` comes out at `7FFFEFFC`, which is near the top of the address space, and `$t1` at `10008000`,
which sits in the middle of the data segment. `$t2` is 0. After the `addi`, `$sp` and `$t3` both read
`7FFFEFF4`, eight bytes lower, because **the stack grows downwards** and moving the pointer is all
that taking room means.

- **`$sp`** is the top of the stack. `lw` and `sw` through it are how a program keeps more than 32
  values, and every subroutine that saves anything moves it.
- **`$fp`** is a second pointer into the same frame, which stays still while `$sp` moves. Both are in
  "The stack and $sp". Some manuals call it `$s8`, since it is a saved register like the eight before
it; this assembler takes `$fp` and `$30` and not that name.
- **`$gp`** points into the data segment so that a global can be read as `lw $t0, 0($gp)` with one
  instruction instead of the two an `la` costs. MARS puts it at `0x10008000`.
- **`$ra`** is written by `jal`, the call instruction, with the address to come back to. `jr $ra`
  goes there.

## hi and lo

Two more registers sit outside the 32, and only four instructions reach them. `mult` and `div` write
them, `mfhi` and `mflo` read them into a register you name. They are at the bottom of the registers
panel with `pc`, and "Arithmetic, logic and bits" is where they are used.

## Your turn

The test starts `$t0` at 5. Leave a copy of it in `$s0` and its negation in `$s1`, which the panel
shows as `FFFFFFFB`, using `$zero` in both instructions instead of a `move` or a `neg`.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 5 },
    "expectedRegisters": { "$s0": 5, "$s1": -5 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    add $s0, $t0, $zero     # x + 0 is a copy
    sub $s1, $zero, $t0     # 0 - x is a negation
```

</details>

The second one wants `0x12345678` in `$t0` with `$at` left at 0, which rules out `li`. Two
instructions: put the top half in place and then or the bottom half in.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": "0x12345678", "$at": 0 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    lui $t0, 0x1234         # the top 16 bits, the low ones cleared
    ori $t0, $t0, 0x5678    # and the bottom 16 or'd in
```

</details>
