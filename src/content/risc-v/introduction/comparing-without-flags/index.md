Every program so far has run straight through, doing the same thing every time. The moment a program
becomes interesting is the moment it looks at a value and decides what to do next, and here that is
one instruction:

```riscv
beq t0, t1, same
```

Read it as: **if `t0` equals `t1`, carry on from the label `same`; otherwise carry on with the next
line**. The comparing and the jumping are the same instruction. Nothing is set up beforehand and
nothing is left behind afterwards.

## The six branches

There are six of them, and every one compares **two registers**.

| written          | jumps when                  |
| ---------------- | --------------------------- |
| `beq t0, t1, l`  | the two registers are equal |
| `bne t0, t1, l`  | they are not equal          |
| `blt t0, t1, l`  | `t0` < `t1`, signed         |
| `bge t0, t1, l`  | `t0` >= `t1`, signed        |
| `bltu t0, t1, l` | `t0` < `t1`, unsigned       |
| `bgeu t0, t1, l` | `t0` >= `t1`, unsigned      |

`beq` and `bne` only ask whether the bits are the same, a question that needs no notion of positive
or negative. The other four come as pairs, one signed and one unsigned, and choosing the wrong half
of a pair is the most common bug on this page.

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
    bltu t0, t1, e5     # not taken
    li s4, 1
e5:
    li s5, 9
```

Step through it with the registers panel open and watch `pc` jump over the lines that a taken branch
skipped. A register that stays at 0 is one whose `li` got skipped.

The `bltu` at the bottom is the one to stop at. It compares the same two registers the `blt` above
it compared, and it answers the other way round. `t0` holds `FFFFFFFB`. Read as a signed number
those bits are -5, which is below zero; read as an unsigned number they are 4294967291, and nothing
is below zero. Both instructions are right about their own question.

The rule of thumb: **addresses, sizes and counts of bytes are unsigned**, so compare them with
`bltu` and `bgeu`. Differences, coordinates and anything that can go below zero are signed. Nothing
warns you if you pick wrong. The program simply runs and the branch goes the other way, and a loop
that walks an array with `blt` will work perfectly until the day the array sits above `0x80000000`.

## The other four, and the ones against zero

`a > b` is the same question as `b < a`, so the missing comparisons are the six above with their
operands written the other way round. The assembler will do the swapping for you if you write the
name you meant:

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

Every row is **one** real instruction. None of them costs an extra instruction or borrows a register
behind your back, so there is no reason not to write the one that says what you mean.

The bottom six are worth a second look, because they are what makes `zero` earn its place. A
comparison against nothing at all is just a comparison against a register that always reads 0, so
"is this register empty" needs no special instruction.

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

Click on the `bgt` line after building. The editor prints the instruction it actually assembled to
underneath, and it is `blt t0, t1, taken`, character for character the line below it.

## When you want the answer, not a jump

Sometimes the comparison is the thing you want, not the jump. `slt t2, t0, t1` is **set less than**:
it writes 1 into `t2` when `t0` is less than `t1`, and 0 when it is not. The answer is then an
ordinary number in an ordinary register, which you can add up, store, or leave for later.

- **`slt`** and **`sltu`**, two registers, signed and unsigned.
- **`slti`** and **`sltiu`**, with a constant on the right instead of a second register.
- **`seqz`**, **`snez`**, **`sltz`**, **`sgtz`**, for "is it zero", "is it not zero", "is it
  negative" and "is it positive".

```riscv|playground
.text
main:
    li t0, -1           # FFFFFFFF
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

The same pair of registers goes into `slt` and `sltu`, and they disagree, for the same reason the
two branches did.

`slt` writes a whole word holding 0 or 1. That is worth knowing because it makes the answer usable
as a number: an `add t4, t4, t2` after an `slt` counts the times a condition held, with no branch in
sight.

Equality as a value takes two instructions rather than one, and they are worth seeing because the
reasoning turns up everywhere: `sub t2, t0, t1` followed by `seqz t2, t2`. Two numbers are equal
exactly when their difference is zero.

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
