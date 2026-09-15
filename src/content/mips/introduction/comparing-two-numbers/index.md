Every program has to ask questions about numbers and do different things with the answers. Is this
one equal to that one. Is it bigger. Have we run off the end of the array yet. MIPS answers all of
them with two ideas, and this page is both of them.

The first is that some questions come with the decision built in:

```
    beq $t0, $t1, same_thing
```

"If `$t0` and `$t1` hold the same bits, carry on at `same_thing`; otherwise carry on at the next
line." One instruction, asked and acted on.

The second is that a comparison does not have to be a jump at all. It can be an instruction like any
other, reading two registers and writing a number into a third:

```
    slt $t2, $t0, $t1
```

That one leaves 1 in `$t2` if `$t0` is less than `$t1`, and 0 if it is not. Nothing jumps. The
answer is now a value, and you can branch on it later, add it up, store it, or pass it to a
subroutine. Everything else on this page is built out of those two instructions.

## The branches that ask and jump

Six real branch instructions, covering equality and every comparison against zero.

| written               | branches when               |
| --------------------- | --------------------------- |
| `beq $t0, $t1, label` | the two registers are equal |
| `bne $t0, $t1, label` | they are not equal          |
| `bltz $t0, label`     | `$t0` < 0, signed           |
| `blez $t0, label`     | `$t0` <= 0, signed          |
| `bgtz $t0, label`     | `$t0` > 0, signed           |
| `bgez $t0, label`     | `$t0` >= 0, signed          |

`beq` and `bne` compare two registers, and all they ask is whether the 32 bits are identical, so it
makes no difference whether you meant them as signed or unsigned numbers. The other four compare one
register against zero, and there the question does depend on the reading, so those four take the
signed one.

```mips|playground
.text
main:
    li $t0, -5
    li $t1, 0
    beq $t0, $t1, e1        # not taken
    li $s0, 1
e1:
    bne $t0, $t1, e2        # taken
    li $s1, 1
e2:
    bltz $t0, e3            # taken: -5 is negative
    li $s2, 1
e3:
    bgez $t0, e4            # not taken
    li $s3, 1
e4:
    blez $t0, e5            # taken
    li $s4, 1
e5:
    li $s5, 9
```

Every `li $s..., 1` in that program is the line **after** a branch, so it runs only when the branch
above it was not taken. `$s0` and `$s3` end up at 1, and the other three stay at 0. Step through it
and watch `pc` skip over the lines that a taken branch jumped past.

That shape, a branch followed by the code for when the branch was **not** taken, is the shape of
every `if` you will write, and it takes a little getting used to: the condition you write is the one
that goes somewhere else.

## slt, a comparison you can hold on to

`slt` is short for **set on less than**. `slt $t2, $t0, $t1` writes 1 into `$t2` when `$t0` is less
than `$t1`, and 0 when it is not, and goes on to the next line either way.

There are four of them: `slt` and `sltu` compare two registers, signed and unsigned, and `slti` and
`sltiu` do the same with a constant on the right instead of a second register.

```mips|playground
.text
main:
    li $t0, -1              # FFFFFFFF
    li $t1, 1
    slt $t2, $t0, $t1       # is -1 less than 1?
    sltu $t3, $t0, $t1      # is 4294967295 less than 1?
    slti $t4, $t0, 0        # is -1 less than 0?
    sltiu $t5, $t0, 0       # is 4294967295 less than 0?
    slt $t6, $t1, $t0       # and the operands the other way round
```

`$t2` and `$t4` come out at 1 and the other three at 0. The first two lines are worth staring at:
same two registers, same question in English, opposite answers. `FFFFFFFF` is -1 to `slt` and
4294967295 to `sltu`, and neither of them is making a mistake.

One detail that matters when you use the answer as a number rather than as a condition: `slt` writes
a whole 32 bit word holding exactly 0 or exactly 1. So `add $t9, $t9, $t2` after a `slt` counts the
number of times the condition held, and a sequence of `slt` results can be added, shifted or stored
like any other integer.

## The comparisons the assembler builds for you

Six branches and four `slt`s do not include "branch if `$t0` is less than `$t1`", which is a thing
programs want on nearly every page. You can still write it:

```
    blt $t0, $t1, label
```

`blt` is a pseudo-instruction. The assembler puts the comparison and the branch together out of the
parts that do exist: an `slt` into `$at`, then a `bne` against `$zero` to jump when the answer was 1.

| you write                      | what it becomes                                  |
| ------------------------------ | ------------------------------------------------ |
| `blt $t0, $t1, label`          | `slt $at, $t0, $t1` then `bne $at, $zero, label` |
| `bge $t0, $t1, label`          | `slt $at, $t0, $t1` then `beq $at, $zero, label` |
| `bgt $t0, $t1, label`          | `slt $at, $t1, $t0` then `bne $at, $zero, label` |
| `ble $t0, $t1, label`          | `slt $at, $t1, $t0` then `beq $at, $zero, label` |
| `bltu`, `bgeu`, `bgtu`, `bleu` | the same four with `sltu`                        |
| `beqz $t0, label`              | `beq $t0, $zero, label`, one instruction         |
| `bnez $t0, label`              | `bne $t0, $zero, label`, one instruction         |

Two tricks are doing all the work in that table, and they are worth learning as tricks rather than
as rows, because you will need them by hand the first time you write a loop condition that does not
fit one of the names:

