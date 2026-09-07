A string sits at `0x9000` with a zero byte after it, and the program works out how long it is by
walking to that zero and subtracting the address it started from. The answer, 15, ends up in `hl`.

Nothing in memory records the length of a string. The largest element knew it had eight numbers
because `count` said so; here the only thing that says where the string ends is a byte of its own,
and finding it is the program's job.

**You need to know:** the "Arrays, strings and ix" lecture and the "8-bit and 16-bit arithmetic,
logic and bits" lecture. What is new here is that the difference of two addresses is a number of
bytes, so a length can be measured instead of counted.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld hl, text     ; p = text
    ld d, h
    ld e, l         ; keep where the string starts
scan:
    ld a, (hl)      ; is *p the terminator?
    or a
    jr z, found
    inc hl          ; p++
    jr scan
found:
    or a            ; C = 0, because sbc would subtract it too
    sbc hl, de      ; n = p - text
    halt

    .org 0x9000
text:   .asciz "Assembly is fun"
more:   .asciz "!"
```

`or a` is the "is `a` zero" idiom from the F register lecture: it computes `a | a`, which leaves `a`
exactly as it was, and sets `Z` from it. So `jr z, found` under it means "if that byte was the
terminator, stop", and no `cp 0` is needed.

When the loop falls out, `hl` holds `900F`, the address of the terminator itself, and `de` still
holds the `9000` it was given before the loop. Their difference is 15, and there is nothing to take
off afterwards, because the scan stops **on** the zero rather than one byte past it. That is what
C's `strlen` compiles to.

`sbc hl, de` is the only 16 bit subtraction the Z80 has. There is no `sub hl, de`, and `sbc` takes
the carry away as well, so it has to be preceded by something that clears the carry. Here that is a
second `or a`: `a` holds the terminator, so it leaves `a` at zero and forces `C` to 0 into the
bargain. Leave it out and the length can come back one too small, depending on what the instruction
before it left in the carry, which is a bug that only shows up half the time.

Counting with a register works too, an `inc c` inside the loop and no subtraction at the end, and
that is what the loops lecture did. The Z80 also has `cpir`, which searches for the byte in `a` and
counts down `bc` itself, so a length is `ld bc, 0xFFFF`, `xor a`, `cpir` and a little arithmetic on
what is left of `bc`.

`more` is a second string sitting right after the first one. Try changing `text: .asciz` to
`text: .db`, which writes the characters without a terminator: `hl` comes out at `0010`, which is
16, because the loop walks straight on into `more` and stops at that string's zero instead. The only
thing that says where a string ends is that byte.
