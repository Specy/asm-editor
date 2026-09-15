Eight words in memory, sorted from smallest to largest where they lie. The loop compares each pair
of neighbours and swaps them when they are the wrong way round, and it does that as many times as
there are elements, so the largest number reaches the end on the first pass and the rest follow.

This program reads its array seven times over, with an inner loop that walks the array and an outer
loop that says how often, and the difficulty is keeping the two counters out of each other's way.

```mips|playground|memory|allow-open
.eqv COUNT 8

.data
numbers: .word 42, 8, 15, 4, 23, 16, 99, 1

.text
main:
    li $t0, COUNT
    addi $t0, $t0, -1       # the outer loop runs COUNT-1 times
outer:
    la $t1, numbers         # back to the first element
    move $t2, $t0           # the inner loop is one shorter every pass
inner:
    lw $t3, 0($t1)          # the element we are on
    lw $t4, 4($t1)          # and the one after it
    slt $t5, $t4, $t3       # is right below left?
    beqz $t5, in_order
    sw $t4, 0($t1)          # otherwise swap them
    sw $t3, 4($t1)
in_order:
    addi $t1, $t1, 4        # on to the next pair
    addi $t2, $t2, -1
    bnez $t2, inner
    addi $t0, $t0, -1
    bnez $t0, outer
```

`0($t1)` and `4($t1)` are the pair being compared, the element the pointer is on and the one four
bytes after it, which is the next word. Reading both without moving `$t1` is what makes the swap two
plain `sw` instructions, and it is exactly the job `offset(base)` exists to do.

`li $t0, COUNT` and the `addi` under it are two lines because the assembler does no arithmetic at
all: `li $t0, COUNT-1` is a build error. A named constant is substituted exactly as written, so
anything you want computed from one is computed by your program, at run time, in an instruction of
its own.

Both the `la $t1, numbers` and the `move $t2, $t0` belong inside the outer loop. `$t1` has walked to
the end of the array by the time a pass finishes, so it goes back to the start; and `$t2` is 0 by
then, which as a counter would take the `addi` to -1 and run the inner loop four billion times.
Copying `$t0` into it is also what makes each pass shorter than the one before, since the last
element is already in its place after the first pass, the last two after the second, and so on.

Run it with the memory panel on `10010000` and the eight words read 1, 4, 8, 15, 16, 23, 42 and 99,
in that order. It took 263 instructions to sort eight numbers, and it would take about four times as
many to sort sixteen, because both loops grow with the array.

Swap the two source registers of `slt $t5, $t4, $t3` and the same program sorts the other way
round, largest first. The only thing in this whole program that says which order you wanted is which
of those two registers
comes first in that one comparison.
