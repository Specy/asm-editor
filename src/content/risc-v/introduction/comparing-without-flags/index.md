There is no flags register on RISC-V. No zero bit, no carry bit, no sign bit, no status register
anywhere: the panel the M68K and Z80 courses put above the registers is missing from every program
on this page because there is nothing to show in it.

That changes how a condition is written. On the M68K a `cmp` throws its answer away and leaves five
bits behind, and the branch on the next line reads them. Here a comparison either **is** the branch,
or it writes its answer into a register you named, the same as any other instruction.

## The six branches

Six real branch instructions, and each of them compares **two registers**.

| written          | branches when               |
| ---------------- | --------------------------- |
| `beq t0, t1, l`  | the two registers are equal |
| `bne t0, t1, l`  | they are not equal          |
| `blt t0, t1, l`  | `t0` < `t1`, signed         |
| `bge t0, t1, l`  | `t0` >= `t1`, signed        |
| `bltu t0, t1, l` | `t0` < `t1`, unsigned       |
| `bgeu t0, t1, l` | `t0` >= `t1`, unsigned      |

`beq` and `bne` ask whether the bits are the same, which needs no notion of signed or unsigned. The
other four come in pairs, one signed and one unsigned, and picking the wrong one of a pair is the
most common bug on this page.

This is where RISC-V and MIPS part company, and it is the reason RISC-V code is shorter. MIPS has
`beq` and `bne` on two registers and everything else only against zero, so `blt $t0, $t1, label`
there becomes an `slt` into the assembler's scratch register and a branch on the answer, two
instructions and a register you did not know you were using. Here `blt` is one instruction and
borrows nothing.

```riscv|playground
.text
main:
    li t0, -5
    li t1, 0
    beq t0, t1, e1      # not taken
    li s0, 1
e1:
    bne t0, t1, e2      # taken
    li s1, 1
e2:
    blt t0, t1, e3      # taken: -5 is less than 0
    li s2, 1
e3:
    bge t0, t1, e4      # not taken
    li s3, 1
e4:
    bltu t0, t1, e5     # not taken: FFFFFFFB is not below 0
    li s4, 1
e5:
    li s5, 9
```

`s0`, `s3` and `s4` come out at 1, because those three branches were not taken and the line under
each of them ran. `s1` and `s2` stay 0. The `bltu` is the one to look at: the same two registers the
`blt` above compared, and the opposite answer, because `FFFFFFFB` read as an unsigned number is
4294967291 and nothing is below zero.

Step through it and watch the `pc` register jump over the lines the taken branches skipped.

## slt, a comparison that is a value

`slt t2, t0, t1` means **set less than**: it writes 1 into `t2` when `t0` is less than `t1` and 0
when it is not. That is C's `t2 = (t0 < t1)`, and it is what you write when you want the answer
rather than a jump.

Four of them, and then a set of short names for the comparisons against zero:

- **`slt`** and **`sltu`**, both operands registers, signed and unsigned.
- **`slti`** and **`sltiu`**, with a 12 bit constant on the right.
- **`seqz`**, **`snez`**, **`sltz`**, **`sgtz`**, each one real instruction, for `== 0`, `!= 0`,
  `< 0` and `> 0`.

```riscv|playground
.text
main:
    li t0, -1           # FFFFFFFF: -1 signed, 4294967295 unsigned
    li t1, 1
    slt t2, t0, t1      # is -1 less than 1?
    sltu t3, t0, t1     # is 4294967295 less than 1?
    slti t4, t0, 0      # is -1 less than 0?
    sltiu t5, t0, 0     # is 4294967295 less than 0?
    slt t6, t1, t0      # and the operands the other way round
    seqz s0, t1         # is t1 zero?
    snez s1, t1         # is it not zero?
    sltz s2, t0         # is t0 negative?
    sgtz s3, t0         # is it positive?
```

`t2` and `t4` come out at 1, `t3`, `t5` and `t6` at 0. The same two registers, the same question,
and the signed and unsigned instructions disagree about the answer, because `FFFFFFFF` is two
different numbers depending on who is reading it. `s1` and `s2` are 1 and `s0` and `s3` are 0.

`slt` writes a whole word holding 0 or 1, not a byte and not all ones. That matters when you use the
answer as a number: `add t4, t4, t2` after a `slt` counts how many times the condition held.

There is no `seq` and no `sne`. Equality as a value is a subtraction and a `seqz`: `sub t2, t0, t1`
and then `seqz t2, t2`, which is 1 exactly when the difference was zero.

## The branches the assembler builds

`bgt`, `ble`, `bgtu` and `bleu` are pseudo-instructions, and each is one of the six real branches
**with its operands swapped**, because `a > b` is `b < a`.

| you write        | what it becomes   |
| ---------------- | ----------------- |
| `bgt t0, t1, l`  | `blt t1, t0, l`   |
| `ble t0, t1, l`  | `bge t1, t0, l`   |
| `bgtu t0, t1, l` | `bltu t1, t0, l`  |
| `bleu t0, t1, l` | `bgeu t1, t0, l`  |
| `beqz t0, l`     | `beq t0, zero, l` |
| `bnez t0, l`     | `bne t0, zero, l` |
| `bltz t0, l`     | `blt t0, zero, l` |
| `bgez t0, l`     | `bge t0, zero, l` |
| `bgtz t0, l`     | `blt zero, t0, l` |
| `blez t0, l`     | `bge zero, t0, l` |

