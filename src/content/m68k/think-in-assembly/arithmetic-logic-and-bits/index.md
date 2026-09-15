`add` and `sub` behave exactly as they look, in all three sizes. Multiplication and division are the
two that do not. Both of them work in words rather than longs, and a division hands you two answers
in one register, so they are worth going slowly over.

## Multiplication packs a long into a register

`mulu source, dn` reads the **low word** of `dn` and the **word** of the source, multiplies them, and
writes the 32 bit product over the whole of `dn`. `muls` is the signed pair. Two 16 bit numbers make
at most a 32 bit answer, which is why the operands are words and the answer is a long.

```m68k|playground|no-flags
    move.w #1000, d0
    move.w #300, d1
    mulu d1, d0             ; 1000 * 300

    move.l #$00010002, d2   ; the high word is ignored
    move.l #$00010003, d3
    mulu d3, d2             ; 2 * 3
```

`d0` comes out at `000493E0`, which is 300000 and needs 19 bits, so the whole register was written.
`d2` comes out at `00000006`: the `0001` in the high word of both registers took no part in it, and
`d2`'s own high word was overwritten by the product. Multiplying two full 32 bit numbers is not one
instruction on this machine; you break the numbers into words and add the partial products, the way
you multiply on paper.

## Division answers twice at once

`divu source, dn` divides the **whole long** in `dn` by the **word** of the source, and packs both
answers back into `dn`: the **quotient in the low word** and the **remainder in the high word**.
`divs` is the signed pair.

```m68k|playground
    move.l #100000, d0
    move.l #3, d1
    divu d1, d0         ; the quotient and the remainder, both at once
```

`d0` comes out at `00018235`. Press **W** in the registers panel and the two words are drawn apart:
`8235` is 33333, the quotient, and `0001` is 1, the remainder, because 3 times 33333 is 99999.
`swap d0` puts the remainder in the low word when that is the one you want.

The quotient has to fit in 16 bits. When it does not, the M68K sets `V` and **leaves the register
alone**, so the answer you get is the number you started with. Try changing `move.l #3, d1` to
`move.l #1, d1`: `d0` stays `000186A0`, which is the 100000 you put in, and `V` goes to 1. Dividing by
zero is worse: the run ends with "Division by zero" in the message under the editor.

A division whose operands came from somewhere you do not control therefore wants a `bvs` after it,
or you get the number you started with and no complaint.

## Logic and masks

`and`, `or`, `eor` and `not` work one bit position at a time, with nothing carrying between the
positions. `and` gives a 1 only where both inputs had one, `or` where either did, `eor` where exactly
one did, and `not` flips every bit. The `i` forms take a plain number: `andi.l #$FF, d0`. `eor`
insists on a data register as its **source**, so `eor.l d1, d0` is fine and `eor.l #1, d0` has to be
written `eori.l #1, d0`.

A **mask** is a number written for the pattern of its bits, and the three do the three things you can
want: `and` keeps the bits the mask has set, `or` sets them, `eor` flips them.

Putting a mask and a shift together pulls a field out of the middle of a value and puts one back in:

```m68k|playground|no-flags
    move.l #$12345678, d0
    andi.l #$0000FF00, d0   ; keep the second byte
    lsr.l #8, d0            ; slide it down to the bottom

    move.l #$00AB, d1
    move.l #$00CD, d2
    lsl.l #8, d1            ; make room for a byte under d1
    or.l d2, d1             ; and drop d2 into it
```

`d0` comes out at `00000056`, the `56` out of `12345678` on its own. `d1` comes out at `0000ABCD`,
two bytes packed into one word. That pair, mask and shift down to read, shift up and or to write, is
how every packed value on this machine is taken apart, including the `$00BBGGRR` colours the screen
tasks use.

## Shifts and rotates

Six instructions in three pairs, each with an `l` and an `r` form:

