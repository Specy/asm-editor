A string sits at `$2000` with a zero byte after it, and the program works out how long it is by
walking to that zero and subtracting the address it started from. The answer, 15, ends up in `d0`.

Nothing in memory records the length of a string. The largest element knew it had eight numbers
because `count` said so; here the only thing that says where the string ends is a byte of its own,
and finding it is the program's job.

**You need to know:** the "Arrays, strings and `(a0)+`" lecture. What is new here is that the
difference of two addresses is a number of bytes, so a length can be measured instead of counted.

```m68k|playground|memory|no-flags|allow-open
    lea text, a0        ; p = text
    move.l a0, d1       ; keep where the string starts
scan:
    tst.b (a0)+         ; is *p++ the terminator?
    bne scan
    move.l a0, d0       ; p, one byte past the terminator
    sub.l d1, d0        ; n = p - text
    subq.l #1, d0       ; without the terminator itself

    org $2000
text: dc.b 'Assembly is fun', 0
```

`tst.b (a0)+` reads the byte, sets `Z` from it and steps `a0` on by one, all in one instruction, so
`bne scan` under it means "if that byte was not zero, go round again". No `cmp` is needed, because
`tst` is `cmp #0` written shorter and the postincrement mode does the walking.

When the loop falls out, `a0` is `00002010`, one byte past the terminator, and `d1` still holds the
`00002000` it was given before the loop. Their difference is 16, the whole string including the zero,
and the `subq.l #1` takes the zero back off. That is what C's `strlen` compiles to, and it is why
`d0` comes out at `0000000F`, which is 15.

Counting with a register works too, an `addq.l #1, d0` inside the loop and no subtraction at the end,
and it costs one instruction per character instead of two instructions once.

Try taking the `, 0` off the `dc.b` line and pressing Run. The loop walks past the end of your string
into memory nobody wrote and keeps going, and after a while the run stops with "Execution limit of
2000000 instructions reached". A string with no terminator has no length.
