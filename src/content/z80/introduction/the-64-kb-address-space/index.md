A Z80 address is 16 bits, so there are 65536 of them, `0x0000` to `0xFFFF`. That is 64 KB, and it is
the whole of it: no more memory can be attached, no bank of registers extends it, and every byte your
program will ever touch is in that one array.

The number that matters is the match between the two. A pair is 16 bits and an address is 16 bits, so
**any pair can point at any byte**, and there is no such thing on this machine as an address that
does not fit in a register. It is also why the pairs exist at all.

## Where things go

Nothing in the hardware divides the 64 KB into sections. What the addresses mean is a convention, and
this is the one these pages use:

| addresses               | what is there                                                   |
| ----------------------- | --------------------------------------------------------------- |
| `0x0000`-`0x0038`       | the reset and `rst` entry points of a real Z80                  |
| `0x0066`                | the non maskable interrupt entry point of a real Z80            |
| `0x8000` upwards        | your program, because `.org 0x8000` puts it there               |
| downwards from `0xFFFF` | the stack, which `sp` starts at the top of and which grows down |

The low addresses are spoken for by the CPU itself. `rst 0x18` is a one byte call to address `0x18`,
there are eight of those, and on power up the Z80 starts executing at `0x0000`, so a real machine put
ROM down there. Nothing here stops you writing to `0x0000`, and `.org 0x8000` keeps your program out
of the way of the convention anyway.

The stack comes down from the other end, which is what `sp` starting at `0xFFFF` means. Your code
grows upwards from `0x8000` and the stack grows downwards from `0xFFFF`, and they meet in the middle
if a program is careless, which the stack lecture comes back to.

## Reading and writing

Four shapes cover the whole of it, and they were in the registers lecture:

- `ld a, (hl)` and `ld (hl), a` go through a pointer in a pair, and `(hl)` works for any 8 bit
  register while `(bc)` and `(de)` work only for `a`.
- `ld a, (0x9000)` and `ld (0x9000), a` name a fixed address, and only `a` can.
- `ld hl, (0x9000)` and `ld (0x9000), hl` move two bytes at a time, and every pair can, `sp` and the
  index registers included.
- `ld (ix+2), 7` writes through an index register with a displacement.

Build this one, type `9000` into the memory panel's address box, and press Run.

```z80|playground|memory
    .org 0x8000
    ld hl, 0x1234
    ld (0x9000), hl     ; two bytes at 0x9000
    ld a, 0x56
    ld (0x9002), a      ; one byte after them
    ld de, (0x9000)     ; and both back into de
    halt
```

| address  | byte |
| -------- | ---- |
| `0x9000` | `34` |
| `0x9001` | `12` |
| `0x9002` | `56` |

`de` comes out at `1234`, the same number that went in.

## Little endian

Look at those first two bytes again. The number was `0x1234` and memory holds `34 12`: **the low byte
goes at the lower address**. That is little endian, the same order MIPS and RISC-V use and the
opposite of the M68K's.

It is not a decision the program can change, and it decides what the two halves of an address mean.
`ld a, (0x9001)` reads the byte after the `34`, which is `12`, the _high_ byte of the number stored
there. So going one byte up in memory means going eight bits up in the value, and getting that
backwards is how a table of 16 bit entries comes out reading nonsense.

```z80|playground|memory
    .org 0x8000
    ld hl, 0xBEEF
    ld (value), hl
    ld a, (value)       ; the low byte
    ld b, a
    ld a, (value + 1)   ; the high byte
    halt
value:  .ds 2
```

`b` comes out at `EF` and `a` at `BE`. Try swapping the two reads round and see the two registers
trade values.

There is **no alignment rule**. A 16 bit value can start at an odd address, and `ld hl, (0x9001)`
reads two bytes from there with no penalty and no error. The M68K stops a program that reads a word
from an odd address, and MIPS and RISC-V do the same for a misaligned word; the Z80 was designed
around 8 bit memory and simply reads two bytes in a row.

## Your program is in there too

The memory panel starts at `0x8000`, which is where your program is, and that is not a coincidence:
**the assembled instructions are bytes in the same array as everything else**. Build this one without
running it and look at the panel.

```z80|playground|memory
    .org 0x8000
start:
    ld a, (start)   ; the first byte of this very program
    ld b, a
    halt
```

The panel shows `3A 00 80 47 76`. `3A` is the opcode for `ld a, (nnnn)`, the `00 80` after it is the
address `0x8000` written little endian, `47` is `ld b, a` and `76` is `halt`. Now press Run: `a` and
`b` both come out at `3A`, because the program read its own first byte and there is nothing about it
that says "instruction" rather than "data".

That is the whole of what "code is just data" means, and on the Z80 you can watch it happen. It also
says why a program that runs off the end of its own code keeps going: the bytes after it are zeroes,
`00` is the opcode for `nop`, and the CPU would execute nops all the way to `0xFFFF` and wrap round.
This editor stops the run at the end of your code instead, which is the "running off the end"
termination from the first lecture.

Try changing `ld a, (start)` to `ld a, (start + 3)` and running again. `a` comes out at `47`, the
`ld b, a` that follows.

## Untouched memory

Every byte this editor has not written reads `00`. On the M68K untouched memory reads `FF`, so a
program moved between the two courses sees a different blank, and neither of them is a promise: a
real machine's RAM holds whatever the last program left there, and reading a byte you never wrote is
a bug in either case.

## Your turn

Write the 16 bit number `0xBEEF` to address `0x9000`, then read the byte at `0x9001` back into `a`.
Little endian decides what that byte is.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0xBE" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0xEF", "0xBE"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, 0xBEEF
    ld (0x9000), hl     ; EF at 0x9000, BE at 0x9001
    ld a, (0x9001)      ; the high byte
    halt
```

</details>

The second one starts with three bytes at `0x9000`, `0x11`, `0x22` and `0x33`. Copy them to `0x9010`
in the same order, using `hl` for the source and `de` for the destination. Nothing here needs a loop,
three copies written out will do, and `ld (de), a` is how a byte gets written through `de`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x11", "0x22", "0x33"] }
    ],
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9010", "bytes": 1, "expected": ["0x11", "0x22", "0x33"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, 0x9000       ; src = 0x9000
    ld de, 0x9010       ; dst = 0x9010
    ld a, (hl)          ; *dst = *src, three times
    ld (de), a
    inc hl
    inc de
    ld a, (hl)
    ld (de), a
    inc hl
    inc de
    ld a, (hl)
    ld (de), a
    halt
```

</details>
