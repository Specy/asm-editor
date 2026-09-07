Every program so far has been written in the same shape, and this is it: an M68K instruction is a
mnemonic, an optional size, and at most two operands:

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
way round. MIPS and RISC-V name all three registers (`sub t0, t1, t2`), so nothing of theirs is
overwritten unless you say so; on the M68K one of the two operands always is.

## The families

About fifty mnemonics, in eight groups. You will use the first two lines of this table for most of
what you write.

| what it does           | the instructions                                                      |
| ---------------------- | --------------------------------------------------------------------- |
| move data              | `move`, `movea`, `moveq`, `movem`, `lea`, `pea`, `exg`, `swap`, `clr` |
| arithmetic             | `add`, `sub`, `muls`, `mulu`, `divs`, `divu`, `neg`, `ext`            |
| logic                  | `and`, `or`, `eor`, `not`                                             |
| shifts and rotates     | `lsl`, `lsr`, `asl`, `asr`, `rol`, `ror`                              |
| single bits            | `btst`, `bset`, `bclr`, `bchg`                                        |
| compare and test       | `cmp`, `cmpa`, `cmpi`, `cmpm`, `tst`                                  |
| go somewhere else      | `bra`, `b<cc>`, `db<cc>`, `dbra`, `s<cc>`, `jmp`, `jsr`, `bsr`, `rts` |
| stack frames and other | `link`, `unlk`, `trap`, `nop`                                         |

The whole list, with the addressing modes and sizes each one takes and the flags it writes, is on the
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
  `moveq` takes one between -128 and 127.
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

`d1`, `d4` and `d5` come out at `000000FF`, `d2` and `d6` at `00000000`. `s<cc>` writes one byte and
leaves the rest of the register alone, which is why the answers are `FF` rather than `FFFFFFFF`. It
is how you turn a comparison into a value without a branch, the way `x = (a == b)` does in C.

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

`d0` is 16, `d1` is 8, `d2` is `00000003` and `d3` is `C0000000`. A shift drops the bit that falls
off the end, a rotate puts it back in at the other end.

## What the assembler does with all this

It turns each mnemonic into the opcode for the exact combination you wrote, and the combination
matters: `move.l d0, d1`, `move.l #5, d1` and `move.l (a0), d1` are three different encodings of one
mnemonic. It works out the expressions, replaces labels with addresses, and swaps in the `a` versions
when the destination is an address register.

What it will not do is guess. Each operand of each instruction accepts a fixed set of addressing
modes, and the documentation page of an instruction lists them: `swap` takes `Dn` and nothing else,
`lea` takes an address and `An`, `eor` needs a data register as its source. An operand outside that
set is a build error naming the line, not an instruction that quietly does something else.

## Your turn

Two instructions, no branch. The test starts `d0` and `d1` both at 7, and wants `$FF` in `d2` when
the two registers are equal.

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

The second one starts `d0` at `$00001234`. Leave `d0` multiplied by 8 in `d1`, using a shift, and
`d0` with its two words exchanged in `d2`.

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
