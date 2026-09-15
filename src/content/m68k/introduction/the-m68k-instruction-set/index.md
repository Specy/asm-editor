Every M68K instruction has the same shape: a mnemonic, an optional size, and at most two operands.

```
    mnemonic.size source, destination
```

The **destination is the operand on the right**, and it is the one that gets written. `add.l d1, d0`
leaves the sum in `d0` and `d1` untouched. `sub.l d1, d0` computes `d0 - d1`, source subtracted from
destination, which is the order you have to keep in your head, because the operand you read first is
the one taken away.

```m68k|playground|no-flags
    move.l #10, d0
    move.l #3, d1
    sub.l d1, d0        ; d0 = d0 - d1

    move.l #10, d2
    move.l #3, d3
    sub.l d2, d3        ; d3 = d3 - d2
```

`d0` comes out at 7 and `d3` at `FFFFFFF9`, which is -7: the same two numbers, subtracted the other
way round. With only two operands there is nowhere else for the answer to go, so the destination is
always destroyed. When you still need what was in it, copy it somewhere before you compute.

## The families

There are about fifty base mnemonics. Almost everything in this course is built from these:

| what it does       | the ones you will use                                                 |
| ------------------ | --------------------------------------------------------------------- |
| move data          | `move`, `moveq`, `movem`, `lea`, `pea`, `exg`, `swap`, `clr`          |
| arithmetic         | `add`, `sub`, `muls`, `mulu`, `divs`, `divu`, `neg`, `ext`            |
| logic and bits     | `and`, `or`, `eor`, `not`, `btst`, `bset`, `bclr`, `bchg`             |
| shifts and rotates | `lsl`, `lsr`, `asl`, `asr`, `rol`, `ror`                              |
| compare and test   | `cmp`, `tst`                                                          |
| go somewhere else  | `bra`, `b<cc>`, `dbra`, `db<cc>`, `s<cc>`, `jmp`, `jsr`, `bsr`, `rts` |
| the rest           | `trap`, `link`, `unlk`, `nop`                                         |

The full list, with the operands and sizes each one takes and the flags it writes, is on the
[M68K documentation pages](/documentation/m68k), and every instruction there has a program you can
run.

## The letters on the end

An M68K mnemonic is often a base name with a letter glued on, and the letter says which version you
want. Learn the five and a name you have never seen becomes readable.

- **`a`, address register.** `movea`, `adda`, `suba`, `cmpa` are the versions whose destination is an
  address register. You rarely write them, because the assembler picks them when it sees `a0` on the
  right of a `move`, `add`, `sub` or `cmp`.
- **`i`, immediate.** `addi`, `subi`, `andi`, `ori`, `eori`, `cmpi` take a plain number as their
  source. `add` takes one too, so `add.l #5, d0` and `addi.l #5, d0` are the same thing written twice.
- **`q`, quick.** `addq` and `subq` take a source between 1 and 8 and fit in a shorter encoding;
  `moveq` takes one between -128 and 255, which is the whole of one byte read either way.
- **`m`, memory.** `cmpm` compares two memory operands, which the plain `cmp` cannot.
- **`s` and `u`, signed and unsigned.** `muls` against `mulu`, `divs` against `divu`.

```m68k|playground|no-flags
    move.l #100, d0
    add.l #5, d0        ; the general one
    move.l #100, d1
    addq.l #5, d1       ; quick, source must be 1 to 8
    move.l #100, d2
    addi.l #5, d2       ; the immediate one, spelled out
    move.l #100, a0
    adda.l #5, a0       ; the address register one
```

All four registers come out at `00000069`, which is 105. Try changing `addq.l #5, d1` to
`addq.l #9, d1` and pressing Build: `addq` refuses it, because 9 does not fit in the three bits the
encoding gives the source.

## The conditions glued on

Three of those mnemonics are fourteen mnemonics each, because a **condition code** of two letters is
part of the name:

- **`b<cc> label`**, branch if the condition holds. `beq`, `bne`, `blt`, `bcc`, and so on.
- **`db<cc> dn, label`**, decrement and branch, the counted loop instruction.
- **`s<cc> destination`**, set the destination byte to `$FF` if the condition holds and `$00` if it
  does not, without branching anywhere.

The conditions are `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `hi`, `ls`, `cc`, `cs`, `pl`, `mi`, `vc`,
`vs`, and `cc` and `cs` can also be written `hs` and `lo`. `s<cc>` takes two more, `st` and `sf`,
which are always true and always false. Each one reads a combination of the flags, and they are the
subject of "The condition code register", later in this course.

```m68k|playground|no-flags
    move.l #5, d0
    cmp.l #5, d0        ; is d0 equal to 5?
    seq d1              ; d1 = $FF if it is
    sne d2              ; d2 = $FF if it is not
    move.l #3, d3
    cmp.l #5, d3        ; is d3 less than 5?
    slt d4              ; d4 = $FF if it is
    st d5               ; always $FF
    sf d6               ; always $00
```

`s<cc>` writes one byte and leaves the rest of the register alone, which is why the answers come out
as `FF` and not `FFFFFFFF`. It is how you turn the answer to a question into a value you can then
compute with, without jumping anywhere.

The shifts and rotates glue a letter on the same way, `l` for left and `r` for right: `ls<d>` is the
logical shift, `as<d>` the arithmetic one, `ro<d>` the rotate.

```m68k|playground|no-flags
    move.l #%00000001, d0
    lsl.l #4, d0        ; shift left by 4, so times 16
    move.l #%10000000, d1
    lsr.l #4, d1        ; shift right by 4, so divided by 16
    move.l #$80000001, d2
    rol.l #1, d2        ; rotate left: the top bit comes back at the bottom
    move.l #$80000001, d3
    ror.l #1, d3        ; rotate right: the bottom bit goes to the top
```

A shift drops the bit that falls off the end. A rotate puts it back in at the other end, which is
why `d2` and `d3` still have exactly two bits set between them after the rotates, and `d0` and `d1`
do not.

## What the assembler does with all this

One mnemonic is many instructions underneath. `move.l d0, d1`, `move.l #5, d1` and `move.l (a0), d1`
are three different numbers in the built program, and the assembler works out which from the operands
you wrote. It also computes the expressions, replaces labels with the addresses they turned out to
have, and swaps in the `a` versions when the destination is an address register.

What it will not do is guess. Each operand of each instruction accepts a fixed set of things, listed
on that instruction's documentation page: `swap` takes a data register and nothing else, `lea` takes
an address and an address register, `eor` needs a data register as its source. Hand one something
outside that set and you get a build error naming the line, not an instruction that quietly does
something else.

## Your turn

Two instructions and no branch anywhere. `d0` and `d1` both start at 7; put `$FF` in `d2` if they
are equal.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 7, "d1": 7 },
    "expectedRegisters": { "d2": "0xFF" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    cmp.l d1, d0        ; sets the flags from d0 - d1
    seq d2              ; d2 = $FF when they were equal
```

</details>

Now two answers from one register. `d0` starts at `$00001234`. Put `d0` multiplied by 8 into `d1`,
using a shift rather than a multiply, and `d0` with its two words exchanged into `d2`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x00001234" },
    "expectedRegisters": { "d1": "0x000091A0", "d2": "0x12340000" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d1
    lsl.l #3, d1        ; three places left is eight times
    move.l d0, d2
    swap d2             ; the two words exchanged
```

</details>
