RISC-V gives three names to the sizes used most often in this course: **byte**, **halfword** and
**word**. By the end of this lecture, you should be able to tell how many bits each one contains,
read its signed and unsigned ranges, and decide whether a smaller value needs sign extension or
zero extension when it enters a 32-bit register.

## Byte, halfword and word

The names describe fixed numbers of bits:

| RISC-V name | common short name | bytes | bits | hexadecimal digits |
| ----------- | ----------------- | ----: | ---: | -----------------: |
| byte        | byte              |     1 |    8 |                  2 |
| halfword    | half              |     2 |   16 |                  4 |
| word        | word              |     4 |   32 |                  8 |

One hexadecimal digit represents four bits, so two hex digits fit one byte. A halfword needs four
hex digits, and a word needs eight. For example, `0xA7` fits in a byte, `0x12A7` fits in a
halfword, and `0x123412A7` fills a word.

A halfword in memory occupies two consecutive byte addresses, and a word occupies four. The
little-endian rule from the previous lecture decides the order of those bytes; it does not change
the total size.

In this 32-bit RISC-V course, every integer register is one word wide. A register therefore always
has room for 32 bits, even when the useful value began as only one byte or one halfword.

The word _word_ does not name the same size on every kind of processor. For the RISC-V machine in
this course, it means 32 bits. **Halfword** means half of that word: 16 bits.

## One pattern, signed or unsigned

Bits do not carry a label saying “signed” or “unsigned.” Those are two ways to interpret a bit
pattern as a number.

An unsigned interpretation uses every bit for the value, so its range begins at zero. A signed
interpretation in two's complement uses the top bit as the sign bit, leaving half of the patterns
for negative values. Here are their ranges at each RISC-V size:

| size     | unsigned range     | signed range                    |
| -------- | ------------------ | ------------------------------- |
| byte     | 0 to 255           | -128 to 127                     |
| halfword | 0 to 65,535        | -32,768 to 32,767               |
| word     | 0 to 4,294,967,295 | -2,147,483,648 to 2,147,483,647 |

For example, the byte `0xF0` has this bit pattern:

```text
11110000
```

Read as unsigned, it is 240. Read as signed two's complement, it is -16. Nothing about the stored
byte changes between those readings. The operation being performed determines which reading is
appropriate.

The same principle applies to a whole register. The 32 bits `0xFFFFFFFF` can mean 4,294,967,295 or
-1. The register remembers only the bits, not which meaning you have in mind.

## A small value in a full register

A byte has 8 bits, but a register has 32. Placing the byte `0xF0` in a register leaves 24 bit positions
to fill:

```text
original byte:                  F0
zero-extended to a word: 000000F0
sign-extended to a word: FFFFFFF0
```

**Zero extension** fills every new position on the left with zero. It preserves the unsigned value,
so `0xF0` remains 240.

**Sign extension** copies the smaller value's top bit into every new position. The top bit of
`0xF0` is 1, so the new positions are all ones. This preserves the signed value, so `0xF0` and
`0xFFFFFFF0` both represent -16 at their respective sizes.

If the smaller value's top bit is 0, sign extension also fills with zero. For example, the byte
`0x70` becomes `0x00000070` with either kind of extension. The two methods differ only when the top
bit of the smaller value is 1.

A halfword follows the same rule, except that only 16 new bits are needed:

```text
original halfword:              8001
zero-extended to a word:    00008001
sign-extended to a word:    FFFF8001
```

The halfword `0x8001` is 32,769 unsigned and -32,767 signed. Zero extension preserves the first
meaning; sign extension preserves the second.

A word already fills a 32-bit register, so it needs no extension.

## Check the sizes and extensions

1. How many bytes and bits are in a RISC-V halfword?
2. The byte `0xFF` is 255 unsigned and -1 signed. What 32-bit pattern results from zero extension?
   What pattern results from sign extension?
3. The halfword `0x7ABC` has a top bit of 0. Will sign extension and zero extension produce different
   32-bit patterns?
4. Why does a word not need a signed and unsigned extension choice when it is placed in a 32-bit
   register?

<details>
<summary>Show answers</summary>

1. A halfword is 2 bytes, or 16 bits.
2. Zero extension produces `0x000000FF`. Sign extension produces `0xFFFFFFFF`.
3. No. Both produce `0x00007ABC`, because both methods fill the new positions with zero when the
   smaller value's top bit is 0.
4. A word and the register are both 32 bits wide, so there are no extra positions to fill.

</details>

The central idea is that size and interpretation are separate. **Byte**, **halfword** and **word**
say how many bits there are. **Signed** and **unsigned** say how to read those bits. When a byte or
halfword must fill a 32-bit register, sign extension preserves its signed value and zero extension
preserves its unsigned value.
