`cmp.l #5, d0` subtracts 5 from `d0` and throws the answer away. The instruction after it has to
decide something on the strength of that, and the answer is gone. What is left is five bits, set
aside as the subtraction went past, and every decision a program makes is made out of those five
bits.

They live together in the low byte of the status register, which is called the **condition code
register**, or CCR, and the flags panel above the registers shows them in the M68K's own order:

- **X**, extend. A second copy of the carry. It is there so that arithmetic on numbers wider than 32
  bits can carry from one register into the next, and this assembler has no instructions that do
  that, so nothing you write here will ever read it.
- **N**, negative. The top bit of the result, which is 1 when the result read as a signed number is
  negative.
- **Z**, zero. 1 when the result was zero.
- **V**, overflow. 1 when the answer did not fit in the **signed** range of its size.
- **C**, carry. 1 when the operation carried or borrowed out of the top bit, which is the
  **unsigned** answer to the same question.

## Which instructions write the flags

Not every instruction touches them, and that is the part that catches people out. Four things can
happen to a flag: it is set from the result, it is forced to 0, it is forced to 1, or it is left
exactly as it was.

| instruction                                                      |   X |   N |   Z |   V |   C |
| ---------------------------------------------------------------- | --: | --: | --: | --: | --: |
| `add`, `sub`, `addq`, `subq`, `neg`, `asl`, `asr`, `lsl`, `lsr`  |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |
| `cmp`, `cmpi`, `cmpa`, `cmpm`                                    |   - |   ✓ |   ✓ |   ✓ |   ✓ |
| `move`, `moveq`, `and`, `or`, `eor`, `not`, `tst`, `ext`, `swap` |   - |   ✓ |   ✓ |   0 |   0 |
| `lea`, `pea`, `movea`, `adda`, `suba`, `movem`, `exg`, `link`    |   - |   - |   - |   - |   - |

✓ means set from the result, `0` means forced to zero, `-` means left exactly as it was. The other
instructions are on the [documentation pages](/documentation/m68k), one line each.

Two of those rows change how you write programs. The third one says that **a plain `move` sets the
flags**, so a `move` slipped in between your comparison and your branch quietly destroys the
comparison. The last one says that `lea`, `movea` and `adda` do not, so you can work out an address
in the middle of a comparison and the branch still sees what `cmp` left.

```m68k|playground|pc
    move.l #$F0, d1     ; N = 0, Z = 0
    move.l #0, d0       ; Z goes to 1, because 0 is zero
    lea $2000, a0       ; nothing changes
    movea.l #$1234, a1  ; nothing changes
    adda.l #4, a1       ; nothing changes
    btst #4, d1         ; bit 4 of $F0 is 1, so Z goes back to 0
```

Step through it with the flags panel open. `Z` goes to 1 on the second line and then sits there
through three instructions that all write address registers, which is the point: those three lines
could be anything and the comparison would survive them.

## cmp subtracts and keeps only the flags

`cmp source, destination` computes `destination - source`, throws the answer away, and keeps what it
did to `N`, `Z`, `V` and `C`.

```m68k|playground
    move.l #5, d0
    cmp.l #5, d0        ; 5 - 5 = 0
    move.l #3, d1
    cmp.l #5, d1        ; 3 - 5 = -2
    move.l #7, d2
    cmp.l #5, d2        ; 7 - 5 = 2
```

| after this line | `N` | `Z` | `V` | `C` |
| --------------- | --: | --: | --: | --: |
| `cmp.l #5, d0`  |   0 |   1 |   0 |   0 |
| `cmp.l #5, d1`  |   1 |   0 |   0 |   1 |
| `cmp.l #5, d2`  |   0 |   0 |   0 |   0 |

The middle row is the interesting one. 3 minus 5 is -2, which is negative, so `N` is 1. Read the same
subtraction as unsigned and 3 is smaller than 5, so it had to borrow, which is what `C` reports. One
subtraction, two bits, each answering a different question about it. Every condition below is built
out of that.

## The fourteen conditions

`b<cc>`, `db<cc>` and `s<cc>` all read the flags through the same fourteen conditions. Six of them
ask about a single flag, four ask the signed question and four the unsigned one.

| written    | means                        | the flags it reads                |
| ---------- | ---------------------------- | --------------------------------- |
| `eq`       | equal                        | `Z` is 1                          |
| `ne`       | not equal                    | `Z` is 0                          |
| `mi`       | minus                        | `N` is 1                          |
| `pl`       | plus                         | `N` is 0                          |
| `vs`       | overflow set                 | `V` is 1                          |
| `vc`       | overflow clear               | `V` is 0                          |
| `gt`       | greater than, **signed**     | `Z` is 0 and `N` equals `V`       |
| `ge`       | greater or equal, **signed** | `N` equals `V`                    |
| `lt`       | less than, **signed**        | `N` differs from `V`              |
| `le`       | less or equal, **signed**    | `Z` is 1, or `N` differs from `V` |
| `hi`       | higher, **unsigned**         | `C` is 0 and `Z` is 0             |
| `hs`, `cc` | higher or same, unsigned     | `C` is 0                          |
| `lo`, `cs` | lower, unsigned              | `C` is 1                          |
| `ls`       | lower or same, unsigned      | `C` is 1 or `Z` is 1              |

