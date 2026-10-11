## From registers to memory

RISC-V has 32 integer registers. Registers are useful working storage, but a program keeps the
rest of its information in **memory**.

Recall the basic picture: memory is a long sequence of **bytes**, and every byte has a numbered
**address**. An address tells us which byte we mean. The editor usually writes addresses in
**hexadecimal**, a base-16 notation marked by the prefix `0x`. Hexadecimal uses the digits `0`
through `9` and the letters `A` through `F`.

Consecutive addresses name consecutive bytes:

| address  | byte stored there |
| -------- | ----------------- |
| `0x1000` | first byte        |
| `0x1001` | next byte         |
| `0x1002` | next byte         |
| `0x1003` | next byte         |

One byte contains eight bits. A multi-byte value therefore occupies several adjacent
addresses. Reading or writing bytes in memory is called a **memory access**. Two questions then
matter:

1. In what order are the bytes placed at those addresses?
2. Which starting addresses support an access of several bytes?

These questions describe **byte order** and **alignment**.

## Little-endian byte order

Consider the four-byte value `0x12345678`. A byte has 256 possible bit patterns, and two
hexadecimal digits can name those 256 patterns, from `00` through `FF`. We can therefore separate
the value into bytes like this:

```text
value as written:  12 | 34 | 56 | 78
                   ^              ^
             highest part     lowest part
```

The byte `0x78` is the **least significant byte**: it contains the lowest place values in the
number. The byte `0x12` is the **most significant byte**: it contains the highest place values.
“Significant” is about place value here, not importance.

The 32-bit RISC-V environment used in this course is **little endian**. That means the least
significant byte goes at the lowest address. If our value begins at address `0x1000`, memory contains:

| address  | byte |
| -------- | ---- |
| `0x1000` | `78` |
| `0x1001` | `56` |
| `0x1002` | `34` |
| `0x1003` | `12` |

The addresses rise from `0x1000` to `0x1003`, while the byte pairs appear in the reverse order from
the written number:

```text
written number:        12 34 56 78
in increasing address: 78 56 34 12
```

When RISC-V reads those four bytes as one value, it uses the same little-endian rule and
reconstructs `0x12345678`. The order is visible when inspecting the individual bytes in the memory
panel.

Byte order arranges the bytes of a multi-byte value. A single byte stays unchanged, and its bits stay
in the same order: the byte `0x78` remains `0x78`.

### Check the byte order

Suppose the four-byte value `0xA1B2C3D4` begins at address `0x2000`.

1. Which byte is stored at `0x2000`?
2. Which byte is stored at `0x2003`?
3. Four consecutive addresses contain `EF BE AD DE`, listed from lowest to highest address. What
   four-byte value do they represent?

<details>
<summary>Show answers</summary>

1. `0xD4`. It is the least significant byte, so it goes at the lowest address.
2. `0xA1`. It is the most significant byte, so it goes at the highest of the four addresses.
3. `0xDEADBEEF`. Reverse the address order when writing the complete value in the usual notation.

</details>

## Alignment

A multi-byte value needs several adjacent addresses. A memory access is **naturally aligned** when
its starting address is divisible by the number of bytes in the access. This course's simulator
requires that alignment for accesses of several bytes at once.

For a four-byte access, the starting address must therefore be a multiple of four. These are aligned
starts:

```text
0x1000   0x1004   0x1008   0x100C
```

Each address is four bytes after the previous one. Addresses such as `0x1001`, `0x1002` and `0x1003`
are not four-byte aligned. In hexadecimal, a four-byte-aligned address ends in `0`, `4`, `8` or `C`.
That ending is a quick way to recognize the rule; the rule itself is still “a multiple of four.”

The same idea follows the access size:

| bytes accessed | aligned starting address |
| -------------- | ------------------------ |
| 1              | any address              |
| 2              | a multiple of 2          |
| 4              | a multiple of 4          |

The starting address must be divisible by the number of bytes in the access.

Sometimes arranging the next value for an aligned access leaves a gap. Suppose three bytes already
occupy addresses `0x1000` through `0x1002`. The next free address is `0x1003`, but that is not a
multiple of four. We can instead place a four-byte value beginning at `0x1004`:

```text
address:  0x1000  0x1001  0x1002  0x1003  0x1004  0x1005  0x1006  0x1007
use:      existing existing existing  gap   |------ four-byte value ------|
```

The unused byte at `0x1003` is called **padding**. It moves the next starting point forward to the
required boundary.

In this course's simulator, a multi-byte access from an incorrectly aligned address stops the
program with an alignment error.

### Check the alignment

1. Is address `0x3006` aligned for a two-byte access?
2. Is address `0x3006` aligned for a four-byte access?
3. Three bytes occupy addresses `0x4000`, `0x4001` and `0x4002`. What is the first later address at
   which a four-byte value can begin while remaining aligned? How many padding bytes are needed?

<details>
<summary>Show answers</summary>

1. Yes. Its last hexadecimal digit, `6`, is even, so `0x3006` is a multiple of two.
2. No. The nearby four-byte boundaries are `0x3004` and `0x3008`.
3. The value begins at `0x4004`. Address `0x4003` is one padding byte.

</details>

The two rules answer different questions. **Little endian** determines the order of the bytes after
a starting address has been chosen. **Alignment** determines whether that starting address is valid
for an access of a particular size.
