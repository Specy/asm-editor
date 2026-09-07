There is no flags register on MIPS. No zero bit, no carry bit, no sign bit, no status register
anywhere: the panel the M68K and Z80 courses put above the registers is missing from every program on
this page because there is nothing to show in it.

That changes how a condition is written. On the M68K a `cmp` throws its answer away and leaves five
bits behind, and the branch on the next line reads them. Here a comparison either **is** the branch,
or it writes its answer into a register you named, the same as any other instruction.

## The branches that compare for you

Six real branch instructions, and between them they cover equality and everything against zero.

| written               | branches when               |
| --------------------- | --------------------------- |
| `beq $t0, $t1, label` | the two registers are equal |
| `bne $t0, $t1, label` | they are not equal          |
| `bltz $t0, label`     | `$t0` < 0, signed           |
| `blez $t0, label`     | `$t0` <= 0, signed          |
| `bgtz $t0, label`     | `$t0` > 0, signed           |
| `bgez $t0, label`     | `$t0` >= 0, signed          |

`beq` and `bne` are the only two that look at two registers, and all they ask is whether the bits are
the same, which needs no notion of signed or unsigned. The other four compare one register with zero,
and there they do read it as a signed number.

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

`$s0` and `$s3` come out at 1, because those two branches were not taken and the line under each of
them ran. `$s1`, `$s2` and `$s4` stay 0. Step through it and watch the `pc` register jump over the
lines the taken branches skipped.

## slt, a comparison that is a value

`slt $t2, $t0, $t1` means **set on less than**: it writes 1 into `$t2` when `$t0` is less than `$t1`
and 0 when it is not. That is C's `t2 = (t0 < t1)`, and it is where every comparison MIPS does not
have as a branch comes from.

Four of them:

- **`slt $rd, $rs, $rt`**, signed, both operands registers.
- **`sltu $rd, $rs, $rt`**, the same read as unsigned numbers.
- **`slti $rd, $rs, imm`** and **`sltiu $rd, $rs, imm`**, with a constant on the right.

```mips|playground
.text
main:
    li $t0, -1              # FFFFFFFF: -1 signed, 4294967295 unsigned
    li $t1, 1
    slt $t2, $t0, $t1       # is -1 less than 1?
    sltu $t3, $t0, $t1      # is 4294967295 less than 1?
    slti $t4, $t0, 0        # is -1 less than 0?
    sltiu $t5, $t0, 0       # is 4294967295 less than 0?
    slt $t6, $t1, $t0       # and the operands the other way round
```

`$t2` and `$t4` come out at 1, `$t3`, `$t5` and `$t6` at 0. The same two registers, the same
question, and the signed and unsigned instructions disagree about the answer, because `FFFFFFFF` is
two different numbers depending on who is reading it.

`slt` writes a whole word holding 0 or 1, not a byte and not all ones. That matters when you use the
answer as a number: `add $t3, $t3, $t2` after a `slt` counts how many times the condition held.

## The branches the assembler builds

`blt`, `bgt`, `ble`, `bge` and their unsigned forms are pseudo-instructions, and each is an `slt`
into `$at` and a branch on the result.

| you write                      | what it becomes                                  |
| ------------------------------ | ------------------------------------------------ |
| `blt $t0, $t1, label`          | `slt $at, $t0, $t1` then `bne $at, $zero, label` |
| `bge $t0, $t1, label`          | `slt $at, $t0, $t1` then `beq $at, $zero, label` |
| `bgt $t0, $t1, label`          | `slt $at, $t1, $t0` then `bne $at, $zero, label` |
| `ble $t0, $t1, label`          | `slt $at, $t1, $t0` then `beq $at, $zero, label` |
| `bltu`, `bgeu`, `bgtu`, `bleu` | the same with `sltu`                             |
| `beqz $t0, label`              | `beq $t0, $zero, label`, one instruction         |
| `bnez $t0, label`              | `bne $t0, $zero, label`, one instruction         |

Two patterns are in that table and they are worth reading off it. **Greater than** is less than with
the operands swapped, since `a > b` is `b < a`. And **greater or equal** is the negation of less
than, so the same `slt` is branched on with `beq` instead of `bne`.

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

`$s0` and `$s1` both stay 0 and `$s2` comes out at 1: the pseudo-instruction and the two real ones
below it do the same thing. Click on the `blt` line after building and the editor prints exactly
those two instructions underneath.

Writing `blt` is fine, and knowing it costs `$at` is what stops you from keeping something there.

## Picking the wrong family

`0xFFFFFFFF` is 4294967295 unsigned and -1 signed. Compared against 1, one of those is bigger and the
other is smaller, so `bltu` and `blt` disagree about the same two registers.

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

`$s0` stays 0 and `$s1` comes out at 1, from the same two registers. The rule of thumb: addresses,
sizes and counts of bytes are **unsigned**, so compare them with `sltu`, `bltu` and `bgeu`.
Differences, coordinates and anything that can go below zero are **signed**.

## The conditions of a flags machine, written here

Everything the M68K's fourteen conditions do has a shape on MIPS:

| in C                  | on MIPS                                       |
| --------------------- | --------------------------------------------- |
| `if (a == b)`         | `beq $a, $b, label`                           |
| `if (a != b)`         | `bne $a, $b, label`                           |
| `if (a < b)` signed   | `slt $at, $a, $b` and `bne $at, $zero, label` |
| `if (a < b)` unsigned | `sltu` and the same branch                    |
| `if (a == 0)`         | `beq $a, $zero, label`                        |
| `if (a < 0)`          | `bltz $a, label`                              |
| `x = (a < b)`         | `slt $x, $a, $b`, with nothing to branch on   |
| `if (a & 8)`          | `andi $at, $a, 8` and `bne $at, $zero, label` |

The last row is the one with no instruction of its own. `btst` on the M68K tests one bit and sets a
flag; here you compute the `and` into a register and branch on whether it came out zero.

## The carry that is not there

An unsigned addition that does not fit sets the carry flag on a machine that has one. MIPS has
neither the flag nor a trap for it, since `addu` wraps silently, so a program that needs to know
works it out: **when an unsigned sum wraps, it comes out smaller than either operand**.

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

`$t2` comes out at 1 and `$t3` at 1, which is the carry the hardware did not keep. `$t6` is 7 and
`$t7` is 0. Signed overflow, the same question asked of signed numbers, MIPS does answer: `add` and
`addi` raise an arithmetic overflow exception where `addu` and `addiu` wrap.

## Nothing gets in the way

On a flags machine an instruction between the comparison and the branch destroys the comparison,
because a `move` writes the flags too. Here the answer to a comparison is a word in a register you
chose, so it survives anything that does not write that register, and you can compute an address,
load something or call a subroutine between the `slt` and the branch that reads it.

The one register that is not safe is `$at`, which every pseudo-instruction in between will take.

## Your turn

The test starts `$t0` at -5 and `$t1` at 3, and wants the larger of the two, read as **signed**
numbers, in `$t2`. Use `slt` and a real branch, without `blt` or `bgt`.

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

The second one starts `$t0` at -1 and `$t1` at 1, and asks the same question twice without branching.
Leave 1 in `$t2` when `$t0` is the higher of the two read as **unsigned** numbers, and 1 in `$t3`
when it is the greater read as **signed**. Since `$t0` is `FFFFFFFF`, `$t2` comes out at 1 and `$t3`
at 0.

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
