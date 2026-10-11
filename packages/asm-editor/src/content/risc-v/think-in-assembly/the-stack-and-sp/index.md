The stack is a region of memory used for temporary storage. RISC-V uses `x2`, also named `sp`, as
the **stack pointer** by convention. The register itself still holds an ordinary integer address;
moving it does not automatically read, write or clear memory.

Some startup code must give `sp` a usable address before a program treats it as a stack pointer.
This playground does that for us and starts `sp` at `0x7FFFEFFC`, near the high end of its memory.
That is this playground's initial value, not a value guaranteed by the RISC-V architecture.

## A push is a subtraction and a store

The stack **grows downwards**, toward smaller addresses. For a four-byte word:

- a **push** subtracts 4 from `sp`, then uses `sw` at `0(sp)`;
- a **pop** uses `lw` at `0(sp)`, then adds 4 back to `sp`.

The 4 is the size of the word. It also keeps each word address a multiple of 4, as required by the
playground's `lw` and `sw` instructions.

```riscv|playground|memory
.text
main:
    li t0, 0x11111111
    li t1, 0x22222222
    addi sp, sp, -4     # reserve one word
    sw t0, 0(sp)        # push t0
    addi sp, sp, -4
    sw t1, 0(sp)        # push t1
    lw t2, 0(sp)        # read the most recent word
    addi sp, sp, 4      # pop it
    lw t3, 0(sp)        # read the previous word
    addi sp, sp, 4      # pop it
```

Step through it and watch `sp` in the registers panel. Before the first push, the stack is empty.
Here `sp` marks its boundary: no word has been allocated at `0x7FFFEFFC`. The next push allocates
the word immediately below that boundary. The green marker shows `sp`, and untouched memory in
this playground reads as zero:

|      address |    value    |
| -----------: | :---------: |
| `0x7FFFEFF4` |  00000000   |
| `0x7FFFEFF8` |  00000000   |
| `0x7FFFEFFC` | 🟢 00000000 |

The first `addi` lowers `sp` to `0x7FFFEFF8`. At that point `sp` points at the newly allocated word,
and `sw` writes there:

|      address |    value    |
| -----------: | :---------: |
| `0x7FFFEFF4` |  00000000   |
| `0x7FFFEFF8` | 🟢 11111111 |
| `0x7FFFEFFC` |  00000000   |

The second pair lowers it another four bytes and writes the next word:

|      address |    value    |
| -----------: | :---------: |
| `0x7FFFEFF4` | 🟢 22222222 |
| `0x7FFFEFF8` |  11111111   |
| `0x7FFFEFFC` |  00000000   |

The two pops read the words in the opposite order. `t2` gets `22222222`, `t3` gets `11111111`,
and `sp` returns to `0x7FFFEFFC`. This is **last in, first out**. Both values remain in memory
because a pop changes the boundary; it does not erase the bytes.

After running, enter `7FFFEFF4` in the memory panel's address box to see both words. The **Stack**
tab of the memory panel already displays this region.

## One adjustment, several stores

Several values can share one reserved block. Move `sp` once by the total size, then use a different
offset for each word:

```riscv|playground|memory
.text
main:
    li s0, 1
    li s1, 2
    li s2, 3
    addi sp, sp, -12    # reserve three words at once
    sw s0, 0(sp)
    sw s1, 4(sp)
    sw s2, 8(sp)
    li s0, 0xFF         # overwrite the register values
    li s1, 0xFF
    li s2, 0xFF
    lw s0, 0(sp)        # restore them from memory
    lw s1, 4(sp)
    lw s2, 8(sp)
    addi sp, sp, 12     # release all three words
```

This example chooses `s0`, `s1` and `s2` as three values to preserve. Their names do not make the
hardware save them, and changing `sp` does not affect them; the `sw` and `lw` instructions do all of
the copying.

While the values are saved, `sp` is `0x7FFFEFF0` and the reserved block holds:

|      address |    value    | reached as | register |
| -----------: | :---------: | ---------- | -------- |
| `0x7FFFEFF0` | 🟢 00000001 | `0(sp)`    | `s0`     |
| `0x7FFFEFF4` |  00000002   | `4(sp)`    | `s1`     |
| `0x7FFFEFF8` |  00000003   | `8(sp)`    | `s2`     |

Each restore uses the same offset as its matching save. Adding 12 at the end restores the exact
value that `sp` had before the block was reserved.

