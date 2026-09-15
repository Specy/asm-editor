Seven registers hold seven bytes, and a program has more than seven bytes to keep. Everything else
lives in the 64 KB, and almost all of it is arranged in one of three shapes: a run of values of the
same size, a run of characters, or a small bundle of different things that belong together. This
lecture is those three, and the code for each of them is shorter than you would expect.

## An array is a run of bytes

An array is values of the same size laid end to end, and element number `i` is at the address of the
first one plus
`i` times the size of an element. Assembly has exactly that without the brackets: a pointer in `hl`,
and `inc hl` to move it on.

```z80|playground|memory
    .org 0x8000
    ld hl, numbers  ; hl = the start of the array
    ld b, 6         ; six of them
    ld a, 1         ; v = 1
loop:
    ld (hl), a      ; write v where hl points
    inc hl          ; on to the next byte
    inc a           ; v++
    djnz loop
    halt

    .org 0x9000
numbers: .ds 6      ; six bytes, nothing written into them
```

Type `9000` into the memory panel and press Run. The six bytes go from `00 00 00 00 00 00` to
`01 02 03 04 05 06`, and `hl` ends at `9006`, one past the last one it wrote. They start at zero
because `.ds` reserved the room and put nothing in it.

The `inc hl` is where the size of an element lives, and it is entirely your responsibility. Nothing
in `(hl)` knows how wide the thing it just read was. An array of bytes steps by 1; an array of 16 bit
words steps by 2, which is two `inc hl`. Get it wrong and the walk reads the second half of one
element and the first half of the next, and nothing complains.

## Indexing by a register

Walking is one thing, reaching straight for `numbers[i]` with `i` in a register is another, and the
addressing lecture said why: the Z80 has no base plus index mode. The index is widened into a pair
and added.

Elements bigger than a byte need the index **scaled** first, by the size of an element. For 16 bit
words that is a doubling, which `add hl, hl` does in one instruction. Both are here, an array of
bytes and an array of words:

```z80|playground|memory
    .org 0x8000
    ld a, 2         ; i = 2
    ld l, a
    ld h, 0         ; hl = i, widened, since an index is not negative
    ld de, numbers
    add hl, de      ; hl = numbers + i
    ld a, (hl)      ; x = numbers[i]

    ld a, 2         ; and the same index into an array of words
    ld l, a
    ld h, 0
    add hl, hl      ; i * 2, because a word is two bytes
    ld de, words
    add hl, de      ; hl = words + i * 2
    ld c, (hl)      ; the low byte
    inc hl
    ld b, (hl)      ; the high byte, so bc = words[i]
    halt

    .org 0x9000
numbers: .db 10, 20, 30, 40
words:   .dw 100, 200, 300, 400
```

That is four instructions of address
arithmetic for one read, which is why a program that touches every element walks a pointer instead,
and only computes an address when it has to jump straight to one.

The two loads at the end are the little endian order from the memory lecture: the low byte is the one
at the lower address, so it goes into `c`.

## Strings

A string is an array of bytes holding character codes, and nothing marks a byte as a letter. `'H'` is
the number 72, or `0x48`, which is what ASCII assigns to that letter, and the same byte is 72 to
every instruction that reads it.

Nothing records how long a string is either, so the convention says where it ends: a byte of zero
after the last character, which is what C does and what `.asciz` writes for you.

| address    | byte | as a character |
| ---------- | ---- | -------------- |
| `text`     | `68` | `h`            |
| `text + 1` | `69` | `i`            |
| `text + 2` | `20` | a space        |
| `text + 3` | `7A` | `z`            |
| `text + 4` | `21` | `!`            |
| `text + 5` | `00` | the terminator |

So every loop over a string is "read a byte, is it zero, if not do the work and step on", and a string
of five characters takes six bytes.

```z80|playground|memory
    .org 0x8000
    ld hl, text     ; hl = the start of the string
loop:
    ld a, (hl)      ; the byte hl points at
    or a            ; is it the terminator?
    jr z, done
    cp 'a'          ; below 'a', so leave it alone
    jr c, next
    cp 'z' + 1      ; above 'z', so leave it alone
    jr nc, next
    sub 32          ; 'a' - 'A' is 32, so this is toupper
    ld (hl), a      ; write it back where hl points
next:
    inc hl          ; on to the next byte
    jr loop
done:
    halt

    .org 0x9000
text:   .asciz "hi z!"
```

