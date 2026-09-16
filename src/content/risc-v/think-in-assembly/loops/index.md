A loop repeats a group of instructions. Assembly builds that repetition from the control-flow tools
you already know: labels, conditional branches and unconditional jumps.

One execution of the repeated group is called a **pass**. Most loops also have a value that changes
on every pass, such as a counter or a pointer. The branch tests that changing value to decide
whether another pass should run.

## Translate a while loop

Start with a familiar counted loop. This one adds the numbers from 1 through 10:

```text
sum = 0
i = 1
while i <= 10:
    sum = sum + i
    i = i + 1
```

A `while` loop tests its condition before each pass. We can flatten it into labels and jumps:

```text
sum = 0
i = 1
loop_test:
    if i > 10, go to loop_end
    sum = sum + i
    i = i + 1
    go to loop_test
loop_end:
```

The branch asks the opposite question from the original `while` condition. As long as `i <= 10`,
the branch falls through into the body. Once `i > 10`, it branches to `loop_end`.

Here is the same layout in RISC-V:

```riscv|playground
.text
main:
    li   t0, 0             # sum = 0
    li   t1, 1             # i = 1
    li   t2, 10            # upper bound
loop_test:
    bgt  t1, t2, loop_end  # if i > 10, leave the loop
    add  t0, t0, t1        # sum += i
    addi t1, t1, 1         # i++
    j    loop_test
loop_end:
```

After ten passes, `t0` contains `00000037`, which is 55. The last pass uses 10, increments `t1`
to 11 and jumps back to the test. This time the branch is taken, so execution reaches `loop_end`.

This is a **top-tested loop** because the test comes before the body. If the condition is already
false at the first test, the body runs zero times.

## Put the test at the bottom

A loop can also place its test after the body. This is a **bottom-tested loop**: the body runs first,
and the branch then decides whether to begin another pass. High-level languages often call this
control-flow shape a `do while` loop.

Here is a bottom-tested version of the sum. The counter begins at 10 and counts down to zero:

`bnez t1, loop` branches to `loop` when `t1 != 0`. It is the assembler convenience for
`bne t1, zero, loop`.

```riscv|playground
.text
main:
    li   t0, 0             # sum = 0
    li   t1, 10            # numbers left to add
loop:
    add  t0, t0, t1        # sum += t1
    addi t1, t1, -1        # one fewer number remains
    bnez t1, loop          # begin another pass while t1 != 0
loop_end:
```

`t0` again finishes at 55, and `t1` finishes at 0. The branch goes directly back to `loop`, so this
shape has no separate unconditional jump at the bottom.

The position of the test changes the behavior when the initial count is zero:

| initial count | top-tested loop | unguarded bottom-tested loop |
| ------------- | --------------- | ---------------------------- |
| 3 | tests first, then runs three passes | runs three passes, testing after each one |
| 0 | tests first and skips the body | runs the body once before its first test |

In RV32, decrementing 0 produces the bit pattern `0xFFFFFFFF`. Repeated decrements eventually wrap
back to zero, but that takes about 4.3 billion unwanted passes in this simulator. A bottom-tested
loop whose count may be zero therefore needs a test before entry. Here is the complete safe shape:

```riscv|playground
.text
main:
    li   t0, 0             # sum = 0
    li   t1, 0             # numbers left to add; try 3 as well
    beqz t1, loop_end      # a zero count has no first pass
loop:
    add  t0, t0, t1
    addi t1, t1, -1
    bnez t1, loop
loop_end:
```

With an initial count of 0, `beqz` branches straight to `loop_end`. With an initial count of 3, the
body adds 3, 2 and 1, leaving 6 in `t0`.

Counting down is convenient when the body only needs to know how many passes remain. When the body
uses an increasing value as an index, an upward counter and a separate bound often express the job
more directly.

## Nested loops

A **nested loop** is one loop inside the body of another. Each loop has its own counter. The inner
counter is initialized inside the outer body so that every outer pass starts a fresh inner loop.