`hs` and `cc` are two spellings of one condition, and so are `lo` and `cs`: `bcc` is the same
instruction as `bhs`, and you write whichever says what you mean, "carry clear" when you are thinking
about a carry and "higher or same" when you are comparing two unsigned numbers.

Notice that the unsigned conditions read `C` on its own, while every signed one drags `V` in
alongside `N`. That is not decoration, and the next section is why.

## When N lies

`N` is the top bit of the result, and the top bit of a signed number is its sign. Usually those are
the same thing. Once the answer is too big to fit, they are not.

Subtract -1000000000 from 2000000000. The true answer is 3000000000, and the largest number a signed
long can hold is 2147483647, so it does not fit. Step through this one line at a time with the flags
panel open.

```m68k|playground
    move.l #$77359400, d0   ; 2000000000
    move.l #$C4653600, d1   ; -1000000000
    cmp.l d1, d0            ; d0 - d1
    smi d2                  ; was the result negative?
    svs d3                  ; did it overflow?
    sgt d4                  ; is d0 the greater of the two, signed?
```

After the `cmp`:

| flag | value | what it is saying                                      |
| ---- | ----: | ------------------------------------------------------ |
| `N`  |     1 | the result's top bit is a 1, so the result is negative |
| `Z`  |     0 | the result is not zero                                 |
| `V`  |     1 | the answer did not fit in a signed long                |
| `C`  |     1 | read as unsigned, the subtraction had to borrow        |

**`N` is the one that is lying.** A big positive number minus a negative number cannot possibly be
negative. What actually happened is that the true answer, 3000000000, needs 32 bits with the top one
set, so the subtraction produced the pattern `B2D05E00`. Read that as unsigned and it is exactly
3000000000, which is right. Read it as signed and the top bit turns it into -1294967296, which is
not. The bits are correct and the reading of them is not.

**`V` is the flag that says so.** It is set precisely when the sign the result ends up with is not
the sign the arithmetic should have produced.

So the fix is to read the two together. When `V` is 0 the result fits and `N` is telling the truth.
When `V` is 1 the result wrapped and `N` is inverted, so the true sign is the opposite of what `N`
says. Both cases are covered by one test: **the answer was negative when `N` and `V` differ**. That
is the `lt` row of the table, and `ge` and `gt` are the same trick the other way up.

You can see it work in the last line. `d2` and `d3` both come out at `FF`, `N` and `V` both being
set, and `sgt` agrees with them and gives `FF` too, because `gt` asked whether `N` equals `V` rather
than whether `N` is 0. The condition got the right answer out of a flag that had the wrong one in it.

## Picking the wrong family

The other way to get this wrong is to answer the right question with the wrong reading. `$FFFFFFFF`
is 4294967295 read as unsigned and -1 read as signed. Compared against 1, one of those is bigger and
the other is smaller, so `hi` and `gt` disagree about the same two registers.

```m68k|playground
    move.l #$FFFFFFFF, d0   ; 4294967295 unsigned, -1 signed
    move.l #1, d1
    cmp.l d1, d0            ; d0 - d1
    shi d2                  ; is d0 higher than d1, unsigned?
    sgt d3                  ; is d0 greater than d1, signed?
```

This time `N` is 1, `Z` is 0, `V` is 0 and `C` is 0. Nothing overflowed and no flag is lying. `hi`
wants `C` and `Z` both 0, which they are, so `d2` is `FF`. `gt` wants `N` to equal `V`, which it does
not, so `d3` is `00`.

One comparison, two right answers, and picking the family that matches what your numbers mean is on
you. Sizes and addresses are unsigned; counts and differences are usually signed.

## Your turn

`d0` starts at `$FFFFFFFF` and `d1` at 1, the pair from just above. Without branching anywhere, leave
`$FF` in `d2` if `d0` is the higher of the two read as **unsigned** numbers, and `$00` in `d3` if
`d0` is not the greater read as **signed** numbers.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0xFFFFFFFF", "d1": 1 },
    "expectedRegisters": { "d2": "0xFF", "d3": "0x00" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    cmp.l d1, d0        ; d0 - d1, flags only
    shi d2              ; unsigned: higher
    sgt d3              ; signed: greater
```

</details>

Now one where the answer does not fit. `d0` holds `$77359400`, which is 2000000000, and `d1` holds
`$C4653600`, which is -1000000000. Compare
them and record two things: `$FF` in `d2` if the subtraction overflowed, and `$FF` in `d3` if `d0` is
the greater of the two read as signed numbers.

Both come out `$FF`, and the pair of them together is the whole point of the section above: the
comparison was still right even though the result was not.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": "0x77359400", "d1": "0xC4653600" },
    "expectedRegisters": { "d2": "0xFF", "d3": "0xFF" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    cmp.l d1, d0        ; d0 - d1, which is too big to fit
    svs d2              ; V is set
    sgt d3              ; and gt is right anyway
```

</details>
