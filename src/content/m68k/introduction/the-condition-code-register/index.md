The M68K keeps five bits about how the last instruction came out, and they live together in the low
byte of the status register, which is called the **condition code register**, or CCR. The flags panel
above the registers shows them in the M68K's own order:

- **X**, extend. A second copy of the carry, kept for multi precision arithmetic.
- **N**, negative. The top bit of the result, 1 when the result read as a signed number is negative.
- **Z**, zero. 1 when the result was zero.
- **V**, overflow. 1 when the result did not fit in the **signed** range of its size.
- **C**, carry. 1 when the operation carried or borrowed out of the top bit, which is the
  **unsigned** answer to the same question.

## Which instructions write which flags

An instruction does not touch all five. Four things can happen to a flag: it is set from the result,
it is forced to 0 or to 1, or it is left exactly as it was.

| instruction                                                                         |   X |   N |   Z |   V |   C |
| ----------------------------------------------------------------------------------- | --: | --: | --: | --: | --: |
| `add`, `sub`, `addq`, `subq`, `addi`, `subi`, `neg`, `asl`, `asr`                   |   ✓ |   ✓ |   ✓ |   ✓ |   ✓ |
| `cmp`, `cmpi`, `cmpa`, `cmpm`                                                       |   - |   ✓ |   ✓ |   ✓ |   ✓ |
| `move`, `moveq`, `and`, `or`, `eor`, `not`, `tst`, `ext`, `swap`, `muls`, `mulu`    |   - |   ✓ |   ✓ |   0 |   0 |
| `divs`, `divu`                                                                      |   - |   ✓ |   ✓ |   ✓ |   0 |
| `lsl`, `lsr`                                                                        |   ✓ |   ✓ |   ✓ |   0 |   ✓ |
| `rol`, `ror`                                                                        |   - |   ✓ |   ✓ |   0 |   ✓ |
| `btst`, `bset`, `bclr`, `bchg`                                                      |   - |   - |   ✓ |   - |   - |
| `clr`                                                                               |   - |   0 |   1 |   0 |   0 |
| `lea`, `pea`, `movea`, `adda`, `suba`, `movem`, `exg`, `link`, `unlk`, the branches |   - |   - |   - |   - |   - |

✓ means set from the result, `0` and `1` mean forced to that value, and `-` means left exactly as
it was.

Two rows of that table decide how a program is written. The third one says that **a plain `move` sets
the flags**, so a `move` between your comparison and your branch destroys the comparison. The last
one says that `lea`, `movea` and `adda` do not, so you can work out an address in the middle of a
comparison and the branch still sees what `cmp` left.

```m68k|playground|pc
    move.l #$F0, d1     ; N = 0, Z = 0
    move.l #0, d0       ; Z goes to 1, because 0 is zero
    lea $2000, a0       ; nothing changes
    movea.l #$1234, a1  ; nothing changes
    adda.l #4, a1       ; nothing changes
    btst #4, d1         ; bit 4 of $F0 is 1, so Z goes back to 0
```

Step through it with the flags panel open. `Z` goes to 1 on the second line and stays 1 through three
instructions that write two address registers, then the `btst` moves it and leaves `N`, `V` and `C`
where they were.

## cmp subtracts and keeps only the flags

`cmp source, destination` computes `destination - source`, throws the answer away, and keeps what it
did to `N`, `Z`, `V` and `C`. It leaves `X` alone, which is the one difference from writing the
`sub` out.

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

The second one is the interesting row. 3 minus 5 is -2, which is negative, so `N` is 1; and as an
unsigned subtraction it had to borrow, which is what `C` reports. The same two bits, read as the
answers to two different questions, are what the two families of conditions below are built out of.

## The fourteen conditions

`b<cc>`, `db<cc>` and `s<cc>` all read the flags through the same fourteen conditions. Six of them
ask about one flag, four ask the signed question and four the unsigned one.

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
instruction as `bhs`, and you write whichever one says what you mean, "carry clear" when you are
thinking about a carry and "higher or same" when you are comparing two unsigned numbers.

The signed conditions read `N` and `V` together, because a signed comparison that overflowed has a
negative flag that lies: subtract a large negative number from a large positive one and the answer
wraps round to negative while the true answer is positive. `V` is the bit that says so, and "`N`
equals `V`" is the corrected answer.

## Picking the wrong family

`$FFFFFFFF` is 4294967295 unsigned and -1 signed. Compared against 1, one of those is bigger and the
other is smaller, so `hi` and `gt` disagree about the same two registers.

```m68k|playground
    move.l #$FFFFFFFF, d0   ; 4294967295 unsigned, -1 signed
    move.l #1, d1
    cmp.l d1, d0            ; d0 - d1
    shi d2                  ; is d0 higher than d1, unsigned?
    sgt d3                  ; is d0 greater than d1, signed?
```

`d2` comes out at `000000FF` and `d3` at `00000000`. The `cmp` left `N` at 1, `Z` at 0, `V` at 0 and
`C` at 0. `hi` wants `C` and `Z` both 0, which they are, and `gt` wants `N` to equal `V`, which it
does not. One comparison, two right answers, and picking the family that matches what your numbers
mean is on you. Sizes and addresses are unsigned, counts and differences are usually signed.

## X, the flag nothing here reads

`X` is a copy of the carry that survives instructions which write `C`. On a real 68000 it exists so
that `addx`, `subx`, `negx`, `roxl` and `roxr` can carry from one register into the next when a
number is wider than 32 bits. This editor's assembler has none of those five, so `X` is written and
never read: it is in the panel and no program you write here will branch on it.

```m68k|playground
    move.l #$80000000, d0
    lsl.l #1, d0            ; the 1 falls off the top, so C and X both go to 1
    move.l #$80000000, d1   ; a move rewrites N, Z, V and C, and leaves X alone
    rol.l #1, d1            ; the 1 comes back in at the bottom: C goes to 1, X does not move
```

Step through it. After the `lsl.l` both `C` and `X` are 1. The `move` on the next line puts `C` back
to 0 and `X` stays 1, which is the whole point of having two of them. The `rol.l` sets `C` again and
leaves `X` alone, because a rotate loses nothing.

## Your turn

The test starts `d0` at `$FFFFFFFF` and `d1` at 1. Without branching, leave `$FF` in `d2` if `d0` is
the higher of the two read as **unsigned** numbers, and `$00` in `d3` if `d0` is not the greater read
as **signed** numbers.

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

The second one starts `d0` at 1 and `d1` at `$FFFFFFFF`, and wants the larger of the two read as
unsigned numbers left in `d0`. Compare them and branch over the copy when `d0` already holds it.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 1, "d1": "0xFFFFFFFF" },
    "expectedRegisters": { "d0": "0xFFFFFFFF" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    cmp.l d1, d0        ; d0 - d1
    bhi done            ; if(d0 > d1) unsigned, d0 is already the answer
    move.l d1, d0       ; otherwise take d1
done:
```

</details>
