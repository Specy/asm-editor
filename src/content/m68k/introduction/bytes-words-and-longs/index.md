Memory is bytes and a register is 32 bits, and neither of them says what the bits mean. On the M68K
two things decide that: the **size** you put on the instruction, and which of the signed or unsigned
instructions you picked.

## Five ways of writing the same number

The assembler reads four bases and a character literal, and a `#` in front means the number itself
rather than the address it names.

| written    | base                  |
| ---------- | --------------------- |
| `100`      | decimal               |
| `$64`      | hexadecimal           |
| `%1100100` | binary                |
| `@144`     | octal                 |
| `'d'`      | the ASCII code of `d` |

All five of those are 100, and the last one is 100 because ASCII gives the letter `d` the code
`$64`. A literal of more than one character is packed into as many bytes: `#'Hi'` is `$4869`, an `H`
and an `i` side by side.

An immediate can also be an expression, worked out by the assembler while it assembles, with labels
allowed inside it:

```m68k|playground|no-flags
    move.l #100, d0         ; decimal
    move.l #$64, d1         ; hexadecimal
    move.l #%1100100, d2    ; binary
    move.l #@144, d3        ; octal
    move.l #'d', d4         ; a character
    move.l #'Hi', d5        ; two characters, two bytes
    move.l #$FF*2+4, d6     ; worked out while assembling
```

`d0` to `d4` all come out at `00000064`. `d5` is `00004869` and `d6` is `00000202`, which is 514.
Nothing of the expression survives into the program: the assembler puts `514` in the instruction and
the CPU never sees the multiplication.

## The three sizes

Every instruction that moves or computes carries one of three sizes, and it says how many bytes of
the destination it writes:

- `.b`, one **byte**, 8 bits, the lowest byte of a register.
- `.w`, one **word**, 2 bytes, 16 bits, the lowest word.
- `.l`, one **long**, 4 bytes, all 32 bits.

**Leave the size off and you get a word.** That holds for `move`, `add`, `sub`, `clr`, `neg`, `not`
and `ext`, and it is the single most common way to write a bug on this machine, because a word is
what you want least often.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0
    move #$1111, d0     ; a word, so d0 keeps AABB above it
    move.l #$AABBCCDD, d1
    clr d1              ; clears the low word only
    move.l #$AABBCCDD, d2
    neg d2              ; negates the low word only
    move.l #$AABBCCDD, d3
    add #1, d3          ; adds to the low word only
```

| register |      value |
| -------: | ---------: |
|     `d0` | `AABB1111` |
|     `d1` | `AABB0000` |
|     `d2` | `AABB3323` |
|     `d3` | `AABBCCDE` |

`AABB` survived all four of them. Write `.l` on every one of those lines and the whole register
changes instead. Some instructions only accept the size their encoding can mean: `lea.l`,
`moveq.l`, `swap.w` and the word-sized multiply and divide instructions, for example. You may leave
that one suffix off. The bit instructions accept `.b` for memory or `.l` for a data register, while a
branch's `.s`/`.b`, `.w` or `.l` describes its displacement rather than an operand.

## moveq, the size that is not a size

`moveq #n, dn` takes an encoded byte between -128 and 255, sign extends it to 32 bits, and writes
**all** of `dn`. The spellings 128 through 255 have the same bit patterns as -128 through -1. It
exists because that is the common case and it fits in a shorter encoding on a real 68000.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0
    move.b #-1, d0      ; a byte, so the three bytes above it stay
    move.l #$AABBCCDD, d1
    moveq #-1, d1       ; the whole register, sign extended
    moveq #255, d2      ; another spelling of -1
    moveq #-128, d3     ; and the smallest
```

`d0` comes out at `AABBCCFF`, while `d1` and `d2` are both `FFFFFFFF`: `-1` and `255` encode the same
byte. `d3` is `FFFFFF80`. `moveq #256, d4` does not assemble because it does not fit in the encoded
byte.

