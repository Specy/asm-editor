A program normally runs one instruction after another. A **branch** lets it ask a question and
choose which instruction comes next.

A **label** is a name for a particular place in the instructions. It is written on a line ending
in a colon:

```riscv
same:
    li t2, 1
```

Here, `same` names the place where `li t2, 1` begins. The label is not an instruction of its own.
Another instruction can use the name `same` as a destination.

## Taken or fall-through

This branch compares two registers:

```riscv
beq t0, t1, same
```

Read it as: **if `t0` equals `t1`, continue at `same`**.

There are two possible paths:

```text
compare t0 with t1
       |
       +-- equal --------> branch taken ------> continue at same
       |
       +-- not equal ----> fall through ------> execute the next instruction
```

When the condition is true, the branch is **taken**. Execution continues at the instruction named
by the label. When the condition is false, the branch is **not taken**, and execution **falls
through** to the next line.

Here is a small example. Assume all four registers start at 0:

```riscv
    li t0, 4
    li t1, 9
    bge t0, t1, done
    li t2, 1
done:
    li t3, 1
```

`bge` asks whether `t0` is greater than or equal to `t1`. Here it asks whether 4 is at least 9, so
the answer is no. The branch falls through and both `li` instructions run. At the end, `t2` and
`t3` both hold 1.

If `t0` held 12 instead, the branch would be taken. Execution would continue at `done`, skipping
`li t2, 1`. Then `t2` would remain 0 and `t3` would become 1.

A branch does not write an answer into a destination register. Its effect is only the choice of
which instruction comes next.

## The six register comparisons

RISC-V has six real branch instructions for comparing two registers.

| instruction form       | branch is taken when                                       |
| ---------------------- | ---------------------------------------------------------- |
| `beq t0, t1, label`    | `t0` and `t1` are equal                                    |
| `bne t0, t1, label`    | `t0` and `t1` are not equal                                |
| `blt t0, t1, label`    | `t0` is less than `t1`, using signed values                |
| `bge t0, t1, label`    | `t0` is greater than or equal to `t1`, using signed values |
| `bltu t0, t1, label`   | `t0` is less than `t1`, using unsigned values              |
| `bgeu t0, t1, label`   | `t0` is greater than or equal to `t1`, using unsigned values |

The names are easier to read when split into parts:

- `b` means **branch**;
- `eq` and `ne` mean **equal** and **not equal**;
- `lt` and `ge` mean **less than** and **greater than or equal**; and
- a final `u` means that the ordering is **unsigned**.

The first register is on the left of the comparison. For example,
`blt t0, t1, smaller` asks whether `t0 < t1`. Operand order matters for the ordering branches.

There is no separate real instruction for “greater than.” Reverse the registers instead:
`blt t1, t0, label` asks whether `t0` is greater than `t1`.

## Comparing with zero

Every branch above compares registers, not a register and an immediate number. When the number you
want is zero, use the `zero` register. Recall that reading `zero` always produces 0.

```riscv
beq t0, zero, is_zero       # taken when t0 holds 0
bne t0, zero, not_zero      # taken when t0 does not hold 0
blt t0, zero, negative      # taken when signed t0 is below 0
bge t0, zero, nonnegative   # taken when signed t0 is at least 0
```

These are ordinary uses of the real branch instructions.

## Choosing signed or unsigned ordering

`beq` and `bne` only ask whether two bit patterns match. Equality therefore needs no signed or
unsigned choice.

Ordering is different. The same 32 bits can describe different signed and unsigned numbers, so
RISC-V provides both `blt`/`bge` and `bltu`/`bgeu`.

Suppose `t0` contains the bit pattern `0xFFFFFFFB` and `t1` contains 0. Those bits in `t0` can be
read in two ways:

| interpretation | value of `t0` |
| -------------- | ------------: |
| signed         |            -5 |
| unsigned       | 4,294,967,291 |

The register contents have not changed. Only the meaning used by the comparison changes.

```riscv
blt  t0, t1, lower     # taken: signed -5 is less than 0
bltu t0, t1, lower     # not taken: unsigned 4,294,967,291 is not less than 0
```

The register panel displays the pattern as `FFFFFFFB` by default, without a prefix. In prose and code
explanations, the `0x` in `0xFFFFFFFB` makes it explicit that the value is written in hexadecimal.

Choose the interpretation that matches what the value means:

- Use signed comparisons when negative values are meaningful, such as for a temperature or a
  difference.
- Use unsigned comparisons for quantities that cannot be negative, such as a size or a count of
  bytes.

RISC-V does not remember which interpretation you intended. Choosing the signed or unsigned branch
is part of expressing that intent.

## Check the path

Assume `t0` and `t1` have the values shown. For each branch, decide whether it is taken or falls
through.

1. `t0` is 7 and `t1` is 7: `beq t0, t1, equal`
2. `t0` is 7 and `t1` is 7: `bne t0, t1, different`
3. `t0` is -3 and `t1` is 2: `bge t0, t1, at_least`
4. `t0` is 0 and `t1` is 0: `bgeu t0, t1, at_least`

<details>
<summary>Show answers</summary>

1. Taken. The two registers contain equal values.
2. Falls through. The two registers are not different.
3. Falls through. As signed values, -3 is not greater than or equal to 2.
4. Taken. As unsigned values, 0 is greater than or equal to 0.

</details>

## Choose a branch

Write the instruction that asks each question. Use `answer` as the label.

1. Are `t0` and `t1` equal?
2. Are `t0` and `t1` different?
3. Is signed `t0` less than signed `t1`?
4. Is unsigned `t0` greater than or equal to unsigned `t1`?
5. Does `t0` hold zero?

<details>
<summary>Show answers</summary>

```riscv
beq  t0, t1, answer
bne  t0, t1, answer
blt  t0, t1, answer
bgeu t0, t1, answer
beq  t0, zero, answer
```

</details>

## Read one pattern two ways

Suppose `t0` contains `0xFFFFFFFB` and `t1` contains 0. Decide whether each branch is taken.

| branch                    | taken or not? |
| ------------------------- | ------------- |
| `beq t0, t1, answer`      | ?             |
| `bne t0, t1, answer`      | ?             |
| `blt t0, t1, answer`      | ?             |
| `bge t0, t1, answer`      | ?             |
| `bltu t0, t1, answer`     | ?             |
| `bgeu t0, t1, answer`     | ?             |

<details>
<summary>Show answers</summary>

| branch | result | reason |
| ------ | ------ | ------ |
| `beq`  | not taken | `0xFFFFFFFB` and 0 are different bit patterns |
| `bne`  | taken | the bit patterns are different |
| `blt`  | taken | signed -5 is less than 0 |
| `bge`  | not taken | signed -5 is not greater than or equal to 0 |
| `bltu` | not taken | unsigned 4,294,967,291 is not less than 0 |
| `bgeu` | taken | unsigned 4,294,967,291 is greater than or equal to 0 |

</details>

The central idea is one choice with two outcomes: compare two registers, then either continue at
the label when the condition is true or fall through to the next instruction when it is false.
