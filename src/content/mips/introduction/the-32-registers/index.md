The 32 registers are one piece of hardware: 32 slots, 32 bits each, all built the same way and all
equally fast. The machine has opinions about exactly one of them. Everything else on this page,
every name and every rule about who is allowed to use what, is an **agreement** between programs,
written down by the people who built the first MIPS compilers and followed by everyone since.

That matters more than it sounds. If you break the agreement, nothing stops you, nothing warns you,
and the program works right up until it meets code somebody else wrote.

## Numbers first, names second

What actually goes into an instruction is a number from 0 to 31, five bits of it, which is the reason
there are exactly 32 registers and not 40. The names are the assembler's doing, and `$t0` and `$8`
are two spellings of one register.

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

Step through it and watch `$t0` go to 10 on a line that never mentions `$t0`. You will not write
register numbers, because nobody can read them, but knowing they are underneath explains things that
otherwise look arbitrary, such as why a name like `$t8` sits between `$s7` and `$k0` rather than next
to `$t7`.

## $zero, the one the hardware cares about

Register `$0`, spelled `$zero`, answers 0 to every read. Writes to it happen and are thrown away.

A register permanently stuck at 0 sounds like 31 registers and a waste. It is the opposite: it is
what lets the instruction set stay small. Adding `$zero` to something is a copy. Subtracting
something from `$zero` is a negation. Branching when two copies of `$zero` are equal is a jump that
always happens. So MIPS needs no move instruction, no negate, no clear and no unconditional jump,
because each of those is an instruction it already has with `$zero` in one slot.

You still get to write the short names. The assembler swaps them out for you:

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

`$t3` and `$t4` come out identical, which is the point of the pair: the second line is what the
first one was all along.

`$zero` has no row in the registers panel, since a row that always reads `00000000` says nothing.

## The names you need for now

Eighteen of the registers are general purpose scratch space, and you can pick any of them for
anything today:

| name           | what it is                                             |
| -------------- | ------------------------------------------------------ |
| `$t0` to `$t9` | ten of them, called **temporaries**                    |
| `$s0` to `$s7` | eight of them, called **saved**                        |
| `$sp`          | the stack pointer, which starts near the top of memory |
| `$at`          | the assembler's, and the next section is about it      |

Temporary and saved describe what happens to a register when your program calls a subroutine, and
until this course has a subroutine that distinction has nothing to bite on. "jal, jr and the calling
convention" is where it arrives and where it matters. Until then, treat all eighteen as scratch.

The remaining names, `$v0`, `$v1`, `$a0` to `$a3`, `$k0`, `$k1`, `$gp`, `$fp` and `$ra`, each belong
to a feature you have not met, and each of them turns up in the lecture that introduces its feature.
The whole list, with the numbers, is on the [MIPS documentation pages](/documentation/mips).

`$sp` is worth one program on its own, because the stack pointer behaves in a way that surprises
people:

```mips|playground
.text
main:
    move $t0, $sp       # where the stack pointer starts
    addi $sp, $sp, -8   # take eight bytes of stack
    move $t1, $sp
```

`$t0` reads `7FFFEFFC`, near the very top of the address space. After the `addi`, `$sp` and `$t1`
both read `7FFFEFF4`, which is eight **lower**. The stack grows downwards on this machine, so taking
room on it means subtracting. That subtraction is the entire operation: nothing is allocated and
nothing is cleared, and the eight bytes between the old `$sp` and the new one are yours from that
instant onwards. "The stack and $sp" builds on it.

## $at, which the assembler is using

Some of the lines you have been writing are not instructions. `li $t0, 100000` cannot be one: a MIPS
instruction is 32 bits wide and has to spell out an operation and a register inside those bits, which
leaves nowhere near enough room for a 32 bit constant. So the assembler quietly writes two
instructions, one for each half of the number, and it needs a spare register to hold the half it has
built so far.

That spare register is `$at`, and a line like `li` that the assembler expands into real instructions
is called a **pseudo-instruction**. It takes `$at` without asking and without putting anything back.

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

`$t0` still has your `11111111` on the line after you put it there. Two lines later `$t2` has
`00010000` instead, which is the top half of 100000 left behind by the first of the two instructions
`li` turned into. Nothing in the program you wrote mentions `$at` on those lines, and it was
overwritten anyway.

Build the program and click on the line `li $t1, 100000`. The editor prints the instructions it was
really assembled into underneath it, `lui $at, 0x1` and `ori $t1, $at, 0x86a0`. It does this for
every line that turned into more than one, which is how you find out which of your lines are quietly
using `$at`.

So `$at` is not yours to keep anything in. `li`, `la`, `blt`, `mul` and `rem` are the common
offenders. There is a directive, `.set noat`, that tells the assembler to stop using it, at the price
of every pseudo-instruction that needs it no longer working, and what people do in practice is
simply leave the register alone.

## hi and lo

Two more registers sit outside the 32, and only four instructions can reach them: `mult` and `div`
write them, `mfhi` and `mflo` copy them into a register you name. They are at the bottom of the
registers panel next to `pc`, and "Arithmetic, logic and bits" is where they earn their keep.

## Your turn

The test starts `$t0` at 5. Leave a copy of it in `$s0` and its negation in `$s1`, using `$zero` in
both instructions rather than `move` or `neg`.

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

The second one wants `0x12345678` in `$t0` and `$at` left at 0, which rules out `li`, since `li`
would route the number through `$at` on the way. Two real instructions do it: `lui` writes a 16 bit
constant into the **top** half of a register and clears the bottom half, and `ori` can then or the
bottom half in.

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
