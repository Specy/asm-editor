This program prints the same number in three bases: `BEEF` in base 16, `48879` in base 10, and
`1011111011101111` in base 2. The subroutine makes the characters itself. It uses `trap #15` only
to print the finished string.

```m68k|playground|console|no-flags|allow-open
    move.l #48879, d0       ; number to convert
    move.l #16, d1          ; base 16
    bsr print_in_base
    move.l #48879, d0
    move.l #10, d1          ; base 10
    bsr print_in_base
    move.l #48879, d0
    move.l #2, d1           ; base 2
    bsr print_in_base
    move.b #9, d0           ; end the program
    trap #15

; print_in_base: d0 = number (0..131071), d1 = base (2..36)
print_in_base:
    lea buffer_end, a1      ; start just beyond the buffer
    clr.b -(a1)             ; put the zero terminator at the end
digit:
    move.l d0, d2
    divu d1, d2             ; high word = remainder, low word = quotient
    move.l d2, d3
    swap d3
    andi.l #$FFFF, d3       ; d3 = remainder: the next digit
    andi.l #$FFFF, d2       ; d2 = quotient: the number still to convert
    cmp.b #9, d3
    bhi letter
    add.b #'0', d3          ; 0..9 become '0'..'9'
    bra store
letter:
    add.b #'A'-10, d3       ; 10..35 become 'A'..'Z'
store:
    move.b d3, -(a1)        ; put this digit before the earlier ones
    move.l d2, d0           ; use the quotient on the next pass
    bne digit
    move.b #13, d0          ; print the string at a1 and a new line
    trap #15
    rts

    org $2000
buffer:     ds.b 18         ; at most 17 binary digits plus the terminator
buffer_end:
```

Select **Build**, then **Run**. The console shows exactly these three lines:

```text
BEEF
48879
1011111011101111
```

## Where the digits come from

Dividing by the base gives a **quotient** and a **remainder**. The remainder is the rightmost digit.
For the first pass, `48879 = 16 × 3054 + 15`, so the quotient is 3054 and the remainder 15 becomes
`F`. The next pass divides 3054 by 16 to find the digit before it. Repeating until the quotient is
zero produces `F`, `E`, `E`, then `B`.

`divu` reads the whole 32-bit value in `d2`, but its divisor is the low 16 bits of `d1`. It packs
the two answers back into `d2` as two 16-bit words. Immediately after the first division, the
register reads:

| high word: remainder | low word: quotient | full `d2` |
| -------------------- | ------------------ | --------- |
| `000F` (15)          | `0BEE` (3054)      | `000F0BEE` |

`move.l d2, d3` copies that result. `swap d3` brings the remainder into its low word, and
`andi.l #$FFFF, d3` clears the high word, leaving `15`. The same mask on `d2` clears its remainder
and leaves the quotient, `3054`. The next pass divides that quotient.

To turn a remainder into a character, the code adds `'0'` for values 0 through 9. For values 10
through 35, it adds `'A'-10`: a remainder of 10 becomes `A`, and 35 becomes `Z`. `cmp.b #9, d3`
and `bhi` choose the letter path when the remainder is above 9.

The digits arrive rightmost first. `clr.b -(a1)` first places a zero byte at the end of the
buffer; task 13 needs that byte to know where the string stops. Each `move.b d3, -(a1)` then moves
`a1` back one byte and stores the new character in front of the ones already written. By the time
task 13 runs, `a1` points to the first character. The loop runs at least once, so an input of zero
still puts a `0` in the buffer. After each pass, `move.l d2, d0` sets the zero flag from the
quotient; `bne digit` repeats only while more digits remain.

This version accepts an unsigned number from **0 through 131071** in `d0` and a base from **2
through 36** in `d1`. The range works for every allowed base: the largest first quotient occurs
in base 2, and `131071 / 2` gives 65535, the largest quotient that fits in the low word of a
`divu` result. A larger number may overflow that quotient in base 2. Within this range, the
longest result is 17 binary digits, so the 18-byte buffer also has room for its zero terminator.

## Try another number

Change all three `#48879` values to `#255`. Predict the lines, then select **Build** and **Run**
again to check.

<details>
<summary>Show answer</summary>

The lines are `FF`, `255`, and `11111111`. In base 16, 255 leaves a remainder of 15 (`F`) twice;
in base 2, it has eight set bits.

</details>
