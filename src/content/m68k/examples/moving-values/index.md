Two numbers go into registers, the program works out the perimeter of the rectangle they describe,
and the answer stays in `d2`. Nothing is read from memory and nothing branches: every value is in a
register from the first instruction to the last, which is what the registers panel next to the
program shows you.

This is the first program of the ladder, and the ones after it are built out of the same three
moves: a number into a register, a register into another register, and an `add`.

**You need to know:** the "Getting started with M68K" lecture and the "Data and address registers"
lecture. What is new here is the size on the last instruction, `.b` writes one byte of a register
and leaves the three bytes above it exactly as they were.

```m68k|playground|no-flags|allow-open
    move.l #30, d0      ; width = 30
    move.l #12, d1      ; height = 12
    move.l d0, d2       ; perimeter = width
    add.l d1, d2        ; perimeter = perimeter + height
    add.l d2, d2        ; perimeter = perimeter + perimeter

    move.l #$FFFFFF00, d3   ; d3 already holds something
    move.b d2, d3           ; only the lowest byte of d3 is written
```

The `#` in `move.l #30, d0` means the number 30 itself; without it the instruction reads four bytes
from address 30 instead. The copy into `d2` and the two adds after it are one C line,
`perimeter = 2 * (width + height)`, written one operation at a time, because an M68K instruction has
two operands and the one on the right is the one that gets written. `add.l d2, d2` adds `d2` to
itself, which is how you double a number without a multiplication.

`d2` comes out at `00000054`, which is 84, and `d3` at `FFFFFF54`. The `54` is the perimeter and the
`FFFFFF` is what `d3` was already holding: the size on the instruction is the only thing that
decided how much of the register changed.

Try changing `move.b d2, d3` to `move.l d2, d3`. `d3` comes out at `00000054` with the `FFFFFF`
gone, because a long is the whole register.
