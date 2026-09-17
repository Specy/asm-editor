Eight bytes sit in memory and the program walks them once, keeping the largest one it has seen so
far in `c` and the position it was found at in `d`. One of the numbers is negative, which is what
makes the choice of comparison matter.

Sum of an array read every element and needed nothing from the ones before it. Here every pass has
to compare the element against something the loop is carrying, which is the shape of every "find the
best one" program there is.

```z80|playground|memory|no-flags|allow-open
count equ 8

    .org 0x8000
    ld hl, numbers  ; hl = the start of the array
    ld a, (hl)      ; best = numbers[0]
    ld c, a
    inc hl
    ld d, 0         ; where = 0
    ld e, 0         ; i = 0
    ld b, count-1   ; seven elements left
loop:
    inc e           ; i++
    ld a, c         ; best
    cp (hl)         ; best minus the byte hl points at
    jp pe, flipped  ; the subtraction overflowed, so S is inverted
    jp m, take      ; it did not, so S tells the truth
    jr next
flipped:
    jp p, take      ; inverted: plus means less
    jr next
take:
    ld a, (hl)
    ld c, a         ; that byte is the new best
    ld d, e         ; where = i
next:
    inc hl          ; on to the next byte
    djnz loop
    halt

    .org 0x9000
numbers: .db 12, -4, 37, 8, 99, 41, 2, 60
```

The first element is read before the loop, into `c` and with an `inc hl` stepping past it, so the
loop itself has only seven elements left and starts with an answer that is already right for the
part of the array it has seen. Starting `c` at 0 instead would be a different program, one that
answers 0 for an array of negative numbers.

The five instructions in the middle are one comparison. `cp (hl)` subtracts the byte `hl` points at
from the best so far and sets the flags from the result, and **the best is smaller, as signed bytes,
exactly when `S` and `P/V` differ**: `P/V` says the
subtraction overflowed, and when it did the sign of the answer is the opposite of the truth. So
`jp pe` picks which of the two readings of `S` to use, and `jp m` and `jp p` are those two readings.
Neither `pe` nor `m` nor `p` has a `jr` form, which is why all three are a `jp`.

`c` comes out at `63`, which is 99, and `d` at `04`, since 99 is the fifth element and the first one
is number 0. The panel shows them as `bc` at `0063` and `de` at `0407`, `e` being the index the walk
finished on.

If five jumps to do one comparison looks like too much, replace all of them and the `flipped` label
with the single line `jr nc, next`, the unsigned comparison, and run it. The program reports 252 as
the largest. Read as an unsigned byte the `-4` in the array is `FC`, which is 252, so nothing beats
it and the smallest number in the array is confidently returned as the biggest. One instruction
against five is what the signed comparison costs, and it is why 8 bit programs keep their numbers
unsigned wherever they can.
