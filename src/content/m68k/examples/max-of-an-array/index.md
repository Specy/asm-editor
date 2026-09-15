Eight words sit in memory and the program walks them once, keeping the largest one it has seen so far
in `d0` and the position it was found at in `d3`. One of the numbers is negative, which is what makes
the choice of condition matter.

Adding up an array needs nothing carried between passes. Finding the largest does: every pass has to
compare its element against the best one so far, which is the shape of every "find the best" program
there is.

```m68k|playground|memory|no-flags|allow-open
count equ 8

    lea numbers, a0     ; a0 points at the first element
    move.w (a0)+, d0    ; best = numbers[0]
    clr.w d3            ; where = 0
    clr.w d4            ; i = 0
    move.w #count-2, d1 ; seven elements left, and dbra counts one more
loop:
    addq.w #1, d4       ; i++
    move.w (a0)+, d2    ; n = *a0++
    cmp.w d0, d2        ; n - best
    ble not_bigger      ; if(n <= best) keep the one we have
    move.w d2, d0       ; best = n
    move.w d4, d3       ; where = i
not_bigger:
    dbra d1, loop

    org $2000
numbers: dc.w 12, -4, 37, 8, 99, 41, 2, 60
```

The first element is read before the loop, into `d0` and with `(a0)+` stepping past it, so the loop
itself has only seven elements left and starts with an answer that is already right for the part of
the array it has seen. Starting `d0` at 0 instead would be a different program, one that answers 0
for an array of negative numbers.

`d0` comes out at `00000063`, which is 99, and `d3` at `00000004`: 99 is the fifth element and the
first one is number 0.

`ble` is the **signed** condition, and the `-4` in the array is why it has to be. Change
`ble not_bigger` to `bls not_bigger`, the unsigned one, and run it again: `d0` comes out at
`0000FFFC` and `d3` at 1. Read as an unsigned word, `FFFC` is 65532, so the program decides that -4
is the largest number in the array and nothing else gets a look in. Both versions assemble, both run
to the end, and one of them is wrong.
