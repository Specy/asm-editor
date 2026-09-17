Two unit conversions, one in each direction. The first turns 365 days into hours with a `mulu`, and
the second turns 1000 seconds into 16 minutes and 40 seconds with a `divu`, which answers both
questions at once and packs the two answers into one register.

Multiply and divide are the two instructions with rules of their own, and the rules are all about
size: the source is a word, and a division hands back a word and a word in one register.

```m68k|playground|no-flags|allow-open
    move.w #365, d0     ; days = 365
    move.w #24, d1
    mulu d1, d0         ; hours = days * 24

    move.l #1000, d2    ; seconds = 1000
    divu #60, d2        ; d2 = seconds / 60, with seconds % 60 above it
    move.l d2, d3
    andi.l #$FFFF, d2   ; the quotient, whole minutes
    swap d3
    andi.l #$FFFF, d3   ; the remainder, the seconds left over
```

`mulu` multiplies the low **word** of the destination by the **word** of the source and writes the
32 bit product over the whole destination, so `d0` comes out at `00002238`, which is 8760. Two 16 bit
numbers cannot make more than a 32 bit answer, which is why the operands are that size.

`divu` divides the whole **long** in the destination by the **word** of the source and puts the
quotient in the low word and the remainder in the high word of the same register. `d2` after the
division is `0028 0010`: 16 minutes in the low word and 40 seconds in the high one. Copying it into
`d3` and swapping the words is how you get at the remainder, and the two `andi.l` lines throw away
the half of the register that belongs to the other answer.

The quotient has to fit in those sixteen bits. When it does not, `divu` sets `V` and leaves the
register exactly as it was, so a division of numbers you did not choose yourself wants a `bvs` after
it. Dividing by zero ends the run with "Division by zero".

The word-sized source catches people the same way. Change `move.w #365, d0` to `move.l #65901, d0`
and run it: `d0` still comes out at 8760. 65901 is 65536 plus 365, and `mulu` never looked above the
low word, so the extra 65536 was silently dropped and the answer is the one for a number you did not
ask about.
