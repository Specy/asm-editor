This program sorts eight signed words from smallest to largest in the same memory where they start,
at `$2000`. It compares neighbouring words and swaps them when the left one is larger. The inner
loop makes one pass across the unsorted part of the array; the outer loop sends it back to the
start for another pass. Seven passes are enough for eight words.

```m68k|playground|memory|no-flags|allow-open
count equ 8

    move.w #count-2, d0     ; the outer loop runs count-1 times
outer:
    lea numbers, a0         ; back to the first element
    move.w d0, d1           ; the inner loop is one shorter every pass
inner:
    move.w (a0), d2         ; left = numbers[i]
    move.w 2(a0), d3        ; right = numbers[i + 1]
    cmp.w d2, d3            ; right - left
    bge in_order            ; if(right >= left) leave them alone
    move.w d3, (a0)         ; otherwise swap them
    move.w d2, 2(a0)
in_order:
    addq.l #2, a0           ; on to the next pair
    dbra d1, inner
    dbra d0, outer

    org $2000
numbers: dc.w 42, 8, 15, 4, 23, 16, 99, 1
```

`(a0)` reads the left word and `2(a0)` reads the next word, two bytes farther on. Both reads leave
`a0` in place, so the two `move.w` instructions can write the swapped values back to those same
addresses. `cmp.w d2, d3` compares the right word with the left one by calculating `d3 - d2` for
the condition flags. The signed `bge` skips the swap when the right word is greater than or equal
to the left word.

The outer counter `d0` starts at `count-2`, or 6. With `dbra`, that gives seven outer passes. At
the start of each pass, `move.w d0, d1` gives the inner loop its own counter: 6 for seven pair
comparisons on the first pass, then 5 for six, down to 0 for one comparison on the last pass. The
largest remaining word reaches its final position at the right end of each pass, so the next pass
does not need to compare it again.

Both `lea numbers, a0` and `move.w d0, d1` must run at the start of every outer pass. After the
first seven comparisons, `a0` points at the last word, `$200E`; it needs to return to `$2000`.
The inner `dbra` also leaves `d1` at `$FFFF`. Reloading it from `d0` sets the shorter count for the
next pass.

Select **Build**, then **Run**, and set the memory panel to `2000`. The eight words, starting at
`$2000`, read 1, 4, 8, 15, 16, 23, 42, 99. Select **Build** again to reset the program, then use
**Step** to follow the first two comparisons. The first compares 42 with 8 and swaps them: the
first two words become 8, 42. After `addq.l #2, a0`, `a0` is `$2002`. The next comparison is
therefore 42 with 15, which swaps too; the first three words become 8, 15, 42.

## Predict the first pass

Before stepping through the rest of the first pass, predict the eight words it will leave in
memory. Which word has reached its final position, and how far has 1 moved from the last address?

<details>
<summary>Show answer</summary>

After the first pass the words are 8, 15, 4, 23, 16, 42, 1, 99. The 99 has reached its final
position at `$200E`. The 1 has moved just one word to the left, from `$200E` to `$200C`. A value
moving toward the front can move at most one place per pass because the inner loop walks from
left to right.

</details>
