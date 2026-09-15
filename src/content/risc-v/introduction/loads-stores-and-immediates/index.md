There are exactly three ways to write an operand, and the way an operand is written is called its
**addressing mode**.

| mode             | written | what it means                            |
| ---------------- | ------- | ---------------------------------------- |
| register         | `t0`    | the value in that register               |
| immediate        | `7`     | a number written into the instruction    |
| base plus offset | `4(t0)` | the memory at the address `t0` plus four |

The first two name something the processor already has in hand. The third names an address, and only
a load or a store is allowed to use it.

## Everything happens in registers

Eight instructions touch memory: `lw`, `lh`, `lb`, `lbu`, `lhu`, `sw`, `sh` and `sb`. Every other
instruction on the machine works on registers and nothing else, which is what the phrase **load/store
architecture** means.

So a program that works on data in memory always has the same shape. Load it into a register, do the
work there, store it back. Three steps where you might have expected one, and the reason is
underneath: reaching memory can take many times longer than an addition, so the design keeps the
slow thing in instructions of its own where you can see it happening.

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

Two things the mode will not do for you. It will not add two registers together, so there is no
`lw t0, (t1 + t2)`. And it will not scale anything, so turning an element number into a byte offset
is your own code's job. That is the next section.

## Indexing an array

Asking for element number `i` of an array means going to the start of the array and moving `i`
elements along, and the machine has no idea how big an element is. Both halves are yours to
write.

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

`slli t2, t1, 2` is the multiplication by four: shifting left by two places multiplies by four, and
since every useful element size is a power of two, a shift is always the right instruction for this.

Once the address is in a register, the constant offset does the rest of the work for free. `0(t3)`
and `4(t3)` are two neighbouring elements from one piece of arithmetic, which is why a loop that
handles elements in pairs is cheaper than two separate loops.

## Where la gets its address from

You have been writing `la t0, numbers` since the first lecture, and it is worth knowing what the
assembler does with it, because the answer is not what you would guess.

A 32 bit address will not fit inside a 32 bit instruction, so `la` is always two instructions. The
surprise is that neither of them contains the address. The pair assembles into **`auipc`**, add
upper immediate to `pc`, and an `addi`:

```
auipc t0, 0xfc10        # t0 = pc + 0xfc10000
addi t0, t0, 0          # and the low 12 bits of the difference
```

`auipc` takes a 20 bit constant, shifts it up 12 places, and adds it to the address of the `auipc`
instruction itself. So what those two lines actually work out is **the distance from here to the
label**, added to wherever the program happens to be right now.

The `0xfc10` in the expansion is the top 20 bits of `0x10010000` minus `0x00400000`, the gap between
the instruction and the data section.

Working in distances rather than in fixed addresses means the same code still finds its data if the
whole program is loaded somewhere else in memory, which is a thing that really happens once a
program is more than one file. You get that for free here and never have to think about it.

## Reaching a label directly

`lw t1, numbers` is not one of the three modes, but the assembler accepts it and builds it out of an
`auipc` that works the address out into the destination register and a real `lw` through that.

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

Look at the third line, which has an operand more than a store should have. This is why: the address
has to be built somewhere, and a load can build it in the very register it is about to fill, because
that register's old value is about to be thrown away anyway. A store has no such register. It is
reading a register, not writing one, so it needs you to **lend it one**, and `t3` is the one lent
here. Afterwards `t3` holds `10010014`, the address the `auipc` worked out, which the store's own
offset of -20 brought back down to `10010000`.

One thing the assembler will not do is arithmetic on a label: `lw t1, numbers+8` is a build error,
because a label in an operand is that label and nothing added to it.

These label forms cost two instructions every time they run. Inside a loop, do the `la` once before
the loop starts and use `offset(base)` inside it. That is why `la` is the form you will write most:
a pointer sitting in a register is what a loop actually wants.

## Walking with a pointer

An array in memory has no length, no bounds and no element names, so a loop over it is built out of
a pointer and a count.

```riscv|playground|memory
.data
numbers: .word 10, 20, 30, 40, 50

.text
main:
    la t0, numbers      # where we are in the array
    li t1, 0            # the running total
    li t2, 5            # how many are left
loop:
    lw t3, 0(t0)        # the element we are on
    add t1, t1, t3
    addi t0, t0, 4      # on to the next word
    addi t2, t2, -1
    bnez t2, loop
```

`t0` finishes at `10010014`, twenty bytes along and one word past the last element. The
`addi t0, t0, 4` is the step, and the 4 in it is the size of what is being stepped over: an array of
bytes would step by 1, an array of halves by 2.

The other way to write that loop keeps `t0` at the base and computes `slli` and `add` on every pass,
which is two instructions more and gives you the index in a register. Use the pointer when you touch
every element in order, and the index when you need the index itself, or when the loop jumps around
the array the way a binary search does.

## How a jump finds its target

Jumps work in distances rather than in any of the three modes above. `beq t0, t1, label` carries the
number of bytes from the branch to the label, and reaches about 4 kilobytes either way. `jal label`
carries a distance too, and reaches about a megabyte. `jalr t0, t1, 0` is the one that takes an
address out of a register, which is how a return and a jump table both work.

In all of them you write a label and the assembler works the distance out.

## Reach into the array yourself

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
