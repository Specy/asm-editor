# The condition code register

Alongside its data and address registers, the M68K keeps five one-bit summaries of a recent result.
Together they form the **condition code register**, or **CCR**. The simulator displays them in the
flags panel above the registers, in the order `X N Z V C`.

A one-bit summary is called a **flag**. A flag is **set** when its value is 1 and **clear** when its
value is 0.

| flag | name     | what it summarizes for the selected size                           |
| ---- | -------- | ------------------------------------------------------------------ |
| `X`  | extend   | carry or borrow that can be passed between pieces of a calculation |
| `N`  | negative | the highest bit of the result is 1                                 |
| `Z`  | zero     | the result is zero                                                 |
| `V`  | overflow | the signed result is outside the selected size's range             |
| `C`  | carry    | an addition carried out, or a subtraction borrowed                 |

The instruction size matters. For a byte instruction, these summaries describe the 8-bit byte
result. For a word instruction they describe the 16-bit word result, and for a long instruction
they describe the 32-bit long result. Preserved upper bits in a data register do not take part in a
smaller operation's flags.

## Zero and negative

`Z` is set when the result within the selected size is zero. This can happen even when the full data
register still contains nonzero upper bits.

`N` copies the highest bit within the selected size. For a byte, that is bit 7; for a word, bit 15;
for a long, bit 31. In two's-complement signed reading, a 1 in that position marks a negative value.

Each playground on this page begins with its registers at zero and all five displayed flags clear.
The following instructions then give both registers explicit values before the byte operations.

```m68k|playground
    move.l #$A5A50001, d0
    sub.b #1, d0
    move.l #$11223344, d1
    move.b #$80, d1
```

| after this instruction  | register value | `X` | `N` | `Z` | `V` | `C` |
| ----------------------- | -------------- | --: | --: | --: | --: | --: |
| `move.l #$A5A50001, d0` | `d0=$A5A50001` |   0 |   1 |   0 |   0 |   0 |
| `sub.b #1, d0`          | `d0=$A5A50000` |   0 |   0 |   1 |   0 |   0 |
| `move.l #$11223344, d1` | `d1=$11223344` |   0 |   0 |   0 |   0 |   0 |
| `move.b #$80, d1`       | `d1=$11223380` |   0 |   1 |   0 |   0 |   0 |

After the subtraction, the selected byte result is `$00`, so `Z` is set. The upper three bytes of
`d0` remain `$A5A500`, but they do not affect a byte instruction's flags. The last instruction
moves the byte `$80`. Its highest bit is 1, so `N` is set even though the full register begins with
the positive-looking long-sized pattern `$11`.

## Carry and overflow

`C` and `V` describe the same fixed-width calculation from two different numeric readings:

- `C` records an **unsigned** carry out of an addition or borrow from a subtraction.
- `V` records a result outside the **signed** range for the selected size.

An unsigned byte ranges from 0 through 255. A signed byte ranges from -128 through 127. These two
ranges make the difference visible with small values.

```m68k|playground
    move.l #$000000FF, d0
    add.b #1, d0
    move.l #$0000007F, d1
    add.b #1, d1
    move.l #3, d2
    sub.b #5, d2
```

| after this instruction | register value | `X` | `N` | `Z` | `V` | `C` |
| ---------------------- | -------------- | --: | --: | --: | --: | --: |
| `move.l #$FF, d0`      | `d0=$000000FF` |   0 |   0 |   0 |   0 |   0 |
| `add.b #1, d0`         | `d0=$00000000` |   1 |   0 |   1 |   0 |   1 |
| `move.l #$7F, d1`      | `d1=$0000007F` |   1 |   0 |   0 |   0 |   0 |
| `add.b #1, d1`         | `d1=$00000080` |   0 |   1 |   0 |   1 |   0 |
| `move.l #3, d2`        | `d2=$00000003` |   0 |   0 |   0 |   0 |   0 |
| `sub.b #5, d2`         | `d2=$000000FE` |   1 |   1 |   0 |   0 |   1 |

