This program calculates the perimeter of a rectangle whose width is 30 and height is 12. It keeps
every value in data registers: `d0` holds the width, `d1` the height, and `d2` the answer.

The calculation is `30 + 12 = 42`, then `42 + 42 = 84`.

```m68k|playground|no-flags|allow-open
    move.l #30, d0          ; width = 30
    move.l #12, d1          ; height = 12
    move.l d0, d2           ; start d2 with the width
    add.l d1, d2            ; d2 = width + height = 42
    add.l d2, d2            ; d2 = 42 + 42 = 84

    move.l #$FFFFFF00, d3  ; give d3 a visible starting value
    move.b d2, d3          ; copy just d2's low byte into d3
```

## Run it and inspect the registers

In the playground, select **Build**, then **Run**. When the program has finished, look at the
registers panel:

| register | value to check | why                                 |
| -------- | -------------- | ----------------------------------- |
| `d0`     | `0000001E`     | 30, the width                       |
| `d1`     | `0000000C`     | 12, the height                      |
| `d2`     | `00000054`     | 84, the perimeter                   |
| `d3`     | `FFFFFF54`     | its low byte was replaced with `54` |

The panel displays registers in hexadecimal, without `0x`. Decimal 84 is hexadecimal `$54`.

To watch one instruction at a time, select **Build** again to reset the program, then select
**Step**. After the third instruction, `d2` matches `d0`; after the fourth it is 42 (`0000002A`);
after the fifth it is 84.

`#30` and `#12` mean the numbers themselves. In these instructions, the source is on the left and
the destination is on the right. So `add.l d1, d2` adds the value in `d1` to `d2` and stores the
sum in `d2`. `add.l d2, d2` uses `d2` as both source and destination, doubling its value.

The final `move.b` writes one byte. The low byte of `d2` is `54`, so it replaces only the final two
hexadecimal digits of `d3`. The upper three bytes, `FFFFFF`, stay as they were.

## Try it

Change the two starting numbers so the rectangle is 20 by 5. Before running, work out what `d2`
and `d3` should show. Select **Build**, then **Run**, and check your prediction in the registers
panel.
