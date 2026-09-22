# The Z80 instruction set

The Z80 has many instruction forms, but they are not hundreds of unrelated ideas. An instruction
usually combines a familiar operation with particular places for its values. For example, both
`ld a, b` and `ld a, 5` are forms of `ld`: one copies a byte from `b`, while the other puts the
constant 5 in `a`.

You do not need to memorise the whole instruction set. This page gives you a way to read an
instruction and its bytes, then introduces one useful instruction that copies a run of memory.
The [instruction reference](/documentation/z80/instruction) is the place to look up the forms that
are allowed for a particular mnemonic.

## Mnemonics, operands, and forms

The readable name at the beginning of an instruction is its **mnemonic**. The values or places after
it are its **operands**. In this line, `ld` is the mnemonic; `a` and `5` are operands:

```z80
    ld a, 5
```

The operands say which form of the instruction you mean. They can name a register, a pair, a
constant written in the source, or a memory location such as `(hl)`. Parentheses still mean the
byte in memory at the address held in `hl`.

`ld` has many useful forms, but it does not copy every kind of value to every possible destination.
For example, the forms below are all valid and have different jobs:

```z80
    ld a, 5          ; put a constant in a
    ld b, a          ; copy a into b
    ld a, (hl)       ; read a byte from memory
    ld (hl), a       ; write a byte to memory
    ld hl, 0x9000    ; put a two-byte value in a pair
```

An assembler turns each complete instruction form into its **encoding**: the bytes the CPU reads
from memory. The mnemonic and operands are for us; the encoding is for the CPU.

## Instructions as bytes

Instructions can take from one to four bytes. Often the first byte identifies the operation, and
extra bytes hold a number or address used by that operation. Build this program and look at memory
from `8000`:

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, 5          ; 3E 05
    ld hl, 0x1234    ; 21 34 12
    ld (hl), a       ; 77
    add a, 1         ; C6 01
    halt             ; 76
```

The bytes are grouped by source line:

```text
3E 05 | 21 34 12 | 77 | C6 01 | 76
```

`ld a, 5` needs two bytes: one says which `ld` form to perform, and one holds 5. `ld hl, 0x1234`
needs three. Its last two bytes are `34 12`, because a two-byte value in Z80 memory is little
endian: the low byte comes first. `halt` needs only its one encoding byte, `76`.

The Z80 also has **prefix bytes**. A prefix is an extra first byte that tells the CPU to read the
following byte from a different table of instruction meanings. You can see one in the encoding for
`ldir`, introduced below: it is `ED B0`. The `ED` prefix changes how the CPU reads `B0`. Prefixes
are part of why the Z80 can have more instruction forms than one byte can name.

## A map of the instruction set

The instruction set is easier to approach as families. You already know examples from the first two
rows. Use the table as a map: it groups instructions by the kind of work they do.

| Family | Main purpose | Examples you know |
| --- | --- | --- |
| load and exchange | put values in registers or memory; swap register sets | `ld`, `exx` |
| arithmetic | add, subtract, or change a value by one | `add`, `sub`, `inc`, `dec` |
| logic and bits | work with individual bits in a byte | — |
| control flow | choose which instruction runs next or repeat work | — |
| block operations | work through a sequence of memory bytes | `ldir` below |
| stack and subroutines | keep return information and reusable pieces of code | — |
| input, output, and CPU control | communicate with hardware or control the CPU | `halt` |

Many rows contain several related forms. The important habit is to read an instruction's operands,
then check the reference when you need an exact form or encoding.

## Copy a block with `ldir`

`ldir` is a two-byte instruction (`ED B0`) for copying a sequence of bytes forwards in memory. It
uses three pairs with fixed roles:

- `hl` holds the address of the next source byte.
- `de` holds the address where the next copy goes.
- `bc` holds the number of bytes still to copy.

For each byte, `ldir` copies the byte at `(hl)` to `(de)`, increases both addresses by one, and
decreases `bc` by one. It keeps doing that until `bc` is zero. Start it with a positive count. When
it finishes, `hl` and `de` point one byte past the copied ranges, and `bc` is zero.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, source   ; address to read
    ld de, dest     ; address to write
    ld bc, 4        ; number of bytes
    ldir
    halt

source: .db 0xAA, 0xBB, 0xCC, 0xDD
dest:   .ds 4
```

In this program, `source` is at `0x800C` and `dest` is at `0x8010`. After Run, the four bytes at
`0x8010` through `0x8013` are `AA BB CC DD`. The original four bytes remain at `source`:
`ldir` copies them; it does not move them.

## Try it yourself

An exercise can supply a starting state before your code runs. Here the runner puts addresses in
`hl` and `de`, puts 5 in `bc`, and places five bytes at the source address. It then runs your code
until `halt` and checks the destination bytes. Copy all five bytes with one instruction.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "startingRegisters": { "hl": "0x9000", "de": "0x9010", "bc": 5 },
    "startingMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": [1, 2, 3, 4, 5] }
    ],
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9010", "bytes": 1, "expected": [1, 2, 3, 4, 5] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ldir
    halt
```

</details>
