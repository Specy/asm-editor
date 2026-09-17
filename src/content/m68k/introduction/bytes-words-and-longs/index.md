# Bytes, words and longs

Each M68K data register holds 32 bits: four bytes, two words or one long. An instruction can work
with all 32 bits or with only the low part of the register. Its **size suffix** says which part.

| suffix | size | bits used in a data register |
| ------ | ---- | ---------------------------- |
| `.b`   | byte | the lowest 8 bits            |
| `.w`   | word | the lowest 16 bits           |
| `.l`   | long | all 32 bits                  |

Here, "lowest" means the part on the right when a register is displayed in hex. In
`$AABBCCDD`, the low byte is `$DD` and the low word is `$CCDD`.

## Reading an instruction line

The examples in this lesson use this shape:

```text
name.size source, destination
```

Each part has a job:

- `name` tells the processor which operation to perform. Here, `move` copies a value.
- `.size` is `.b`, `.w` or `.l` and gives the number of bits to copy.
- The **source** is the value to copy from. M68K writes the source first.
- The comma separates the two operands.
- The **destination** is the place to copy into.

A `#` before a number means that the number itself is the source. For example,
`move.l #$12345678, d0` copies the literal hex value `$12345678` into `d0`. Without `#`, `d0` is
a register operand: `move.l d0, d1` copies the value in `d0` into `d1`.

A semicolon begins a comment. The assembler ignores everything after it on that line:

```m68k|playground|no-flags
    move.l #$12345678, d0   ; copy this literal value into d0
    move.l d0, d1           ; copy d0 into d1
```

The first line has the literal as its source and `d0` as its destination. The second has `d0` as
its source and `d1` as its destination. Copying leaves the source unchanged.

## What each size changes

For a data-register destination, a byte write changes the low 8 bits and preserves the upper 24.
A word write changes the low 16 bits and preserves the upper 16. A long write replaces all 32
bits.

This example first gives each register the same explicit starting value. It then writes a different
size to each one:

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0   ; d0 starts at AABBCCDD
    move.l #$AABBCCDD, d1   ; d1 starts at AABBCCDD
    move.l #$AABBCCDD, d2   ; d2 starts at AABBCCDD

    move.b #$11, d0         ; replace the low byte
    move.w #$2233, d1       ; replace the low word
    move.l #$44556677, d2   ; replace the whole long
```

| register | starting value | value afterward | part preserved from the starting value |
| -------- | -------------- | --------------- | -------------------------------------- |
| `d0`     | `$AABBCCDD`    | `$AABBCC11`     | upper 24 bits: `AABBCC`                |
| `d1`     | `$AABBCCDD`    | `$AABB2233`     | upper 16 bits: `AABB`                  |
| `d2`     | `$AABBCCDD`    | `$44556677`     | none                                   |

The suffix controls both how much of the source is copied and how much of the destination is
changed. For example, `move.b d0, d1` copies only `d0`'s low byte into `d1`'s low byte. The other
three bytes of `d1` keep their previous bits.

## A signed value needs a width

A stored bit pattern has no signed or unsigned label. Its numeric value depends on the width and
interpretation chosen when it is used.

For an unsigned value, every bit contributes to a value starting at zero. For a signed value, the
M68K uses **two's complement**. At a chosen width, a 0 in the highest bit gives a non-negative
value, while a 1 gives a negative value.

The chosen width matters because it decides which bit is highest:

| displayed bits | width | unsigned reading | signed reading |
| -------------- | ----- | ---------------: | -------------: |
| `$F0`          | 8     |              240 |            -16 |
| `$00F0`        | 16    |              240 |            240 |
| `$000000F0`    | 32    |              240 |            240 |
| `$FFF0`        | 16    |            65520 |            -16 |
| `$FFFFFFF0`    | 32    |       4294967280 |            -16 |

So `$F0` is -16 when interpreted as an 8-bit signed byte. The full register value `$000000F0` is
+240 when interpreted as a 32-bit signed long. To preserve the signed value -16 while widening it,
the added high bits must be ones, producing `$FFFFFFF0`.

This widening process is called **sign extension**. It copies the highest bit of the smaller value
into the new bits above it. A positive value receives zeroes; a negative value receives ones.

## Sign extension with `ext`

`ext` works on one data register, so its instruction line has a destination but no separate source:

```text
ext.size Dn
```

`Dn` means any data register from `d0` through `d7`. The two forms used here have precise jobs:

- `ext.w Dn` sign-extends the low byte into the low word. It preserves the register's upper word.
- `ext.l Dn` sign-extends the low word across the full long.

Watch both the value and the width being interpreted in this sequence:

```m68k|playground|no-flags
    move.l #$A5A500F0, d0   ; explicit starting value
    ext.w d0                ; sign-extend low byte F0 into the low word
    ext.l d0                ; sign-extend low word FFF0 into the full long
```

| moment           | value in `d0` | signed interpretation being followed             |
| ---------------- | ------------- | ------------------------------------------------ |
| start            | `$A5A500F0`   | low byte `$F0` is -16                            |
| `ext.w` finished | `$A5A5FFF0`   | low word `$FFF0` is -16; upper word is preserved |
| `ext.l` finished | `$FFFFFFF0`   | full long `$FFFFFFF0` is -16                     |

Two steps are required because the two forms widen by one size at a time. `ext.w` first makes the
low **word** a correct 16-bit version of the signed byte. Then `ext.l` uses that word's highest bit
to make a correct 32-bit **long**.

For a positive byte such as `$70`, the same two instructions fill the new bits with zeroes:
`$70` becomes `$0070`, then `$00000070`.

## Check your understanding

### 1. Copy three different sizes

The testcase starts `d0` at `$12345678`. Registers `d1`, `d2` and `d3` each start at
`$AABBCCDD` so that preserved upper bits remain visible.

Write three `move` instructions:

1. Copy the low byte of `d0` into `d1`.
2. Copy the low word of `d0` into `d2`.
3. Copy the full long in `d0` into `d3`.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": "0x12345678",
        "d1": "0xAABBCCDD",
        "d2": "0xAABBCCDD",
        "d3": "0xAABBCCDD"
    },
    "expectedRegisters": {
        "d1": "0xAABBCC78",
        "d2": "0xAABB5678",
        "d3": "0x12345678"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.b d0, d1
    move.w d0, d2
    move.l d0, d3
```

</details>

### 2. Widen signed bytes

`d0` starts at `$CAFE00F0`, whose low byte is -16. `d1` starts at `$BEEF8070`, whose low byte is
+112. Sign-extend each low byte all the way to a 32-bit long. Each register needs the same two
instructions.

```m68k|playground|exercise
; your code here
```

```testcase
{
    "startingRegisters": {
        "d0": "0xCAFE00F0",
        "d1": "0xBEEF8070"
    },
    "expectedRegisters": {
        "d0": "0xFFFFFFF0",
        "d1": "0x00000070"
    }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    ext.w d0
    ext.l d0
    ext.w d1
    ext.l d1
```

</details>
