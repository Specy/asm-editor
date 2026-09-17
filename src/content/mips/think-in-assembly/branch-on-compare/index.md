Most instructions let execution continue with the next line. A conditional branch can change that
path: when its condition is true, execution moves to a label; when the condition is false, execution
**falls through** to the next instruction.

A label names a place in the program. It does not run an instruction, and it does not mark the end
of a block. These simple rules are enough to build the shapes that higher-level languages call
`if`, `if/else`, and `else if`.

## A one-armed if

Suppose `$s0` should become 1 only when `$t0` and `$t1` are equal. Start `$s0` at 0, then branch
around the assignment when the values are not equal:

```mips|playground
.text
main:
    li $t0, 7
    li $t1, 7
    li $s0, 0
    bne $t0, $t1, done      # different values skip the body
    li $s0, 1               # reached only when the values are equal
done:
    li $v0, 10
    syscall
```

Here `bne` means **branch if not equal**. With the two 7s, its condition is false, so execution falls
through and writes 1. Change either value and the branch is taken; execution continues at `done`,
leaving `$s0` at 0.

The source-level condition was “when the values are equal,” but the branch asks when to skip that
work: “when the values are not equal.” Writing the skip condition is a useful habit for one-armed
decisions.

## Compare and branch

The previous lesson showed two ways to use a comparison. `slt` and `sltu` write a 0 or 1 into a
register and then execution continues. A compare-and-branch form checks a relationship and decides
where execution continues in the same source line.

This small table is enough for the examples on this page. Each form compares two registers and
takes the branch when the stated condition is true.

| form                     | branch when                   |
| ------------------------ | ----------------------------- |
| `beq left, right, label` | `left` equals `right`         |
| `bne left, right, label` | `left` does not equal `right` |
| `blt left, right, label` | signed `left < right`         |
| `ble left, right, label` | signed `left <= right`        |
| `bgt left, right, label` | signed `left > right`         |
| `bge left, right, label` | signed `left >= right`        |

For unsigned ordering, use the forms with a `u`: `bltu`, `bleu`, `bgtu`, and `bgeu`. Equality only
asks whether the bits match, so `beq` and `bne` work for both signed and unsigned values. You can
look these forms up as you work; there is no need to memorize the table now.

## An if/else shape

An `if/else` chooses exactly one of two arms. The conditional branch sends execution to the second
arm, while `j` skips that arm after the first one has run:

```mips|playground
.text
main:
    li $t0, 50              # value to test
    li $t1, 10              # threshold
    ble $t0, $t1, else      # if $t0 <= $t1, take the else arm
    li $s0, 100             # $t0 > $t1
    j end                   # do not fall through into else
else:
    li $s0, 200             # $t0 <= $t1
end:
    li $v0, 10
    syscall
```

With 50 in `$t0`, `ble` is not taken and execution falls through to the first assignment. The
instruction `j end` is an unconditional jump, so execution then skips the `else` arm. `$s0`
finishes at 100.

Change the first value to 5. Now the condition `$t0 <= $t1` is true, so `ble` moves execution to
`else` and `$s0` finishes at 200.

Try deleting `j end` and run the original version with 50 again. The first assignment runs, then
execution falls through the `else` label and the second assignment overwrites it. A label does not
stop fall-through; the jump is what keeps the two arms separate.

## An ordered else-if chain

More than two cases form a chain of tests. Each failed test falls through to the next one. Put the
most selective condition first so the first matching case wins.

```mips|playground
.text
main:
    li $t0, 75              # score
    li $t1, 90
    li $t2, 60

    bge $t0, $t1, grade_a   # score >= 90
    bge $t0, $t2, grade_b   # score >= 60
    li $s0, 'C'             # score < 60
    j done

grade_a:
    li $s0, 'A'
    j done

grade_b:
    li $s0, 'B'

done:
    li $v0, 10
    syscall
```

For a score of 75, the first branch is not taken and the second one is taken, so `$s0` receives
`'B'`. A score of 95 matches the first test and jumps directly to `grade_a`. A score of 40 falls
through both tests and receives `'C'`.

The 90 test must come before the 60 test. If the 60 test came first, a score of 95 would match it and
reach the wrong arm. Each selected arm must also finish at `done` instead of falling into another
arm. `grade_b` is already directly above `done`, so it reaches the finish by ordinary fall-through.

## Your turn

Classify three signed values. For each input, write -1 when it is negative, 0 when it is zero, and 1
when it is positive:

- classify `$t0` into `$s0`;
- classify `$t1` into `$s1`;
- classify `$t2` into `$s2`.

Use signed compare-and-branch forms with `$zero`. The test supplies one negative, one zero, and one
positive value, so all three outcomes must work. The stop sequence is already present.

```mips|playground|exercise
.text
main:
    # classify the three inputs here
    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": -7, "$t1": 0, "$t2": 12 },
    "expectedRegisters": { "$s0": -1, "$s1": 0, "$s2": 1 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    blt $t0, $zero, first_negative
    bgt $t0, $zero, first_positive
    li $s0, 0
    j second
first_negative:
    li $s0, -1
    j second
first_positive:
    li $s0, 1

second:
    blt $t1, $zero, second_negative
    bgt $t1, $zero, second_positive
    li $s1, 0
    j third
second_negative:
    li $s1, -1
    j third
second_positive:
    li $s1, 1

third:
    blt $t2, $zero, third_negative
    bgt $t2, $zero, third_positive
    li $s2, 0
    j done
third_negative:
    li $s2, -1
    j done
third_positive:
    li $s2, 1

done:
    li $v0, 10
    syscall
```

</details>

For the second exercise, assign grades to three scores:

- score `$t0` goes in `$s0`;
- score `$t1` goes in `$s1`;
- score `$t2` goes in `$s2`.

Use `'A'` for a score of 90 or more, `'B'` for a score of 60 through 89, and `'C'` for a score below 60. Load 90 and 60 into registers once, then use register-to-register branches. The supplied scores
exercise all three arms, including the boundary at 60.

```mips|playground|exercise
.text
main:
    # assign the three grades here
    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": 95, "$t1": 60, "$t2": 40 },
    "expectedRegisters": { "$s0": "0x41", "$s1": "0x42", "$s2": "0x43" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t3, 90
    li $t4, 60

    bge $t0, $t3, first_a
    bge $t0, $t4, first_b
    li $s0, 'C'
    j second_score
first_a:
    li $s0, 'A'
    j second_score
first_b:
    li $s0, 'B'

second_score:
    bge $t1, $t3, second_a
    bge $t1, $t4, second_b
    li $s1, 'C'
    j third_score
second_a:
    li $s1, 'A'
    j third_score
second_b:
    li $s1, 'B'

third_score:
    bge $t2, $t3, third_a
    bge $t2, $t4, third_b
    li $s2, 'C'
    j done
third_a:
    li $s2, 'A'
    j done
third_b:
    li $s2, 'B'

done:
    li $v0, 10
    syscall
```

</details>
