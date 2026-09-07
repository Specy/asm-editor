On a 32 bit machine a register holds any number a beginner is likely to write. On the Z80 a register
holds a byte, 256 different patterns, and running out of room is something that happens on the third
line of a program rather than in a lecture about edge cases. Let's go through what fits where.

## What a byte holds

Eight bits is 256 patterns, and there are two ways to read them:

- **unsigned**, 0 to 255,
- **signed**, -128 to 127, in two's complement, where the top bit is the sign and negating a number
  means flipping every bit and adding 1.

Nothing in the register says which. The same `FB` is 251 and -5 at the same time, and what decides is
the instruction that reads it and the flag you branch on afterwards.

```z80|playground
    .org 0x8000
    ld a, 5
    neg             ; a = -a
    ld b, a
    ld a, 0
    sub 5           ; and 0 - 5 gets there the other way
    halt
```

`a` and `b` both come out at `FB`. Hover the value in the registers panel and it shows you both
readings, 251 and -5, of the one byte. `neg` is the Z80's negate, and it works on `a` and on nothing
else.

## When a byte is not enough

Add 1 to the largest number that fits and it comes back round to the smallest, and which flag says so
depends on which reading you meant.

```z80|playground
    .org 0x8000
    ld a, 255
    add a, 1        ; the unsigned wrap
    ld b, a
    ld a, 127
    add a, 1        ; the signed wrap
    halt
```

| after this line  | `a` | `S` | `Z` | `H` | `P/V` | `N` | `C` |
| ---------------- | --- | --: | --: | --: | ----: | --: | --: |
| `add a, 1` (255) | 00  |   0 |   1 |   1 |     0 |   0 |   1 |
| `add a, 1` (127) | 80  |   1 |   0 |   1 |     1 |   0 |   0 |

255 plus 1 is 256, which does not fit, so `a` is 0 and the carry flag `C` is 1: that is the **unsigned**
answer to "did it fit". 127 plus 1 is 128, which fits perfectly as an unsigned byte, so `C` stays 0,
but read as signed the answer wrapped from +127 round to -128 and `P/V` is 1 instead: that is the
**signed** answer to the same question. The same addition sets both every time, and picking the one
that matches what your numbers mean is on you.

Try changing the second pair to `ld a, 200` and `add a, 100`. `a` comes out at `2C`, which is 44, and
`C` goes to 1, because 300 needs nine bits.

## Sixteen bits, when eight will not do

The way out is a pair, which holds 0 to 65535 unsigned or -32768 to 32767 signed. There is one 16 bit
addition, `add hl, rr`, and it carries out of bit 15 into `C` the same way.

```z80|playground
    .org 0x8000
    ld hl, 300      ; a number that needs nine bits
    ld de, 1000
    add hl, de      ; hl = 1300
    ld bc, 0xFFFF
    ld hl, 1
    add hl, bc      ; 1 + 65535 wraps round to 0
    halt
```

`hl` is `0514` after the first addition, which is 1300, and `0000` after the second, with `C` at 1.
`add hl, rr` writes `C` and `H` and leaves `S`, `Z` and `P/V` exactly as they were, which is a trap:
after `add hl, de` there is no zero flag to branch on, the one in the panel belongs to whatever ran
before it.

## Widening a byte into a pair

You have a byte in `a` and you want it in `hl` so you can add it to an address. If the byte is
unsigned that is two instructions, `ld l, a` and `ld h, 0`, and you are done.

If it is signed it is not, because -5 in one byte is `FB` and -5 in two bytes is `FFFB`: the three
`F`s have to be put there. Filling the high byte with copies of the sign bit is called **sign
extension**, and the M68K has `ext` for it and RISC-V does it inside every `lb`. The Z80 has no
instruction for it at all, so you write it out.

The two ways of doing it are in here. Build it and press **Step** through both halves.

