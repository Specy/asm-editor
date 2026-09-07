Thirty two registers hold thirty two words, and a program has more than that to keep. Everything else
lives in memory, which RISC-V reaches with a 32 bit address and with nothing but the load and store
instructions.

## The address space

An address is 32 bits, so it runs from `0x00000000` to `0xFFFFFFFF`: four gigabytes. Nothing in the
hardware divides that up, and this simulator follows RARS in putting each thing at a fixed address:

| from         | what is there                                                |
| ------------ | ------------------------------------------------------------ |
| `0x00400000` | **text**, the instructions you wrote                         |
| `0x10000000` | global data                                                  |
| `0x10008000` | where `gp` starts                                            |
| `0x10010000` | **static data**, where `.data` puts your first label         |
| `0x10040000` | the **heap**, which `ecall` service 9 hands out              |
| `0x7FFFEFFC` | where `sp` starts, and the **stack** grows downwards from it |
| `0xFFFF0000` | the memory-mapped devices, the screen and the keyboard       |

A byte nobody has written reads **0** here. Open the memory panel of any program on this page, look
anywhere your program did not touch, and every byte is `00`. That is this simulator's choice, and
the M68K's is the opposite, so a program that reads uninitialised memory behaves differently on the
two.

The instructions are the one region you cannot read. `li t0, 0x00400000` and then `lw t1, 0(t0)`
ends the run with

```
Cannot read directly from text segment!0x00400000
```

The assembled program is there, at four bytes per instruction, and this simulator keeps it where a
load cannot reach it. Everything else in the table is memory like any other.

There is no kernel region in that table. MIPS puts an exception handler at a fixed address in a
segment of its own, and RISC-V does not: a handler here is ordinary code in `.text` whose address
your program writes into a control register, which "Exceptions, CSRs and interrupts" gets to.

## Little endian

RISC-V is **little endian**: the **least** significant byte of a word goes at the **lowest**
address. The word `0x12345678` written at `0x10010000` is `78` at `0x10010000`, `56` at
`0x10010001`, `34` at `0x10010002` and `12` at `0x10010003`, which is backwards from the way you
wrote the number down.

Build this one with the memory panel open, type `10010000` in its address box, then Run.

```riscv|playground|memory
.data
value: .word 0x12345678

.text
main:
    la t0, value
    lbu t1, 0(t0)       # the byte at value
    lbu t2, 1(t0)       # the one after it
    lbu t3, 2(t0)
    lbu t4, 3(t0)
    lhu t5, 0(t0)       # the low half
    lhu t6, 2(t0)       # and the high half
    lw s0, 0(t0)        # the whole word
```

| address      | byte | in   |
| ------------ | ---- | ---- |
| `0x10010000` | `78` | `t1` |
| `0x10010001` | `56` | `t2` |
| `0x10010002` | `34` | `t3` |
| `0x10010003` | `12` | `t4` |

`t5` comes out at `00005678` and `t6` at `00001234`, the two halves each read back the right way
round, and `s0` at `12345678`, the whole word as you wrote it. A load of a word or a half puts the
bytes back in order; only reading them one at a time shows you which way they are stored.

The M68K is big endian and stores the same word as `12 34 56 78`. Nothing about a program that only
reads and writes whole words changes between the two. What changes is a program that takes a word
apart a byte at a time, which is what the table above does.

## The size is in the instruction's name

RISC-V has no size suffix. Which instruction you use says how many bytes it touches, and the loads
say what to do with the bits above them:

| instruction | bytes | what it does                                    |
| ----------- | ----- | ----------------------------------------------- |
| `lb`        | 1     | loads a byte and **sign extends** it to 32 bits |
| `lbu`       | 1     | loads a byte and fills the rest with zeroes     |
| `lh`        | 2     | loads a half and sign extends it                |
| `lhu`       | 2     | loads a half and fills the rest with zeroes     |
| `lw`        | 4     | loads a whole word                              |
| `sb`        | 1     | stores the **lowest byte** of the register      |
| `sh`        | 2     | stores the lowest half                          |
| `sw`        | 4     | stores the whole word                           |

