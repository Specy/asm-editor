This program compares two numbers in registers. It leaves the larger number in `t2` and the
nonnegative distance between them in `t4`. Step through it and watch which instructions the arrow
visits: the branches cause some instructions to be skipped.

```riscv|playground|allow-open
.text
main:
    li t0, 37               # a = 37
    li t1, 64               # b = 64

    blt t1, t0, a_is_bigger # if b is below a, a is the answer
    mv t2, t1               # otherwise b is
    j done
a_is_bigger:
    mv t2, t0
done:

    slt t3, t0, t1          # t3 = 1 if a < b, otherwise 0

    sub t4, t0, t1          # the distance, which may come out negative
    bgez t4, positive       # if it did not, it is already the answer
    sub t4, zero, t4        # otherwise flip its sign
positive:
```

`blt t1, t0, a_is_bigger` reads as: if `t1` is less than `t0`, carry on from the label. Both numbers
being compared are named right there in the instruction, and the jump either happens or it does not.
Nothing is left behind for a later instruction to read.

`slt t3, t0, t1` compares the numbers in the opposite order: it writes 1 into `t3` if `t0` is less
than `t1`, or 0 otherwise. It stores the comparison result instead of jumping, so you can keep the
result, add it to something, or test it later. Use a branch to choose between two pieces of code,
and use `slt` when you want the comparison result as a value.

The `j done` is the part that is easy to leave out. Only one of the two assignments to `t2` should
run, so the first one has to jump over the second. Delete that line and the program runs straight
into `a_is_bigger` and overwrites the answer it just worked out, which is a good thing to see once
on purpose.

The second half does not need a fresh comparison value. `sub t4, t0, t1` has already produced the
difference, and `bgez t4, positive` looks at that same register: if the subtraction came out at
zero or above, the answer is already right and the next line is skipped. `bgez` is a convenient
pseudo-instruction; the assembler expands `bgez t4, positive` to the real two-register branch
`bge t4, zero, positive`. `sub t4, zero, t4` flips the sign, since 0 minus a number is its negative,
and `neg t4, t4` is the shorter name for that subtraction.

Both `blt` and the `bge` behind `bgez` use **signed** ordering, which is what a difference that may
go below zero needs. There is a `bltu` next to `blt` that reads both registers as unsigned counts,
and it would treat a negative number as a very large positive one.

## Your turn: choose the larger number and find the distance

The test runner supplies two small signed numbers in `t0` and `t1`; their difference always fits in
a signed 32-bit register. Write the branch-based if/else that leaves the larger number in `t2`.
Then leave the nonnegative distance between the inputs in `t4`. Do not replace the starting values
in `t0` or `t1`.

```riscv|playground|exercise
.text
main:
    # choose the larger value for t2
    # find the nonnegative distance for t4
```

```testcase
{
    "startingRegisters": { "t0": 37, "t1": 64 },
    "expectedRegisters": { "t2": 64, "t4": 27 }
}
```

```testcase
{
    "startingRegisters": { "t0": 91, "t1": 12 },
    "expectedRegisters": { "t2": 91, "t4": 79 }
}
```

```testcase
{
    "startingRegisters": { "t0": -8, "t1": -8 },
    "expectedRegisters": { "t2": -8, "t4": 0 }
}
```

```testcase
{
    "startingRegisters": { "t0": -20, "t1": 7 },
    "expectedRegisters": { "t2": 7, "t4": 27 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    blt t1, t0, first_is_bigger
    mv  t2, t1
    j   have_bigger
first_is_bigger:
    mv  t2, t0
have_bigger:
    sub t4, t0, t1
    bge t4, zero, done
    sub t4, zero, t4
done:
```

</details>
