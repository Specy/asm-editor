MIPS uses three common sizes for numbers and bit patterns:

| name               | bits | bytes | hexadecimal digits |
| ------------------ | ---: | ----: | -----------------: |
| byte               |    8 |     1 |                  2 |
| half (or halfword) |   16 |     2 |                  4 |
| word               |   32 |     4 |                  8 |

Every MIPS register holds one full word. Memory can also hold individual bytes and halves. The size
matters because the same pattern can represent a different number when it is read at a different
width.

Hexadecimal makes the boundaries easy to see because two hexadecimal digits represent one byte.
For the word `0x12345678`, the same 32 bits can be grouped like this:

```text
word:    12345678
halves:  1234 | 5678
bytes:   12 | 34 | 56 | 78
```

This diagram groups the bits inside the value. In memory, the Playground displays the four bytes in
little-endian order, as the previous lesson showed.

The registers panel has **B**, **W**, and **L** view buttons. For MIPS, **B** divides each register
into four bytes, **W** divides it into two halves, and **L** shows the whole 32-bit word. These
buttons change how the panel groups the value; they do not change the bits in the register.

## Decimal and hexadecimal source values

Write an ordinary decimal number with digits, such as `100`. Write a hexadecimal number with the
prefix `0x`, such as `0x64`. A negative decimal value uses a minus sign.

```mips|playground
.text
main:
    li $t0, 100
    li $t1, 0x64
    li $t2, -1
    li $v0, 10
    syscall
```

Build the program and step through the three `li` instructions. `$t0` and `$t1` both become
`00000064`: decimal `100` and hexadecimal `0x64` are two source spellings for the same value.
`$t2` becomes `FFFFFFFF`.

Hover over these register values. The panel shows both a signed and an unsigned reading when those
readings differ. Then switch among **B**, **W**, and **L** to see the byte, half, and word boundaries.
The register still contains the same 32 bits in every view.

## Declare each size in memory

The `.byte`, `.half`, and `.word` directives place values of the three sizes in memory:

```mips|playground|memory
.data
small:  .byte 0x7F
        .align 1
middle: .half 0x1234
        .align 2
large:  .word 0x12345678

.text
main:
    la $t0, small
    la $t1, middle
    la $t2, large
    li $v0, 10
    syscall
```

Build and run the program, then open the memory panel at `0x10010000`. The byte at `small` uses one
address. After one padding byte, the half at `middle` uses two addresses. The word at `large` uses
four addresses.

The panel shows these bytes from low address to high address:

```text
7F 00 34 12 78 56 34 12
```

The `00` after `7F` is padding added by `.align 1`, which moves `middle` to a multiple-of-two
address. The following `.align 2` moves `large` to a multiple-of-four address. The bytes of each
multi-byte value appear least significant first because this Playground is little endian.

## One pattern can have two numeric readings

An **unsigned** value uses every bit to represent zero or a positive number. A **signed** value uses
the highest bit to distinguish the negative half of the range. MIPS uses **two's complement** for
signed values.

For a fixed width, you can find the magnitude of a negative two's-complement pattern by flipping
every bit and adding 1. Consider the byte `11110000`:

```text
original:          11110000
flip every bit:    00001111
add 1:             00010000   = 16
```

Its highest bit is 1, so its signed reading is -16. If all eight bits are read as unsigned, the same
pattern is 240.

Width is part of the interpretation. The table follows the same low eight bits, `F0`, and pads them
with leading zeroes at the wider widths. `F0` is negative when treated as one byte, while `00F0`
and `000000F0` are positive because their highest bit is 0:

| pattern    | width | unsigned reading | signed reading |
| ---------- | ----- | ---------------: | -------------: |
| `F0`       | byte  |              240 |            -16 |
| `00F0`     | half  |              240 |            240 |
| `000000F0` | word  |              240 |            240 |

Positive patterns whose highest bit is 0 have the same signed and unsigned reading. Patterns whose
highest bit is 1 fall in the upper half of the unsigned range and the negative half of the signed
range.

## Ranges

Each size has a fixed number of bit patterns. A byte has 2<sup>8</sup>, or 256, patterns; a half has
2<sup>16</sup>, or 65,536; and a word has 2<sup>32</sup>, or 4,294,967,296. Signed and unsigned
readings divide those same patterns differently:

| size |     unsigned range |                    signed range |
| ---- | -----------------: | ------------------------------: |
| byte |           0 to 255 |                     -128 to 127 |
| half |        0 to 65,535 |               -32,768 to 32,767 |
| word | 0 to 4,294,967,295 | -2,147,483,648 to 2,147,483,647 |

Use this table as a reference; there is no need to memorize every endpoint. The recurring pattern is
that an unsigned value starts at 0, while a signed value gives half of its patterns to negative
numbers.

## Check your reading

For each pattern, state its unsigned and signed readings before opening the answer.

1. The byte `FF`
2. The half `8000`
3. The word `FFFFFFFF`

<details>
<summary>Show answers</summary>

1. `FF` is 255 unsigned and -1 signed.
2. `8000` is 32,768 unsigned and -32,768 signed.
3. `FFFFFFFF` is 4,294,967,295 unsigned and -1 signed.

</details>

## Your turn

A register always holds a word. Use decimal operands with `li` so `$t0` displays `000000FF` and
`$t1` displays `FFFFFFFF`. The first is the unsigned value of the byte pattern `FF`; the second is
the signed value represented by an all-ones word.

```mips|playground|exercise
.text
main:
    # put the two values in $t0 and $t1
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 255, "$t1": -1 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t0, 255
    li $t1, -1
    li $v0, 10
    syscall
```

</details>

Now declare one byte at `small`, one half at `middle`, and one word at `large`. Use the values shown
in the comments. The alignment directives are already present. The three addresses will show that
the declarations reserve 1, 2, and 4 bytes.

```mips|playground|memory|exercise
.data
small:  # declare the byte 0x7F
        .align 1
middle: # declare the half 0x1234
        .align 2
large:  # declare the word 0x12345678

.text
main:
    la $t0, small
    la $t1, middle
    la $t2, large
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$t0": "0x10010000",
        "$t1": "0x10010002",
        "$t2": "0x10010004"
    },
    "expectedMemory": [
        { "type": "number", "address": "0x10010000", "bytes": 1, "expected": "0x7F" },
        { "type": "number", "address": "0x10010002", "bytes": 2, "expected": "0x1234" },
        { "type": "number", "address": "0x10010004", "bytes": 4, "expected": "0x12345678" }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
small:  .byte 0x7F
        .align 1
middle: .half 0x1234
        .align 2
large:  .word 0x12345678

.text
main:
    la $t0, small
    la $t1, middle
    la $t2, large
    li $v0, 10
    syscall
```

</details>
