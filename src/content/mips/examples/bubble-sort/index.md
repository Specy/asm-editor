This program sorts eight words in memory from smallest to largest. It compares neighbouring words
and swaps them when the left one is larger. One trip through the array moves its largest value to
the end. Then the program starts again, stopping one pair earlier because that last word is already
in place.

The outer loop counts those trips, or **passes**. The inner loop counts the pairs to compare during
one pass. The two counts must stay separate: the inner count reaches zero at the end of every pass,
while the outer count tells the program how many passes remain.

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
    slt $t5, $t4, $t3       # is right smaller than left?
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

Start with the first two pairs. The comparison `slt $t5, $t4, $t3` asks whether the right word is
smaller than the left word. If it is, the two `sw` instructions write them back in the opposite
order. The pointer then moves four bytes to the next pair:

| Comparison   | Array after the comparison       |
| ------------ | -------------------------------- |
| Start        | `42, 8, 15, 4, 23, 16, 99, 1`   |
| `42` and `8` | `8, 42, 15, 4, 23, 16, 99, 1`   |
| `42` and `15` | `8, 15, 42, 4, 23, 16, 99, 1`  |

The larger word of each pair travels to the right. As the comparisons continue, 42 meets 4, 23,
and 16. Then 99 replaces it as the word travelling right, and the final comparison puts 99 after
1. After the first pass the array reads `8, 15, 4, 23, 16, 42, 1, 99`. The last word is now in
its final position, even though the words before it are not yet sorted.

`$t1` holds the address of the left word in the current pair. `0($t1)` loads or stores that word;
`4($t1)` reaches the next one because a word occupies four bytes. The pointer moves only after the
comparison, so the two stores use the same addresses that the two loads used.

At `outer`, `la $t1, numbers` returns the pointer to the first word, and `move $t2, $t0` gives
the inner loop a fresh count. Initially `$t0` is `COUNT - 1`, or 7, so the first pass compares
seven pairs. On the next pass `$t0` is 6, and the inner loop stops before the last word. Each
later pass stops one pair earlier, leaving the growing sorted end of the array alone. After the
seventh pass, the array is sorted. If `$t2` were not reset, it would still be zero from the
previous pass; subtracting one would make it nonzero, and `bnez` would keep the loop going beyond
the array.

Build and run the program. In the memory panel, enter `10010000` as the address and select **W**
to view words. The eight values should read `1, 4, 8, 15, 16, 23, 42, 99` in order.

Now check the passes yourself:

1. On paper, start with `42, 8, 15, 4`. Compare each neighbouring pair from left to right,
   swapping when needed. What order do the four words have after one pass? The last word should be
   42. To check, select **Open in editor**, change the data to those four values and `COUNT` to 4,
   then **Build** and **Step** instruction by instruction until execution reaches `inner` three
   times.
2. Restore the eight values and `COUNT 8`. Swap the two source registers in `slt`, then predict
   which word will reach the end on the first pass. **Build** and **Run**, and inspect the eight
   words in memory. They should now be in descending order.

Keep `COUNT` equal to the number of `.word` values when changing the array. This version starts
both countdown loops without a zero-count guard, so use at least two words.
