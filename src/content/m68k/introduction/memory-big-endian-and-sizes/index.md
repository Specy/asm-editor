Sixteen registers hold sixteen longs, and a program has more than that to keep. Everything else lives
in memory, which the M68K reaches with an address.

## The address space

An address on the M68K is **24 bits**, so it runs from `$000000` to `$FFFFFF`: 16777216 bytes, 16
megabytes. Addresses are still carried in 32 bit registers, and the top byte is ignored, which is why
`a0` can read `01000000` while the byte it points at is at `$000000`.

A byte nobody has written reads `$FF` in this editor. Open the memory panel of any program on this
page, look anywhere your program did not touch, and that is what you see: not zero, `FF`. Memory
starts as whatever it starts as, and the only bytes you can make a claim about are the ones your
program or the assembler put there.

Three regions get used, and nothing in the hardware separates them:

- **Code**, from `$1000`. That is where this editor starts assembling, and it is what the `org $1000`
  at the top of a new project says.
- **Data**, wherever the assembler happens to put it, which by default is right after the last
  instruction. `org` moves it somewhere else.
- **The stack**, from `$1000000` downwards, which is one byte past the end of memory, so the first
  push writes at `$FFFFFC`.

The instructions themselves are the one thing you cannot see in the memory panel here. The simulator
keeps the decoded program on the side and reserves **four bytes per instruction** for it, so the
addresses come out as if the code were there (which is why a label after five instructions lands
twenty bytes in), while the bytes at those addresses still read `FF`. A real 68000 encodes an
instruction in two to ten bytes and they are genuinely in memory, and a program can read them like
any other data.

## Big endian

The M68K is **big endian**: the most significant byte of a word or a long goes at the lowest address.
`$12345678` written at `$2000` is `12` at `$2000`, `34` at `$2001`, `56` at `$2002` and `78` at
`$2003`, in the order you write the number down.

Build this one with the memory panel open, type `2000` in its address box, then Run.

```m68k|playground|memory|no-flags
    move.l #$12345678, value    ; four bytes written at once
    move.b value, d0            ; the byte at value
    move.b value+1, d1          ; the one after it
    move.b value+2, d2
    move.b value+3, d3

    org $2000
value: ds.l 1
```

| address | byte | in `d0` to `d3` |
| ------- | ---- | --------------- |
| `$2000` | `12` | `d0`            |
| `$2001` | `34` | `d1`            |
| `$2002` | `56` | `d2`            |
| `$2003` | `78` | `d3`            |

`value+1` is an ordinary address written as a sum: the assembler works out `$2000 + 1` while it
assembles and puts `$2001` in the instruction. Any expression of numbers and labels can go there,
`value+4`, `$FF*2`, `end-start`.

Little endian machines store the same long as `78 56 34 12`, so a byte read from the front of it
gives `78` instead. This is the one thing that has to be re-learned when you move to MIPS or RISC-V,
and it changes nothing about a program that only ever reads and writes whole longs.

## A size decides how many bytes

`.b`, `.w` and `.l` on an instruction that touches memory say how many bytes it reads or writes: one,
two or four, starting at the address you named and going up.

```m68k|playground|memory|no-flags
    move.l #$12345678, value
    move.b value, d0    ; one byte
    move.w value, d1    ; two bytes
    move.l value, d2    ; all four
    move.w value+2, d3  ; the other word

    org $2000
value: ds.l 1
```

`d0` is `00000012`, `d1` is `00001234`, `d2` is `12345678` and `d3` is `00005678`. Every one of them
read from `$2000` or `$2002` and they came out different, because the size is part of the
instruction and nothing in memory records how wide the thing there was meant to be.

Reading into a register only writes the low end of it, the same way it does between registers: after
`move.b value, d0` the three bytes above `12` in `d0` are whatever `d0` held before.

## Odd addresses stop the program

A word or a long has to start at an **even address**. `move.w $2001, d0` is an address error on a
real 68000, and this simulator raises it too: the run ends and the message says

```
Address error: Tried to read/write to an odd memory address "8451" using non-byte operation with size "Word"
```

with the address in decimal (`8451` is `$2103`). A byte access at an odd address is fine, and so is
every instruction, because instructions are even by construction.

Odd addresses turn up on their own, because the assembler writes your data exactly where the
directives fall and pads nothing:

```m68k|playground|memory|no-flags
    nop

    org $2000
flags:   dc.b 1, 2, 3
counts:  dc.w $1234, $5678
total:   dc.l $AABBCCDD
```

| label    | address | bytes         |
| -------- | ------- | ------------- |
| `flags`  | `$2000` | `01 02 03`    |
| `counts` | `$2003` | `12 34 56 78` |
| `total`  | `$2007` | `AA BB CC DD` |

Three bytes of `flags` push `counts` to `$2003`, and a `move.w counts, d0` on that layout ends the
run. Add a fourth byte to the `dc.b` line, or move the `dc.b` after the others, and everything after
it is even again. Two habits keep this from happening: put the byte data last, and give `dc.b` an
even number of bytes.

Try adding `move.w counts, d0` under the `nop` and pressing Build and Run, so you see the message
once yourself. Then change it to `move.b counts, d0` and it runs.

## Your turn

The data block below is already at `$2000` and holds one long. Write the number `$12345678` into it,
then read back its **first byte** into `d0`, which on a big endian machine is the `$12`.

```m68k|playground|memory|exercise
* your code here

    org $2000
value: dc.l 0
```

```testcase
{
    "expectedRegisters": { "d0": "0x12" },
    "expectedMemory": [{ "type": "number-chunk", "address": "0x2000", "bytes": 1, "expected": [18, 52, 86, 120] }]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    move.l #$12345678, value    ; the whole long
    move.b value, d0            ; its first byte, which is the highest one

    org $2000
value: dc.l 0
```

</details>
