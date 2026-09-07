Eight words sit in memory and the program walks them once, keeping the largest one it has seen so
far in `t1` and the position it was found at in `t2`. One of the numbers is negative, which is what
makes the choice of comparison matter.

Sum of an array read every element and needed nothing from the ones before it. Here every pass has
to compare the element against something the loop is carrying, which is the shape of every "find the
best one" program there is.

**You need to know:** the "Arrays and strings" lecture and the "Comparing without flags" lecture.
What is new here is the best so far: a register that starts as the first element and is overwritten
only when the loop meets something better.

```riscv|playground|memory|allow-open
.eqv COUNT, 8

.data
numbers: .word 12, -4, 37, 8, 99, 41, 2, 60

.text
main:
    la t0, numbers      # the array
    lw t1, 0(t0)        # best = numbers[0]
    li t2, 0            # where = 0
    li t3, 1            # i = 1
    li t6, COUNT        # the bound, which a branch needs in a register
loop:
    slli t4, t3, 2      # i * 4, the size of a word
    add t4, t0, t4      # &numbers[i]
    lw t5, 0(t4)        # n = numbers[i]
    ble t5, t1, not_bigger   # if(n <= best) leave it alone
    mv t1, t5           # best = n
    mv t2, t3           # where = i
not_bigger:
    addi t3, t3, 1      # i++
    blt t3, t6, loop
```

The first element is read before the loop, into `t1`, so the loop itself has only seven elements
left and starts with an answer that is already right for the part of the array it has seen. Starting
`t1` at 0 instead would be a different program, one that answers 0 for an array of negative numbers.

This loop walks by **index**, because it needs to remember where the best one was and a pointer does
not say that. `slli t4, t3, 2` is the multiplication by four that C does for you inside
`numbers[i]`: shifting left by two multiplies by four, and every element size on this machine is a
power of two, so a shift is always what you want there.

`li t6, COUNT` sits above the loop and not inside it because `blt` compares two registers and
neither of them may be a number. MIPS writes `blt $t3, COUNT, loop` and lets the assembler put the
constant in `$at` for you; there is no such register here, so the `li` is yours and it belongs
outside, where it runs once.

`t1` comes out at `00000063`, which is 99, and `t2` at 4, since 99 is the fifth element and the
first one is number 0. `t5` holds 60, the last element the loop looked at, and `t3` ends at 8, which
is what stopped it.

`ble` is the **signed** comparison, and the `-4` in the array is why. Try changing
`ble t5, t1, not_bigger` to `bleu t5, t1, not_bigger`, which reads the same bits as unsigned
numbers: `t1` comes out at `FFFFFFFC` and `t2` at 1, because read that way `FFFFFFFC` is 4294967292
and nothing in the array beats it.
