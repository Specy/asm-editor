What is the greatest common divisor of 84 and 36? Keep subtracting the smaller number from the
larger one. When the two numbers become equal, that number is their greatest common divisor. This
program puts the starting numbers in `a` and `b`, calls `gcd`, and gets the answer back in `a`.
Use **positive, nonzero** byte values (1 through 255) for both inputs: subtracting zero would
leave the other number unchanged, so the loop would never finish.

Open the program in the editor and choose **Build**. Use **Step** to follow the call and the
subtractions, or **Run** to see the result. The register and memory panels show hexadecimal values;
the numbers `84` and `36` in the program are decimal.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld a, 84        ; first argument
    ld b, 36        ; second argument
    call gcd        ; result comes back in a
    ld c, a         ; keep a copy of the result
    jp done         ; skip over the subroutine

; gcd: positive inputs in a and b; result in a; changes b and c
gcd:
    cp b            ; compare a with b without changing a
    ret z           ; equal: a is the answer
    jr nc, bigger   ; a > b: go straight to the subtraction
    ld c, a         ; a < b: swap the two numbers
    ld a, b
    ld b, c
bigger:
    sub b           ; subtract the smaller number from the larger
    jr gcd          ; compare again

done:
    halt
```

The comment above `gcd` is its **calling convention**: the caller supplies two values in `a` and
`b`, and reads the result from `a`. The routine also changes `b` and uses `c` while swapping, so
the caller cannot expect their old values to survive. The `ld c, a` after the call deliberately
uses `c` only _after_ `gcd` has finished.

`cp b` compares `a` with `b` by setting flags as if it had calculated `a - b`; it leaves `a`
alone. If they are equal, `Z` is set and `ret z` returns. Otherwise, `jr nc, bigger` jumps when
`a` is greater than `b`: the C flag is clear because the subtraction needs no borrow. If `a` is
smaller, C is set, so execution falls through to the three instructions that swap `a` and `b`.
Either way, `sub b` then reduces the larger number.

You can follow the changing pair in the registers panel. The table uses decimal numbers; the panel
shows the same bytes in hexadecimal.

| Before `cp b` | What happens next                 |
| ------------- | --------------------------------- |
| `84, 36`      | subtract 36 → `48, 36`            |
| `48, 36`      | subtract 36 → `12, 36`            |
| `12, 36`      | swap, then subtract 12 → `24, 12` |
| `24, 12`      | subtract 12 → `12, 12`            |
| `12, 12`      | `ret z` returns 12 in `a`         |

To see where `ret z` goes, open the memory panel at `fff8` and use **Step** on the `call`. In this
playground, `sp` starts at `FFFF`. The call changes it to `FFFD` and writes `07 80` at addresses
`FFFD` and `FFFE`. Those bytes are the return address `0x8007`, with its low byte first: the
address of `ld c, a` immediately after the call. When `ret z` is taken, it reads that address into
`pc` and restores `sp` to `FFFF`. Execution resumes at `ld c, a`; after **Run**, both `a` and
`c` show `0C`, the hexadecimal value of 12.

The `jp done` keeps normal execution from entering `gcd` after the caller has copied the answer.
Entering it that way would reach a `ret` without a matching `call`, so `ret` would take unrelated
bytes from the stack as its next address.

Try changing the inputs to `21` and `14`. Before you run it, trace the pairs until they match.
What value will `a` hold when `ret z` runs? Check it in the registers panel: `a = 07`, or 7 in
decimal. This subtraction method can take many passes when the numbers are far apart, because each
pass removes the smaller number only once.
