Eight words in memory, sorted from smallest to largest where they lie. The loop compares each pair of
neighbours and swaps them when they are the wrong way round, and it does that as many times as there
are elements, so the largest number reaches the end on the first pass and the rest follow.

Every loop up to here read an array once. This one reads it seven times, with an inner loop that
walks the array and an outer loop that says how often, and the two counters have to be kept apart.

**You need to know:** the "Loops and dbra" lecture and the "Fill an array with the numbers from 1 to
10" Example. What is new here is nesting: the inner counter is set **inside** the outer loop, because
it has to start again from the top on every pass.

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

`(a0)` and `2(a0)` are the pair being compared, the element the pointer is on and the one two bytes
after it, which is the next word. Reading both without moving `a0` is what makes the swap two plain
`move.w` instructions.

Both the `lea numbers, a0` and the `move.w d0, d1` belong inside the outer loop. `a0` has walked to
the end of the array by the time a pass finishes, so it goes back to the start; and `d1` is `$FFFF`
by then, which as a counter would run the inner loop 65536 times. Copying `d0` into it is also what
makes each pass shorter than the one before, since the last element is already in its place after the
first pass, the last two after the second, and so on.

Run it with the memory panel on `2000` and the eight words read 1, 4, 8, 15, 16, 23, 42 and 99, in
that order. It took 220 instructions to sort eight numbers, and it would take about four times as
many to sort sixteen, because both loops grow with the array.

Try changing `bge in_order` to `ble in_order`. The same program sorts the other way round, largest
first, because the only thing that says which order you wanted is that one condition.
