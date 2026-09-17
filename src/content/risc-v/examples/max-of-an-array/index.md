Eight words sit in memory and the program walks them once, keeping the largest one it has seen so
far in `t1` and the position it was found at in `t2`. One of the numbers is negative, and that turns
out to decide which comparison you are allowed to use.

```riscv|playground|memory|allow-open
.eqv COUNT, 8

.data
numbers: .word 12, -4, 37, 8, 99, 41, 2, 60

.text
main:
    la t0, numbers      # the array
    lw t1, 0(t0)        # best so far = the first element
    li t2, 0            # and where it was found
    li t3, 1            # start looking at element 1
    li t6, COUNT        # the bound, which the branch needs in a register
loop:
    slli t4, t3, 2      # index * 4
    add t4, t0, t4      # the address of element t3
    lw t5, 0(t4)
    ble t5, t1, not_bigger
    mv t1, t5           # a new best
    mv t2, t3           # and where it was
not_bigger:
    addi t3, t3, 1
    blt t3, t6, loop
```

The first element is read **before** the loop starts, so the program always has an answer that is
correct for the part of the array it has looked at so far. Starting `t1` at 0 instead would be a
different program, and a wrong one: over an array of nothing but negative numbers it would happily
report 0, which is not in the array.

This loop walks by index rather than by pointer, because it has to report **where** the best element
was and a bare address does not tell you that. Turning an index into an address takes the two lines
at the top of the body:

| `t3` | `slli t4, t3, 2` | `add t4, t0, t4` |
| ---- | ---------------- | ---------------- |
| 1    | 4                | `10010004`       |
| 2    | 8                | `10010008`       |
| 3    | 12               | `1001000C`       |

`slli` shifts left, and shifting left by two multiplies by four, which is the size of a word. Every
useful element size is a power of two, so this shift is how array indexing is done everywhere: it is
a multiplication the machine can do in one step.

`li t6, COUNT` sits above the loop rather than inside it. The bound has to be in a register for the
branch to compare against, and loading it once before the loop is free where loading it every pass
is not.

`ble` is the **signed** comparison, and the `-4` in the array is why that matters. Swap it for
`bleu`, which reads the same bits as plain positive counts, and the program reports `FFFFFFFC` as
the largest element: those are the bits of -4, and read as an unsigned number they come to
4294967292, which nothing in the array can beat. The bits never changed. Only the instruction
looking at them did.
