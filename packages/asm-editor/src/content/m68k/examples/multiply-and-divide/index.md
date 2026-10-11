This program turns 365 days into hours, then splits 1000 seconds into whole minutes and seconds
left over. `d0` holds the hours. Division puts both answers in `d2` at first; the last instructions
leave the minutes in `d2` and the remaining seconds in `d3`.

```m68k|playground|no-flags|allow-open
    move.w #365, d0     ; days = 365
    move.w #24, d1
    mulu d1, d0         ; hours = days * 24

    move.l #1000, d2    ; seconds = 1000
    divu #60, d2        ; quotient and remainder packed into d2
    move.l d2, d3       ; keep a copy for the remainder
    andi.l #$FFFF, d2   ; keep the quotient, whole minutes
    swap d3             ; move the remainder to the low word
    andi.l #$FFFF, d3   ; keep the remainder, seconds left over
```

`mulu` and `divu` are **unsigned**: they treat their inputs as zero or positive values. `mulu`
multiplies the low word of `d0` by the word in `d1`, then writes the full 32-bit product to `d0`.
Here that is 365 × 24 = 8760. The source and the part of the destination it reads are each one
word (16 bits), even though the product takes a long (32 bits).

`divu` reads the whole long in `d2` and divides it by the word-sized divisor 60. Since
1000 = 60 × 16 + 40, the **quotient** is 16 whole minutes and the **remainder** is 40 seconds.
`divu` stores both in one register: the remainder in the high word and the quotient in the low
word. A word is four hexadecimal digits, so read `d2` from left to right like this:

| high word: remainder | low word: quotient  | full `d2` display |
| -------------------- | ------------------- | ----------------- |
| `0028` (40 seconds)  | `0010` (16 minutes) | `00280010`        |

The register panel displays hexadecimal without `0x`. Decimal 40 is `$28`, and decimal 16 is
`$10`. The zeroes fill each word to four digits.

## Run it, then follow the two answers

Select **Build**, then **Run**. At the end, the registers panel shows `d0=00002238` (8760 hours),
`d2=00000010` (16 minutes), and `d3=00000028` (40 seconds).

Select **Build** again to reset the program, then select **Step** once per instruction. After
`mulu`, check `d0=00002238`. Step through `move.l #1000, d2` and `divu #60, d2`; just after the
division, `d2=00280010`. Its left four digits are the high word, and its right four digits are
the low word.

The copy into `d3` keeps both words while the program extracts each answer. Watch the registers
after each of the remaining instructions:

| instruction just stepped | `d2`       | `d3`       | what changed                          |
| ------------------------ | ---------- | ---------- | ------------------------------------- |
| `move.l d2, d3`          | `00280010` | `00280010` | both registers hold the packed result |
| `andi.l #$FFFF, d2`      | `00000010` | `00280010` | the mask keeps the low word in `d2`   |
| `swap d3`                | `00000010` | `00100028` | the two words in `d3` trade places    |
| `andi.l #$FFFF, d3`      | `00000010` | `00000028` | the mask keeps the low word in `d3`   |

The mask `$FFFF` is a long value with zeroes in its high word and ones in its low word:
`0000 FFFF`. An `and` keeps bits where the mask has ones and clears bits where it has zeroes.
The first mask therefore removes the remainder from `d2`. After `swap` moves the remainder to
the low word of `d3`, the second mask removes the quotient there.

These chosen inputs also meet two requirements for `divu`: the divisor is nonzero, and the
quotient fits in one unsigned word (0 through 65535).

## Try a value with a high word

Change `move.w #365, d0` to `move.l #65901, d0`. Before selecting **Build** and **Run** again,
predict `d0` after `mulu`: will it contain 65901 × 24, or something else? Remember which part
of `d0` the instruction reads.

<details>
<summary>Show answer</summary>

`d0` is still `00002238` (8760). Decimal 65901 is 65536 + 365, so its low word still holds 365.
`mulu` reads that low word, ignores the high word, and replaces the whole register with
365 × 24.

</details>
