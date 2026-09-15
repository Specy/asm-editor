Sixteen registers, and the CPU refuses half of them for any given job. `swap` will not take an
address register. `lea` will not take a data register. Get it wrong and the build fails rather than
the program, so this is a thing worth sorting out early.

The split is not arbitrary. `d0` to `d7` are for numbers and `a0` to `a7` are for addresses, and the
CPU treats a thing it believes is an address differently from a thing it believes is a number.

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
address) writes one, and every way of writing "the memory at this register", `(a0)`, `4(a0)`,
`(a0)+`, `-(a0)`, names one.

```m68k|playground|no-flags
    move.l #100, d0     ; a number in a data register
    lea total, a0       ; the address of total in an address register
    move.l (a0), d1     ; the long sitting at that address
    add.l d1, d0        ; and add it in

total: dc.l 25
```

`a0` comes out at `00001010`, which is where the assembler put the `25`. Four instructions of four
bytes each start at `$1000`, so the data begins sixteen bytes later. The `25` was never in the
instruction: `lea` fetched an address and `move.l (a0), d1` went and got what was at it.

Then come three rules, all of them consequences of the CPU believing that what is in there is an
address.

**There is no byte size.** `move.b #1, a0` does not assemble, and the assembler says so: "Byte size
not allowed for address register". Only `.w` and `.l` are accepted, because a quarter of an address
is not an address.

**A word written into an address register is copied up into all 32 bits.** The top bit of the word
you wrote is repeated across the whole upper half, so `$FFFE`, whose top bit is a 1, leaves
`FFFFFFFE` and not `0000FFFE`. This is called **sign extension**, and "Bytes, words and longs"
explains the arithmetic behind it. The reason it happens here is that the register always holds a
whole address, so the CPU has to decide what goes above the word and copying the top bit is the
choice that keeps the number's value the same.

**Writing an address register never touches the flags.** Working out an address is not computing a
number, so `X`, `N`, `Z`, `V` and `C` keep saying whatever the last arithmetic instruction left them
saying.

```m68k|playground
    move.l #$12345678, d0   ; all four bytes of a data register
    move.b #$FF, d0         ; only the lowest byte
    move.l #$12345678, a0   ; all four bytes of an address register
    move.w #$FFFE, a1       ; a word, copied up over the whole register
    move.w #$7FFE, a2       ; and a word whose top bit is a 0
```

| register |      value | why                                             |
| -------: | ---------: | ----------------------------------------------- |
|     `d0` | `123456FF` | the byte write left the three bytes above it    |
|     `a0` | `12345678` | a long is copied as it is                       |
|     `a1` | `FFFFFFFE` | the top bit of `$FFFE` is 1, so ones fill above |
|     `a2` | `00007FFE` | the top bit of `$7FFE` is 0, so zeroes do       |

Step to the end with the flags panel open. `N` is still 1, left there by the `move.b #$FF, d0` on
the second line, and the three address register writes after it changed nothing.

## movea, adda and the rest

That last rule catches people, so it is worth knowing where it comes from. `move.l d0, a0` is not
actually a `move`. The 68000 has a separate instruction for writing an address register, called
`movea`, and the assembler quietly picks it for you the moment it sees an address register on the
right. The same goes for `add.w #4, a0`, which becomes `adda.w #4, a0`, and `cmp.l a1, a0`, which
becomes `cmpa.l a1, a0`.

You can write `movea`, `adda`, `suba` and `cmpa` out by hand and it changes nothing. What is worth
carrying away is that an `add.w #4, a0` in the middle of your program leaves the flags alone while
the `add.w #4, d0` next to it sets them, and that is because they are not the same instruction at
all.

## a7 is the stack pointer

`a7` is an address register like the other seven, and the CPU also uses it as the **stack pointer**:
`bsr` pushes onto it, `rts` pops off it, and `-(sp)` and `(sp)+` are the two forms that write and
read the stack. You can write it as `a7` or as `sp`, they are the same register.

```m68k|playground|no-flags
    move.l a7, d0       ; where the stack pointer starts
    move.l sp, d1       ; the same register under its other name
    subq.l #4, sp       ; four bytes of stack taken
    move.l a7, d2       ; a7 moved too
```

`d0` and `d1` both come out at `01000000`, one byte past the last address of memory: the stack
starts at the very top and grows downwards. After the `subq.l #4, sp` both names read `00FFFFFC`,
because there was only ever one register.

That makes `a7` the one register you should not treat as scratch space. Whatever your subroutines
left on the stack is found through it, so a stray `move.l #0, a7` loses the lot. The stack gets its
own lecture, "The stack, -(sp) and movem".

## Which register an instruction takes

Each instruction accepts one kind, or the other, or both. The ones you meet first:

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
word of `d1` by 7 and writes the product over the whole register. Then `exg d1, a1` swaps those two
registers, which is the one instruction here that does not care which bank you hand it.

Replace `swap d0` with `swap a0` and press Build. The assembler refuses it, and the message names
the operand it wanted.

## Your turn

`d0` starts out holding `$0000FFFE`. Put its low word into `a0` and the whole of it into `a1`, in
two instructions.

The two answers differ, which is the point: `a0` comes out at `$FFFFFFFE` and `a1` at `$0000FFFE`.

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
    move.w d0, a0       ; a word, copied up into all 32 bits
    move.l d0, a1       ; the whole long, copied as it is
```

</details>
