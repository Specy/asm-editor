Twelve words in order, and the program finds which one holds 91 by halving the range it is looking
in until nothing is left. It leaves the index in `$t4`, or -1 when the value is not in the array.
Four elements are read out of the twelve, where walking the array would read ten.

Bubble sort left an array in order. This is what being in order is worth: every comparison throws
away half of what is left, so an array of a thousand elements takes about ten reads and one of a
million takes about twenty.

**You need to know:** the "Arrays and strings" lecture and the "Bubble sort" Example. What is new
here is a loop that jumps around its array instead of walking it, which is why the element is
reached through an index rather than through a pointer that steps.

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
    bgt $t2, $t3, search_done   # while(low <= high)
    add $t5, $t2, $t3
    srl $t5, $t5, 1         # mid = (low + high) / 2
    sll $t6, $t5, 2         # mid * 4, the size of a word
    add $t6, $t0, $t6
    lw $t7, 0($t6)          # numbers[mid]
    beq $t7, $t1, found
    bgt $t7, $t1, too_big
    addi $t2, $t5, 1        # low = mid + 1
    j search
too_big:
    addi $t3, $t5, -1       # high = mid - 1
    j search
found:
    move $t4, $t5           # found = mid
search_done:
```

`srl $t5, $t5, 1` is the halving: shifting a number one place right divides it by two and throws the
remainder away, which is the rounding down that `(low + high) / 2` wants. `srl` is the shift that
brings zeroes in at the top, which is right here because an index is never negative; `sra` is the
one for a number that can be.

`sll $t6, $t5, 2` turns the index into a byte offset, since the elements are words. That is the
whole of the difference between `numbers[mid]` in C and the two instructions here: C knows how big
an element is, and `offset(base)` adds one register to one constant and scales nothing.

`addi $t2, $t5, 1` writes `low` from `mid` and adds one in the same instruction, which is what three
operands buy you: the M68K copies `d4` into `d1` and then increments it.

The four probes are 23, 72, 100 and finally 91. Each one either matches, or moves `low` past the
middle, or moves `high` below it, and the loop ends when `low` walks past `high`. `$t4` comes out at
`00000009`, which is the index of 91, and `$t2`, `$t3` and `$t5` all end at 9 as well, which is the
range having closed onto one element.

Try changing `li $t1, 91` to `li $t1, 90`, which is not in the array. `$t4` stays `FFFFFFFF`, the -1
the `li` put there before the loop started, because a search that finds nothing has to say so and 0
is a perfectly good index.