## Two kinds of alignment

Every word address above is a multiple of 4. That **natural alignment** is what the current `lw` and
`sw` examples require in this playground, and subtracting 4 or 12 from the 4-byte-aligned initial
`sp` preserves it.

The standard RISC-V calling convention has a separate rule: `sp` is 16-byte aligned when a procedure
begins and remains aligned while that procedure runs. The playground's initial `0x7FFFEFFC` is not
16-byte aligned; it leaves a remainder of 12 when divided by 16. Subtracting 16 would produce
`0x7FFFEFEC`, which has the same remainder. Therefore the examples in this lesson have the natural
alignment their word accesses need, but they do not demonstrate calling-convention alignment. In an
environment that follows that convention, startup or calling code supplies a 16-byte-aligned `sp`,
and frame sizes that are multiples of 16 preserve it.

## Room of your own

Moving `sp` can reserve space for temporary data as well as saved register values. This example
reserves sixteen bytes and treats them as a local array of four words:

```riscv|playground|memory
.text
main:
    addi sp, sp, -16    # reserve local[0] through local[3]
    li t1, 0            # i = 0
    li t4, 4
fill:
    slli t2, t1, 2      # byte offset = i * 4
    add t2, sp, t2      # &local[i]
    addi t3, t1, 10     # value = 10 + i
    sw t3, 0(t2)        # local[i] = value
    addi t1, t1, 1
    blt t1, t4, fill
    lw t5, 0(sp)        # local[0]
    lw t6, 12(sp)       # local[3]
    addi sp, sp, 16     # release the array
```

`t5` finishes at 10 and `t6` at 13. While the block is reserved, its four words run from
`0x7FFFEFEC` through `0x7FFFEFF8`. This is the same base-plus-scaled-index arithmetic used for any
word array; here the base address happens to be in `sp`.

After the last `addi`, the bytes still contain the four values, but the block is available for
later stack use. Reserving that region again may overwrite them. The pointer records which region
is currently reserved; moving the pointer performs no automatic memory operation.

## Restore the boundary

Code that reserves a stack block must restore the previous value of `sp` when it finishes using the
block. Otherwise later code starts from the wrong boundary, so all of its expected stack offsets
refer to the wrong addresses.

For a simple block, the amount added at the end matches the amount subtracted at the beginning. It
is useful to write those two adjustments as a pair and then fill in the loads, stores and
calculations between them. Watch the `sp` row of the registers panel to verify that it finishes at
its starting value.

## Your turn

The test starts `t0` at `0x11111111`, `t1` at `0x22222222` and `sp` at `0x7FFFEFFC`. Exchange the
two values through one word on the stack, without using a third data register. Restore `sp` before
the program ends.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": {
        "t0": "0x11111111",
        "t1": "0x22222222",
        "sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "t0": "0x22222222",
        "t1": "0x11111111",
        "sp": "0x7FFFEFFC"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    addi sp, sp, -4
    sw t0, 0(sp)        # save the old t0
    mv t0, t1
    lw t1, 0(sp)        # recover the old t0
    addi sp, sp, 4
```

</details>

The second test starts `s0`, `s1` and `s2` at 1, 2 and 3. The three `li` instructions in the middle
overwrite them and must stay unchanged. Reserve one block with a single downward adjustment, save
the three values at different offsets, restore them, and release the whole block with a single
upward adjustment. The test checks the restored registers and final `sp`; inspect your two `addi`
instructions to confirm that you moved `sp` only once in each direction.

```riscv|playground|exercise
.text
main:
    # reserve one block and save s0, s1 and s2 here

    li s0, 0xFF
    li s1, 0xFF
    li s2, 0xFF

    # restore them and release the block here
```

```testcase
{
    "startingRegisters": {
        "s0": 1,
        "s1": 2,
        "s2": 3,
        "sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "s0": 1,
        "s1": 2,
        "s2": 3,
        "sp": "0x7FFFEFFC"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    addi sp, sp, -12    # reserve three naturally aligned words
    sw s0, 0(sp)
    sw s1, 4(sp)
    sw s2, 8(sp)

    li s0, 0xFF
    li s1, 0xFF
    li s2, 0xFF

    lw s0, 0(sp)
    lw s1, 4(sp)
    lw s2, 8(sp)
    addi sp, sp, 12     # restore the original stack boundary
```

</details>
