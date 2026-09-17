Four questions about one number, none of them answered with arithmetic. Is 182 odd, what is it times
eight, what are its bottom four bits, and how many of its 32 bits are ones. The answers land in `d1`
to `d4`.

Arithmetic treats a register as a number. All four of these treat the same register as 32 bits side
by side, which is the other way to read one, and usually the cheaper way.

```m68k|playground|no-flags|allow-open
    move.l #182, d0     ; n = 182, which is %10110110

    btst #0, d0         ; is the lowest bit set?
    sne d1              ; d1 = $FF when n is odd, $00 when it is even

    move.l d0, d2
    lsl.l #3, d2        ; n * 8, three places left is eight times

    move.l d0, d3
    andi.l #$0F, d3     ; the low nibble on its own

    clr.l d4            ; bits = 0
    move.l d0, d5       ; a copy to take apart
    move.w #31, d6      ; 32 bits, so 31
count:
    lsr.l #1, d5        ; the lowest bit falls into C
    bcc no_bit
    addq.l #1, d4       ; bits++
no_bit:
    dbra d6, count
```

`btst #0, d0` asks about the lowest bit without building a mask to do it, and it sets `Z` from the
bit it found: `Z` goes to 1 when the bit **was 0**, which is backwards from what you expect the first
time. `sne d1`
reads it the other way round again and leaves `$FF` when the bit was a 1, so `d1` is `00000000` here
because 182 is even.

Shifting left by three multiplies by eight, since every place a bit moves left doubles what it is
worth. `d2` comes out at `000005B0`, which is 1456. A shift by a constant takes a count from 1 to 8
and no more; past that you put the count in a register, `lsl.l d1, d2`.

`andi.l #$0F, d3` keeps the four bits the mask has set and clears everything else, so `d3` is 6, the
`6` of `$B6`. That is how any field is taken out of a packed value: mask what you want, then shift it
down to the bottom if it was not there already.

The loop runs 32 times, once per bit, and never tests a bit directly. `lsr.l #1, d5` moves every bit
one place down and the bit that falls off the bottom lands in `C`, so `bcc` skips the `addq` when
that bit was a zero. The shifting and the testing are the same instruction.