Press the text button in the memory panel's corner and the bytes are drawn as characters. Before the
run `0x9000` reads `hi z!` and afterwards it reads `HI Z!`, with the space and the exclamation mark
untouched because neither is between `a` and `z`.

`cp 'z' + 1` is the assembler doing the arithmetic: `'z'` is 122, so the instruction that ends up in
memory compares against 123, and `jr nc` is "greater or equal to 123", which is "greater than `z`".

## Records, and ix

A **record** is a small bundle of values that belong together, laid out at fixed distances from a
starting point: a player's x, then their y, then their lives, three bytes in a row. `ix` and the
`(ix+dd)` mode were made for exactly this. Park `ix` at the start of the bundle and reach each field
by a name defined with `equ`, and nothing in the code has to mention a raw offset.

Stepping through an **array of records** means adding the record's size to `ix`, and since the
displacement in the instruction is a constant, that addition is `add ix, de` with the size in `de`.

```z80|playground|memory
X       equ 0           ; a player is three bytes
Y       equ 1
LIVES   equ 2
SIZE    equ 3

    .org 0x8000
    ld ix, players      ; ix = the first record
    ld b, 3             ; three of them
    ld a, 0             ; total = 0
loop:
    add a, (ix+Y)       ; add this record's y
    ld de, SIZE
    add ix, de          ; on to the next record, three bytes along
    djnz loop
    halt

    .org 0x9000
players:
    .db 1, 10, 0
    .db 2, 20, 0
    .db 3, 30, 0
```

`a` comes out at `3C`, which is 60, the three `y` fields added up. `ix` ends at `9009`, one record
past the last one.

Changing the layout is now one place: add a `SCORE equ 3`, change `SIZE` to 4, and give each record a
fourth byte. Nothing else in the loop moves.

## The block instructions

Copying and searching are common enough that the Z80 does each in one instruction, using `hl` for the
source, `de` for the destination and `bc` for the count.

```z80|playground|memory
    .org 0x8000
    ld hl, source
    ld de, dest
    ld bc, 6
    ldir            ; copy six bytes forwards

    ld hl, source
    ld bc, 6
    ld a, 30
    cpir            ; search forwards for the byte in a
    halt

    .org 0x9000
source: .db 10, 20, 30, 40, 50, 60
dest:   .ds 6
```

After the `ldir` the six bytes appear at `dest`. After the `cpir`, `hl` holds `9003`, which is **one
past** the byte that matched, and `Z` is 1 to say it was found; a `cpir` that runs out of bytes
leaves `Z` at 0. The address of the match is `hl` minus 1, so a program that wants it writes
`dec hl` next.

`lddr` is the same copy going backwards, from the last byte to the first, and it is the one to use
when the two blocks **overlap and the destination is higher**. Copying `0x9000` to `0x9001` forwards
would read a byte the copy has already overwritten; going backwards reads each byte before anything
lands on it.

## Two walks to write

Find the largest of the six bytes at `numbers` and leave it in `a`. They are unsigned, the largest is
90, and a `cp (hl)` next to a `jr` is the comparison.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt

    .org 0x9000
numbers: .db 10, 90, 30, 40, 50, 60
```

```testcase
{
    "expectedRegisters": { "a": 90 }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, numbers  ; hl = the start of the array
    ld b, 6
    ld a, 0         ; best = 0, since every byte is at least that
loop:
    cp (hl)         ; best minus the byte hl points at
    jr nc, next     ; not bigger, so keep the one we have
    ld a, (hl)      ; otherwise this one is the new best
next:
    inc hl
    djnz loop
    halt

    .org 0x9000
numbers: .db 10, 90, 30, 40, 50, 60
```

</details>

The second one copies a string. `text` holds `hello` and `copy` has room for six bytes: copy the five
characters and the zero after them into `copy`, in one instruction.

```z80|playground|exercise|memory
    .org 0x8000
    ; your code here
    halt

    .org 0x9000
text:   .asciz "hello"
copy:   .ds 6
```

```testcase
{
    "expectedMemory": [{ "type": "string-chunk", "address": "0x9006", "expected": "hello" }]
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution|memory
    .org 0x8000
    ld hl, text     ; from
    ld de, copy     ; to
    ld bc, 6        ; five characters and the terminator
    ldir
    halt

    .org 0x9000
text:   .asciz "hello"
copy:   .ds 6
```

</details>
