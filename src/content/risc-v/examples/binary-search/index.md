Twelve words in order, and the program finds which one holds 91 by halving the range it is looking in
until nothing is left. It leaves the index in `t4`, or -1 when the value is not in the array. Four
elements are read out of the twelve, where walking the array would read ten.

Bubble sort left an array in order. This is what being in order is worth: every comparison throws
away half of what is left, so an array of a thousand elements takes about ten reads and one of a
million takes about twenty.

```riscv|playground|memory|allow-open
.eqv COUNT, 12

.data
numbers: .word 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127

.text
main:
    la t0, numbers          # the array
    li t1, 91               # the value we are looking for
    li t2, 0                # low = 0
    li t3, COUNT
    addi t3, t3, -1         # high = COUNT - 1
    li t4, -1               # found = -1, meaning not there
search:
    bgt t2, t3, search_done # while(low <= high)
    add t5, t2, t3
    srli t5, t5, 1          # mid = (low + high) / 2
    slli t6, t5, 2          # mid * 4, the size of a word
    add t6, t0, t6
    lw s0, 0(t6)            # numbers[mid]
    beq s0, t1, found
    bgt s0, t1, too_big
    addi t2, t5, 1          # low = mid + 1
    j search
too_big:
    addi t3, t5, -1         # high = mid - 1
    j search
found:
    mv t4, t5               # found = mid
search_done:
```

`srli t5, t5, 1` is the halving. Shifting right by one divides by two and throws the remainder away,
which is exactly the rounding down that the midpoint of a range wants. `srli` is the right shift for
an index, since an index is never negative.

`slli t6, t5, 2` then turns that index into a byte offset, because the elements are words. Those two
lines, a shift and an add, are every read of an element in the program.

Here is the range closing on the answer:

| probe | `low` | `high` | `mid` | `numbers[mid]` | what it decides    |
| ----- | ----- | ------ | ----- | -------------- | ------------------ |
| 1     | 0     | 11     | 5     | 23             | too small, low = 6 |
| 2     | 6     | 11     | 8     | 72             | too small, low = 9 |
| 3     | 9     | 11     | 10    | 100            | too big, high = 9  |
| 4     | 9     | 9      | 9     | 91             | found it           |

Four reads out of twelve elements, and the whole search is 46 instructions.

Search for a number that is not in the array, 90 say, and `t4` stays at `FFFFFFFF`. That is the -1
the `li` put there before the loop, and -1 is used rather than 0 because 0 is a perfectly good index
of a real element.
