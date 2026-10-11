This program asks four questions about 182: Is it odd? What is it times eight? What are its lowest
four bits? How many of its 32 bits are ones? It leaves the answers in `d1` through `d4`.

The same value, `$B6` or `%10110110`, supplies every answer. A bit test answers the first question,
a left shift multiplies it, a mask extracts four bits, and a loop counts the ones.

```m68k|playground|allow-open
    move.l #182, d0     ; n = 182, or %10110110

    clr.l d1            ; give the whole result register a known value
    btst #0, d0         ; test the lowest bit; Z=1 if it is zero
    sne d1              ; low byte = $FF if odd, $00 if even

    move.l d0, d2
    lsl.l #3, d2        ; shift left three places: n * 8

    move.l d0, d3
    andi.l #$0F, d3     ; keep only the lowest four bits

    clr.l d4            ; count of one bits starts at zero
    move.l d0, d5       ; shift a copy, keeping d0 intact
    move.w #31, d6      ; 32 passes with dbra
count:
    lsr.l #1, d5        ; the bit leaving the low end goes into C
    bcc no_bit          ; skip the addition if that bit was zero
    addq.l #1, d4
no_bit:
    dbra d6, count
```

`btst #0, d0` tests bit 0, the lowest bit, without changing `d0`. It sets `Z=1` when that bit is
zero. `sne` means “set if not equal,” or `Z=0`, so it writes `$FF` for an odd number and `$00` for
an even one. It writes only the low byte of `d1`; `clr.l d1` makes the other three bytes zero.

Each left shift doubles the value while no set bit falls off the high end. Three shifts make
`182 × 8 = 1456`. The `andi.l #$0F, d3` mask keeps bits 0 through 3 and clears the rest. Those
four bits are `%0110`, or 6.

The loop checks every bit of the 32-bit copy in `d5`. After each `lsr.l`, `C` holds the bit that
fell off the low end; `bcc` branches when `C=0`. Five bits of 182 are ones, so the addition runs
five times. `dbra` starts with 31 in the low word of `d6`, giving 32 passes as it counts down
through zero. On its last pass, that low word becomes `$FFFF` and the loop ends.

Select **Build**, then **Run**. At the end, the register panel displays hexadecimal values without
a `$` prefix: `d1=00000000` (even), `d2=000005B0` (1456), `d3=00000006` (lowest four bits), and
`d4=00000005` (five one bits). The final low word of `d6` is `FFFF`.

To follow the flags, select **Build** again and use **Step**. Check `Z` immediately after `btst`;
then check `C` immediately after a `lsr.l` in the loop. Later instructions change the flags, so
inspect each flag before stepping past the instruction that set it.

## Try it

Change the starting value to 183. Predict `d1` through `d4`, then select **Build** and **Run** to
check them. Which answers change when only bit 0 changes from zero to one?

<details>
<summary>Show answer</summary>

All four change: `d1=000000FF` (odd), `d2=000005B8` (1464), `d3=00000007`, and
`d4=00000006`. The new bit 0 makes the number odd and adds one to the bit count; it also changes
the low nibble and the product.

</details>
