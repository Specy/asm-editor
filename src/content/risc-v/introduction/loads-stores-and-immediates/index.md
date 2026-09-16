RISC-V keeps arithmetic and memory access separate. To change a value in memory, you first load it
into a register, work on it there, and then store it back. This lecture develops that pattern and
the operand notation it uses.

## Real operands and assembler conveniences

The real RISC-V instructions in this lecture use three important operand forms:

| form | example | meaning |
| ---- | ------- | ------- |
| register | `t0` | the 32-bit value currently in that register |
| immediate | `7` or `-4` | a constant written as part of the instruction |
| base plus offset | `8(t0)` | memory at the address obtained from `t0 + 8` |

These forms are often called **addressing modes**. The form an instruction accepts depends on the
instruction. For example, `addi` accepts registers and an immediate, while a load or store accepts
the `offset(base)` memory form.

The assembler also accepts convenient **pseudo-instructions** and rewrites them into real
instructions. Three common ones are:

- `li t0, 7`, which puts the immediate value 7 in `t0`;
- `mv t1, t0`, which copies the value in `t0` to `t1`; and
- `la t2, numbers`, which puts the address named `numbers` in `t2` without reading memory there.

`li` means **load immediate**. It places a constant in a register without reading memory. For a
small value, the assembler can rewrite it using the real instruction `addi` and the `zero`
register:

```riscv
li t0, 7               # convenient spelling
addi t0, zero, 7       # same result for this value
```

Similarly, `mv t1, t0` can become `addi t1, t0, 0`. A large value or an address may take more than
one real instruction to construct. Use `li` for a number, `mv` to copy a register, and `la` for
the address represented by a label.

Assemblers can also accept some label-based shortcuts for loads and stores. Those shortcuts are
not another hardware addressing mode. In this course, the clear general pattern is to use `la`
once to place a label's address in a register, then access memory with `offset(base)`.

## Working with an immediate

An **immediate** is a constant included in an instruction. The real `addi` instruction adds such a
constant to a register:

```riscv
addi t1, t0, 5         # t1 = t0 + 5
addi t2, t1, -1        # t2 = t1 - 1
```

The first operand is the destination, the second is the register source, and the third is the
immediate. The source register keeps its value unless it is also the destination:

```riscv
addi t0, t0, 4         # replace t0 with t0 + 4
```

The immediate in a real `addi` instruction is a signed 12-bit value, so it can be from -2048 to
2047. `li` is easier when your aim is simply to put a constant in a register, and the assembler can
also expand `li` when the requested constant is too large for one `addi`.

## Loading and storing

A register can be used directly by arithmetic instructions. A value in memory cannot. RISC-V uses
**load** instructions to copy data from memory into a register and **store** instructions to copy
data from a register into memory.

The instructions choose how many bytes are copied. Loads of a byte or halfword also choose how the
smaller value fills the rest of the 32-bit destination register:

| instruction | bytes read | result in the register |
| ----------- | ---------: | ---------------------- |
| `lb`  | 1 | sign-extend the byte to 32 bits |
| `lbu` | 1 | zero-extend the byte to 32 bits |
| `lh`  | 2 | sign-extend the halfword to 32 bits |
| `lhu` | 2 | zero-extend the halfword to 32 bits |
| `lw`  | 4 | copy the complete 32-bit word |

Sign extension copies the smaller value's top bit into the new high bits; zero extension fills the
new high bits with zero. If memory contains the byte `0xF0`, `lb` produces
`0xFFFFFFF0`, which represents -16 as a signed value. `lbu` produces `0x000000F0`, which represents
240. When the top bit of the smaller value is zero, sign extension and zero extension give the same
result.

Stores have no extension choice because they copy bits in the other direction:

| instruction | bytes written from the source register |
| ----------- | --------------------------------------: |
| `sb` | the lowest 1 byte |
| `sh` | the lowest 2 bytes |
| `sw` | all 4 bytes |

For example, if `t1` contains `0x12345678`, `sb t1, 0(t0)` writes the low byte `0x78`. The other 24
bits in `t1` stay unchanged. Choose the instruction that matches the size of the value in memory:
byte, halfword, or word. Halfword accesses must start at an address divisible by 2, and word
accesses must start at an address divisible by 4 in this course's simulator.

## Calculating an effective address

The memory operand `offset(base)` tells the processor how to calculate an address. The value in the
base register and the offset in bytes are added:

```text
effective address = value in base register + offset
```

The result is called the **effective address**: the address actually used for this access. In

```riscv
lw t3, 8(t0)
```

`t0` is the base register and 8 is the byte offset. If `t0` holds `0x1000`, the effective address is
`0x1008`. `lw` reads the four bytes beginning there and places the resulting word in `t3`. The value
in `t0` does not change.

A store writes in the opposite direction. Its register operand is the source value:

```riscv
sw t3, 8(t0)           # write t3 to the word at address t0 + 8
```