```z80|playground
    .org 0x8000
    ld a, 0xFB      ; -5 in one byte
    ld l, a         ; the low half is the byte itself
    ld h, 0         ; assume it is positive
    bit 7, a        ; was the sign bit set?
    jr z, tested    ; if not, h is already right
    ld h, 0xFF      ; if so, fill the high half with ones
tested:

    ld a, 0xFB      ; and the same thing without a branch
    ld e, a
    rla             ; rotate the sign bit out of a and into C
    sbc a, a        ; a = a - a - C, which is 0x00 or 0xFF
    ld d, a
    halt
```

`hl` comes out at `FFFB` and so does `de`, which is -5 in sixteen bits, twice. The first half tests
the sign bit and picks one of two values for `h`. Try changing its `ld a, 0xFB` to `ld a, 0x7B` and
running again: the branch is taken, `h` stays 0, and `hl` is `007B`, which is 123.

The second half is what Z80 programmers write instead, and you will meet it in other people's code.
`rla` shifts `a` left through the carry, so bit 7 lands in `C`. `sbc a, a` subtracts `a` from itself
and then subtracts the carry, so the answer is 0 minus `C`, which is `00` when the sign bit was 0 and
`FF` when it was 1. Four instructions and no branch.

## Two decimal digits in a byte

There is a third way to read a byte, and the Z80 has an instruction for it that most machines do not.
**Binary coded decimal** puts one decimal digit in each half of the byte, so `0x27` means the number
27 and not 39. It was how a machine with no division kept a score or a clock, since printing a BCD
byte is two nibbles and two `add a, '0'`.

Adding two BCD bytes with a plain `add` gives the wrong answer, because the CPU carries at 16 and not
at 10. `daa`, decimal adjust accumulator, fixes `a` up afterwards.

```z80|playground
    .org 0x8000
    ld a, 0x27      ; twenty-seven, in BCD
    add a, 0x15     ; plus fifteen, which a plain add gets wrong
    ld b, a
    ld a, 0x27
    add a, 0x15
    daa             ; and daa puts it right
    halt
```

`b` comes out at `3C` and `a` at `42`. `0x27` plus `0x15` really is `0x3C` in binary, and 27 plus 15
really is 42, and `daa` is what turns the first into the second by adding six to a nibble that went
past nine. It works out what to add from two flags, `H` and `N`, which is what those two flags are in
the register for, and the flags lecture comes back to them.

## Writing numbers down

Every literal in this course is one of these, and they all mean the same 31:

| written      | base                            |
| ------------ | ------------------------------- |
| `31`         | decimal                         |
| `0x1F`       | hexadecimal, the C spelling     |
| `$1F`        | hexadecimal, the M68K spelling  |
| `1Fh`        | hexadecimal, the Zilog spelling |
| `0b00011111` | binary                          |
| `0o37`       | octal                           |

`'A'` is the character code 65, and `"A"` is the same byte. A leading zero means nothing here, `037`
is decimal 37, not octal.

Hexadecimal is what you will read most, because one hex digit is exactly four bits, so `0xFB` splits
into `1111` and `1011` in your head and `0x27` is the BCD 27 by eye. Binary is for masks, where the
bit positions are the point: `0b00010000` says "bit 4" far more clearly than 16 does.

## Your turn

The test starts `a` at `0xFB`, which is -5 as a signed byte. Leave the same number in `hl` as a
signed 16 bit value, which is `FFFB`. Either of the two ways above will do.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": "0xFB" },
    "expectedRegisters": { "hl": "0xFFFB" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld l, a         ; the byte itself is the low half
    ld h, 0         ; assume positive
    bit 7, a        ; was the sign bit set?
    jr z, done
    ld h, 0xFF      ; fill the high half with ones
done:
    halt
```

</details>

The second one starts `bc` at 400 and `de` at 900, both too big for a byte. Leave their sum in `hl`,
which is 1300, or `0514` in hexadecimal. `hl` is the only place a 16 bit addition can land.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "bc": 400, "de": 900 },
    "expectedRegisters": { "hl": "0x0514" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld h, b         ; hl = bc
    ld l, c
    add hl, de      ; hl = hl + de
    halt
```

</details>
