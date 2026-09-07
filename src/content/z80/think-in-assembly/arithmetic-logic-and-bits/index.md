The loops so far counted with `inc` and `add`. Let's now go through everything the Z80 can compute
with, which is a short list, and then through the two things it cannot do at all.

## Bytes, through the accumulator

`add`, `adc`, `sub`, `sbc`, `and`, `or`, `xor` and `cp` all write `a` and read `a`, and the operand
you write is the other one. It can be another 8 bit register, an immediate, `(hl)` or `(ix+dd)`.

`inc` and `dec` are the exceptions: they work on any 8 bit register, on `(hl)` and on `(ix+dd)`, and
they leave the carry flag alone.

```z80|playground
    .org 0x8000
    ld a, 7         ; x = 7
    add a, 5        ; x = x + 5
    sub 2           ; x = x - 2
    ld b, 3
    add a, b        ; x = x + y
    inc a           ; x++
    dec b           ; y--, and the carry is untouched
    neg             ; x = -x
    halt
```

`a` comes out at `F2`, which is -14 as a signed byte, and `b` at `02`. Every line but the last two
went through the accumulator, which is the shape of Z80 code: values are brought into `a`, worked on,
and put back somewhere.

## Pairs, through hl

Sixteen bit arithmetic is five instructions and no more:

| written      | what it does       | flags            |
| ------------ | ------------------ | ---------------- |
| `add hl, rr` | `hl = hl + rr`     | `C` and `H` only |
| `adc hl, rr` | `hl = hl + rr + C` | all of them      |
| `sbc hl, rr` | `hl = hl - rr - C` | all of them      |
| `inc rr`     | `rr++`             | none             |
| `dec rr`     | `rr--`             | none             |

`rr` is `bc`, `de`, `hl` or `sp`, and `ix` and `iy` have their own `add ix, rr` and `add iy, rr`.

**There is no `sub hl, rr`.** The only 16 bit subtraction is `sbc`, which subtracts the carry as
well, so it has to be preceded by something that clears the carry. `or a` is the usual one: it leaves
`a` alone and forces `C` to 0.

`adc` and `sbc` exist so that a number wider than the registers can be added a piece at a time: the
carry out of the low piece is carried into the high one, exactly the way you add two long numbers on
paper. The second half of this program is `add hl, de` written out that way, one byte at a time.

```z80|playground
    .org 0x8000
    ld hl, 1000
    ld de, 300
    or a            ; C = 0, because sbc would subtract it too
    sbc hl, de      ; hl = hl - de

    ld hl, 0x00FF
    ld de, 0x0001
    ld a, l
    add a, e        ; the low bytes: 0xFF + 0x01 = 0x00 with a carry
    ld l, a
    ld a, h
    adc a, d        ; the high bytes, plus that carry
    ld h, a
    halt
```

`hl` reaches `02BC`, which is 700, after the `sbc`, and comes out at `0100` at the end. Take the
`or a` out and the subtraction can come back one too small, depending on what the instruction before
it left in the carry, which is a bug that only shows up half the time.

Adding a byte at a time is the only way when the number is 24 or 32 bits wide: three or four pieces,
one `add` and then `adc` for the rest.

## No multiplication, no division

The Z80 has **no multiply instruction and no divide instruction**. The M68K has `mulu` and `divu`,
MIPS and RISC-V have `mul` and `div`, and here you write them out. Both are the algorithm you were
taught for long multiplication, in base 2 instead of base 10.

Multiplying is shift and add. Look at each bit of the multiplier from the bottom up: if it is 1, add
the multiplicand to the total, and double the multiplicand every time round.

```z80|playground
    .org 0x8000
    ld b, 6         ; x
    ld c, 7         ; y
    ld hl, 0        ; the product, which needs 16 bits
    ld d, 0
    ld e, c         ; de = y, widened to 16 bits
    ld a, b         ; a = x, whose bits we look at
    ld b, 8         ; eight of them
multiply:
    srl a           ; the lowest bit of x falls into C
    jr nc, skip     ; if it was 0, add nothing
    add hl, de      ; if it was 1, add y
skip:
    sla e           ; y = y * 2, sixteen bits of it
    rl d
    djnz multiply

    ld a, 25        ; and multiplying by a constant, which is cheaper
    ld l, a
    ld h, 0         ; hl = a
    add hl, hl      ; hl = a * 2
    ld d, h
    ld e, l         ; de = a * 2, kept
    add hl, hl      ; hl = a * 4
    add hl, hl      ; hl = a * 8
    add hl, de      ; hl = a * 8 + a * 2
    halt
```

`hl` reaches `002A`, which is 42, at the end of the loop. Eight times round whatever the numbers are,
and the answer is 16 bits wide because two bytes multiplied need two bytes.

The five instructions after it multiply by a **constant**, which is much cheaper, because you know
the bits in advance and `add hl, hl` doubles a pair in one instruction. Ten is eight plus two, so
`hl` comes out at `00FA`, which is 250, and the same trick works for any constant: write it as a sum
of powers of two.

