MIPS has no flags register for integer comparisons. An `add`, `sub`, or load does not leave behind
comparison flags for a later instruction to read. Instead, MIPS gives you two direct ways to compare
values:

- a branch such as `beq` compares registers and decides immediately whether execution moves to a
  label;
- `slt` or `sltu` compares registers and writes the answer, exactly 0 or 1, into another register.

Use a branch when the comparison should change which instruction runs next. Use `slt` when the
answer needs to remain available as a value.

## Compare and branch immediately

`beq` means **branch if equal**, and `bne` means **branch if not equal**:

```text
beq left, right, label
bne left, right, label
```

Both instructions compare the complete 32-bit values in two registers. If the stated condition is
true, the branch is **taken** and the next instruction comes from the named label. If it is false,
the branch is **not taken** and execution continues with the next line.

```mips|playground|pc
.text
main:
    li $t0, 7
    li $t1, 7
    beq $t0, $t1, equal     # taken because 7 equals 7
    li $s0, 99              # skipped
equal:
    li $s1, 1
    li $v0, 10
    syscall
```

The `pc`, or **program counter**, holds the address of the next instruction to execute. Step through
the example and watch it move to `equal` after the `beq`. The instruction that would put 99 in
`$s0` does not run, so `$s0` stays 0. The code at `equal` runs and puts 1 in `$s1`.

Equality only asks whether the bits match. Signed and unsigned readings do not change that answer,
so `beq` and `bne` do not need separate unsigned versions.

## Keep the answer with `slt`

`slt` means **set on less than**:

```text
slt destination, left, right
```

It reads `left` and `right`, compares them as signed numbers, and writes the result to
`destination`:

- 1 when `left` is less than `right`;
- 0 otherwise.

Execution then continues with the next instruction. No branch occurs.

```mips|playground
.text
main:
    li $t0, -4
    li $t1, 6
    slt $t2, $t0, $t1      # 1, because -4 is less than 6
    slt $t3, $t1, $t0      # 0, because 6 is not less than -4
    slt $t4, $t0, $t0      # 0, because a value is not less than itself
    li $v0, 10
    syscall
```

The result occupies a full 32-bit register and is exactly 0 or 1. It can be copied, stored in
memory, or compared by a later instruction like any other integer.

When the right-hand value is a constant, `slti` provides the immediate form:

```mips
slti $t2, $t0, 10          # $t2 = 1 when signed $t0 is less than 10
```

## Signed and unsigned comparisons

A register only contains bits. The instruction decides whether those bits represent a signed or an
unsigned number, just as you saw with earlier arithmetic and loads.

- `slt` compares signed values.
- `sltu` compares unsigned values.

This example gives the same bits two different meanings:

```mips|playground
.text
main:
    li $t0, 0xFFFFFFFF
    li $t1, 1
    slt  $t2, $t0, $t1     # 1: signed -1 is less than 1
    sltu $t3, $t0, $t1     # 0: unsigned 4294967295 is not less than 1
    li $v0, 10
    syscall
```

Use the signed family when negative values are meaningful, such as temperatures or coordinates.
Use the unsigned family for values that represent nonnegative quantities such as addresses, byte
counts, and sizes. The `u` changes only how the comparison reads the bits; it does not change the
bits in either source register.

`sltiu` is the immediate form of `sltu`:

```mips
sltiu $t2, $t0, 10         # unsigned comparison with the constant 10
```

## Convenient comparison branches

Programs often need to branch when one register is less than another. The assembler lets you write
that comparison directly with pseudo-instructions:

| instruction                    | branch condition                         |
| ------------------------------ | ---------------------------------------- |
| `blt $t0, $t1, label`          | signed `$t0 < $t1`                       |
| `bge $t0, $t1, label`          | signed `$t0 >= $t1`                      |
| `bgt $t0, $t1, label`          | signed `$t0 > $t1`                       |
| `ble $t0, $t1, label`          | signed `$t0 <= $t1`                      |
| `bltu`, `bgeu`, `bgtu`, `bleu` | the same relationships, read as unsigned |

These are pseudo-instructions because the processor does not have a single instruction for each
row. The assembler builds them from `slt` or `sltu` followed by `beq` or `bne`. For example:

```mips
blt $t0, $t1, smaller
```

is assembled from this comparison and branch:

```mips
slt $at, $t0, $t1
bne $at, $zero, smaller
```

`slt` writes 1 when `$t0 < $t1`, and `bne` takes the branch when that result is not zero. For the
opposite condition, `bge` uses the same comparison and branches when its result equals zero:

```mips
slt $at, $t0, $t1
beq $at, $zero, greater_or_equal
```

The assembler uses `$at` for expansions like these, which is why that register is reserved.

Greater-than comparisons use the same less-than operation with the operands reversed. The question
`$t0 > $t1` is the same as `$t1 < $t0`, so `bgt $t0, $t1, label` compares `$t1` with `$t0`.

## Try the comparisons

The first exercise supplies three pairs of values. Write the four requested comparison results:

- `$s0`: signed `$t0 < $t1`;
- `$s1`: unsigned `$t0 < $t1`;
- `$s2`: signed `$t2 < $t3`;
- `$s3`: signed `$t5 < $t4`.

Use only `slt` and `sltu` for the comparisons. The test covers a signed/unsigned disagreement, equal
values, and operands that must be read in the requested order.

```mips|playground|exercise
.text
main:
    # write the four comparison results here
    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": {
        "$t0": -1,
        "$t1": 1,
        "$t2": 7,
        "$t3": 7,
        "$t4": 12,
        "$t5": 3
    },
    "expectedRegisters": { "$s0": 1, "$s1": 0, "$s2": 0, "$s3": 1 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    slt  $s0, $t0, $t1
    sltu $s1, $t0, $t1
    slt  $s2, $t2, $t3
    slt  $s3, $t5, $t4
    li $v0, 10
    syscall
```

</details>

For the second exercise, leave the smaller signed value from each pair in `$s0`, `$s1`, and `$s2`.
Use `slt` for each comparison, then use `beq` or `bne` to decide whether to replace the value you
first copied. The three pairs make both branch outcomes occur and include an equal pair.

```mips|playground|exercise
.text
main:
    # smaller signed value from $t0 and $t1 -> $s0
    # smaller signed value from $t2 and $t3 -> $s1
    # smaller signed value from $t4 and $t5 -> $s2
    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": {
        "$t0": -5,
        "$t1": 3,
        "$t2": 9,
        "$t3": -2,
        "$t4": 7,
        "$t5": 7
    },
    "expectedRegisters": { "$s0": -5, "$s1": -2, "$s2": 7 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    move $s0, $t0
    slt $t8, $t1, $t0      # is the second value smaller?
    beq $t8, $zero, pair_two
    move $s0, $t1

pair_two:
    move $s1, $t2
    slt $t8, $t3, $t2
    beq $t8, $zero, pair_three
    move $s1, $t3

pair_three:
    move $s2, $t4
    slt $t8, $t5, $t4
    beq $t8, $zero, done
    move $s2, $t5

done:
    li $v0, 10
    syscall
```

</details>
