Two numbers go into registers, the program works out the perimeter of the rectangle they describe,
and the answer stays in `d2`. Nothing is read from memory and nothing branches: every value is in a
register from the first instruction to the last, which is what the registers panel next to the
program shows you.

Three moves and an `add` is the whole program, and a surprising amount of what follows is built out
of those.

```m68k|playground|no-flags|allow-open
    move.l #30, d0      ; width = 30
    move.l #12, d1      ; height = 12
    move.l d0, d2       ; perimeter = width
    add.l d1, d2        ; perimeter = perimeter + height
    add.l d2, d2        ; perimeter = perimeter + perimeter

    move.l #$FFFFFF00, d3   ; d3 already holds something
    move.b d2, d3           ; only the lowest byte of d3 is written
```

The `#` in `move.l #30, d0` means the number 30 itself. Without it, the instruction would read four
bytes from address 30 instead.

Doubling `width + height` would be one line of arithmetic written anywhere else. Here it is three
instructions, because an M68K instruction has two operands and the one on the right is the one that
gets written, so every step has to name where its answer goes. `add.l d2, d2` adds `d2` to itself,
which is how you double a number without a multiplication.

The last two lines are the interesting pair. `d3` comes out at `FFFFFF54`: the `54` is the perimeter
and the `FFFFFF` above it is what `d3` was already holding, untouched. The `.b` is the only thing in
that instruction that decided how much of the register changed.
