Memory is a long sequence of bytes. Each byte has its own numeric **address**, so an address tells
you exactly where one byte is stored.

A MIPS **word** is 32 bits, or 4 bytes. Declaring one word therefore uses four consecutive
addresses:

```mips|playground|memory
.data
value:  .word 0x12345678

.text
main:
    la $t0, value
    li $v0, 10
    syscall
```

Build and Run the program. The register panel shows `$t0` as `10010000`, which is the hexadecimal
address `0x10010000`. The `0x` prefix marks a number as hexadecimal; the register panel leaves that
prefix out. In the memory panel, each two-digit entry such as `78` or `FF` is one byte written in
hexadecimal.

## The part of the address map we need

This Playground places the two sections you already know at fixed starting addresses:

| starting address | section | what it contains     |
| ---------------- | ------- | -------------------- |
| `0x00400000`     | `.text` | program instructions |
| `0x10010000`     | `.data` | declared data        |

The first declaration in `.data` begins at `0x10010000`. Each byte advances the address by one, so
a four-byte word there occupies addresses `0x10010000` through `0x10010003`. The next free address
is `0x10010004`.

## Little-endian byte order

The word `0x12345678` contains four bytes. Written as pairs of hexadecimal digits, they are `12`,
`34`, `56`, and `78`. The rightmost pair, `78`, is the **least significant byte**: it contributes
the smallest part of the number. The leftmost pair, `12`, is the **most significant byte**.

MIPS in this Playground uses **little-endian** byte order. It places the least significant byte at
the lowest address:

| address      | byte |
| ------------ | ---- |
| `0x10010000` | `78` |
| `0x10010001` | `56` |
| `0x10010002` | `34` |
| `0x10010003` | `12` |

Open the memory panel at `10010000` and compare these four entries with the declaration. The bytes
appear as `78 56 34 12`, even though the word was written as `0x12345678`. Little endian describes
this order in memory. The declared value is still the word `0x12345678`.

Byte order matters when a multi-byte value is examined as separate bytes. A one-byte declaration
already occupies a single address, so there is no group of bytes to order.

## Align word-sized locations

A word-sized location is **aligned** when its first address is a multiple of 4. In hexadecimal,
addresses ending in `0`, `4`, `8`, or `C` are multiples of 4.

The directive `.align n` advances the next declaration to an address that is a multiple of
2<sup>n</sup>. Therefore `.align 2` advances to a multiple of 2<sup>2</sup>, or 4 bytes:

```mips|playground|memory
.data
name:   .asciiz "MIPS"
        .align 2
buffer: .space 8

.text
main:
    la $t0, name
    la $t1, buffer
    li $v0, 10
    syscall
```

The string uses five bytes: four characters followed by the zero byte added by `.asciiz`. It
occupies addresses `0x10010000` through `0x10010004`. The next free address is `0x10010005`, and
`.align 2` advances it to `0x10010008`. After Run, `$t0` contains `10010000` and `$t1` contains
`10010008`. The three skipped bytes are padding between the string and `buffer`.

This Playground automatically aligns a `.word` declaration. An explicit `.align 2` immediately
before `.word` is therefore redundant for the assembler, but it makes the four-byte boundary clear
to a reader. Strings and `.space` use exactly their stated number of bytes; they do not by
themselves align a following byte-data label such as `buffer`. Use `.align 2` when that label must
begin on a word boundary.

Bytes reserved by `.space` initially appear as `00` in this Playground. The source-level meaning
of `.space 8` is simply “reserve eight bytes.” Treat those bytes as room for future data rather
than as eight meaningful zero values.

## Try these

Declare the word `0x0A0B0C0D` at `marker`, then put `marker`'s address in `$t0`. Before running the
program, predict the four bytes you will see starting at `0x10010000`.

```mips|playground|memory|exercise
.data
marker:
    # declare one word here

.text
main:
    # put marker's address in $t0
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": "0x10010000" },
    "expectedMemory": [{ "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected":
["0x0A0B0C0D"] }]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
marker: .word 0x0A0B0C0D

.text
main:
    la $t0, marker
    li $v0, 10
    syscall
```

The memory panel shows `0D 0C 0B 0A` from the lowest address to the highest.

</details>

The string below uses five bytes. Add one directive so `buffer` begins at the next address that is
a multiple of 4, then put `buffer`'s address in `$t0`.

```mips|playground|memory|exercise
.data
name:   .asciiz "MIPS"
        # add the alignment directive here
buffer: .space 8

.text
main:
    la $t0, buffer
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": "0x10010008" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
name:   .asciiz "MIPS"
        .align 2
buffer: .space 8

.text
main:
    la $t0, buffer
    li $v0, 10
    syscall
```

</details>