- **Greater than is less than backwards.** "`a` > `b`" and "`b` < `a`" are the same question, so
  `bgt` is `blt` with the operands swapped.
- **Greater or equal is the opposite of less than.** So it is the same `slt`, branched on with `beq`
  instead of `bne`.

```mips|playground
.text
main:
    li $t0, 3
    li $t1, 7
    blt $t0, $t1, taken     # 3 < 7, so taken
    li $s0, 99
taken:
    slt $at, $t0, $t1       # the same comparison, written out
    bne $at, $zero, again   # and the same branch
    li $s1, 99
again:
    li $s2, 1
```

Neither `li $s..., 99` runs: the pseudo-instruction and the two real instructions below it do the
same thing, in the same number of cycles, because they **are** the same two instructions. Build the
program and click on the `blt` line and the editor prints them underneath it.

Write `blt`. It reads better. Just remember it has spent `$at`, so nothing of yours can be living
there.

## Signed or unsigned is your decision

`0xFFFFFFFF` is 4294967295 read one way and -1 read the other. Against 1, one of those is larger and
one is smaller, so `blt` and `bltu` will genuinely disagree about the same two registers.

```mips|playground
.text
main:
    li $t0, 0xFFFFFFFF
    li $t1, 1
    blt $t0, $t1, signed_smaller    # taken: -1 is less than 1
    li $s0, 1
signed_smaller:
    bltu $t0, $t1, unsigned_smaller # not taken: 4294967295 is not
    li $s1, 1
unsigned_smaller:
    li $s2, 9
```

`$s0` stays 0 and `$s1` ends at 1, from one pair of registers and two instructions that differ by a
letter. Nothing in the register says which one you meant, so picking the family is a decision you
have to make every time, and the rule of thumb is short:

- addresses, sizes, lengths and counts of bytes are **unsigned**, so use `sltu`, `bltu`, `bgeu`;
- differences, coordinates, temperatures and anything that can legitimately go below zero are
  **signed**.

The classic bug is comparing an address with `blt`. Addresses near the top of memory have their top
bit set, so the signed comparison reads them as large negative numbers and the loop ends
immediately or never.

## Did that addition wrap?

`addu` never complains, it just wraps: add 2 to `0xFFFFFFFF` and you get 1. Sometimes a program
needs to know that happened, and the way to find out is to ask a question about the answer.

**An unsigned sum that wrapped comes out smaller than the number you added to.** It has to: wrapping
means the true answer was too big for 32 bits, so what is left after the top bit falls off is less
than either operand. That is a comparison, and comparisons are `sltu`.

```mips|playground
.text
main:
    li $t0, 0xFFFFFFFF
    li $t1, 2
    addu $t2, $t0, $t1      # wraps round to 1
    sltu $t3, $t2, $t0      # 1: the sum is below the operand, so it wrapped
    li $t4, 5
    li $t5, 2
    addu $t6, $t4, $t5      # 7, no wrap
    sltu $t7, $t6, $t4      # 0
```

`$t3` is 1 and `$t7` is 0, and those two bits are worked out by your program rather than remembered
by the hardware. The signed version of the same question MIPS does answer for you: `add` and `addi`
stop the program with an arithmetic overflow where `addu` and `addiu` wrap quietly.

## The answer keeps until you want it

Because the result of a comparison is an ordinary word in a register you chose, it stays there. You
can do the `slt` at the top of a loop, load something, work out an address, even call a subroutine,
and then branch on the answer ten lines later. It survives everything that does not write that
particular register.

The one register that is not safe for it is `$at`, since any pseudo-instruction in between takes
`$at` for itself.

## Three to work out

The test starts `$t0` at -5 and `$t1` at 3, and wants the larger of the two, read as **signed**
numbers, in `$t2`. Use `slt` and a real branch, not `blt` or `bgt`.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": -5, "$t1": 3 },
    "expectedRegisters": { "$t2": 3 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    move $t2, $t0           # assume $t0 is the larger
    slt $t3, $t0, $t1       # is it smaller than $t1?
    beq $t3, $zero, done    # no, so keep it
    move $t2, $t1           # yes, so take $t1
done:
```

</details>

The second one asks the same question twice and forbids branching at all. `$t0` starts at -1 and
`$t1` at 1. Leave 1 in `$t2` if `$t0` is the higher of the two read as **unsigned**, and 1 in `$t3`
if it is the greater read as **signed**. One of those is true and the other is not.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": -1, "$t1": 1 },
    "expectedRegisters": { "$t2": 1, "$t3": 0 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    sltu $t2, $t1, $t0      # a > b is b < a
    slt $t3, $t1, $t0       # the same swap, read as signed
```

</details>

The third asks a question with two halves. `$t0` starts at 15, and you want 1 in `$t2` when `$t0` is
between 10 and 20 inclusive, and 0 when it is outside that range. No branches: work out the two
conditions as values and combine them.

Two hints. `slti $t1, $t0, 10` leaves 1 when `$t0` is **below** 10, which is the opposite of what
you want, and `xori $t1, $t1, 1` turns a 1 into a 0 and a 0 into a 1. And "both of these are true"
is an `and`, because each condition is already a 1 or a 0.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": 15 },
    "expectedRegisters": { "$t2": 1 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    slti $t1, $t0, 10       # 1 when below 10
    xori $t1, $t1, 1        # flipped, so 1 when 10 or more
    slti $t2, $t0, 21       # 1 when 20 or less
    and $t2, $t1, $t2       # 1 only when both held
```

</details>