Offsets may be zero or negative:

```riscv
lh  t2, 0(t0)          # read a halfword exactly at the address in t0
lw  t4, -4(t1)         # read a word four bytes before the address in t1
```

Like the immediate in `addi`, the offset in these real load and store instructions is a signed
12-bit value from -2048 to 2047. It is always counted in bytes, regardless of the access size. An
offset of 4 means four bytes for `lb`, `lh`, and `lw`; it does not mean four elements.

## Load, work, store

Suppose `t0` holds the address of a word in memory and you want to add 1 to that word. Arithmetic
instructions work on registers, so use this three-step pattern:

```riscv
lw   t1, 0(t0)         # load: copy the word from memory into t1
addi t1, t1, 1         # work: add 1 in the register
sw   t1, 0(t0)         # store: copy the changed word back to memory
```

The original memory value remains after the load. Changing `t1` changes only the register; the
final store writes the changed value back to memory.

The same shape works at other sizes. To change a byte, load it with `lb` or `lbu`, work on the
32-bit register value, and write its low byte back with `sb`. Your choice between `lb` and `lbu`
depends on whether the byte should be treated as a signed or unsigned value while it is in the
register.

## Finding an array element

An array places equal-sized elements next to one another in memory. If a word array begins at
`0x1000`, its first four elements have these addresses:

| element | address calculation | address |
| ------- | ------------------- | ------- |
| `numbers[0]` | `0x1000 + 0 * 4` | `0x1000` |
| `numbers[1]` | `0x1000 + 1 * 4` | `0x1004` |
| `numbers[2]` | `0x1000 + 2 * 4` | `0x1008` |
| `numbers[3]` | `0x1000 + 3 * 4` | `0x100C` |

The general calculation is:

```text
element address = array base address + index * element size in bytes
```

If `t0` already holds the address of `numbers` and you want the element at a known index, the byte
offset can go directly in the memory operand:

```riscv
lw t1, 8(t0)           # numbers[2], because 2 * 4 = 8
```

If the index is in a register, calculate the byte offset and address in registers first. For a word
array, `slli` by two bit positions multiplies a non-negative index by 4:

```riscv
# t0 = address of numbers, t1 = index i
slli t2, t1, 2         # byte offset = i * 4
add  t3, t0, t2        # address of numbers[i]
lw   t4, 0(t3)         # load numbers[i]
```

For a byte array, the index is already a byte offset. For a halfword array, the byte offset is the
index multiplied by 2.

A pointer is a register that holds an address. It can hold the current element's address and move
to the next element:

```riscv
# t0 = address of one word element
lw   t1, 0(t0)         # use the current element
addi t0, t0, 4         # move the address to the next word
lw   t2, 0(t0)         # use the next element
```

The step matches the element size: 1 for bytes, 2 for halfwords, and 4 for words. `addi` changes the
address held in the register, and the following load uses the ordinary `0(t0)` memory form.

## Check the address and value

Assume `t0` holds `0x1000` and memory contains this word array:

| address | word value |
| ------- | ---------: |
| `0x1000` | 10 |
| `0x1004` | 20 |
| `0x1008` | 30 |
| `0x100C` | 40 |

What effective address does `lw t4, 8(t0)` use, and what value does it place in `t4`?

<details>
<summary>Show answer</summary>

The effective address is `0x1000 + 8`, or `0x1008`. The word at that address is 30, so `t4`
receives 30.

</details>

## Practice

1. `t0` holds `0x2004`. What effective address is used by `lh t1, -2(t0)`? Is that address aligned
   for a halfword?
2. Memory at the address in `t0` contains the byte `0xFF`. Which load should you use to obtain 255
   in `t1`? Which load should you use to obtain -1?
3. `t0` holds the base address of a word array and `t1` holds the index 3. Write instructions that
   calculate the address of element 3 in `t2` and load that element into `t3`.
4. `t0` holds the address of a word whose current value is 20. Write the load–work–store sequence
   that adds 5 and writes 25 back to the same address.

<details>
<summary>Show answers</summary>

1. The effective address is `0x2004 - 2`, or `0x2002`. It is aligned because it is divisible by 2.
2. Use `lbu t1, 0(t0)` to zero-extend `0xFF` and obtain 255. Use `lb t1, 0(t0)` to sign-extend it
   and obtain -1.
3. One solution is:

   ```riscv
   slli t2, t1, 2      # 3 * 4 = 12 bytes
   add  t2, t0, t2     # address of element 3
   lw   t3, 0(t2)      # load element 3
   ```

4. One solution is:

   ```riscv
   lw   t1, 0(t0)
   addi t1, t1, 5
   sw   t1, 0(t0)
   ```

</details>

The pattern to carry forward is small but powerful: use immediates for constants, calculate memory
addresses in bytes, load values into registers, do the work there, and store results back when
memory must change.
