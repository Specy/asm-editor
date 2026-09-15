Memory is bytes and a register is 32 bits, and neither of them says what the bits mean. On the M68K
two things decide that: the **size** you put on the instruction, and which of the signed or unsigned
instructions you picked.

Before either of those makes sense, it is worth being certain about what a bit pattern actually is,
and where a negative number can possibly hide in one.

## Binary, and why hex is shorthand for it

A bit is a 0 or a 1. A byte is eight of them in a row, and each place is worth twice the one to its
right, so the byte `01100100` is 64 + 32 + 4, which is 100.

The assembler lets you write a number in binary with a `%` in front, and that is occasionally what
you want, when the number is a pattern of switches rather than a quantity. Most of the time it is
too long to read. `%01100100` and `$64` are the same byte, and the second one is four characters.

The reason hex is the shorthand and not, say, decimal, is that **four bits make exactly one hex
digit**:

| four bits | `0000` | `0001` | `0010` | `0011` | `0100` | `0101` | `0110` | `0111` |
| --------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| hex       | `0`    | `1`    | `2`    | `3`    | `4`    | `5`    | `6`    | `7`    |

| four bits | `1000` | `1001` | `1010` | `1011` | `1100` | `1101` | `1110` | `1111` |
| --------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| hex       | `8`    | `9`    | `A`    | `B`    | `C`    | `D`    | `E`    | `F`    |

So converting runs one digit at a time and never carries. `%01100100` splits into `0110` and `0100`,
which are `6` and `4`, giving `$64`. Going back, `$F0` is `1111` then `0000`, which is `%11110000`.
A byte is two hex digits, a word is four, a long is eight, always.

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

An immediate, meaning a number written into the instruction itself rather than fetched from
anywhere, can also be an expression, worked out by the assembler while it assembles, with labels
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

`d0` to `d4` all come out at `00000064`, and `d5` at `00004869`. Nothing of the expression on the
last line survives into the program: the assembler puts `514` in the instruction and the CPU never
sees the multiplication.

## Where negative numbers come from

A byte is eight bits, so there are 256 patterns and no more. Read them as plain binary and they are
the numbers 0 to 255. There is nowhere left over to put a minus sign, and no bit in there is doing
anything but counting.

So negative numbers cannot be added to the machine. They have to be found inside the patterns that
are already there. Here is where they are.

Take the byte `$FF`, all eight bits on, and add 1 to it:

```
  11111111
+ 00000001
-----------
 100000000
```

Nine bits came out, and a byte only holds eight. The one on the left falls off the end and is gone,
leaving `00000000`. Adding 1 to `$FF` gave zero.

Now: what number, added to 1, gives zero? Only -1 does. The pattern `$FF` behaves in every way like
-1, so that is what it is. Add 2 to `11111110` and you get zero the same way, so `$FE` is -2. Keep
going down and you keep finding negatives, one per pattern, until after 128 steps you reach
`10000000`, which is -128.

That is the whole of **two's complement**. It is not a rule someone imposed; it is where the
counting lands once you accept that a byte wraps round.

| bits       | as unsigned | as signed |
| ---------- | ----------: | --------: |
| `00000000` |           0 |         0 |
| `00000001` |           1 |         1 |
| `01111111` |         127 |       127 |
| `10000000` |         128 |      -128 |
| `11111110` |         254 |        -2 |
| `11111111` |         255 |        -1 |

Look at the left column and you can see why people say **the top bit means negative**. Every pattern
counting up from zero has a 0 there, and every pattern counting down from zero has a 1 there, and
the changeover is exactly halfway through. The top bit is not a minus sign that was bolted on. It is
where the two counts happen to meet.

This all works the same at any width, because every width wraps. A long is 32 bits, so the
all-ones pattern is `$FFFFFFFF`, and adding 1 to it pushes a thirty-third bit off the end and leaves
zero. **`FFFFFFFF` is -1**, and you will see it in the registers panel constantly.

| size          | read as unsigned | read as signed            |
| ------------- | ---------------- | ------------------------- |
| byte, 8 bits  | 0 to 255         | -128 to 127               |
| word, 16 bits | 0 to 65535       | -32768 to 32767           |
| long, 32 bits | 0 to 4294967295  | -2147483648 to 2147483647 |

