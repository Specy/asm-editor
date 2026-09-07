The instruction set lecture wrote an instruction's operands as `destination` and `source` without
saying what can go in them. This is what can, and the way an operand is written is its **addressing
mode**. RISC-V has three, which is fewer than any other machine in this editor.

| mode             | written | in C               |
| ---------------- | ------- | ------------------ |
| register         | `t0`    | `x`                |
| immediate        | `7`     | `7`                |
| base plus offset | `4(t0)` | `p[1]`, `*(p + 1)` |

The first two name a value the CPU already has or the assembler already knows. The third names an
address, and only a load or a store may use it.

## Arithmetic never reaches memory

RISC-V is a **load/store architecture**, which means exactly this: `lw`, `lh`, `lb`, `lbu`, `lhu`,
`sw`, `sh` and `sb` are the only instructions that touch memory, and everything else works on
registers. There is no `add` that reads a variable, no comparison against a word in memory, no
increment of a counter that lives at an address.

So the shape of every program that works on data in memory is the same three steps: load it into a
register, do the work there, store it back. On the M68K, where `add.l total, d0` adds the long at a
label straight into a register, that is one instruction; here it is three, and the reason the design
went that way is that a load can take many cycles and an `add` takes one, so the two are kept apart.

## offset(base)

`lw t3, 4(t2)` reads the word at the address `t2 + 4`. The register is the **base**, the number is
the **offset** in bytes, and the offset is the same signed 12 bit constant every I-type instruction
carries, so it runs from -2048 to 2047. That is the whole mode: one register, one constant, added
while the instruction runs.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li t0, 7            # immediate
    mv t1, t0           # register
    la t2, numbers      # the address of the label, nothing read
    lw t3, 0(t2)        # numbers[0]
    lw t4, 4(t2)        # numbers[1]
    addi t5, t2, 12     # a pointer at numbers[3]
    lw t6, -4(t5)       # and one word back from it
```

The four words sit at `0x10010000`, where `.data` puts the first label:

| address      | value      | which element |
| ------------ | ---------- | ------------- |
| `0x10010000` | `0000000A` | `numbers[0]`  |
| `0x10010004` | `00000014` | `numbers[1]`  |
| `0x10010008` | `0000001E` | `numbers[2]`  |
| `0x1001000C` | `00000028` | `numbers[3]`  |

`t3` comes out at 10 and `t4` at 20. `t5` is `1001000C`, and `t6` is 30, because the offset may be
negative and `-4(t5)` is one word back.

Two things the mode cannot do. It cannot add two registers, so there is no `lw t0, (t1 + t2)`. And
it cannot scale anything, so an index has to be turned into a byte offset by your own code.

## Indexing an array

C hides the size of an element: `numbers[i]` means the address of `numbers` plus `i` times four,
because the elements are 4 byte words. RISC-V makes you write both halves of that.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    la t0, numbers
    li t1, 2            # i = 2
    slli t2, t1, 2      # i * 4, the size of a word
    add t3, t0, t2      # &numbers[i]
    lw t4, 0(t3)        # numbers[i]
    lw t5, 4(t3)        # numbers[i + 1]
    li t6, 99
    sw t6, 0(t3)        # numbers[i] = 99
```

`t4` comes out at 30 and `t5` at 40, and after the `sw` the word at `0x10010008` reads `00000063`,
which is 99. `slli t2, t1, 2` is the multiplication by 4: shifting left by 2 multiplies by 4, and
every size on this machine is a power of two, so a shift is always what you want here.

Once the address is in a register, the constant offset does the rest of the work: `0(t3)` and
`4(t3)` are two neighbouring elements out of one computed address, and a loop over pairs pays for
the arithmetic once.

Try changing `li t1, 2` to `li t1, 0` and watching which word changes instead.

## auipc, and how la works

`la t0, numbers` looks like it should be a `lui` and an `addi` holding the address as a constant.
It is not. It assembles into **`auipc`**, add upper immediate to `pc`, and an `addi`:

```
auipc t0, 0xfc10        # t0 = pc + 0xfc10000
addi t0, t0, 0          # and the low 12 bits of the difference
```

