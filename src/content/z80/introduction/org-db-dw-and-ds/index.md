Every program so far started with `.org 0x8000` and put its data after the `halt`. Let's now go
through the directives that decide where things land. A **directive** is a line addressed to the
assembler, and none of them is an instruction the Z80 executes.

There is no data section here. MIPS and RISC-V make you write `.data` and `.text` and the assembler
puts each in a region of its own; the Z80 assembler lays bytes down **in the order you wrote them**,
and where they end up is entirely `.org`'s business.

## org

`.org address` says "the next byte goes here". Everything after it is laid out from that address
upwards until the next `.org`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld a, (byte1)       ; a = the byte at byte1
    ld hl, (word1)      ; hl = the word at word1
    ld de, text         ; de = the address of text
    halt

    .org 0x9000
byte1:  .db 0x2A
word1:  .dw 0x1234
text:   .asciz "Hi!"
list:   .db 1, 2, 3
```

Type `9000` into the memory panel's address box and press Run. `a` comes out at `2A`, `hl` at `1234`
and `de` at `9003`, the address `text` stands for. The bytes at `0x9000` read
`2A 34 12 48 69 21 00 01 02 03`, which is the four directives in order with nothing between them.

The program has two blocks now, one at `0x8000` and one at `0x9000`, and the run still starts at the
lowest address with code in it. `.org` can move backwards as well as forwards, which most assemblers
refuse, and a second `.org` at a lower address does not change where the program starts.

Writing the code first and the data at a `.org` of its own is the layout these pages use, because it
keeps a program readable when the data grows. The other two layouts you will see are data after the
`halt`, which the earlier lectures used, and data at the top with a `jp` over it, which is what a
program does when its data has to sit at a known address.

## db, the byte directive

`.db` writes bytes where the line is. It takes a list, and each item can be a number, a character or
a string:

```
values: .db 1, 2, 3          ; three bytes
mask:   .db 0b10000000       ; one byte, written in binary
greet:  .db "Hi", 0          ; three bytes: 48 69 00
letter: .db 'A'              ; one byte, 41
mixed:  .db "Line", 10, 0    ; a string, a newline and a terminator
```

`.asciz "Hi"` is `.db "Hi", 0`: it puts the zero terminator on for you, which is the convention C
strings use and the one every string in this course uses.

This assembler accepts `defb`, `db`, `.db`, `.byte`, `defm`, `dm`, `.dm`, `.text` and `.ascii` as
spellings of the same directive, because it grew out of several older ones. These pages write `.db`
and `.asciz`.

## dw, the word directive

`.dw` writes 16 bit values, low byte first, which is the little endian order from the memory lecture.
`.dw 0x1234` puts `34 12` in memory, and `ld hl, (word1)` reads them back as `0x1234`.

A label is a 16 bit value, so `.dw label` writes an address, which is how you build a table of
pointers. The synonyms are `defw`, `dw`, `.dw` and `.word`.

## ds, the reservation directive

`.ds count` reserves `count` bytes and writes nothing into them, which is a buffer or an uninitialised
array. `.ds count, value` reserves them and fills every one with `value`.

```z80|playground|memory|no-flags
    .org 0x8000
    ld hl, buffer
    ld (hl), 0x11       ; buffer[0] = 0x11
    inc hl
    ld (hl), 0x22       ; buffer[1] = 0x22
    halt

    .org 0x9000
buffer: .ds 4           ; four bytes, nothing written into them
filled: .ds 3, 0xEE     ; three bytes, all 0xEE
marker: .db 0xFF
```

Before you run it, `buffer` reads `00 00 00 00` and `filled` reads `EE EE EE`, and `marker` sits
right after them at `0x9007`. Afterwards the first two bytes of `buffer` hold the values the program
wrote. `.ds` moved the address along without putting anything in memory, which is why `marker` is
where it is.

The spellings are `defs`, `ds`, `.ds`, `.block` and a couple more.

## equ, the name for a number

`equ` gives a number a name at assembly time, and the name costs nothing at run time: the assembler
writes the number into the instruction and there is no memory anywhere holding it.

```z80|playground|no-flags
ROWS    equ 4
COLS    equ 5
CELLS   equ ROWS * COLS      ; arithmetic on names is allowed
NEWLINE equ 10

    .org 0x8000
    ld a, CELLS         ; 20, worked out by the assembler
    ld b, NEWLINE
    ld hl, CELLS * 2    ; and again, in the instruction
    halt
```

`a` comes out at `14`, which is 20, `b` at `0A` and `hl` at `0028`, which is 40. `*`, `+` and `-` all
work on a name that was already defined. `=` and `.equ` are the same directive under other names.

The two things `equ` is for: a number that appears in more than one place, like the size of an array,
and a number whose meaning would otherwise be invisible, like a field offset or a port number. Both
of them turn a change in one line into a change everywhere.

```z80|playground|memory|no-flags
X       equ 0           ; the field offsets of a three byte record
Y       equ 1
LIVES   equ 2

    .org 0x8000
    ld ix, player
    ld a, (ix+LIVES)    ; a = player->lives
    ld b, (ix+X)        ; b = player->x
    halt

    .org 0x9000
player: .db 10, 20, 3
```

`a` comes out at `03` and `b` at `0A`. Try adding a fourth field, `SCORE equ 3`, a fourth byte to the
record and a `ld c, (ix+SCORE)`: nothing else on the page has to change.

## Where the program starts

Building a program points the program counter at the **lowest address any code was assembled to**,
which for everything here is `0x8000`. The `end` directive overrides that: `end label` says start at
`label` instead, which is how you put a block of data first and still begin at the code.

```z80|playground|no-flags
    .org 0x8000
skipped:
    ld a, 99            ; never runs
begin:
    ld b, 7
    halt
    end begin           ; start here instead of at the top
```

`a` comes out at `00` and `b` at `07`. Take the `end begin` line away and `a` comes out at `63`,
which is 99, because the program then starts at the top like everything else.

Most programs do not need it. `jp start` at the top of the file does the same job in three bytes and
one obvious line, and that is what the Example programs of this course use.

## Your turn

Lay out three bytes at `0x9000` holding the 16 bit number `0x1234` and then the byte `0x56`, and
leave that `0x56` in `a`. The data is your `.dw` and `.db`, and the code is one `ld` and the `halt`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0x56" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": ["0x34", "0x12", "0x56"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld a, (0x9002)      ; the byte after the word
    halt

    .org 0x9000
    .dw 0x1234
    .db 0x56
```

</details>

The second one is a record of three bytes at `0x9000`, holding 10, 20 and 3. Give the three field
offsets names with `equ`, point `ix` at the record and leave the third field, the 3, in `a`.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": 3 },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x9000", "bytes": 1, "expected": [10, 20, 3] }
    ]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
X       equ 0
Y       equ 1
LIVES   equ 2

    .org 0x8000
    ld ix, player
    ld a, (ix+LIVES)
    halt

    .org 0x9000
player: .db 10, 20, 3
```

</details>