To negate a number by hand: **flip every bit, then add 1**. 5 is `00000101`, flipped is `11111010`,
plus one is `11111011`, which is `$FB`. Check it by adding `$FB` and 5 and watching the byte wrap to
zero. The CPU has `neg` for this and `not` for the flip on its own.

```m68k|playground|no-flags
    move.b #$FF, d0     ; eight ones in the low byte
    addq.b #1, d0       ; and it wraps to zero, which is what -1 does
    move.b #5, d1
    neg.b d1            ; flip the bits and add one
    move.l #1, d2
    neg.l d2            ; the same thing across all 32 bits
```

`d1` comes out with `FB` in its low byte, the pattern worked out above, and `d2` at `FFFFFFFF`.

### Why this means comparisons come in two flavours

Put `$FF` and `$01` side by side and ask which is bigger.

Read as unsigned they are 255 and 1, so the first one is bigger. Read as signed they are -1 and 1,
so the first one is smaller. Both answers are correct. The bits do not choose between them, and the
CPU has no way of knowing which you meant, because you never told it.

That is why there are two sets of conditions to branch on, one for each reading, and why choosing
the wrong one gives you a program that is wrong only sometimes. "The condition code register" is
where they are laid out.

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
changes instead.

A few instructions accept only the one size their encoding can express, and you may leave that
suffix off: `lea.l`, `moveq.l`, `swap.w`, and the multiply and divide instructions, which are always
word sized.

## moveq, the size that is not a size

`moveq #n, dn` takes a number between -128 and 255, extends it to 32 bits, and writes **all** of
`dn`. It exists because small constants are the common case and it fits in a shorter instruction.

The interesting part is that the spellings 128 to 255 land on the same patterns as -128 to -1, for
the reason the table above gives: `255` and `-1` are the same byte, so they arrive at the same
register.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0
    move.b #-1, d0      ; a byte, so the three bytes above it stay
    move.l #$AABBCCDD, d1
    moveq #-1, d1       ; the whole register
    moveq #255, d2      ; another spelling of -1
    moveq #-128, d3     ; and the smallest
```

`d1` and `d2` both come out at `FFFFFFFF`, from two different-looking source lines. `d3` is
`FFFFFF80`. `moveq #256, d4` does not assemble, because 256 does not fit in a byte at all.

## Sign extension

`$FF` in a byte is 255 unsigned and -1 signed, and once that byte is copied into a long the two part
company: 255 is `000000FF` and -1 is `FFFFFFFF`. Copying the eight bits and leaving zeroes above
them is right for one reading and wrong for the other.

**Sign extension** is filling the space above with copies of the top bit. It is what keeps a signed
number the same number in a bigger box, and you can see why from the wrapping argument: -1 in a byte
is all ones, and -1 in a long is all ones, so widening it means adding more ones.

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

`d1` goes `000000F0`, then `0000FFF0`, then `FFFFFFF0`, and it is -16 at every step. `d2` stays
`0000007F`, because the top bit of `$7F` is a 0 and extending it fills with zeroes.

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

`d2` comes out at `0002FFFD`, which is 196605, and `d3` at `FFFFFFFD`, which is -3. Both
multiplications were handed identical bits. `d4` is `FFFFFFFB`, which is -5, while `d5` is
`3FFFFFFB`, over a billion, because `lsr` fed a zero into the top and destroyed the sign.

The registers panel has the same choice. The **B**, **W** and **L** buttons in its header cut each
register into bytes, words or one long, and hovering a value shows you its signed and unsigned
readings side by side.

## Your turn

`d0` starts at `$123456F0`. Take its lowest byte on its own, read that byte as a signed number, and
leave it in `d1` as a full 32 bit long. Since `$F0` has its top bit set, `d1` should end at
`$FFFFFFF0`.

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

Next, the same bits multiplied twice. `d0` holds `$0000FFFF` and `d1` holds 3. Leave the unsigned
product in `d2` and the signed product in `d3`, and they will not match: `$0002FFFD` against
`$FFFFFFFD`.

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

One last one, by hand. `d0` holds 5. Leave -5 in `d1` **without using `neg`**: flip every bit of it
and add 1, which is the recipe the section above worked out. The answer is `$FFFFFFFB`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 5 },
    "expectedRegisters": { "d1": "0xFFFFFFFB" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d1
    not.l d1            ; every bit flipped
    addq.l #1, d1       ; and one added
```

</details>
