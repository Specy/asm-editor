Two unit conversions, one in each direction. The first turns 365 days into 8760 hours and the second
turns 1000 seconds into 16 minutes and 40 seconds, which answers both questions at once because a
division produces the remainder on its way to the quotient.

The M68K does each of these in one instruction, `mulu` and `divu`, and so do MIPS and RISC-V. **The
Z80 has neither.** There is no multiply instruction and no divide instruction anywhere in the set,
so both of them are loops you write, and this is the rung of the ladder where the machine costs you
the most.

**You need to know:** the "8-bit and 16-bit arithmetic, logic and bits" lecture and the "Loops and
djnz" lecture. What is new here is that both algorithms are the long multiplication and long
division you were taught at school, done in base 2, where a digit is either 0 or 1 and multiplying
by the base is a shift.

```z80|playground|no-flags|allow-open
    .org 0x8000
; hours = days * 24, by shift and add
    ld de, 365      ; days, sixteen bits of it
    ld a, 24        ; the multiplier, whose bits we look at
    ld hl, 0        ; the product
    ld b, 8         ; eight bits to look at
multiply:
    srl a           ; the lowest bit of the multiplier falls into C
    jr nc, no_add
    add hl, de      ; if it was 1, add the multiplicand
no_add:
    sla e           ; the multiplicand doubles every time round
    rl d
    djnz multiply
    ex de, hl       ; the hours, out of the way of the division

; minutes = seconds / 60, and the remainder is the seconds left over
    ld hl, 1000     ; the dividend
    ld c, 60        ; the divisor
    xor a           ; the remainder starts empty
    ld b, 16        ; sixteen bits of dividend
divide:
    add hl, hl      ; the top bit of what is left of the dividend
    rla             ; comes in at the bottom of the remainder
    cp c            ; does the divisor go into it?
    jr c, no_sub
    sub c           ; take it away
    inc l           ; and record a 1 in the quotient
no_sub:
    djnz divide
    halt
```

The multiplication looks at the multiplier one bit at a time from the bottom up. `srl a` drops the
lowest bit of 24 into `C`, `jr nc` skips the addition when that bit was a 0, and `sla e` with `rl d`
under it doubles the multiplicand so that the next bit up is worth twice as much. Eight passes,
whatever the numbers, and the product is kept in `hl` because 365 times 24 needs a great deal more
than the eight bits `a` has. `de` comes out at `2238`, which is 8760.

`sla e` and `rl d` are the 16 bit shift from the arithmetic lecture: `sla e` puts the top bit of `e`
into `C` and `rl d` brings it in at the bottom of `d`, so the two of them are one shift of the pair.
The low half goes first, because the carry has to be produced before the instruction that consumes
it.

The division is the same idea run backwards. `hl` holds what is left of the dividend and `a` holds
the remainder being built, and every pass shifts the whole 24 bit thing one place left: `add hl, hl`
moves the top bit of `hl` into `C` and `rla` brings it into the bottom of `a`. Then `cp c` asks
whether the divisor fits in what the remainder has become, and when it does, `sub c` takes it away
and `inc l` writes a 1 into the quotient. The quotient is written into the bottom of `hl` as the
dividend leaves the top of it, which is why one register does both jobs and why `inc l` is enough:
the bit it sets was shifted in as a 0 a moment earlier.

`hl` comes out at `0010`, which is 16 minutes, and `a` at `28`, which is the 40 seconds left over.
On the M68K those two answers arrive packed into one register and are pulled apart with a `swap`;
here they are simply in the two registers the loop used, and the remainder is free.

The whole program is 134 instructions for two sums the other machines do in two. A multiplication by
a **constant** is much cheaper, because you know the bits in advance: 24 is 16 plus 8, so four
`add hl, hl`, a copy kept when the number has been doubled three times, and one `add hl, de` at the
end would do it with no loop at all.

Try changing `ld b, 8` to `ld b, 4`. The loop looks at only the bottom four bits of 24, which are
`1000`, so `de` comes out at `0B68`, which is 2920: the multiplier became 8 and the bits above the
fourth were never looked at.
