A CPU has between eight and thirty two registers, and a program usually has more to keep than that.
Everything else lives in memory, which we saw is one large array of bytes, and the program reaches it
with the indirect and indexed modes: an address in a register, and the CPU goes and reads what is
there.

## Telling the assembler to put something there

Data does not appear in memory by itself, a **directive** puts it there while the program is being
assembled. The M68K's are short:

- `dc` **defines a constant**: it writes the values you list into memory, right where the line is. `dc.b`, `dc.w` and `dc.l` write bytes, words and longs.
- `ds` **defines storage**: it reserves room for a number of them and writes nothing. `ds.l 6` is six longs of space, and what is in them is whatever was there before.
- `equ` gives a number a name, and `org` says at which address what follows it goes.

So `numbers: dc.w 4, 8, 15` puts three words in memory and calls the address of the first one
`numbers`, and `buffer: ds.b 64` reserves 64 bytes and calls the first one `buffer`.

## An array

An array in C is a run of elements of the same size, one after another, and `a[i]` is the address of
`a[0]` plus `i` times the size of an element. Assembly has exactly the same thing without the
brackets: you keep the address of an element in a register and move it along by the size.

This one reserves six longs and writes 0 to 5 into them. Build it, type `1020` in the memory panel's
address box, then Run.

```m68k|playground|memory|no-flags
    lea numbers, a0     ; p = &numbers[0]
    move.l #0, d0       ; i = 0
fill:
    move.l d0, (a0)     ; *p = i
    add.l #4, a0        ; p++, which on a long is four bytes further on
    add.l #1, d0        ; i++
    cmp.l #6, d0        ; while(i < 6)
    blt fill

    org $1020           ; put what follows at 0x1020
numbers: ds.l 6         ; room for six longs, nothing written into them
```

Before you run it the six longs read `FFFFFFFF`, which is what untouched M68K memory reads as, and
that is the point of `ds`: it reserved the room and wrote nothing. Afterwards:

|  address | value      |
| -------: | ---------- |
| `0x1020` | `00000000` |
| `0x1024` | `00000001` |
| `0x1028` | `00000002` |
| `0x102C` | `00000003` |
| `0x1030` | `00000004` |
| `0x1034` | `00000005` |

`a0` ends at `00001038`, four bytes past the last one, which is how the loop knew it had moved six
times: it counted with `d0` instead of comparing addresses. The `add.l #4, a0` is the `p++` of C
written out, because C hides the size of what a pointer points at and assembly does not.

## A string

A string is an array of bytes holding character codes. To the CPU `'H'` is the number 72, or `$48`,
which is what ASCII assigns to that letter, and nothing anywhere marks that byte as a letter rather
than a number.

Nothing records how long a string is either, so something has to say where it ends, and the
convention C uses is a byte of 0 after the last character. `message: dc.b 'Hi!', 0` puts four bytes
in memory:

| address       | byte | as a character |
| ------------- | ---- | -------------- |
| `message`     | `48` | `H`            |
| `message + 1` | `69` | `i`            |
| `message + 2` | `21` | `!`            |
| `message + 3` | `00` | the terminator |

Which is why counting the characters of a string is a loop that reads bytes until it reads a zero,
and why a string of three letters takes four bytes.

## The same thing in RISC-V

RISC-V and MIPS put their data in a `.data` section, and the directives are dotted words instead of
`dc` and `ds`:

- `.byte`, `.half` and `.word` write 1, 2 and 4 byte values, the way `dc.b`, `dc.w` and `dc.l` do.
- `.string` writes a string with a 0 after it (`.ascii` writes one without).
- `.space` reserves that many bytes, like `ds.b`.

This one counts the characters of `message` and stores the answer in `length`. Build it and Run: the
memory panel already starts at `0x10010000`, which is where the data section begins.

```riscv|playground|memory
.data
message:    .string "Hi!"
length:     .word 0
numbers:    .word 10, 20, 30
flags:      .byte 1, 2, 3
buffer:     .space 8

.text
main:
    la t0, message      # p = message
    li t1, 0            # n = 0
count:
    lb t2, 0(t0)        # c = *p
    beqz t2, done       # if(c == 0) goto done
    addi t0, t0, 1      # p++
    addi t1, t1, 1      # n++
    j count
done:
    la t3, length
    sw t1, 0(t3)        # length = n
```

`t1` comes out at 3 and memory looks like this:

| address      | bytes         | what it is                             |
| ------------ | ------------- | -------------------------------------- |
| `0x10010000` | `48 69 21 00` | `message`, the same four bytes         |
| `0x10010004` | `03 00 00 00` | `length`, the 3 the program just wrote |
| `0x10010008` | `0A 00 00 00` | `numbers[0]`, which is 10              |
| `0x1001000C` | `14 00 00 00` | `numbers[1]`, which is 20              |
| `0x10010010` | `1E 00 00 00` | `numbers[2]`, which is 30              |
| `0x10010014` | `01 02 03`    | `flags`, three single bytes            |
| `0x10010017` | `00 00 ...`   | `buffer`, eight bytes nobody wrote     |

The words are written backwards because RISC-V is **little endian**: the word 10 is `0000000A` and
its lowest byte, `0A`, sits at the lowest address. The M68K array above is stored the other way
round, `00 00 00 01` for the 1, because the M68K is big endian, which is why that table could show
each long as one number and this one has to show bytes. The bytes of `message` come out the same in
both, since each of them is a byte on its own and there is nothing to reverse.

Press the text button in the memory panel's corner and the bytes are drawn as characters instead of
hexadecimal, so `message` reads `Hi!` and the words next to it read as nonsense, which is a fair
picture of what memory is: bytes, and whatever you decided they mean.

Try changing `.string "Hi!"` to `.string "Hello"` and running again. `length` comes out at 5, and
everything after the string has moved: `"Hello"` takes six bytes, so `length` is at `0x10010008` and
`numbers[0]` at `0x1001000C`. Nothing in the program had to change, because it asked the assembler
for those addresses by name.
