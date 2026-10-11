This program finds the greatest common divisor (GCD) of 84 and 36. Euclid's method repeatedly
replaces the pair `(a, b)` with `(b, a % b)`. For these inputs, `(84, 36)` becomes `(36, 12)`, then
`(12, 0)`. When `b` reaches zero, `a` is the answer: 12.

The calculation lives in a subroutine. The caller puts `a` in `d0` and `b` in `d1`, calls `gcd`,
and receives the answer in `d0`. This version uses unsigned division. Give it positive whole-number
inputs from 1 through 65535: `divu` reads the low 16-bit word of `d1` as its divisor and requires
the quotient to fit in 16 bits. Both conditions hold for these inputs on every loop pass.

```m68k|playground|no-flags|allow-open
    move.l #84, d0      ; a = 84
    move.l #36, d1      ; b = 36
    bsr gcd             ; a = gcd(a, b)
    move.l d0, d2       ; keep a copy of the answer
    bra end

; gcd(a, b): inputs in d0 and d1; answer in d0; overwrites d1 and d3
gcd:
    tst.l d1            ; is b zero?
    beq gcd_done
    move.l d0, d3       ; t = a
    divu d1, d3         ; high word = a % b; low word = a / b
    swap d3             ; move the remainder into the low word
    andi.l #$FFFF, d3   ; t = a % b, with the high word cleared
    move.l d1, d0       ; a = b
    move.l d3, d1       ; b = t
    bra gcd
gcd_done:
    rts

end:
```

The comment above `gcd` gives its register agreement. The routine changes `d1` as it updates `b`
and uses `d3` for temporary work, so a caller that needs their original values must save them. Such
agreements between a caller and a subroutine form a **calling convention**.

`divu` packs the remainder in the high word of `d3` and the quotient in the low word. On the first
pass, `84 = 36 × 2 + 12`, so `d3` becomes `000C0002`. `swap d3` moves the remainder into the low
word, giving `0002000C`. The `andi.l` mask clears the high word and leaves `0000000C`, ready to
become the new `b`.

## Run it, then step through the call

Select **Build**, then **Run**. In the registers panel, `d0` and its copy in `d2` both show
`0000000C` (12). The panel displays hexadecimal without `0x`.

Select **Build** again to reset the program, then use **Step**. On the first loop pass, watch `d3`
take the three values above after `divu`, `swap`, and `andi.l`. The next two moves change the pair
in `d0` and `d1` from `(84, 36)` to `(36, 12)`. On the second pass they change it to `(12, 0)`.
Now `tst.l d1` sets `Z=1`, and `beq gcd_done` reaches `rts`.

Also watch `a7`, the stack pointer. At `bsr gcd`, it decreases by 4 because `bsr` pushes the
four-byte return address. At `rts`, it increases by 4 as that address is popped, and execution
resumes at `move.l d0, d2`. The following `bra end` skips over the subroutine. Without this branch,
execution would enter `gcd` again after the call has already returned.

## Try another pair

Change the starting values to 36 in `d0` and 84 in `d1`. Predict the first pair produced by the
loop and the final answer. Select **Build**, then **Run** to check `d0` and `d2`.

<details>
<summary>Show answer</summary>

The first pair is `(84, 36)`, because 36 divided by 84 has remainder 36. The loop then reaches
`(36, 12)` and `(12, 0)`. Both `d0` and `d2` finish at `0000000C` (12).

</details>
