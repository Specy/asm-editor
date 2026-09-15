A string sits at `$2000` with a zero byte after it, and the program works out how long it is by
walking to that zero and subtracting the address it started from. The answer, 15, ends up in `d0`.

Nothing in memory records how long a string is. An array can be given a `count` next to it; a string
carries its own end instead, as a zero byte after the last character, and finding it is the
program's job every single time.

```m68k|playground|memory|no-flags|allow-open
    lea text, a0        ; a0 walks the string
    move.l a0, d1       ; keep where it started
scan:
    tst.b (a0)+         ; the terminator? and step on either way
    bne scan
    move.l a0, d0       ; a0 is one byte past the terminator
    sub.l d1, d0        ; how far it walked
    subq.l #1, d0       ; without the terminator itself

    org $2000
text: dc.b 'Assembly is fun', 0
```

`tst.b (a0)+` reads the byte, sets `Z` from it and steps `a0` on by one, all in one instruction, so
`bne scan` under it means "if that byte was not zero, go round again". No `cmp` is needed, because
`tst` is `cmp #0` written shorter and the postincrement mode does the walking.

When the loop falls out, `a0` is `00002010`, one byte past the terminator, and `d1` still holds the
`00002000` it was given before the loop. Their difference is 16, the whole string including the zero,
and the `subq.l #1` takes the zero back off. The length was never counted, it was measured.

Counting with a register works too, an `addq.l #1, d0` inside the loop and no subtraction at the end.
It costs one instruction per character instead of two instructions once.

Take the `, 0` off the `dc.b` line and press Run. There is now nothing at the end of the string to
stop the loop, so it walks off into memory nobody wrote, and it keeps walking until the run stops
with "Execution limit of 2000000 instructions reached". Nothing about the string itself changed; you
removed the only thing that said where it ended.