`auipc` adds a 20 bit constant, shifted up 12 places, to the address of the `auipc` itself. So the
pair computes **the distance from here to the label** and adds it to where the program actually is,
which means the same three instructions work wherever the program was loaded. That is why RISC-V has
`auipc` at all, and it is what makes position independent code the default on this machine instead
of something you ask for.

The number in the disassembly, `0xfc10`, is the top 20 bits of `0x10010000` minus `0x00400000`,
which is the distance from the instruction to the data section.

## The assembler's label forms

`lw t1, numbers` is not one of the three modes. It is a pseudo-instruction, and the assembler turns
it into an `auipc` that puts the address in the destination register and a real `lw` through it.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40

.text
main:
    la t0, numbers      # auipc and addi: the address in a register
    lw t1, numbers      # auipc and lw: the first word
    li t2, 99
    sw t2, numbers, t3  # a store to a label names its own temporary
```

`t1` comes out at 10 and, after the `sw`, the word at `0x10010000` reads `00000063`. The store is
the one with an extra operand: a load can build the address in the register it is about to write,
and a store has no such register, so **you name one**, and `t3` ends at `10010014` holding what the
`auipc` computed, which the store's own offset of -20 then brings back down to `10010000`.

Two things this assembler will not do that MIPS's will. `lw t1, numbers+8` is a build error, because
a label in an operand is the label and nothing added to it. And there is no hidden scratch register
anywhere in the three lines above, so nothing you were keeping got destroyed.

That is the trade. `lw t1, numbers` reads like C and costs two instructions every time it runs, so
inside a loop you do the `la` once, before the loop, and use `offset(base)` inside it. `la` is the
one you will write most, because a pointer in a register is what the loop wants.

## Walking with a pointer

An array in memory has no length, no bounds and no element names, so a loop over it is built out of
a pointer and a count.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50

.text
main:
    la t0, numbers      # p = numbers
    li t1, 0            # sum = 0
    li t2, 5            # left = 5
loop:
    lw t3, 0(t0)        # *p
    add t1, t1, t3      # sum += *p
    addi t0, t0, 4      # p++, which on a word is four bytes
    addi t2, t2, -1     # left--
    bnez t2, loop
```

`t1` comes out at `00000096`, which is 150, and `t0` at `10010014`, twenty bytes on and one word
past the last element. The `addi t0, t0, 4` is C's `p++` written out, because C hides the size of
what a pointer points at and assembly does not.

The other way to write that loop keeps `t0` at the base and computes `slli` and `add` on every pass,
which is two instructions more and gives you the index in a register. Use the pointer when you touch
every element in order, and the index when you need the index itself, or when the loop jumps around
the array the way a binary search does.

## Branches and jumps are addressed differently

None of the three modes applies to the instruction stream. `beq t0, t1, label` holds a distance in
bytes from the branch to the label, which reaches about 4 kilobytes either way. `jal label` holds a
distance too, and reaches about a megabyte. `jalr t0, t1, 0` takes an address out of a register and
adds a 12 bit offset to it, which is how a subroutine return and a jump table both work.

You write a label in all of them and the assembler works out the distance.

## Your turn

The four words are at `0x10010000`. Leave `numbers[2]` in `t0`, working the address out at run time
from the index in `t1` instead of writing the offset 8 yourself.

```riscv|playground|memory|exercise
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li t1, 2            # i = 2
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": 30 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li t1, 2            # i = 2
    la t2, numbers      # the base
    slli t3, t1, 2      # i * 4
    add t3, t2, t3      # &numbers[i]
    lw t0, 0(t3)        # numbers[i]
```

</details>

The second one wants `numbers[i] = 99` with `i` already in `t1`. The test starts it at 3, so the last
of the four words is the one that changes and the array ends up as 10, 20, 30, 99.

```riscv|playground|memory|exercise
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li t1, 3            # i = 3
    # your code here
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

```riscv|playground|memory|solution
.data
numbers: .word 10, 20, 30, 40

.text
main:
    li t1, 3            # i = 3
    la t2, numbers
    slli t3, t1, 2      # i * 4
    add t3, t2, t3      # &numbers[i]
    li t4, 99
    sw t4, 0(t3)        # numbers[i] = 99
```

</details>
