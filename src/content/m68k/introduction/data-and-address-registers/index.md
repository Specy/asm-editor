Getting started listed the sixteen registers of the M68K: eight data registers, `d0` to `d7`, and
eight address registers, `a0` to `a7`, all of them 32 bits wide. What separates the two banks is
which instructions accept them, and what happens when you write fewer than 32 bits into one.

## Data registers hold numbers

`d0` to `d7` are where arithmetic happens. Every instruction that computes something wants a data
register somewhere in it: `add`, `sub`, `muls`, `divu`, `and`, `or`, `eor`, `not`, `neg`, the shifts
`lsl` and `asr`, the bit instructions `btst` and `bset`, and `swap` and `ext`, which have no other
operand at all.

They also hold anything else you want to keep: a loop counter, a character, a flag of your own, the
result of a comparison. Nothing marks a data register as holding one kind of thing.

An instruction on a data register carries a size, and the size says how much of the register it
touches: `.b` the lowest byte, `.w` the lowest word, `.l` all four bytes. The bytes above the size
are left exactly as they were, which is why `move.b #$FF, d0` on a register holding `$12345678`
leaves `$123456FF`.

## Address registers hold addresses

`a0` to `a7` are what the instructions that reach memory work through. `lea` (load effective
address) writes one, and every indirect addressing mode, `(a0)`, `4(a0)`, `(a0)+`, `-(a0)`, names
one. Build this and step through it: `a0` gets the address of `total`, and `(a0)` reads the long
sitting there.

```m68k|playground|no-flags
    move.l #100, d0     ; x = 100
    lea total, a0       ; p = &total
    move.l (a0), d1     ; y = *p
    add.l d1, d0        ; x = x + y

total: dc.l 25
```

`a0` comes out at `00001010`, which is where the assembler put the `25`: four instructions of four
bytes each start at `$1000`, so the data begins sixteen bytes later. `d1` is `00000019`, which is 25,
and `d0` is `0000007D`, which is 125.

Then come the three rules. An address register is a place to keep an address, and the CPU treats it
as one, which means:

**There is no byte size.** `move.b #1, a0` does not assemble, and the assembler says so: "Byte size
not allowed for address register". Only `.w` and `.l` are accepted, because a quarter of an address
is not an address.

**A word written into an address register is sign extended into all 32 bits.** Writing `$FFFE` into
`a1` leaves `FFFFFFFE`, not `0000FFFE`. The register always holds a whole address, so the CPU fills
the top half with copies of the sign bit rather than leaving what was there.

**Writing an address register never touches the flags.** Computing an address is not computing a
number, so the `X`, `N`, `Z`, `V` and `C` bits keep saying what the last arithmetic instruction left
them saying.

```m68k|playground
    move.l #$12345678, d0   ; all four bytes of a data register
    move.b #$FF, d0         ; only the lowest byte
    move.l #$12345678, a0   ; all four bytes of an address register
    move.w #$FFFE, a1       ; a word, sign extended over the whole register
    move.w #$7FFE, a2       ; and a positive word, with zeroes above it
```

| register |      value | why                                            |
| -------: | ---------: | ---------------------------------------------- |
|     `d0` | `123456FF` | the byte write left the three bytes above it   |
|     `a0` | `12345678` | a long is copied as it is                      |
|     `a1` | `FFFFFFFE` | `$FFFE` is -2, and -2 in 32 bits is `FFFFFFFE` |
|     `a2` | `00007FFE` | `$7FFE` is positive, so the sign bit is a 0    |

Step to the end with the flags panel open and `N` is still 1, left there by the `move.b #$FF, d0` on
the second line: the three address register writes after it changed nothing.

## The assembler picks the instruction for you

The real 68000 has separate opcodes for the address register versions, and they are separate
instructions in the documentation: `movea`, `adda`, `suba`, `cmpa`. You almost never write them,
because `move.l d0, a0` is assembled as `movea.l d0, a0`, `add.w #4, a0` as `adda.w #4, a0`, and
`cmp.l a1, a0` as `cmpa.l a1, a0`. The instruction you get is decided by the destination being an
address register, and the three rules above are its rules, not `move`'s.

You can write `movea` and the rest out by hand, and it changes nothing. What is worth knowing is
that an `add.w #4, a0` in the middle of your program leaves the flags alone while the `add.w #4, d0`
next to it sets them.

## a7 is the stack pointer

`a7` is an address register like the other seven, and the CPU also uses it as the **stack pointer**:
`bsr` pushes onto it, `rts` pops off it, and `-(sp)` and `(sp)+` are the addressing modes that write
and read the stack. You can write it as `a7` or as `sp`, they are the same register.

```m68k|playground|no-flags
    move.l a7, d0       ; where the stack pointer starts
    move.l sp, d1       ; the same register under its other name
    subq.l #4, sp       ; four bytes of stack taken
    move.l a7, d2       ; a7 moved too
```

`d0` and `d1` both come out at `01000000`, which is `$1000000`, one byte past the last address of
memory: the stack starts at the very top and grows downwards. After the `subq.l #4, sp` both `sp`
and `a7` read `00FFFFFC`, and `d2` reads it too. The stack gets its own lecture, "The stack, -(sp)
and movem"; what matters here is that using `a7` for scratch work destroys wherever the return
addresses of your subroutines were.

## Which register an instruction takes

The documentation of every instruction lists the addressing modes each of its operands accepts, and
`Dn` and `An` are two different entries in that list. The ones you meet first:

- **Only a data register**: `swap`, `ext`, `muls`, `mulu`, `divs`, `divu` (as the destination), and
  `eor` as its source.
- **Only an address register**: `lea` and `movea` as their destination, `pea` and `unlk` as their
  only operand, `link` as its first.
- **Either one**: `exg`, which exchanges the full 32 bits of any two registers, and `movem`, which
  saves and restores a list of both kinds.

```m68k|playground|no-flags
    move.l #$AABBCCDD, d0
    swap d0             ; a data register only
    lea $2000, a0       ; an address register only
    move.w #6, d1
    mulu #7, d1         ; a data register only
    exg d1, a1          ; either kind, always all 32 bits
```

`swap d0` exchanges the two words of `d0`, so `AABBCCDD` becomes `CCDDAABB`. `lea $2000, a0` puts
the number `$2000` in `a0` without reading anything from memory. `mulu #7, d1` multiplies the low
word of `d1` by 7 and writes the 32 bit product over the whole register, so `d1` is `0000002A`, which
is 42. Then `exg d1, a1` swaps them, leaving 42 in `a1` and 0 in `d1`.

Try replacing `swap d0` with `swap a0` and pressing Build. The assembler refuses it, because `swap`
has one operand and that operand is `Dn`.

## Your turn

Two instructions. The test starts `d0` at `$0000FFFE`, and wants the low word of `d0` in `a0` and
the whole of `d0` in `a1`. Because a word written into an address register is sign extended, `a0`
comes out at `$FFFFFFFE` while `a1` stays `$0000FFFE`.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x0000FFFE" },
    "expectedRegisters": { "a0": "0xFFFFFFFE", "a1": "0x0000FFFE" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.w d0, a0       ; a word, sign extended into all 32 bits
    move.l d0, a1       ; the whole long, copied as it is
```

</details>
