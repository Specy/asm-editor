A loop sends execution backwards so a group of instructions can run again. MIPS has no single
instruction that means `while` or `for`; you build the repetition from branches, jumps, and labels.

Most loops have the same five parts:

1. **Initialization** gives the counter and any result registers their starting values.
2. **Test** decides whether the loop is finished.
3. **Body** does the work for one pass.
4. **Update** changes the value used by the test.
5. **Jump** sends execution back to the test.

Keeping those parts visible makes a loop easier to write and debug.

## Test before the body

This loop adds the numbers from 1 through 10. Its test is at the top, so execution checks the
counter before every pass through the body.

```mips|playground
.text
main:
    li $t0, 0               # running total
    li $t1, 1               # counter: first number to add
    li $t2, 10              # last number to add

loop_test:
    bgt $t1, $t2, loop_end  # finished when the counter is past 10
    add $t0, $t0, $t1       # body: add this number
    addi $t1, $t1, 1        # update: move to the next number
    j loop_test             # test again

loop_end:
    li $v0, 10
    syscall
```

The first test sees `$t1` equal to 1, so the branch is not taken and the body adds 1. After the
update, the jump returns to `loop_test` with `$t1` equal to 2. This continues through 10. The update
then makes `$t1` equal to 11, and the next test branches to `loop_end`.

For this loop, `$t0` finishes at 55 and `$t1` finishes at 11. That final 11 follows from this
particular test and update: 10 is used, then the counter advances once before the loop discovers it
is finished.

A loop with its test at the top can run its body zero times. If the counter had started at 11, the
first instruction at `loop_test` would branch straight to `loop_end`.

## Test after the body

The test can also go at the bottom. Here is the same sum with a counter that starts at 10 and counts
down to zero:

```mips|playground
.text
main:
    li $t0, 0               # running total
    li $t1, 10              # numbers still to add

    beq $t1, $zero, loop_end # a zero count skips the body
loop:
    add $t0, $t0, $t1       # body
    addi $t1, $t1, -1       # update
    bne $t1, $zero, loop    # repeat while the count is not zero

loop_end:
    li $v0, 10
    syscall
```

Once execution reaches `loop`, the body runs before the next test. That gives this shape a useful
rule: the count is positive at the start of every pass. The `beq` before `loop` establishes that
rule by handling zero separately. At the bottom, `bne` performs the test and the backward jump
together.

Without the guard, a starting count of zero would still run the body once. The update would then
change the count to -1, so the bottom test would send execution backwards again. A bottom-tested
loop therefore needs an explicit guard whenever zero is a valid starting count.

## Nested loops

A loop can contain another loop. The inner loop must receive a fresh starting value for every pass
through the outer loop.

This example visits two rows with three columns in each row. `$t0` counts the visits.

```mips|playground
.text
main:
    li $t0, 0               # cells visited
    li $t1, 0               # rows completed
    li $t3, 2               # total rows
    li $t4, 3               # columns in each row

outer_test:
    bge $t1, $t3, loop_end
    li $t2, 0               # reset columns for this row

inner_test:
    bge $t2, $t4, outer_update
    addi $t0, $t0, 1        # visit one cell
    addi $t2, $t2, 1        # one more column completed
    j inner_test

outer_update:
    addi $t1, $t1, 1        # one more row completed
    j outer_test

loop_end:
    li $v0, 10
    syscall
```

Each time execution reaches `outer_test`, `$t1` is the number of complete rows. After the outer
test, `li $t2, 0` resets the column counter before the inner loop begins. Inside that loop, `$t2` is
the number of columns already visited in the current row. These are useful **invariants**: facts
that remain true whenever execution reaches the same point in a loop.

The inner loop adds 3 to `$t0` before reaching `outer_update`. The outer loop does that twice, so
`$t0` finishes at 6. If the reset of `$t2` were outside the outer loop, the second row would begin
with `$t2` still equal to 3 and would visit no columns.

## Write two loops

Add the numbers from 1 through 10 with a top-tested loop. Leave the sum in `$t0`. Keep the counter in
`$t1`; after the loop it should be 11. The stop sequence is already in place.

```mips|playground|exercise
.text
main:
    # initialize the loop here

    # write the test, body, update, and backward jump here

loop_end:
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 55, "$t1": 11, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t0, 0
    li $t1, 1
    li $t2, 10

loop_test:
    bgt $t1, $t2, loop_end
    add $t0, $t0, $t1
    addi $t1, $t1, 1
    j loop_test

loop_end:
    li $v0, 10
    syscall
```

</details>

For the second exercise, `$t0` and `$t1` hold two repeat counts. Use a separate guarded,
bottom-tested loop for each count:

- add 1 to `$s0` exactly `$t0` times;
- add 1 to `$s1` exactly `$t1` times.

Initialize both result registers to zero. The supplied inputs make the first loop skip its body and
the second loop run four times. Finish with the stop sequence shown in the examples.

```mips|playground|exercise
.text
main:
    # initialize the results and write both loops here
```

```testcase
{
    "startingRegisters": { "$t0": 0, "$t1": 4 },
    "expectedRegisters": { "$t0": 0, "$t1": 0, "$s0": 0, "$s1": 4, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $s0, 0
    li $s1, 0

    beq $t0, $zero, first_end
first_loop:
    addi $s0, $s0, 1
    addi $t0, $t0, -1
    bne $t0, $zero, first_loop

first_end:
    beq $t1, $zero, second_end
second_loop:
    addi $s1, $s1, 1
    addi $t1, $t1, -1
    bne $t1, $zero, second_loop

second_end:
    li $v0, 10
    syscall
```

</details>
