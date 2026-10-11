# 8-bit and 16-bit arithmetic, logic and bits

Most Z80 calculations are small changes to bytes: add, subtract, keep a few bits, or test one bit. The carry flag has two useful jobs here. A branch can use it after a comparison, and arithmetic can use it to pass an extra bit from one byte to the next.

## Byte arithmetic in `a`

The accumulator, `a`, is the destination for the usual byte arithmetic. The operand can be a byte register, a number written in the instruction, or the byte at `(hl)`.

| Instruction    | Result              |
| -------------- | ------------------- |
| `add a, value` | `a = a + value`     |
| `adc a, value` | `a = a + value + C` |
| `sub value`    | `a = a - value`     |
| `sbc a, value` | `a = a - value - C` |
| `neg`          | `a = 0 - a`         |

`C` means the current carry flag. `adc` and `sbc` use it; the other three arithmetic instructions do not. An answer that does not fit in a byte wraps around, while the flags record facts about it. `neg` changes the sign of the byte pattern in `a`; for example, 7 becomes `F9`, which is -7 when read as a signed byte.

`cp value` has the same operand choices, but it is a comparison rather than an arithmetic result. It reads `a` and `value`, works out `a - value` for the flags, and **preserves `a`**. After `cp value`, `C` is 1 when unsigned `a` is smaller than `value`.

```z80|playground
    .org 0x8000
    ld a, 7
    ld b, 3
    add a, 5        ; a = 12
    sub 2           ; a = 10
    add a, b        ; a = 13
    neg             ; a = -13, or F3 in hexadecimal
    cp b            ; compare with 3; a stays F3
    halt
```

`inc` and `dec` are handy for adding or subtracting one. They can name a byte register or `(hl)`. They update most arithmetic flags but leave `C` unchanged, which matters when a carry still has a job to do.

## Logic: work on matching bits

`and`, `or`, and `xor` also use `a` as their result. Their operand can be a byte register, a number written in the instruction, or the byte at `(hl)`, just as with byte arithmetic. They compare each bit of `a` with the matching bit of their operand; a bit never carries into its neighbour.

| First bit | Second bit | AND | OR  | XOR |
| --------- | ---------- | --- | --- | --- |
| 0         | 0          | 0   | 0   | 0   |
| 0         | 1          | 0   | 1   | 1   |
| 1         | 0          | 0   | 1   | 1   |
| 1         | 1          | 1   | 1   | 0   |

A **mask** is a byte chosen for its pattern of bits. `and` with a mask keeps the positions where the mask has 1s. `or` forces those positions to 1. `xor` flips those positions. `cpl` flips every one of the eight bits in `a`.

```z80|playground
    .org 0x8000
    ld a, 0b10100110
    and 0b00001111  ; keep the low four bits: a = 00000110
    ld b, a
    ld a, 0b10100110
    or 0b00001000   ; force bit 3 to 1: a = 10101110
    ld c, a
    xor 0b00000010  ; flip bit 1: a = 10101100
    cpl             ; flip all eight bits: a = 01010011
    halt
```

The `0b` prefix writes a number in binary. `b` ends as `06`, `c` as `AE`, and `a` as `53` in the register panel.

`or a` leaves every bit of `a` as it was, sets `Z` according to whether `a` is zero, and clears `C` to 0. That last effect is useful before an `sbc` instruction.

## Test, set, or clear one bit

The Z80 has three single-bit instructions:

| Instruction     | Meaning                                    |
| --------------- | ------------------------------------------ |
| `bit n, target` | Test bit `n`; `Z` is 1 when that bit is 0. |
| `set n, target` | Make bit `n` 1.                            |
| `res n, target` | Make bit `n` 0.                            |

`n` is a number from 0 through 7 written in the instruction. `target` can be a byte register or `(hl)`. The bit instructions leave `C` unchanged.

```z80|playground
    .org 0x8000
    ld a, 0b00001001
    bit 3, a        ; bit 3 is 1, so Z becomes 0
    res 3, a        ; a = 00000001
    set 5, a        ; a = 00100001
    halt
```

