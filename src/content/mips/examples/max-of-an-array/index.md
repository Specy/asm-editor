Eight words sit in memory and the program walks them once, keeping the largest one it has seen so
far in `$t1` and the position it was found at in `$t2`. One of the numbers is negative, which is
what makes the choice of comparison matter.

Every pass of this loop compares the element it is standing on against something the loop is
carrying with it, which is the shape of every find-the-best-one program there is.

```mips|playground|memory|allow-open
.eqv COUNT 8

.data
numbers: .word 12, -4, 37, 8, 99, 41, 2, 60

.text
main:
    la $t0, numbers     # the array
    lw $t1, 0($t0)      # the first element, our best so far
    li $t2, 0           # the index it was found at
    li $t3, 1           # start at the second element
loop:
    sll $t4, $t3, 2     # i * 4, one word per element
    add $t4, $t0, $t4   # the address of element i
    lw $t5, 0($t4)      # and the element itself
    slt $t6, $t1, $t5   # is best below n?
    beqz $t6, not_bigger
    move $t1, $t5       # a new best
    move $t2, $t3       # and where it was
not_bigger:
    addi $t3, $t3, 1    # on to the next index
    blt $t3, COUNT, loop
```

The first element is read before the loop, into `$t1`, so the loop itself has only seven elements
left and starts with an answer that is already right for the part of the array it has seen. Starting
`$t1` at 0 instead would be a different program, one that answers 0 for an array of negative
numbers.

This loop walks by **index** rather than by pointer, and the reason is in the question it is
answering: it has to report **where** the best element was, and a pointer that has walked eight
elements does not say that. So the address is rebuilt from the index on every pass, which costs the
`sll` and the `add`.

`sll $t4, $t3, 2` is the multiplication by four, one word per element, and `add $t4, $t0, $t4` turns
that byte offset into a real address.

`$t1` finishes at 99 and `$t2` at 4: 99 is the fifth element of the array, and elements are counted
from zero. `$t3` ends at 8, which is what stopped the loop.

`slt` is the **signed** comparison, and the `-4` in the array is the reason it has to be. Change it
to `sltu $t6, $t1, $t5` and run it: the program announces that the largest element is `FFFFFFFC` at
index 1. Read as an unsigned number that is 4294967292, and nothing else in the array comes close,
so the program is not broken. It answered a different question correctly, and the only thing that
chose which question was a single letter.
