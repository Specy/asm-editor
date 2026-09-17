Twelve words in order, and the program finds which one holds 91 by halving the range it is looking
in until nothing is left. It leaves the index in `$t4`, or -1 when the value is not in the array.
Four elements are read out of the twelve, where walking the array would read ten.

Searching a sorted array is where the sorting pays for itself: every comparison throws away half of
what is left, so an array of a thousand elements takes about ten reads and one of a million takes
about twenty.

```mips|playground|memory|allow-open
.eqv COUNT 12

.data
numbers: .word 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127

.text
main:
    la $t0, numbers         # the array
    li $t1, 91              # the value we are looking for
    li $t2, 0               # low = 0
    li $t3, COUNT
    addi $t3, $t3, -1       # high = COUNT - 1
    li $t4, -1              # found = -1, meaning not there
search:
    bgt $t2, $t3, search_done   # the range is empty, so stop
    add $t5, $t2, $t3
    srl $t5, $t5, 1         # mid = (low + high) / 2
    sll $t6, $t5, 2         # mid * 4, the size of a word
    add $t6, $t0, $t6
    lw $t7, 0($t6)          # the element in the middle
    beq $t7, $t1, found
    bgt $t7, $t1, too_big
    addi $t2, $t5, 1        # low = mid + 1
    j search
too_big:
    addi $t3, $t5, -1       # high = mid - 1
    j search
found:
    move $t4, $t5           # remember where it was
search_done:
```

`srl $t5, $t5, 1` is the halving: shifting a number one place right divides it by two and throws the
remainder away, which is the rounding down that `(low + high) / 2` wants. `srl` is the shift that
brings zeroes in at the top, which is right here because an index is never negative; `sra` is the
one for a number that can be.

`sll $t6, $t5, 2` turns the index into a byte offset, because the elements are words. An index and
an address are different things here and the program has to convert between them on every pass,
which is the price of `offset(base)` adding one register to one constant and scaling nothing.

`addi $t2, $t5, 1` reads `mid`, adds one, and writes `low`, all in one instruction. Three operands
are what make that possible: the source and the destination are named separately, so there is no
copy first.

The four probes are 23, 72, 100 and finally 91. Each one either matches, or moves `low` above the
middle, or moves `high` below it, and the loop ends when `low` walks past `high`. `$t4` finishes at
9, the index where 91 lives, and `$t2`, `$t3` and `$t5` all end at 9 as well, which is the range
having closed down onto a single element.

Search for 90, which is not in the array, by changing `li $t1, 91` to `li $t1, 90`. `$t4` stays at
`FFFFFFFF`, the -1 put there before the loop started, because a search that finds nothing has to be
able to say so, and 0 will not do: 0 is a perfectly good index. Choosing an answer that cannot be
mistaken for a real one is part of writing the subroutine.
