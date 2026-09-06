The greatest common divisor of two numbers, worked out by Euclid's method: replace the pair with the
smaller number and the remainder of the division, and go round until the remainder is zero. The
program calls it as a subroutine, with the two arguments in `d0` and `d1` and the answer coming back
in `d0`.

This is the first program on the ladder that calls anything. Everything before it was one block of
code running once, and this one has a piece of code with a name that the rest of the program hands
work to.

**You need to know:** the "bsr, rts, link and unlk" lecture and the "Multiply and divide, with the
remainder" Example. What is new here is the call itself, `bsr` pushes the address of the instruction
after it and jumps, and `rts` pops that address back and carries on there.

```m68k|playground|no-flags|allow-open
    move.l #84, d0      ; a = 84
    move.l #36, d1      ; b = 36
    bsr gcd             ; a = gcd(a, b)
    move.l d0, d2       ; the answer, kept somewhere it will not be reused
    bra end

* gcd(a, b): a arrives in d0 and b in d1, the answer leaves in d0.
* It works in d3, which the caller has to expect.
gcd:
    tst.l d1            ; while(b != 0)
    beq gcd_done
    move.l d0, d3       ; t = a
    divu d1, d3         ; d3 = a / b, with a % b above it
    swap d3
    andi.l #$FFFF, d3   ; t = a % b
    move.l d1, d0       ; a = b
    move.l d3, d1       ; b = t
    bra gcd
gcd_done:
    rts

end:
```

The whole agreement between the two halves is the comment above the label: arguments in `d0` and
`d1`, answer in `d0`, and `d3` destroyed. Nothing in the machine enforces any of that, and a
**calling convention** is exactly this comment written once for a whole program instead of once per
subroutine.

The `bra end` above `gcd` is not optional. A subroutine is ordinary code sitting at an ordinary
address, so without that jump the program would walk into `gcd` after the `move.l d0, d2` and reach
an `rts` with nothing of its own on the stack.

Step through the call with the registers panel open and `a7` drops by 4 at the `bsr` and climbs back
at the `rts`, because the return address is on the stack for as long as the subroutine is running.
`d0` and `d2` both come out at `0000000C`, which is 12: 84 and 36 are both 12 times something and
nothing larger divides them both.

Try changing the two numbers to 1071 and 462. The answer is 21, and the loop goes round one more
time to find it.