For `$FF + 1`, the unsigned answer 256 does not fit in a byte. The stored byte wraps to `$00`, so
`C` and `Z` are set. Signed `$FF` means -1, and -1 + 1 gives the valid signed result 0, so `V` is
clear.

For `$7F + 1`, the signed answer 128 is outside the signed-byte range. The stored byte is `$80`, so
`V` and `N` are set. The unsigned answer 128 fits in a byte, so `C` is clear.

For `3 - 5`, an unsigned subtraction needs a borrow. The byte result wraps to `$FE`, setting `C`.
The signed answer -2 fits in a byte, so `V` remains clear. Its top bit is 1, so `N` is set.

`X`, the extend flag, follows carry or borrow for the `add` and `sub` forms used here. Arithmetic on
a value split into several pieces can use that saved bit when working on the next piece. In these
examples, the flags panel lets you observe `X` alongside `C`.

## Compare with `cmp`

`cmp` performs a subtraction for its effect on the flags while preserving both operands. Its form
is:

```text
cmp.size source, destination
```

It calculates `destination - source` at the selected size and sets `N`, `Z`, `V` and `C` as `sub`
would. It preserves `X` because there is no stored arithmetic result to extend.

```m68k|playground
    move.l #3, d0
    cmp.b #5, d0
    move.l #5, d1
    cmp.b #5, d1
```

| after this instruction | register values                | `X` | `N` | `Z` | `V` | `C` |
| ---------------------- | ------------------------------ | --: | --: | --: | --: | --: |
| `move.l #3, d0`        | `d0=$00000003`, `d1=$00000000` |   0 |   0 |   0 |   0 |   0 |
| `cmp.b #5, d0`         | `d0=$00000003`, `d1=$00000000` |   0 |   1 |   0 |   0 |   1 |
| `move.l #5, d1`        | `d0=$00000003`, `d1=$00000005` |   0 |   0 |   0 |   0 |   0 |
| `cmp.b #5, d1`         | `d0=$00000003`, `d1=$00000005` |   0 |   0 |   1 |   0 |   0 |

The first comparison calculates `3 - 5`. That byte result would be `$FE`, so `N` is set and the
unsigned subtraction records a borrow in `C`. The second calculates `5 - 5`, so `Z` is set. The
register values stay at 3 and 5 throughout their comparisons.

## Test a value with `tst`

`tst` summarizes one existing value without changing it:

```text
tst.size operand
```

It sets `N` and `Z` from the selected byte, word or long, clears `V` and `C`, and preserves `X`.

```m68k|playground
    move.l #$00000080, d0
    tst.b d0
    move.l #$AA550000, d1
    tst.w d1
```

| after this instruction  | register values                | `X` | `N` | `Z` | `V` | `C` |
| ----------------------- | ------------------------------ | --: | --: | --: | --: | --: |
| `move.l #$80, d0`       | `d0=$00000080`, `d1=$00000000` |   0 |   0 |   0 |   0 |   0 |
| `tst.b d0`              | `d0=$00000080`, `d1=$00000000` |   0 |   1 |   0 |   0 |   0 |
| `move.l #$AA550000, d1` | `d0=$00000080`, `d1=$AA550000` |   0 |   1 |   0 |   0 |   0 |
| `tst.w d1`              | `d0=$00000080`, `d1=$AA550000` |   0 |   0 |   1 |   0 |   0 |

The byte `$80` has its highest bit set, so the byte test sets `N`. The low word of `d1` is `$0000`,
so the word test sets `Z`. In both cases, `tst` leaves the register itself unchanged.

## Which familiar instructions update the CCR

A flag describes the most recent instruction that updates it. Different instructions update
different parts of the CCR.

