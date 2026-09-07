Twelve words in order, and the program finds which one holds 91 by halving the range it is looking in
until nothing is left. It leaves the index in `d3`, or -1 when the value is not in the array. Four
elements are read out of the twelve, where walking the array would read ten.

Bubble sort left an array in order. This is what being in order is worth: every comparison throws
away half of what is left, so an array of a thousand elements takes about ten reads and one of a
million takes about twenty.

**You need to know:** the "Arrays, strings and `(a0)+`" lecture and the "Bubble sort" Example. What
is new here is a loop that jumps around its array instead of walking it, which is why the element is
reached through an index rather than through a pointer that steps.

```m68k|playground|memory|no-flags|allow-open
count equ 12

    lea numbers, a0     ; the array
    move.l #91, d0      ; the value we are looking for
    clr.l d1            ; low = 0
    move.l #count-1, d2 ; high = count - 1
    moveq #-1, d3       ; found = -1, meaning not there
search:
    cmp.l d2, d1        ; low - high
    bgt search_done     ; while(low <= high)
    move.l d1, d4
    add.l d2, d4
    lsr.l #1, d4        ; mid = (low + high) / 2
    move.l d4, d5
    add.l d5, d5        ; mid * 2, the size of a word
    move.w (a0, d5), d6 ; numbers[mid]
    cmp.w d0, d6        ; numbers[mid] - target
    beq found
    bgt too_big
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

`lsr.l #1, d4` is the halving: shifting a number one place right divides it by two and throws the
remainder away, which is the rounding down that `(low + high) / 2` wants. It is the unsigned shift,
which is right here because an index is never negative.

`add.l d5, d5` doubles the index into a byte offset, since the elements are words. That is the whole
of the difference between `numbers[mid]` in C and `(a0, d5)` here: C knows how big an element is and
the M68K adds a register to an address and nothing else.

The four probes are 23, 72, 100 and finally 91. Each one either matches, or moves `low` past the
middle, or moves `high` below it, and the loop ends when `low` walks past `high`. `d3` comes out at
`00000009`, which is the index of 91, and `d4`, `d1` and `d2` all end at 9 as well, which is the
range having closed onto one element.

Try changing `move.l #91, d0` to `move.l #90, d0`, which is not in the array. `d3` stays
`FFFFFFFF`, the -1 that `moveq` put there before the loop started, because a search that finds
nothing has to say so and 0 is a perfectly good index.