## Shifts and the carry flag

A shift moves every bit one place. Here, `r` means a byte register such as `a` or `d`, or the byte at `(hl)`.

| Instruction | What it does                                                                |
| ----------- | --------------------------------------------------------------------------- |
| `sla r`     | Shift left, put 0 into bit 0, and move the old bit 7 into `C`.              |
| `srl r`     | Shift right, put 0 into bit 7, and move the old bit 0 into `C`.             |
| `sra r`     | Shift right, keep the old bit 7, and move the old bit 0 into `C`.           |
| `rl r`      | Shift left, bring the old `C` into bit 0, and move the old bit 7 into `C`.  |
| `rr r`      | Shift right, bring the old `C` into bit 7, and move the old bit 0 into `C`. |

For an unsigned byte, `sla` doubles it when the answer fits, and `srl` gives its integer quotient after division by 2. The discarded low bit goes into `C`, so it also tells you whether the number was odd. `sra` keeps a signed value's sign bit, but for a negative odd number it rounds toward negative infinity; do not treat it as ordinary signed division that rounds toward zero.

`rl` and `rr` show the carry flag's second job: it can link two byte operations into one wider shift. Shift the low byte first when moving left, so its outgoing bit reaches the high byte. Shift the high byte first when moving right.

```z80|playground
    .org 0x8000
    ld a, 0b10000011
    srl a           ; a = 01000001, C = 1
    ld hl, 0x1234
    sla l           ; low byte first; its old bit 7 goes into C
    rl h             ; bring that carry into the high byte
    halt
```

After the pair shift, `hl` is `2468`: an unsigned 16-bit doubling. When `hl` itself is the pair to double, `add hl, hl` is a shorter way to do the same job.

## Pair arithmetic and wider additions

Pairs hold 16-bit values. For example, `add hl, bc`, `add hl, de`, and `add hl, hl` add a pair to `hl`. `inc` and `dec` also work on pairs. For a 16-bit subtraction, use `sbc hl, bc` or `sbc hl, de`. It subtracts the carry flag as well as the pair, so clear that flag deliberately first:

```z80|playground
    .org 0x8000
    ld hl, 1000
    ld de, 300
    or a            ; a is unchanged; C is now 0
    sbc hl, de      ; hl = 1000 - 300 = 700, or 02BC
    halt
```

`adc hl, bc` and `adc hl, de` add the carry flag to a pair. `C` can be tested by `jr c` after a comparison, or used as an input by `adc` and `sbc` to join pieces of a larger number. To add two values that are wider than one pair, add the low bytes first, then use `adc` for each higher byte:

```z80|playground
    .org 0x8000
    ld hl, 0x00FF
    ld de, 0x0001
    ld a, l
    add a, e        ; low bytes: FF + 01 = 00, with C = 1
    ld l, a
    ld a, h
    adc a, d        ; high bytes plus that carry: 00 + 00 + 1
    ld h, a
    halt
```

This leaves `hl` at `0100`. The `adc` must immediately follow work that produced the carry; another arithmetic or logic instruction could replace it.

## Practice: bits and pair subtraction

The runner starts `a` at `A6` (`10100110` in binary). Keep only its low four bits, then make bit 3 1. Leave the result, `0E`, in `a`.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": "0xA6" },
    "expectedRegisters": { "a": "0x0E" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    and 0x0F
    set 3, a
    halt
```

</details>

For the second exercise, the runner starts `hl` at 1000 and `de` at 300. The two starter lines put 0 in `a` and then use `cp 1` to make `C` equal 1 without changing `a`. Leave `hl` at 700. Clear the carry before the subtraction while preserving the 0 already in `a`.

```z80|playground|exercise
    .org 0x8000
    ld a, 0
    cp 1            ; C = 1; a is still 0
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": 1000, "de": 300 },
    "expectedRegisters": { "a": 0, "hl": "0x02BC" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld a, 0
    cp 1            ; C = 1; a is still 0
    or a
    sbc hl, de
    halt
```

</details>
