The greatest common divisor of two numbers, worked out by Euclid's method: take the smaller of the
pair away from the larger, and go round until the two are equal. The program calls it as a
subroutine, with the two arguments in `a` and `b` and the answer coming back in `a`.

This is the first program on the ladder that calls anything. Everything before it was one block of
code running once, and this one has a piece of code with a name that the rest of the program hands
work to.

**You need to know:** the "call, ret and passing values" lecture and the "The F register" lecture.
What is new here is the call itself, `call` pushes the address of the instruction after it and
jumps, and `ret` pops that address back and carries on there.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld a, 84        ; x = 84
    ld b, 36        ; y = 36
    call gcd        ; x = gcd(x, y)
    ld c, a         ; the answer, kept somewhere it will not be reused
    jp done

; gcd(x, y): x arrives in a and y in b, the answer leaves in a.
; It works in c, which the caller has to expect.
gcd:
    cp b            ; x - y
    ret z           ; while(x != y)
    jr nc, bigger   ; if(x < y) swap them, so a always holds the larger
    ld c, a
    ld a, b
    ld b, c
bigger:
    sub b           ; x = x - y
    jr gcd

done:
    halt
```

The whole agreement between the two halves is the comment above the label: arguments in `a` and `b`,
answer in `a`, and `c` destroyed. Nothing in the machine enforces any of that, and a **calling
convention** is exactly this comment written once for a whole program instead of once per
subroutine.

`ret z` is the conditional return, and it is the loop's exit: `cp b` sets `Z` when the two numbers
are equal, and one byte of instruction turns that into "we are done, go back to the caller". The
M68K and MIPS have nothing like it and write a jump over an unconditional return instead.

The `jp done` above `gcd` is not optional. A subroutine is ordinary code sitting at an ordinary
address, so without that jump the program would walk into `gcd` after the `ld c, a` and reach a
`ret` with nothing of its own on the stack.

Step through the call with the memory panel on `fff8` and `sp` drops from `FFFF` to `FFFD` at the
`call`, with `07 80` appearing there, which is `0x8007`, the address of the `ld c, a` that follows
the call. `ret` reads those two bytes back into the program counter and puts `sp` back to `FFFF`.
`a`, `b` and `c` all come out at `0C`, which is 12: 84 and 36 are both 12 times something and
nothing larger divides them both.

Euclid's method is usually written with a remainder, `a = a % b`, and that is what the M68K page
does with its `divu`. The Z80 has no division, and the remainder of a division is what is left after
subtracting the divisor as many times as it goes, so subtracting once per pass is the same algorithm
with the inner loop unrolled into the outer one. That costs one pass per subtraction, and the whole
program is 31 instructions for these two numbers.

Try changing the two numbers to 250 and 3. The answer is 1, and the program takes 436 instructions
to find it, because 3 has to come off 250 eighty-three times before the pair is anywhere near equal.