```riscv|playground
.text
main:
    li   t0, 0             # total = 0
    li   t1, 3             # rows left
outer:
    li   t2, 4             # four columns for this row
inner:
    addi t0, t0, 1         # total++
    addi t2, t2, -1
    bnez t2, inner
    addi t1, t1, -1
    bnez t1, outer
done:
```

The inner loop runs four passes for each of three outer passes, so `t0` finishes at 12. On each
visit to `outer`, `li t2, 4` resets the column count before execution reaches `inner`.

If `t2` were initialized above `outer`, it would still be 0 when the second row began. The inner
body would decrement that 0 to `0xFFFFFFFF` and then run about 4.3 billion unwanted passes before
the 32-bit counter wrapped back to zero. Placing each initialization with the loop that needs it
makes the reset visible.

## Walk through an array

A pointer can be the changing value in a loop. Put a label immediately after an array, load that
label's address and advance the pointer until it reaches the end address.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50
end:

.text
main:
    la   t0, numbers       # address of the current word
    la   t1, end           # address just after the array
    li   t2, 0             # sum = 0
loop_test:
    beq  t0, t1, done      # all words have been visited
    lw   t3, 0(t0)
    add  t2, t2, t3
    addi t0, t0, 4         # advance by one word
    j    loop_test
done:
```

`end:` declares no data of its own. It names the address immediately after the final word, which is
`0x10010014` for this array in the simulator. At the end, `t0` and `t1` both contain that address.

If another value is appended to the `.word` line, the assembler places `end` after the new final
word. The loop then visits the added word. A counted loop can also adapt when its length is updated;
the end label is useful here because it keeps this particular boundary beside the data it describes.

Equality is enough in this example because the pointer advances by exactly four bytes and lands on
`end`. A loop written as “continue while the current address is below the end address” would compare
those two addresses with `bltu`, since addresses use unsigned ordering. An index-and-length loop
would instead compare the index with the length.

## Three loops to write

Add the numbers from 1 through 10 with a loop and leave 55 in `t0`. You can count upward or
downward.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": 55 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li   t0, 0
    li   t1, 10
loop:
    add  t0, t0, t1       # add the current number
    addi t1, t1, -1
    bnez t1, loop
done:
```

</details>

For the second loop, `t0` supplies a count that may be zero. Add 3 to `t1` exactly `t0` times.
The tests expect 12 when the count is 4 and 0 when the count is 0.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": 4 },
    "expectedRegisters": { "t1": 12 }
}
```

```testcase
{
    "startingRegisters": { "t0": 0 },
    "expectedRegisters": { "t1": 0 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li   t1, 0
    beqz t0, done          # guard the bottom-tested loop
loop:
    addi t1, t1, 3
    addi t0, t0, -1
    bnez t0, loop
done:
```

</details>

The third loop walks through the five words from `numbers` to `end` and leaves their total in `t2`.
Use `t0` as the current address and `t1` as the end address.

```riscv|playground|memory|exercise
.data
numbers: .word 3, 9, 27, 81, 243
end:

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t2": 363 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
numbers: .word 3, 9, 27, 81, 243
end:

.text
main:
    la   t0, numbers
    la   t1, end
    li   t2, 0
loop:
    lw   t3, 0(t0)
    add  t2, t2, t3
    addi t0, t0, 4
    bne  t0, t1, loop
done:
```

The supplied array has five elements, so this bottom-tested loop has a first word to process. After
the fifth word, `bne` falls through to `done`, which is where this small program ends.

</details>

Both top-tested and bottom-tested loops are useful. Choose the shape from the required behavior,
especially whether zero passes are possible. As a secondary consideration, a bottom test can use
one conditional branch per pass, while a top-tested layout commonly uses a conditional branch and
an unconditional jump. Those control-flow instructions are the small amount of work that makes the
repetition happen.
