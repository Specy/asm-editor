Eight words sit in memory and the program walks them once, keeping the largest one it has seen so far
in `d0` and the position it was found at in `d3`. One of the numbers is negative, which is what makes
the choice of condition matter.

Sum of an array read every element and needed nothing from the ones before it. Here every pass has to
compare the element against something the loop is carrying, which is the shape of every "find the
best one" program there is.

**You need to know:** the "Arrays, strings and `(a0)+`" lecture and the "Compare and branch" lecture.
What is new here is the best so far: a register that starts as the first element and is overwritten
only when the loop meets something better.

```m68k|playground|memory|no-flags
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

`d0` comes out at `00000063`, which is 99, and `d3` at `00000004`, since 99 is the fifth element and
the first one is number 0. `d2` holds 60, the last element the loop looked at, and `a0` ends at
`00002010`, one word past the end.

`ble` is the **signed** condition, and the `-4` in the array is why. Try changing `ble not_bigger` to
`bls not_bigger`, which is the unsigned one: `d0` comes out at `0000FFFC` and `d3` at 1, because read
as an unsigned word `FFFC` is 65532 and nothing in the array beats it.
