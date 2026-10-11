# Memory, big endian and sizes

Registers give the processor a small amount of working space. **Memory** provides much more space
for the program's instructions and data. The instructions and data are stored in memory as bytes.

## One address, one byte

Memory is divided into small locations. Each location holds one **byte**, and each has its own
numeric **address**.

Neighbouring locations have neighbouring addresses. If one byte is at address 2000, the next byte
is at address 2001, then 2002, and so on. The address identifies the location; the byte stored there
is its contents.

This first diagram uses ordinary decimal numbers for both the addresses and their contents:

| address | byte stored there |
| ------: | :---------------: |
|    2000 |        25         |
|    2001 |         7         |
|    2002 |        104        |
|    2003 |         3         |

For example, 2001 is an address in this diagram, while 7 is the data at that address. Because each
address identifies one byte, M68K memory is called **byte-addressed**.

When the processor reads from or writes to memory, that operation is called a memory **access**.

## Bits, bytes, words and longs

A **bit** is a single binary digit: either 0 or 1. Bits are grouped into the sizes used here:

| name     | size in bytes | size in bits |
| -------- | ------------: | -----------: |
| **byte** |             1 |            8 |
| **word** |             2 |           16 |
| **long** |             4 |           32 |

A word therefore occupies two consecutive byte locations. A long occupies four consecutive byte
locations. The locations still hold individual bytes; a word or long is formed by treating several
of those neighbouring bytes as one value.

## Reading hexadecimal

Memory addresses and bytes are commonly written in **hexadecimal**, or **hex**. A dollar sign marks
a hexadecimal number in M68K material, so `$2000` is an address written in hex.

Hex uses sixteen digits instead of ten:

```text
0 1 2 3 4 5 6 7 8 9 A B C D E F
```

After 9 comes A, and after F the next position increases. For example, the address after `$2009` is
`$200A`, and the address after `$200F` is `$2010`.

Each hex digit represents four bits, so a pair of hex digits can show one byte. The examples below
are deliberately written with one, two and four pairs:

| example     | pairs written | bytes shown |
| ----------- | ------------: | ----------: |
| `$12`       |             1 |           1 |
| `$1234`     |             2 |           2 |
| `$12345678` |             4 |           4 |

Read a memory diagram by grouping hex digits into pairs, one pair per byte. Leading zero pairs may
also be written: `$0012` is the same number as `$12`, displayed with two pairs instead of one. The
number of written pairs describes this display; a memory access still chooses whether it uses one,
two or four bytes.

## A long in four locations

Suppose the long value `$12345678` begins at address `$2000`. It is split into four bytes: `12`,
`34`, `56` and `78`. Those bytes occupy four consecutive addresses:

| address | byte |
| ------- | :--: |
| `$2000` | `12` |
| `$2001` | `34` |
| `$2002` | `56` |
| `$2003` | `78` |

The lowest address is `$2000`; the addresses increase by one as you move down the table.

The M68K is **big endian**. For a value that occupies several bytes, it stores the leftmost pair of
hex digits at the lowest address, followed by the remaining pairs in the same order. The leftmost
pair is also called the **most significant byte** because it contributes the largest part of the
value.

From the memory above:

- a one-byte read beginning at `$2000` gets `$12`;
- a two-byte word read beginning at `$2000` gets `$1234`;
- a two-byte word read beginning at `$2002` gets `$5678`;
- a four-byte long read beginning at `$2000` gets `$12345678`.

Memory itself only stores the four bytes. It does not attach a note saying that they are one long.
The size of a particular access decides whether the processor uses one byte, two adjacent bytes or
four adjacent bytes.

For example, the same bytes at `$2000` through `$2003` can be viewed as four separate bytes, as the
two words `$1234` and `$5678`, or as the long `$12345678`. Big-endian order tells the processor how
to combine the bytes for either word or long view.

## Even addresses for words and longs

On the 68000 used in this course, a byte access can begin at any address. A word or long access must
begin at an **even address**.

In hex, an address is even when its last digit is `0`, `2`, `4`, `6`, `8`, `A`, `C` or `E`. It is
odd when its last digit is `1`, `3`, `5`, `7`, `9`, `B`, `D` or `F`.

Here is a word access beginning at the even address `$2002`:

| address | byte | part of the word? |
| ------- | :--: | :---------------: |
| `$2001` | `34` |                   |
| `$2002` | `56` |        yes        |
| `$2003` | `78` |        yes        |

It uses the bytes at `$2002` and `$2003`, so the big-endian word is `$5678`. This access is allowed
because its starting address, `$2002`, is even.

A word beginning at `$2001` would use the bytes at `$2001` and `$2002`:

| address | byte | part of the word? |
| ------- | :--: | :---------------: |
| `$2001` | `34` |        yes        |
| `$2002` | `56` |        yes        |
| `$2003` | `78` |                   |

Those two bytes could be combined as `$3456`, but the 68000 used in this course does not allow the
word access because `$2001` is odd. The same starting-address rule applies to a long. Only the
starting address must be even; the following bytes naturally include both odd and even addresses.

## Check your understanding

Use this memory for questions 1–3:

| address | byte |
| ------- | :--: |
| `$3000` | `A1` |
| `$3001` | `B2` |
| `$3002` | `C3` |
| `$3003` | `D4` |

1. What value does a one-byte read beginning at `$3001` get?
2. What value does a word read beginning at `$3002` get?
3. What value does a long read beginning at `$3000` get?
4. How many bytes and bits are in a word? How many are in a long?
5. Which of these starting points are allowed on the 68000 used in this course: a byte at `$3001`,
   a word at `$3001`, a word at `$3002`, and a long at `$3002`?

<details>
<summary>Show answers</summary>

1. `$B2`.
2. `$C3D4`.
3. `$A1B2C3D4`.
4. A word is 2 bytes or 16 bits. A long is 4 bytes or 32 bits.
5. The byte at `$3001`, the word at `$3002` and the long at `$3002` are allowed. The word at
   `$3001` is not allowed because it begins at an odd address.

</details>
