A rectangle is 30 units wide and 12 units high. This program adds the width and height, then
doubles that sum to get the perimeter. It keeps the numbers in registers so you can watch each
change in the registers panel.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld a, 30        ; width = 30
    ld b, 12        ; height = 12
    add a, b        ; a = width + height (half the perimeter)
    add a, a        ; a = 2 * (width + height)

    ld hl, 0xFF00   ; start with h = FF and l = 00
    ld l, a         ; copy the perimeter into l
    halt
```

Build the program, then use **Step** to watch `a`, `b`, and `hl`. The first two `ld` instructions
put 30 in `a` and 12 in `b`. `add a, b` puts their sum, 42, in `a`; `b` stays 12. Next,
`add a, a` adds `a` to itself, leaving the perimeter, 84, in `a`.

The panel shows register values in hexadecimal: after the first add, `a` shows `2A` (42 in
decimal); after the second, it shows `54` (84 in decimal). You can also press **Run** after
building to go straight to the final values.

The last two `ld` instructions show what happens when you write one half of a register pair.
`ld hl, 0xFF00` puts `FF` in the high byte `h` and `00` in the low byte `l`. Then `ld l, a`
copies `54` into `l` without changing `h`, so the panel ends with `hl` showing `FF54`.

Try changing the width to 20 and the height to 10. Before you build and run again, work out
what `a` and `hl` should show at the end. The perimeter is 60, so expect `3C` in `a` and
`FF3C` in `hl`.