## Sign extension

`$FF` in a byte is 255 read as unsigned and -1 read as signed, and the two mean different things once
that byte is copied into a long: 255 is `000000FF` and -1 is `FFFFFFFF`. **Sign extension** is
filling the bytes above with copies of the top bit, which is what keeps a signed number the same
number in a bigger box.

`ext` does it in place on a data register. `ext.w` extends the low byte into the low word, and
`ext.l` extends the low word into the whole register, so a byte becomes a long in two steps.

```m68k|playground|no-flags
    move.l #$123456F0, d0
    move.b d0, d1       ; d1 = 000000F0, the byte on its own
    ext.w d1            ; the byte's sign fills the byte above it
    ext.l d1            ; and that word's sign fills the word above it
    move.b #$7F, d2     ; a positive byte
    ext.w d2            ; so the extension is zeroes
```

`d1` goes `000000F0`, then `0000FFF0`, then `FFFFFFF0`, which is -16 the whole way. `d2` stays
`0000007F`, because `$7F` is positive and extending a positive number fills with zeroes.

Two other places do it for you. `moveq` sign extends its byte, as above, and a word written into an
address register is sign extended into all 32 bits, which is why `move.w #$FFFE, a0` leaves
`FFFFFFFE`.

## Signed or unsigned is your choice, not the register's

Nothing in a register says whether its bits are a signed or an unsigned number. `add`, `sub`, `move`
and the logic instructions do not care: the bits come out the same either way, and only the flags
differ. Where the answer really is different, the M68K gives you two instructions and you pick:

- `mulu` and `divu` read their operands as **unsigned**, `muls` and `divs` as **signed**.
- `lsr` shifts right and feeds in zeroes, `asr` shifts right and drags the sign bit along.
- The branches come in two families, `bhi`, `bls`, `bcc` and `bcs` for unsigned comparisons and
  `bgt`, `ble`, `bge` and `blt` for signed ones. They get their own lecture, "Compare and branch".

```m68k|playground|no-flags
    move.l #$0000FFFF, d0   ; 65535 unsigned, -1 signed
    move.l #3, d1
    move.l d0, d2
    mulu d1, d2             ; 65535 * 3
    move.l d0, d3
    muls d1, d3             ; -1 * 3
    move.l #-20, d4
    asr.l #2, d4            ; -20 / 4, signed
    move.l #-20, d5
    lsr.l #2, d5            ; the same bits shifted, unsigned
```

`d2` comes out at `0002FFFD`, which is 196605, and `d3` at `FFFFFFFD`, which is -3. `d4` is
`FFFFFFFB`, which is -5, and `d5` is `3FFFFFFB`, which is 1073741819. Two instructions, the same
input bits, two right answers to two different questions.

The registers panel has the same choice. The **B**, **W** and **L** buttons in its header cut each
register into bytes, words or one long, and hovering a value shows you its signed and unsigned
readings side by side.

## Your turn

The test starts `d0` at `$123456F0`. Leave the lowest byte of `d0` in `d1`, read as a signed number
and extended to a full long, so `d1` comes out at `$FFFFFFF0`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x123456F0" },
    "expectedRegisters": { "d1": "0xFFFFFFF0" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.b d0, d1       ; the byte on its own
    ext.w d1            ; sign into the byte above
    ext.l d1            ; sign into the word above
```

</details>

The second one starts `d0` at `$0000FFFF` and `d1` at `3`. Multiply them twice: leave the unsigned
product in `d2` and the signed product in `d3`. Since `$FFFF` is 65535 unsigned and -1 signed, `d2`
comes out at `$0002FFFD` and `d3` at `$FFFFFFFD`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x0000FFFF", "d1": 3 },
    "expectedRegisters": { "d2": "0x0002FFFD", "d3": "0xFFFFFFFD" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d2
    mulu d1, d2         ; 65535 * 3
    move.l d0, d3
    muls d1, d3         ; -1 * 3
```

</details>
