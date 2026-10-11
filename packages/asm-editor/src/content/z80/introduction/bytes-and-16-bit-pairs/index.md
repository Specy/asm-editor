# Bytes and 16-bit pairs

A byte register such as `a` holds eight bits: 256 possible patterns. Read as an **unsigned** number, those patterns run from 0 to 255. A value such as 300 cannot fit in one byte register, but it can fit in a two-byte pair such as `hl`. The size of the place you choose matters even when the arithmetic is simple.

## One byte, two readings

The same byte can also represent a **signed** number, from -128 to 127. The Z80 uses _two's complement_ for this reading. In this reading, a byte whose leftmost bit is 0 is nonnegative, and one whose leftmost bit is 1 is negative. Here are a few bytes in both readings:

| Byte in hex | Unsigned | Signed |
| ----------- | -------: | -----: |
| `00`        |        0 |      0 |
| `7F`        |      127 |    127 |
| `80`        |      128 |   -128 |
| `FB`        |      251 |     -5 |
| `FF`        |      255 |     -1 |

The register stores only the bits; it has no signed or unsigned label. You choose the reading that fits the value's job. For example, `FB` can be a count of 251, or a change of -5. An addition always combines the stored bits. `FB` plus `01` gives `FC`, which reads as 251 + 1 = 252 unsigned or -5 + 1 = -4 signed.

```z80|playground|no-flags
    .org 0x8000
    ld a, 0xFB
    add a, 1        ; a becomes FC
    halt
```

Build and Step once for each instruction. The registers panel shows the hex byte; hover over its value to compare the two number readings.

## What happens at the edge

An unsigned answer above 255 needs a ninth bit, so a byte register keeps only its low eight bits. Starting with unsigned 255, adding 1 produces 256, but `a` holds `00`. A signed byte has a different boundary: starting with 127, adding 1 produces the eight-bit pattern `80`, which reads as -128. The bit pattern is predictable in both cases. The reading you chose tells you whether the intended number still fits.

```z80|playground|no-flags
    .org 0x8000
    ld a, 255
    add a, 1        ; a becomes 00
    ld b, a         ; keep that result in b
    ld a, 127
    add a, 1        ; a becomes 80
    halt
```

Step through the program. At the end, `b` is `00` and `a` is `80`. The first result has wrapped around the unsigned range. The second byte is the pattern used for the lowest signed value.

## Give a larger number two bytes

The pairs `bc`, `de` and `hl` each hold 16 bits, or 65,536 patterns. Their unsigned range is 0 to 65,535; read as signed numbers, they range from -32,768 to 32,767. The first register is the high byte, and the second is the low byte: `hl = 0x0514` means `h = 0x05` and `l = 0x14`. As you saw with addresses, a pair can hold a two-byte number as well as an address.

To add two pairs, put one number in `hl`. `add hl, de` adds the pair `de` and leaves the result in `hl`. `add hl, bc` similarly adds the pair `bc`. This is a 16-bit addition, so 300 + 1000 fits and becomes 1300, or `0x0514`.

```z80|playground|no-flags
    .org 0x8000
    ld hl, 300
    ld de, 1000
    add hl, de      ; hl becomes 1300, shown as 0514
    halt
```

Step over the addition and inspect `h`, `l` and `hl`. A pair also has a limit: adding 1 to `0xFFFF` leaves `0x0000`, because the result needs a seventeenth bit. This is the same wraparound idea at a larger size.

## Put an unsigned byte in a pair

Suppose `a` contains an unsigned byte and you want to keep that same number in `hl`. Copy it into the low byte `l` and set the high byte `h` to zero:

```z80|playground|no-flags
    .org 0x8000
    ld a, 0xFB      ; 251 when read as unsigned
    ld l, a
    ld h, 0         ; hl is 00FB, still 251
    halt
```

It matters that `h` is set explicitly: whatever it held before would otherwise remain part of `hl`. The unsigned byte `0xFB` widens to `0x00FB`, while signed -5 widens to `0xFFFB`. To preserve a signed byte in a pair, use high byte `0x00` when source bit 7 is 0 and `0xFF` when it is 1. This is called **sign extension**. These two 16-bit patterns have different values even though both end in `FB`.

## Try it yourself

The first exercise starts with an **unsigned** byte in `a`. Copy that number into `hl`, leaving `a` unchanged. Remember that `h` and `l` are the high and low bytes of the same pair.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "a": "0xE3", "hl": "0xFFFF" },
    "expectedRegisters": { "a": "0xE3", "hl": "0x00E3" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld l, a
    ld h, 0
    halt
```

</details>

For the second exercise, `bc` starts at 400 and `de` at 900. Leave their sum, 1300 (`0x0514`), in `hl`. Copy `b` to `h` and `c` to `l` to give `hl` the starting value, then add `de`.

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
    ld h, b
    ld l, c
    add hl, de
    halt
```

</details>
