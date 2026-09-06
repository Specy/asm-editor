We saw that memory is a large array of **bytes** and that a register holds a fixed number of bits.
Neither of them holds a number in the sense C means it: there is no `int`, no `unsigned`, no `char`,
there are only bits, and what they mean is decided by the instruction that reads them.

## Binary and hexadecimal

A **bit** is one 0 or one 1. Eight of them make a **byte**, which is 256 different patterns.
Writing a byte out in binary takes eight characters, `11001000`, which is unreadable past the third
one, so everybody writes bits in **hexadecimal** instead.

Hexadecimal counts `0` to `9` and then `A` to `F`, sixteen digits, and sixteen is two to the fourth,
so **one hex digit is exactly four bits** and one byte is exactly two hex digits. That is the whole
reason it is used: you can convert a hex digit to four bits in your head and back, which you cannot
do with decimal.

| binary | hex | decimal |
| ------ | --- | ------- |
| `0000` | `0` | 0       |
| `1001` | `9` | 9       |
| `1010` | `A` | 10      |
| `1111` | `F` | 15      |

So `11001000` is `1100` and `1000`, which is `C` and `8`, which is `$C8`, which is 200 in decimal.

Each assembly language writes the bases in its own way. M68K puts `$` in front of a hex number, `%`
in front of a binary one and `@` in front of an octal one, and a plain number is decimal, so `200`,
`$C8`, `%11001000` and `@310` are the same byte. MIPS and RISC-V use `0x` for hex, the way C does.

## Bytes, words and longs

The instructions that move and compute say how many bytes they touch. On the M68K the size is a
letter after the mnemonic:

- `.b` is a **byte**, 1 byte, 8 bits.
- `.w` is a **word**, 2 bytes, 16 bits.
- `.l` is a **long**, 4 bytes, 32 bits.

The names are the CPU's own and they do not travel: a "word" is 2 bytes on the M68K and 4 bytes on
MIPS and RISC-V, which call 2 bytes a halfword. So when you move between languages, check what that
language calls a word before you trust the name.

A size touches the low end of the register and leaves what is above it alone. Build this one and step
through it, watching `d1`, `d2` and `d3`.

```m68k|playground|no-flags
    move.l #$12345678, d0   ; the whole 32 bits of d0
    move.b d0, d1           ; the lowest byte of d0 into the lowest byte of d1
    move.w d0, d2           ; the lowest word
    move.l d0, d3           ; all four bytes
```

| register |      value | what came across |
| -------: | ---------: | ---------------- |
|     `d1` | `00000078` | one byte         |
|     `d2` | `00005678` | two bytes        |
|     `d3` | `12345678` | four bytes       |

The size selector in the registers panel's header cuts the same 32 bits up for reading. On **W** each
register is two groups of four hex digits, which is how these pages show them. Press **B** and it
becomes four groups of two, one per byte, which makes `12 34 56 78` easy to compare against `00 00
56 78`. Press **L** and it is one group of eight.

## Signed and unsigned

The bits `FFFFFFFF` are 4294967295 if you read them as an unsigned number, and -1 if you read them as
a signed one. Nothing in the register says which: the same 32 bits mean both, and the instruction
that reads them picks.

The signed reading is **two's complement**, which every CPU in this editor uses. The rule is: the
highest bit is the sign, and to negate a number you flip every bit and add 1. Flip `00000001` and you
get `11111110`, add 1 and you get `11111111`, which is -1 in one byte. Every CPU here uses it
because with two's complement one `add` instruction adds signed and unsigned numbers correctly, and
only the flags come out differently.

Build this and hover the values in the registers panel: where a register reads differently signed and
unsigned, the panel shows you both.

```m68k|playground|no-flags
    move.l #5, d0           ; x = 5
    neg.l d0                ; x = -x
    move.l #$FFFFFFFF, d1   ; every bit set
    move.l #$80000000, d2   ; only the highest bit set
```

`d0` comes out at `FFFFFFFB`, which is -5 signed and 4294967291 unsigned. `d1` is -1 or 4294967295.
`d2` is the most negative long there is, -2147483648, or 2147483648 if you read it unsigned. A signed
long runs from -2147483648 to 2147483647, an unsigned one from 0 to 4294967295, and both of them are
those same 4294967296 patterns.

## Sign extension

Copying a byte into a long has to decide what goes in the three bytes above it. `$FF` as an unsigned
byte is 255, and as a signed byte it is -1, and as a long 255 is `000000FF` while -1 is `FFFFFFFF`.

Filling the bytes above with copies of the sign bit is called **sign extension**, and it is what
turns a small signed number into the same signed number in a bigger box. The M68K does it with `ext`.

```m68k|playground|no-flags
    move.b #$FF, d0     ; the byte -1, in a register still holding zeroes above it
    ext.w d0            ; sign extend the byte to a word
    ext.l d0            ; and the word to a long
```

`d0` goes `000000FF`, then `0000FFFF`, then `FFFFFFFF`. It stayed -1 the whole way through, and would
have stayed 255 if the program had not asked for the sign to be extended. Loads have both forms in
every language for the same reason, which is why MIPS and RISC-V have `lb` next to `lbu`.

## Overflow

A byte has 256 patterns and no more, so a byte cannot hold 256. Add 1 to the largest number that fits
and the answer comes back around to the smallest.

```m68k|playground
    move.b #127, d0     ; the largest signed byte
    add.b #1, d0        ; one past it
```

`d0` comes out at `80`, which is -128. The addition was right about the bits and wrong about the
number, and the CPU noticed: it set the overflow flag `V`. Try changing the two lines to
`move.b #255, d0` and `add.b #1, d0`: `d0` comes out at `00`, `V` is 0 and the carry flag `C` is 1
instead, because 255 is the largest _unsigned_ byte and that is the wrap the carry reports.

Those flags are what the next lectures branch on, and they get one of their own.
