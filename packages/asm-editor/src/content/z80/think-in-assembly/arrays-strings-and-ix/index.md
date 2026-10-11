# Arrays, strings and `ix`

Code and data share the Z80's 64 KB address space. Three common ways to lay out **data** in that space
are an array of equal-sized values, a zero-terminated string, and a record whose fields have different
jobs. In each case, the CPU still sees only bytes at addresses.

## An array is a run of equal-sized values

An **array** puts values of the same size next to one another. A byte array advances one address per
element. Put the address of the current element in `hl`; `(hl)` is that byte, and `inc hl` moves to
the next one.

```z80|playground|memory
    .org 0x8000
    ld hl, numbers ; address of the first byte
    ld b, 6 ; six bytes to fill
    ld a, 1 ; value to write
fill:
    ld (hl), a ; write at the current address
    inc hl ; next byte in the array
    inc a
    djnz fill
    halt

        .org 0x9000

numbers: .ds 6 ; reserve six bytes; this directive writes no bytes
```

In this editor, fresh memory is displayed as `00`, so the six reserved locations look like zeroes
before the run. That is a property of the fresh emulator memory, not something `.ds` wrote. After
the run they contain `01 02 03 04 05 06`, and `hl` is `9006`: one byte past the last location used.

The pointer step must match the element size. For an array of 16-bit words, each element occupies two
adjacent bytes, so a pointer walk needs two `inc hl` instructions per element. `(hl)` itself does not
know what kind of value the byte belongs to.

## Reaching one element by its number

Sometimes the program has an element number in a register and needs its address directly. The Z80 has
no instruction that combines an array address and a register index, so build the address yourself.
For a byte array, widen an unsigned index from `a` into `hl`, then add the array's starting address.

```z80|playground|memory
    .org 0x8000
    ld a, 2 ; choose the third byte: index 2
    ld l, a
    ld h, 0 ; hl = 2, the widened unsigned index
    ld de, numbers
    add hl, de ; hl = address of the chosen byte
    ld a, (hl) ; a = 30
    halt

        .org 0x9000

numbers: .db 10, 20, 30, 40
```

For an array of words, first scale the index by two because every word occupies two bytes. `add hl, hl`
doubles `hl`. The low byte of the chosen word is at the resulting address, and the high byte is one
address later because Z80 words in memory are little endian.

```z80|playground|memory
    .org 0x8000
    ld a, 2
    ld l, a
    ld h, 0 ; hl = index
    add hl, hl ; hl = index times 2
    ld de, words
    add hl, de ; address of the third word
    ld c, (hl) ; low byte
    inc hl
    ld b, (hl) ; high byte, so bc = 300
    halt

        .org 0x9000

words: .dw 100, 200, 300, 400
```

When code uses every element in order, a pointer walk is usually simpler. Address calculation is for
the occasions when the program genuinely needs one particular element.

## Strings end with a zero byte

A **string** is a byte array whose bytes are character codes. A zero-terminated string uses a zero byte
to mark the end of the text. `.asciz "hi"` defines exactly three bytes: the bytes for `h` and `i`,
followed by a zero byte. The zero is the **terminator**; it is not a character in the text.

| address    | byte in hex | as a character |
| ---------- | ----------- | -------------- |
| `text`     | `0x68`      | `h`            |
| `text + 1` | `0x69`      | `i`            |
| `text + 2` | `0x20`      | a space        |
| `text + 3` | `0x7A`      | `z`            |
| `text + 4` | `0x21`      | `!`            |
| `text + 5` | `0x00`      | the terminator |

A string loop reads a byte, tests it for zero, and only processes a nonzero byte. This one changes
lowercase ASCII letters to uppercase in place. The label `make_uppercase` names the part that performs
that change.

```z80|playground|memory
    .org 0x8000
    ld hl, text
next_character:
    ld a, (hl)
    or a
    jr z, done ; zero ends the string
    cp 'a'
    jr c, keep_character
    cp 'z' + 1
    jr nc, keep_character
make_uppercase:
    sub 32 ; ASCII 'a' is 32 above 'A'
    ld (hl), a
keep_character:
    inc hl
    jr next_character
done:
    halt

        .org 0x9000

text: .asciz "hi z!"
```

After the run, the text reads `HI Z!`. The space and `!` remain unchanged because they are outside
the ASCII range from `a` through `z`. `cp 'z' + 1` compares with 123, so `jr nc` takes the path that
keeps a byte when it is greater than `z`.

## Records and `ix`

A **record** is a small fixed layout for values with different meanings. Say a player has an x position,
a y position, and a number of lives. If `ix` holds the record's first address, the Z80 can read a byte
at a fixed signed offset from it:

```z80
    ld ix, player
    ld a, (ix+1) ; read the byte one address after player: its y position
```

The `+1` is written in the instruction, not held in a register. The offset can be from -128 through
127, which is plenty for a small record. Give field offsets names with `equ` so that the program says
which field it uses.

```z80|playground|memory
X equ 0
Y equ 1
LIVES equ 2
SIZE equ 3

        .org 0x8000
        ld ix, players  ; first record
        ld b, 3         ; three player records
        ld a, 0         ; running total of y positions

sum_y:
    add a, (ix+Y)
    ld de, SIZE
    add ix, de ; first address of the next record
    djnz sum_y
    halt

        .org 0x9000

players:
    .db 1, 10, 0
    .db 2, 20, 0
    .db 3, 30, 0
```

`a` finishes at `0x3C`, or 60. `equ` keeps the field offsets used by code in one named place. If the
layout changes, update those names and `SIZE`; the actual record definitions must also gain, remove,
or reorder their bytes to match the new layout. In the loop, `ld de, SIZE` and `add ix, de` advance
`ix` by one record size.

## Practice: a string walk and a record walk

`text` is a zero-terminated string. Count its characters, excluding the terminator, and leave the
count in `b`. Use `hl` to walk the string.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt

        .org 0x9000

text: .asciz "z80!"
```

```testcase
{
    "expectedRegisters": { "bc": "0x0400" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, text
    ld b, 0
next_character:
    ld a, (hl)
    or a
    jr z, done
    inc b
    inc hl
    jr next_character
done:
    halt

        .org 0x9000

text: .asciz "z80!"
```

</details>

Each record below has an x byte followed by a y byte. Leave the sum of the three y values, 60, in
`a`. Put the first record's address in `ix`, use `Y` for the field, and move `ix` by `SIZE` after each
record.

```z80|playground|exercise|memory
X equ 0
Y equ 1
SIZE equ 2

        .org 0x8000
        ; your code here
        halt

        .org 0x9000

points:
    .db 4, 10
    .db 5, 20
    .db 6, 30
```

```testcase
{
    "expectedRegisters": { "a": 60, "bc": "0x0000", "ix": "0x9006" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
X equ 0
Y equ 1
SIZE equ 2

        .org 0x8000
        ld ix, points
        ld b, 3
        ld a, 0

sum_y:
    add a, (ix+Y)
    ld de, SIZE
    add ix, de
    djnz sum_y
    halt

        .org 0x9000

points:
    .db 4, 10
    .db 5, 20
    .db 6, 30
```

</details>