| instruction from this working set   | effect on `X`         | effect on `N Z V C`                    |
| ----------------------------------- | --------------------- | -------------------------------------- |
| `add`, `sub` with a data result     | set from carry/borrow | set from the sized arithmetic result   |
| `move` to a data register or memory | preserved             | set `N`/`Z` from value; clear `V`/`C`  |
| `ext`                               | preserved             | set `N`/`Z` from result; clear `V`/`C` |
| `move` to an address register       | preserved             | preserved                              |
| `cmp`                               | preserved             | set from a subtraction                 |
| `tst`                               | preserved             | set `N`/`Z` from value; clear `V`/`C`  |

The `move` spelling used with an address-register destination performs an address-register copy and
preserves the CCR. For a memory operand such as `4(a0)`, `0(a0,d1.w)`, `(a0)+` or `-(a0)`, the
effective-address calculation also leaves the CCR alone. The instruction using that address can
still update the flags according to its own row in the table.

Here the zero byte written to memory sets `Z`. The address setup preserves that set flag. The final
`move.b` sets `Z` from the zero byte it reads, while the postincrement changes `a0` from `$2000` to
`$2001` as part of the memory access.

```m68k|playground|memory
    move.l #1, d0
    move.b #0, $2000
    move.l #$2000, a0
    move.b (a0)+, d0
```

| after this instruction | relevant values                 | `X` | `N` | `Z` | `V` | `C` |
| ---------------------- | ------------------------------- | --: | --: | --: | --: | --: |
| `move.l #1, d0`        | `d0=$00000001`                  |   0 |   0 |   0 |   0 |   0 |
| `move.b #0, $2000`     | byte at `$2000` is `$00`        |   0 |   0 |   1 |   0 |   0 |
| `move.l #$2000, a0`    | `a0=$00002000`; flags preserved |   0 |   0 |   1 |   0 |   0 |
| `move.b (a0)+, d0`     | `d0=$00000000`, `a0=$00002001`  |   0 |   0 |   1 |   0 |   0 |

Stepping one instruction at a time keeps the current row visible in the flags panel.

## Check your understanding

For each independent row, predict the destination afterward and all five flags. The starting CCR is
given as `X N Z V C`.

| starting value | starting CCR | instruction     |
| -------------- | ------------ | --------------- |
| `d0=$12345600` | `1 1 0 1 1`  | `move.b #0, d0` |
| `d0=$000000FF` | `0 0 0 0 0`  | `add.b #1, d0`  |
| `d0=$0000007F` | `1 0 0 0 1`  | `add.b #1, d0`  |
| `d0=$00000003` | `1 0 0 0 0`  | `cmp.b #5, d0`  |
| `d0=$A5A50080` | `1 0 0 1 1`  | `ext.w d0`      |
| `d0=$12345680` | `1 0 0 1 1`  | `tst.b d0`      |

<details>
<summary>Show answers</summary>

| instruction     | destination afterward | ending CCR  | reason                                                             |
| --------------- | --------------------- | ----------- | ------------------------------------------------------------------ |
| `move.b #0, d0` | `d0=$12345600`        | `1 0 1 0 0` | the moved byte is zero; `move` preserves `X`                       |
| `add.b #1, d0`  | `d0=$00000000`        | `1 0 1 0 1` | `$FF + 1` carries out and leaves byte zero                         |
| `add.b #1, d0`  | `d0=$00000080`        | `0 1 0 1 0` | signed `$7F + 1` overflows; unsigned 128 fits                      |
| `cmp.b #5, d0`  | `d0=$00000003`        | `1 1 0 0 1` | `3 - 5` is negative and needs an unsigned borrow; `X` is preserved |
| `ext.w d0`      | `d0=$A5A5FF80`        | `1 1 0 0 0` | the sign-extended word is negative and nonzero; `X` is preserved   |
| `tst.b d0`      | `d0=$12345680`        | `1 1 0 0 0` | byte `$80` has its highest bit set; `tst` preserves `X`            |

</details>
