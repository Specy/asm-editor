Twelve words in order, and the program finds which one holds 91 by halving the range it is looking in
until nothing is left. It leaves the index in `d3`, or -1 when the value is not in the array. Four
elements are read out of the twelve, where walking the array would read ten.

This is what having a sorted array is worth. Every comparison throws away half of what is left, so a
thousand elements take about ten reads and a million take about twenty.

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

`add.l d5, d5` doubles the index into a byte offset, since the elements are words. `(a0, d5)` adds a
register to an address and does nothing else, so turning an element number into a byte count is
always yours to do.

The four probes are 23, 72, 100 and finally 91. Each one either matches, or moves `low` past the
middle, or moves `high` below it, and the loop ends when `low` walks past `high`. `d3` comes out at
`00000009`, which is the index of 91, and `d4`, `d1` and `d2` all end at 9 as well, which is the
range having closed onto one element.

When the value is not in the array at all, `d3` is still the `FFFFFFFF` that `moveq` put there before
the loop started. That is why the answer for "not found" is -1 and not 0: 0 is a perfectly good
index, so it cannot also mean nothing.
