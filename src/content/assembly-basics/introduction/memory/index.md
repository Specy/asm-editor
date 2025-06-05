The next component is **Memory**

Memory is a **large storage area** where _data and instructions are stored_.
If you already have experience in programming, see it as a _large array of bytes_.

We say that memory can be _addressed_, meaning that **each byte in memory has a unique address**, and if we
want to _read or write_ to a specific byte, we need to know its address. The address can also be seen as an
_offset_ from the start of memory, which says _"how many bytes from the beginning of memory do I need to go to."_

You will usually see memory represented as a table, where **each row is 16 bytes**, and **each column is 1 byte**.
If you want to read the value of the `FF` inside the table, you can see that it's located in row `00000020`
and column `B`, which means that its address is:

**`00000020 + B = 0000002B`**

|  Offset  |  0  |  1  |  2  |  3  |  4  |  5  |  6  |  7  |  8  |  9  |  A  |  B  |  C  |  D  |  E  |  F  |
| :------: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 00000000 | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  |
| 00000010 | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  |
| 00000020 | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | BB  | FF  | AA  | 00  | 00  | 00  |
| 00000030 | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  | 00  |

## Endianess

When we read from memory, we can read more than one byte at a time — usually either **1, 2, 4 or 8 bytes**.
Usually, instructions allow you to specify the **address of the first byte** you want to read and the **size** of how
many bytes you want to read.

But the issue is: _Do you read them from left to right or right to left?_

This is where the concept of **endianness** comes into play.
Endianness is the **order in which bytes are stored in memory**.
There are two main types of endianness:

- **Little Endian**
- **Big Endian**

As a quick reminder:
Say we have number `0x12345678`, the **most significant byte (MSB)** is `0x12` (the _leftmost_ one), and the
**least significant byte (LSB)** is `0x78` (the _rightmost_ one).
When we read a _multi-byte value_ from memory, we need to know the **endianness** to understand how to interpret the
bytes.

## Little Endian

In **little endian**, the **least significant byte (LSB)** is stored at the _lowest address_, and the **most significant
byte (MSB)**
is stored at the _highest address_.

For example, if you have the value `0x12345678` at address `0x00000000` in memory, it would be represented as:

|  Offset  |  0  |  1  |  2  |  3  |
| :------: | :-: | :-: | :-: | :-: |
| 00000000 | 78  | 56  | 34  | 12  |

## Big Endian

In **big endian**, it's the _opposite_ — the **most significant byte (MSB)** is stored at the _lowest address_, and the
**least significant byte (LSB)** is stored at the _highest address_.

This is _easier to understand_, because it reads the **same way we write numbers**.

For example, if you have the value `0x12345678` at address `0x00000000` in memory, it would be represented as:

|  Offset  |  0  |  1  |  2  |  3  |
| :------: | :-: | :-: | :-: | :-: |
| 00000000 | 12  | 34  | 56  | 78  |