Every row is **one** real instruction. Nothing in that table costs an extra instruction and nothing
borrows a register, so writing `bgt` where you mean `bgt` is free.

```riscv|playground
.text
main:
    li t0, 3
    li t1, 7
    bgt t1, t0, taken   # 7 > 3, so taken
    li s0, 99
taken:
    blt t0, t1, again   # the same comparison, written the other way round
    li s1, 99
again:
    li s2, 1
```

`s0` and `s1` both stay 0 and `s2` comes out at 1. Click on the `bgt` line after building: it
assembled to `blt t0, t1, taken`, which is character for character the instruction on the line
below it.

## Picking the wrong family

`0xFFFFFFFF` is 4294967295 unsigned and -1 signed. Compared against 1, one of those is bigger and the
other is smaller, which is what the `blt` and the `bltu` of the first program above disagreed about.
The rule of thumb: addresses, sizes and counts of bytes are **unsigned**, so compare them with
`sltu`, `bltu` and `bgeu`. Differences, coordinates and anything that can go below zero are
**signed**.

Nothing warns you. The program runs, the branch goes the other way, and a loop over an array that
compares its pointer with `blt` works until the array is somewhere above `0x80000000`.

## The carry that is not there

An addition that does not fit sets the carry flag on a machine that has one. RISC-V has neither the
flag nor a trap for it: "Words, halves and bytes" showed that `add` simply wraps. So a program that
needs to know works it out, and the rule is that **when an unsigned sum wraps, it comes out smaller
than either operand**.

```riscv|playground
.text
main:
    li t0, 0xFFFFFFFF
    li t1, 2
    add t2, t0, t1      # wraps round to 1
    sltu t3, t2, t0     # 1: the sum is below the operand, so it wrapped
    li t4, 5
    li t5, 2
    add t6, t4, t5      # 7, no wrap
    sltu s0, t6, t4     # 0
```

`t2` comes out at 1 and `t3` at 1, which is the carry the hardware did not keep. `t6` is 7 and `s0`
is 0. Signed overflow takes two more instructions, since a signed sum overflowed exactly when the
two operands had the same sign and the answer has the other one.

## The conditions of a flags machine, written here

Everything the M68K's fourteen conditions do has a shape on RISC-V:

| in C                  | on RISC-V                                |
| --------------------- | ---------------------------------------- |
| `if (a == b)`         | `beq a, b, label`                        |
| `if (a != b)`         | `bne a, b, label`                        |
| `if (a < b)` signed   | `blt a, b, label`                        |
| `if (a < b)` unsigned | `bltu a, b, label`                       |
| `if (a == 0)`         | `beqz a, label`                          |
| `if (a < 0)`          | `bltz a, label`                          |
| `x = (a < b)`         | `slt x, a, b`, with nothing to branch on |
| `x = (a == b)`        | `sub x, a, b` and `seqz x, x`            |
| `if (a & 8)`          | `andi t0, a, 8` and `bnez t0, label`     |

The last row is the one with no instruction of its own. `btst` on the M68K tests one bit and sets a
flag; here you compute the `and` into a register and branch on whether it came out zero.

```riscv|playground
.text
main:
    li t0, 10           # 1010 in binary
    andi t1, t0, 8      # keep bit 3
    beqz t1, clear
    li t2, 1            # bit 3 was set
    j done
clear:
    li t2, 0
done:
    andi t3, t0, 1      # bit 0, which is 0 in 1010
    snez t4, t3         # 1 when the bit is set, 0 when it is not
```

`t2` comes out at 1, because bit 3 of 1010 is set, and `t3` and `t4` are both 0. `andi` with a
single bit set is C's `x & 8`, and the `snez` under it is the same test written as a value instead
of a jump.

## Nothing gets in the way

On a flags machine an instruction between the comparison and the branch destroys the comparison,
because a `move` writes the flags too. Here the answer to a comparison is a word in a register you
chose, so it survives anything that does not write that register, and you can compute an address,
load something or call a subroutine between the `slt` and the branch that reads it.

There is no register that is unsafe either. MIPS has `$at`, which every pseudo-instruction in
between will take; the only RISC-V line that takes a register you did not name is `call`, which
takes `t1`.

## Your turn

The test starts `t0` at -5 and `t1` at 3, and wants the larger of the two, read as **signed**
numbers, in `t2`. Use `slt` and one of the six real branches, without `blt` or `bgt`.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": -5, "t1": 3 },
    "expectedRegisters": { "t2": 3 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    mv t2, t0           # assume t0 is the larger
    slt t3, t0, t1      # is it smaller than t1?
    beq t3, zero, done  # no, so keep it
    mv t2, t1           # yes, so take t1
done:
```

</details>

The second one starts `t0` at -1 and `t1` at 1 and asks three questions about them without a single
branch. Leave 1 in `t2` when `t0` is the higher of the two read as **unsigned** numbers, 1 in `t3`
when it is the greater read as **signed**, and 1 in `t4` when the two are equal. Since `t0` is
`FFFFFFFF`, `t2` comes out at 1 and the other two at 0.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": -1, "t1": 1 },
    "expectedRegisters": { "t2": 1, "t3": 0, "t4": 0 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    sltu t2, t1, t0     # a > b is b < a
    slt t3, t1, t0      # the same swap, read as signed
    sub t4, t0, t1
    seqz t4, t4         # equal when the difference is zero
```

</details>