Dividing is subtract and count, and for small numbers the simple version is short enough to write
inline:

```z80|playground
    .org 0x8000
    ld a, 45        ; the dividend
    ld c, 7         ; the divisor
    ld b, 0         ; the quotient
divide:
    cp c            ; while(a >= c)
    jr c, done
    sub c           ; a = a - c
    inc b           ; quotient++
    jr divide
done:
    halt
```

`b` comes out at `06` and `a` at `03`: 45 is 7 times 6 with 3 left over, so the quotient is in `b` and
the **remainder is what is left in `a`**. This loop goes round once per unit of the quotient, so it is
fine for dividing by 7 and slow for dividing by 2; dividing by a power of two is a shift.

## Logic, masks and single bits

`and`, `or` and `xor` are C's `&`, `|` and `^`, one bit position at a time with no carrying between
them, and `cpl` is `~`. All four work on `a`.

A **mask** is a number written for the pattern of its bits, and the three operators are the three
things you do with one: `and` **keeps** the bits the mask has set, `or` **sets** them, `xor` **flips**
them.

```z80|playground
    .org 0x8000
    ld a, 0x12
    and 0x0F        ; keep the low nibble: 0x02
    ld b, a
    ld a, 0x12
    and 0xF0        ; keep the high nibble
    srl a
    srl a
    srl a
    srl a           ; and slide it down four places: 0x01
    ld c, a

    xor a           ; a = 0
    set 3, a        ; a = 0b00001000
    ld d, a
    set 0, a        ; a = 0b00001001
    res 3, a        ; a = 0b00000001
    ld e, a
    bit 0, a        ; bit 0 is 1, so Z goes to 0
    halt
```

`b` comes out at `02` and `c` at `01`, the two halves of `0x12` pulled out one at a time. `xor a` in
the middle is the idiom for **`a = 0`**: it is one byte where `ld a, 0` is two, and it clears the
carry into the bargain.

The four instructions after it are the ones that work on a single bit:

- **`bit n, r`** tests bit `n` and sets `Z` from it, backwards: `Z` is 1 when the bit is **0**.
- **`set n, r`** forces the bit to 1.
- **`res n, r`** forces it to 0.

All three take `n` from 0 to 7, any 8 bit register, `(hl)` or `(ix+dd)`, and none of them touches the
carry. In C they are `x & (1 << n)`, `x |= (1 << n)` and `x &= ~(1 << n)`, and the Z80 does each in
one instruction with the bit number written into the opcode. `d` comes out at `08` and `e` at `01`.
Try changing `bit 0, a` to `bit 5, a` and watch `Z` go to 1, since bit 5 is clear.

## Shifts

| written | direction | what comes in at the far end                        |
| ------- | --------- | --------------------------------------------------- |
| `sla r` | left      | a 0, and the top bit goes into `C`                  |
| `srl r` | right     | a 0, and the bottom bit into `C`                    |
| `sra r` | right     | a copy of the top bit, so the sign survives         |
| `rl r`  | left      | the old `C`, and the top bit becomes the new `C`    |
| `rr r`  | right     | the old `C`, and the bottom bit becomes the new `C` |
| `rlc r` | left      | the bit that fell off the top                       |
| `rrc r` | right     | the bit that fell off the bottom                    |

Shifting left by one multiplies by 2, shifting right by one divides by 2, and `sra` is the signed
divide because it drags the sign bit along.

There is no shift on a pair, so shifting 16 bits is two instructions joined by the carry: `sla l`
puts the top bit of `l` into `C`, and `rl h` brings it in at the bottom of `h`.

```z80|playground
    .org 0x8000
    ld hl, 0x1234
    sla l
    rl h            ; hl = hl * 2
    ld de, 0x8000
    srl d
    rr e            ; de = de / 2, going the other way round
    halt
```

`hl` comes out at `2468` and `de` at `4000`. Going left the low half is shifted first, going right
the high half is, because the carry has to be produced before the instruction that consumes it.

`add hl, hl` doubles a pair in one instruction and is what you write when it is `hl` you are
doubling.

## Your turn

The test starts `a` at 25. Leave `a` times 10 in `hl`, which is 250, or `00FA`. No loop is needed,
`add hl, hl` and one saved copy will do it.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 25 },
    "expectedRegisters": { "hl": "0x00FA" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld l, a
    ld h, 0         ; hl = a
    add hl, hl      ; a * 2
    ld d, h
    ld e, l         ; de = a * 2, kept for later
    add hl, hl      ; a * 4
    add hl, hl      ; a * 8
    add hl, de      ; a * 8 + a * 2 = a * 10
    halt
```

</details>

The second one starts `a` at 45. Divide it by 7, leaving the quotient in `b` and the remainder in `a`,
which are 6 and 3. Subtract and count.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": 45 },
    "expectedRegisters": { "a": 3, "bc": "0x0600" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld b, 0         ; quotient = 0
divide:
    cp 7            ; while(a >= 7)
    jr c, done
    sub 7           ; a = a - 7
    inc b           ; quotient++
    jr divide
done:
    halt
```

</details>
