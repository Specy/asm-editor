The operands you have used so far name values in two ways: a register such as `$t0`, or an
immediate number such as `7`. Loads and stores add a third form that names a location in memory.

| kind | example | meaning |
| --- | --- | --- |
| register | `$t0` | use a register |
| immediate | `7` | use the number written in the instruction |
| memory | `4($t0)` | use memory at the address in `$t0`, plus 4 bytes |

The instruction decides what an operand does. In `addi $t1, $t0, 7`, `$t0` is a register source,
`7` is an immediate source, and `$t1` is the register destination. A memory operand such as
`4($t0)` is used by a load or store. Other instructions in this lesson do not read or write
memory.

## Load from memory, store to memory

A **load** copies data from memory into a register. A **store** copies data from a register into
memory. The first operand changes role between them:

```text
lw destination register, memory       # register <- memory
sw source register, memory            # register -> memory
```

Here is that difference in a runnable program:

```mips|playground|memory
.data
numbers: .word 10, 20

.text
main:
    la $t0, numbers         # $t0 gets the address of numbers
    lw $t1, 0($t0)          # load:  memory -> $t1, so $t1 becomes 10
    li $t2, 99
    sw $t2, 4($t0)          # store: $t2 -> memory, so the second word becomes 99
    li $v0, 10
    syscall
```

Build the program and step through it. `la` puts an address in `$t0`; it does not read the value at
that address. The following `lw` uses the address and reads the first word. The `sw` goes in the
other direction and changes memory.

A common mistake is to read `sw $t2, 4($t0)` as though `$t2` were a destination. It is the source:
the store copies the value already in `$t2` to memory. The store does not replace `$t2`.

## The suffix says how much data moves

The letters `b`, `h`, and `w` match the sizes from the previous lesson: byte, half, and word.

| size | load | store | bytes moved |
| --- | --- | --- | ---: |
| byte | `lb` or `lbu` | `sb` | 1 |
| half | `lh` or `lhu` | `sh` | 2 |
| word | `lw` | `sw` | 4 |

Word and half accesses must begin at the aligned addresses introduced earlier: a word at a
multiple of 4 and a half at a multiple of 2. A byte can begin at any address.

A store writes only the low part of its source register. `sb` writes the low 8 bits, `sh` writes
the low 16 bits, and `sw` writes all 32 bits. Stores do not have separate signed and unsigned
forms because the bit pattern written to memory is the same either way.

Loads of a byte or half need one extra choice because every register is 32 bits wide. The loaded
value must be extended to fill the register:

- `lb` and `lh` **sign-extend**: they copy the loaded value's highest bit into the new leading bits.
- `lbu` and `lhu` **zero-extend**: they fill the new leading bits with zeroes.

The difference is visible with the byte pattern `F0`. The previous lesson showed that `F0` is -16
as a signed byte and 240 as an unsigned byte:

```mips|playground|memory
.data
byte_value: .byte 0xF0
            .align 1
half_value: .half 0xFFF0

.text
main:
    la $t0, byte_value
    lb  $t1, 0($t0)         # FFFFFFF0: sign-extended, read as -16
    lbu $t2, 0($t0)         # 000000F0: zero-extended, read as 240
    la $t3, half_value
    lh  $t4, 0($t3)         # FFFFFFF0: sign-extended, read as -16
    lhu $t5, 0($t3)         # 0000FFF0: zero-extended, read as 65520
    li $v0, 10
    syscall
```

Each pair of loads reads the same bits from memory. Only the new leading bits differ. Sign
extension preserves the signed reading -16; zero extension produces the positive unsigned
reading. A word already fills the entire register, so `lw` does not need signed and unsigned
versions.

## Read `offset(base)` one part at a time

In `4($t0)`, `$t0` is the **base register**. It must hold an address. The `4` is the **offset**,
measured in bytes. The processor adds them to find the memory address:

```text
memory address = value in base register + byte offset
```

The parentheses do not mean “load `$t0`.” They mean “use `$t0` as the base of a memory address.”
The load or store mnemonic says whether data moves from that address or to it.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    la $t0, numbers         # base address: 0x10010000
    lw $t1, 0($t0)          # address + 0 bytes:  numbers[0] = 10
    lw $t2, 4($t0)          # address + 4 bytes:  numbers[1] = 20
    lw $t3, 8($t0)          # address + 8 bytes:  numbers[2] = 30
    addi $t4, $t0, 12       # address of numbers[3]
    lw $t5, -4($t4)         # that address - 4 bytes: numbers[2] = 30
    li $v0, 10
    syscall
```

Each word occupies four bytes, so neighbouring words begin four addresses apart. That is why an
offset of 4 reaches the second word, not the fifth. The offset may be negative; `-4($t4)` means
four bytes before the address in `$t4`.

Use `la` once to put a label's address in a register, then use explicit forms such as `0($t0)` and
`4($t0)`. This keeps the base address visible while you step through the program. The assembler
also accepts some load and store forms written directly with a label, but the `la` plus
`offset(base)` pattern is the one to use in this course.

The offset is a fixed number written in the instruction. It cannot be another register, so a form
such as `lw $t0, $t1($t2)` is not available. When an index is in a register, calculate the element
address in registers first.

## Calculate an array element address

For an array of four-byte words, element `i` begins `i * 4` bytes after the array's base address:

```text
address of numbers[i] = address of numbers + i * 4
```

You can multiply a value by 4 with the `add` instruction you already know: double it once, then
double the result.

```mips|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    la $t0, numbers         # base address
    li $t1, 2               # i = 2
    add $t2, $t1, $t1       # i * 2
    add $t2, $t2, $t2       # i * 4, a byte offset
    add $t3, $t0, $t2       # address of numbers[i]
    lw $t4, 0($t3)          # load numbers[i], so $t4 becomes 30
    li $t5, 99
    sw $t5, 0($t3)          # store 99 in numbers[i]
    li $v0, 10
    syscall
```

There are two different additions here. The first two `add` instructions turn the index into a
byte offset. The third adds that offset to the base address. Once `$t3` holds the complete element
address, `0($t3)` means memory at exactly that address.

## Your turn

The first exercise starts with `i = 2`. Leave `numbers[i]` in `$t0`. Calculate `i * 4` with two
`add` instructions rather than writing the fixed offset 8.

```mips|playground|memory|exercise
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 2               # i = 2
    # calculate the address and load numbers[i] into $t0
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t0": 30 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 2               # i = 2
    la $t2, numbers         # base address
    add $t3, $t1, $t1       # i * 2
    add $t3, $t3, $t3       # i * 4, in bytes
    add $t3, $t2, $t3       # address of numbers[i]
    lw $t0, 0($t3)          # load memory -> $t0
    li $v0, 10
    syscall
```

</details>

For the second exercise, `i = 3`. Store 99 in `numbers[i]`. Again calculate the byte offset with
two `add` instructions, and remember that the register holding 99 is the first operand of `sw`.

```mips|playground|memory|exercise
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 3               # i = 3
    # calculate the address and store 99 in numbers[i]
    li $v0, 10
    syscall
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [10, 20, 30, 99] }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li $t1, 3               # i = 3
    la $t2, numbers         # base address
    add $t3, $t1, $t1       # i * 2
    add $t3, $t3, $t3       # i * 4, in bytes
    add $t3, $t2, $t3       # address of numbers[i]
    li $t4, 99
    sw $t4, 0($t3)          # store $t4 -> memory
    li $v0, 10
    syscall
```

</details>
