Two signed numbers are in `d0` and `d1`. This program puts the larger number in `d2` and their
**absolute difference** in `d3`: the distance between them, always zero or positive. Try it with
small signed numbers (for example, from -1000 to 1000), so the subtraction and its negation fit in
a signed long.

The first decision uses `cmp.l d1, d0`. M68K writes the source first, so this compares `d0` with
`d1` by calculating `d0 - d1` for the flags. It leaves both registers unchanged. The signed branch
`bge` then asks whether `d0` is greater than or equal to `d1`.

```m68k|playground|allow-open
    move.l #37, d0      ; a = 37
    move.l #64, d1      ; b = 64

    cmp.l d1, d0        ; set flags from a - b; keep a and b
    bge a_is_bigger     ; if a >= b, use a
    move.l d1, d2       ; otherwise bigger = b
    bra done            ; skip the other assignment
a_is_bigger:
    move.l d0, d2       ; bigger = a
done:

    move.l d0, d3       ; start with a
    sub.l d1, d3        ; d3 = a - b
    bpl positive        ; if d3 is non-negative, keep it
    neg.l d3            ; otherwise make it positive
positive:
```

## Step through the choices

Select **Build**, then select **Step** once per instruction. After `cmp.l d1, d0`, the difference
used for the flags is `37 - 64 = -27`. The flags panel shows `N=1`, `Z=0`, and `V=0`; `bge` is not
taken. The next `move` puts 64 in `d2`, and `bra done` skips `a_is_bigger`.

Keep stepping. `sub.l d1, d3` stores -27 in `d3` and sets `N=1`. `bpl` tests that flag, so it is not
taken; `neg.l d3` changes -27 to 27. At the end, the registers panel shows `d2=00000040` (64) and
`d3=0000001B` (27). The panel displays these values in hexadecimal.

The two decisions prepare their flags differently: `cmp` calculates a difference only for the
flags, while `sub` stores the difference and sets flags at the same time. Here, `bpl` can read the
`N` flag left by `sub` directly. The `bra done` is needed because the first choice has two
assignments and only one may run; the second choice only needs to skip `neg.l` when the difference
is already non-negative.

## Try it

Swap the starting values: put 64 in `d0` and 37 in `d1`. Before selecting **Build** and stepping
again, predict which branches are taken and what `d2` and `d3` will show.

<details>
<summary>Show answer</summary>

`bge` and `bpl` are both taken. `d2` is `00000040` (64), and `d3` is `0000001B` (27).

</details>