The stores have no signed and unsigned pair, because a store writes the bits it is given and there
is nothing above them to fill in.

```riscv|playground|memory
.data
room: .space 8

.text
main:
    la t0, room
    li t1, 0xAABBCCDD
    sw t1, 0(t0)        # four bytes at room
    li t2, 0x11
    sb t2, 4(t0)        # one byte, four along
    li t3, 0x2233
    sh t3, 6(t0)        # two bytes, six along
    lw t4, 4(t0)        # and read those three back as one word
```

The eight bytes at `0x10010000` come out as `DD CC BB AA 11 00 33 22`, and `t4` reads `22330011`.
The `sb` wrote one byte and left the one after it alone, the `sh` wrote two, and the `lw` picked up
all four as a little endian word, which is why the `11` your program stored first ends up at the
bottom of it.

`0(t0)`, `4(t0)` and `6(t0)` are the only addressing mode there is: a register plus a constant
offset in bytes. "Loads, stores and immediates" is the lecture on it.

## Alignment

A word has to start at an address that is a **multiple of 4**, and a half at a multiple of 2. A byte
can go anywhere. Break the rule and the run ends with a message naming the address:

```
Store address not aligned to word boundary 0x10010005
```

A load says `Load address` instead of `Store address`, and a half says `halfword boundary`.

The assembler keeps `.word` and `.half` aligned for you: put a `.byte` in front of a `.word` and it
leaves the gap, so `.word` data is always safe. What it does **not** align is `.space` and the
strings, because those are byte data and a byte needs no alignment. So a buffer you reserve after an
odd length string starts at an odd address, and the first `sw` into it ends the run.

`.align n` is the fix: it moves the next thing up to a multiple of 2 to the `n`, so `.align 2` gives
you a multiple of 4.

```riscv|playground|memory
.data
label:  .asciz "Hi"     # three bytes, so what follows would start at 0x10010003
        .align 2        # push it up to the next multiple of four
counts: .space 8

.text
main:
    la t0, label
    la t1, counts
    li t2, 42
    sw t2, 0(t1)
    lw t3, 0(t1)
```

`t0` is `10010000` and `t1` is `10010004`, the three bytes of `"Hi"` rounded up to four, and `t3`
comes back at 42.

Delete the `.align 2` line and press Build and Run. `counts` moves to `0x10010003`, the `sw` stops
the program, and the message under the editor gives you that address. Then put it back.

Two more addresses end a run. One outside everything in the table, such as `li t0, 4` and
`lw t1, 0(t0)`, says `address out of range 0x00000004`. And a loop that never stops is simply cut
off when the Playground's two million instructions run out, with no message at all, which is what an
accidental infinite loop looks like here.

## Your turn

The word at `value` is `0x12345678`. Leave its **lowest** byte in `t0`, which is the `0x78`, and its
**highest** byte in `t1`, which is the `0x12`, each as a number on its own with zeroes above it.

```riscv|playground|memory|exercise
.data
value: .word 0x12345678

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": "0x78", "t1": "0x12" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
value: .word 0x12345678

.text
main:
    la t2, value
    lbu t0, 0(t2)       # the lowest byte is at the lowest address
    lbu t1, 3(t2)       # and the highest is three bytes on
```

</details>

The second one has a string of five bytes and a buffer after it, so the buffer starts at an odd
address. Make it word aligned and store `0x11223344` in its first word.

```riscv|playground|memory|exercise
.data
name:   .asciz "RISC"
buffer: .space 8

.text
main:
    # your code here
```

```testcase
{
    "expectedMemory": [{ "type": "number-chunk", "address": "0x10010008", "bytes": 4, "expected": ["0x11223344"] }]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
name:   .asciz "RISC"
        .align 2
buffer: .space 8

.text
main:
    la t0, buffer       # now at 0x10010008
    li t1, 0x11223344
    sw t1, 0(t0)
```

</details>
