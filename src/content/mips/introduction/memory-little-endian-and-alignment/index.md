Thirty two registers hold thirty two words. A program that wants to keep more than that, and every
program does, keeps it in memory, which MIPS reaches with a 32 bit address and with nothing but the
load and store instructions.

## The address space

An address is 32 bits, so it runs from `0x00000000` to `0xFFFFFFFF`: four gigabytes of them. The
hardware draws no lines in that range at all, so where things go is the editor's decision, and it
puts each of them at a fixed address:

| from         | what is there                                                 |
| ------------ | ------------------------------------------------------------- |
| `0x00400000` | **text**, the instructions you wrote                          |
| `0x10000000` | global data                                                   |
| `0x10008000` | where `$gp` starts                                            |
| `0x10010000` | **static data**, where `.data` puts your first label          |
| `0x10040000` | the **heap**, which the memory syscall hands out              |
| `0x7fffeffc` | where `$sp` starts, and the **stack** grows downwards from it |
| `0x80000180` | kernel text, where an exception handler goes                  |
| `0xffff0000` | the memory-mapped devices, the screen and the keyboard        |

A byte nobody has written reads **0** here. Open the memory panel of any program on this page, look
anywhere your program did not touch, and every byte is `00`. That is the editor being kind to you;
do not lean on it, because a program that depends on memory it never wrote is a program that depends
on luck.

The text region is the one you cannot read. `lw $t0, 0x00400000($zero)` ends the run with

```
Cannot read directly from text segment!0x00400000
```

Your assembled program is genuinely there, four bytes per instruction, and the editor keeps it
behind glass. Everything else in the table is ordinary memory.

## Little endian

MIPS is **little endian**: the **least** significant byte of a word goes at the **lowest** address.
The word `0x12345678` written at `0x10010000` is `78` at `0x10010000`, `56` at `0x10010001`, `34` at
`0x10010002` and `12` at `0x10010003`, which is backwards from the way you wrote the number down.

Build this one with the memory panel open, type `10010000` in its address box, then Run.

```mips|playground|memory
.data
value:  .word 0x12345678

.text
main:
    la $t0, value
    lbu $t1, 0($t0)     # the byte at value
    lbu $t2, 1($t0)     # the one after it
    lbu $t3, 2($t0)
    lbu $t4, 3($t0)
    lhu $t5, 0($t0)     # the low half
    lhu $t6, 2($t0)     # and the high half
    lw $t7, 0($t0)      # the whole word
```

| address      | byte | in    |
| ------------ | ---- | ----- |
| `0x10010000` | `78` | `$t1` |
| `0x10010001` | `56` | `$t2` |
| `0x10010002` | `34` | `$t3` |
| `0x10010003` | `12` | `$t4` |

Then look at `$t5`, `$t6` and `$t7`. They read `00005678`, `00001234` and `12345678`: the halves and
the whole word all come back the right way round, even though the bytes underneath them are in the
reverse order. That is the useful half of the rule. A load or a store of a word or a half puts the
bytes in order for you, and the only programs that ever notice little endian are the ones that take
a value apart one byte at a time, as the table above does.

Storing the bytes the other way round, `12 34 56 78`, has a name too, **big endian**. It is not what
this machine does, and it is worth knowing the word because a memory dump is unreadable until you
know which of the two you are looking at.

## The size is in the instruction's name

The instruction's own name says how many bytes it moves. A load of fewer than four also has to
decide what to put in the bits above what it read, and it has two choices: fill them with zeroes, or
**sign extend**, which means copying the top bit of the loaded value into all of them. Sign
extending is what keeps a negative number negative when it moves into a bigger box, since a byte
holding -1 is `FF` and a word holding -1 is `FFFFFFFF`.

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

Only the loads come in signed and unsigned pairs. A store is handed 32 bits and writes some of them,
so there is nothing above it to fill in and no decision to make.

```mips|playground|memory
.data
room:   .space 8

.text
main:
    la $t0, room
    li $t1, 0xAABBCCDD
    sw $t1, 0($t0)      # four bytes at room
    li $t2, 0x11
    sb $t2, 4($t0)      # one byte, four along
    li $t3, 0x2233
    sh $t3, 6($t0)      # two bytes, six along
    lw $t4, 4($t0)      # and read those three back as one word
```

The eight bytes at `0x10010000` come out as `DD CC BB AA 11 00 33 22`. Byte five is the `11`, byte
six was never written and is still `00`, and the `33 22` at the end is the half you stored.

`$t4` is the interesting one. It reads `22330011`, because the `lw` picked up those last four bytes
as a single little endian word, and the byte you wrote first is the one at the bottom of it. Three
stores of three different sizes, read back as one value, and the arithmetic still works out.

## Alignment

A word has to start at an address that is a **multiple of 4**, and a half at a multiple of 2. A byte
can go anywhere. Break the rule and the run ends with a message naming the address:

```
store address not aligned on word boundary 0x10010003
```

A load says `fetch address` instead of `store address`, and a half says `halfword boundary`.

The assembler keeps `.word` and `.half` aligned for you: put a `.byte` in front of a `.word` and it
leaves the gap, so `.word` data is always safe. What it does **not** align is `.space` and the
strings, because those are byte data and a byte needs no alignment. So a buffer you reserve after an
odd length string starts at an odd address, and the first `sw` into it ends the run.

`.align n` is the fix: it moves the next thing up to a multiple of 2 to the `n`, so `.align 2` gives
you a multiple of 4.

```mips|playground|memory
.data
label:  .asciiz "Hi"     # three bytes, so what follows would start at 0x10010003
        .align 2         # push it up to the next multiple of four
counts: .space 8

.text
main:
    la $t0, label
    la $t1, counts
    li $t2, 42
    sw $t2, 0($t1)
    lw $t3, 0($t1)
```

`$t0` is `10010000` and `$t1` is `10010004`, the three bytes of `"Hi"` rounded up to four, and
`$t3` comes back at 42.

Delete the `.align 2` line and press Build and Run. `counts` moves to `0x10010003`, the `sw` stops
the program, and the message under the editor gives you that address. Then put it back.

Two more addresses end a run. One outside everything in the table, such as `lw $t1, 4($zero)`, says
`address out of range 0x00000004`. And a loop that never stops is simply cut off when the Playground's
two million instructions run out, with no message at all, which is what an accidental infinite loop
looks like here.

## Try these

The word at `value` is `0x12345678`. Leave its **lowest** byte in `$t0`, which is the `0x78`, and its
**highest** byte in `$t1`, which is the `0x12`, each as a number on its own with zeroes above it.

```mips|playground|memory|exercise
.data
value:  .word 0x12345678

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": "0x78", "$t1": "0x12" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
value:  .word 0x12345678

.text
main:
    la $t2, value
    lbu $t0, 0($t2)     # the lowest byte is at the lowest address
    lbu $t1, 3($t2)     # and the highest is three bytes on
```

</details>

The second one has a string of five bytes and a buffer after it, so the buffer starts at an odd
address. Make it word aligned and store `0x11223344` in its first word.

```mips|playground|memory|exercise
.data
name:   .asciiz "MIPS"
buffer: .space 8

.text
main:
    # your code here
```

```testcase
{
    "expectedMemory": [{ "type": "number-chunk", "address": "0x10010008", "bytes": 4, "expected":
["0x11223344"] }]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
name:   .asciiz "MIPS"
        .align 2
buffer: .space 8

.text
main:
    la $t0, buffer          # now at 0x10010008
    li $t1, 0x11223344
    sw $t1, 0($t0)
```

</details>
