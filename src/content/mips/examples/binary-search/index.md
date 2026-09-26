This program searches twelve sorted words for 91 and leaves its zero-based index in `$t4`.
If the value is absent, `$t4` stays at -1. A left-to-right search would check ten words to find
91, the tenth value in the array. This search checks four by repeatedly discarding half of the
remaining range.

The range runs from `low` in `$t2` through `high` in `$t3`, including both ends. On each pass,
the program reads the middle word. If that word is smaller than the target, only the words to its
right can match; if it is larger, only the words to its left can match. The array must be sorted in
ascending order for either decision to work.

```mips|playground|memory|allow-open
.eqv COUNT 12

.data
numbers: .word 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127

.text
main:
    la $t0, numbers         # base address of the array
    li $t1, 91              # target
    li $t2, 0               # low = first index
    li $t3, COUNT
    addi $t3, $t3, -1       # high = last index
    li $t4, -1              # result if the target is absent

search:
    bgt $t2, $t3, search_done  # low > high: no candidates remain
    add $t5, $t2, $t3
    srl $t5, $t5, 1         # mid = (low + high) / 2, rounded down
    sll $t6, $t5, 2         # byte offset = mid * 4
    add $t6, $t0, $t6       # address of numbers[mid]
    lw $t7, 0($t6)          # middle value
    beq $t7, $t1, found
    bgt $t7, $t1, middle_too_big
    addi $t2, $t5, 1        # middle value is too small: keep the right half
    j search

middle_too_big:
    addi $t3, $t5, -1       # middle value is too big: keep the left half
    j search

found:
    move $t4, $t5           # save the matching index

search_done:
    li $v0, 10
    syscall
```

The first check stops the loop only when `low > high`. If `low == high`, one candidate remains,
so the program must load it before deciding whether the search succeeded. The `+ 1` and `- 1`
updates exclude the middle word after it has failed to match. Because equality is checked first,
falling through past `bgt $t7, $t1, middle_too_big` means the middle value is smaller than the
target.

`srl $t5, $t5, 1` halves the sum of the two indices, discarding any remainder. The indices here
are nonnegative, so filling the top bit with zero is appropriate. `sll $t6, $t5, 2` then
multiplies the middle index by four, the size of a word. MIPS does not scale an array index for us:
the program makes a byte offset, adds it to the base address, and loads from that address.

Follow the four reads for 91. Each row shows the range just before the middle word is loaded:

| `low` | `high` | `mid` | Middle word | Next step |
| ----: | -----: | ----: | ----------: | --------- |
| 0     | 11     | 5     | 23          | Set `low` to 6 |
| 6     | 11     | 8     | 72          | Set `low` to 9 |
| 9     | 11     | 10    | 100         | Set `high` to 9 |
| 9     | 9      | 9     | 91          | Save index 9 |

Select **Build** and **Run**. `$t4` should show `00000009` in the register panel. Index 9 is the
tenth position because indices begin at zero.

Now change the target to 90. Before running, write down `low`, `high`, `mid`, and the loaded word
on each pass. Why does the next range become empty? Select **Build**, then **Run**, and check that `$t4` shows
`FFFFFFFF`, the 32-bit representation of -1. Zero would not work as an absent-value result
because index 0 belongs to the array.

Finally, try targets 2 and 127. Predict their indices and which middle words the search reads,
then select **Build** and **Run** for each version. Both ends of the array should be reachable: `$t4` becomes 0 for 2 and 11
for 127. Keep `COUNT` equal to the number of `.word` values when changing the array.
