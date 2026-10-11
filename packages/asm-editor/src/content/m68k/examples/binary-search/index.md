Binary search finds a value by checking the middle of a sorted array, then keeping only the half
where the value could still be. This program looks for 91 among twelve words sorted from smallest
to largest. It leaves the matching index in `d3`, or -1 if the value is absent. The order matters:
without it, a comparison cannot tell us which half is safe to discard.

```m68k|playground|memory|no-flags|allow-open
count equ 12

    lea numbers, a0     ; the array
    move.l #91, d0      ; the value we are looking for
    clr.l d1            ; low = 0
    move.l #count-1, d2 ; high = count - 1
    moveq #-1, d3       ; found = -1, meaning not there
search:
    cmp.l d2, d1        ; low - high
    bgt search_done     ; stop if low > high
    move.l d1, d4
    add.l d2, d4
    lsr.l #1, d4        ; mid = (low + high) / 2, rounded down
    move.l d4, d5
    add.l d5, d5        ; mid * 2, the size of a word
    move.w (a0, d5), d6 ; numbers[mid]
    cmp.w d0, d6        ; numbers[mid] - target
    beq found
    bgt too_big         ; numbers[mid] > target
    move.l d4, d1
    addq.l #1, d1       ; low = mid + 1
    bra search
too_big:
    move.l d4, d2
    subq.l #1, d2       ; high = mid - 1
    bra search
found:
    move.l d4, d3       ; found = mid
search_done:

    org $2000
numbers: dc.w 2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 100, 127
```

`d1` and `d2` mark the first and last indices still worth searching. `cmp.l d2, d1` calculates
`low - high` for the condition flags. The signed `bgt` ends the search when `low > high`, because
no indices remain. This signed check also works if `high` reaches -1 after ruling out the first
element.

For a range that remains, `d4` becomes its middle index. `lsr.l #1, d4` divides the sum of
`low` and `high` by two, rounding down. The indices here are never negative. Each array element
is a word of two bytes, so `add.l d5, d5` converts the middle index into a byte offset. For
example, when `mid` is 9, `d5` becomes 18 and `(a0, d5)` reads `numbers + 18`: the tenth word, 91. The first word has index 0 and offset 0.

The second comparison, `cmp.w d0, d6`, calculates `numbers[mid] - target` using words. `beq`
finds an equal value. If the signed `bgt` branches to `too_big`, the middle value is larger than
the target, so `high` moves to `mid - 1`. Otherwise the middle value is smaller, and `low` moves
to `mid + 1`. The values in this array and the target fit in signed words, and the array is in
signed ascending order.

Select **Build**, then **Run**. The registers panel shows `d3 = 00000009`: 91 is at index 9.
Select **Build** again to reset the program, then use **Step** to watch each middle value. The
first probe reads 23 at index 5, so `low` becomes 6. The next reads 72 at index 8, so `low`
becomes 9. The third reads 100 at index 10, so `high` becomes 9. The fourth reads 91 at index
9 and sets `d3` to 9. This search reads four array elements; scanning from the start would read
ten to reach index 9. Halving gives roughly logarithmic growth in _array reads_: around ten
reads can search a thousand sorted elements, and around twenty can search a million. The loop
also does arithmetic and comparisons between reads.

## Try another target

Change `#91` to `#2`, the first value in the array. Predict the index in `d3`, then select
**Build** and **Run** to check. Next change the target to `#90`, which is absent, and predict
`d3` again. Keep the array sorted while trying other values: the search relies on that order.

<details>
<summary>Show answer</summary>

For 2, `d3` is `00000000`, a valid index. For 90, `d3` stays `FFFFFFFF`, which represents -1.
The search for 90 eventually has `low = 9` and `high = 8`, so the first `bgt` ends the loop.
The program starts `d3` at -1 and changes it only after a match. It cannot use 0 to mean
"absent" because the first array element has index 0.

</details>