- **`lsl`, `lsr`**, logical: bits fall off one end and **zeroes** come in at the other.
- **`asl`, `asr`**, arithmetic: `asr` drags the **sign bit** along instead of feeding in zeroes, so
  it divides a signed number by a power of two. `asl` is `lsl` that also reports a change of sign
  in `V`.
- **`rol`, `ror`**, rotate: the bit that falls off one end comes back in at the other, so nothing is
  lost.

Each of them takes the count two ways, and there is a third form for memory:

- `lsl.l #4, d0` shifts by a constant, which must be **1 to 8**. `lsl.l #9, d0` is a build error
  saying the immediate must be between 1 and 8.
- `lsl.l d1, d0` shifts by whatever `d1` holds, with no such limit.
- `lsl (a0)` shifts the **word** in memory at `a0` by one place, with no size letter allowed.

```m68k|playground
    move.l #1, d0
    move.l #20, d1
    lsl.l d1, d0        ; a count from a register, so more than 8 is fine
    move.l #$FF, d2
    lsl.l #8, d2        ; the largest constant count
    move.l #-20, d3
    asr.l #2, d3        ; signed: -20 / 4
    move.l #$80000001, d4
    ror.l #1, d4        ; the bottom bit comes back at the top
```

`d3` comes out at `FFFFFFFB`, which is -5, because `asr` dragged the sign along and -20 over 4 is
still negative. `d4` is `C0000000`: the 1 at the bottom rotated round to the top and joined the 1
that was already there, so no bit was lost.

The bit that falls off the end lands in the carry flag, which is how a program reads the bits of a
number one at a time: shift, then `bcs` or `bcc`.

## One bit at a time

Four instructions take a bit number and a destination:

- **`btst`** tests the bit and changes nothing else.
- **`bset`** sets it to 1.
- **`bclr`** clears it to 0.
- **`bchg`** flips it.

All four set `Z` from the bit's **old** value, and they set it to 1 when the bit **was 0**, which is
backwards from what you expect the first time. So `btst #3, d0` followed by `bne` means "bit 3 was
set", and `beq` means "bit 3 was clear".

Bit 0 is the lowest bit. On a data register the numbers run 0 to 31; on a memory operand the target
is one byte, so they run 0 to 7.

```m68k|playground
    move.l #%1010, d0   ; 10
    bset #0, d0         ; 1011
    bclr #3, d0         ; 0011
    bchg #1, d0         ; 0001
    btst #2, d0         ; bit 2 is 0, so Z goes to 1
```

`d0` comes out at `00000001` and `Z` at 1. Step through it with the flags panel open and watch `Z`
after each of the four: it reports the bit each instruction found, not the bit it left behind.

You could do all four of those with `andi`, `ori` and `eori` and a mask you worked out yourself.
What the bit instructions add is that the bit number can be in a register: `btst d1, d0` tests
whichever bit `d1` is naming right now, and a mask written as a constant cannot move.

## Your turn

`d0` holds 1000. Divide it by 7 and then unpack the two answers into separate registers: the
quotient, 142, in `d2`, and the remainder, 6, in `d3`. Each register should hold its number on its
own with zeroes above it, so getting the values out of the two halves is most of the work.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 1000 },
    "expectedRegisters": { "d2": 142, "d3": 6 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l d0, d2
    divu #7, d2         ; d2 = remainder in the high word, quotient in the low
    move.l d2, d3
    swap d3             ; d3 has them the other way round
    andi.l #$FFFF, d2   ; keep the quotient
    andi.l #$FFFF, d3   ; keep the remainder
```

</details>

Now count bits. `d0` holds `$F0F0F0F0`; leave the number of 1 bits in it in `d1`, which comes to 16.
Shift them out one at a time and count the ones that land in the carry.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0xF0F0F0F0" },
    "expectedRegisters": { "d1": 16 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    clr.l d1            ; count = 0
    move.w #31, d2      ; 32 bits, so 31
loop:
    lsr.l #1, d0        ; the lowest bit falls into C
    bcc skip            ; if(C == 0) it was a zero
    addq.l #1, d1       ; count++
skip:
    dbra d2, loop
```

</details>
