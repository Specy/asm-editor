Two numbers go into registers, the program works out the perimeter of the rectangle they describe,
and the answer stays in `a`. Nothing is read from memory and nothing branches: every value is in a
register from the first instruction to the last, which is what the registers panel next to the
program shows you.

This is the first program of the ladder, and the ones after it are built out of the same three
moves: a number into a register, a register into another register, and an `add`.

**You need to know:** the "Getting started with the Z80" lecture and the "Registers, pairs and the
shadow set" lecture. What is new here is the last two instructions, `hl` is two registers at once
and writing `l` leaves `h` exactly as it was.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld a, 30        ; width = 30
    ld b, 12        ; height = 12
    add a, b        ; perimeter = width + height
    add a, a        ; perimeter = perimeter + perimeter

    ld hl, 0xFF00   ; hl already holds something
    ld l, a         ; only the low half of hl is written
    halt
```

`ld a, 30` writes the number 30 into `a`, and `ld b, 12` does the same with 12 and `b`. Put the 30
in parentheses and `ld a, (30)` reads the byte _at address_ 30 instead, which is a different
instruction and a different program.

The two adds are one C line, `perimeter = 2 * (width + height)`, written one operation at a time.
Every 8 bit addition on this machine writes its answer into `a` and reads one of its two operands
from there, so `add a, b` is the only shape an addition has, and `add a, a` adds the accumulator to
itself, which is how you double a number without a multiplication.

`a` comes out at `54`, which is 84, and `hl` at `FF54`. The `54` is the perimeter and the `FF` is
what the high half of `hl` was already holding: `l` and `h` are one byte each, and naming one of
them is what decided how much of the pair changed.

The M68K writes a size on the instruction, `move.b` or `move.l`, to say the same thing. Here there
are no sizes at all, because the registers you name say it for you: `ld l, a` moves one byte and
`ld hl, 0xFF00` moves two.

Try changing `ld l, a` to `ld h, a`. `hl` comes out at `5400`, with the perimeter in the high half
and the `FF` gone, because `h` is the other one of the two registers the pair is made of.
