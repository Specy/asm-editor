Eight words sit in memory. This program reads each one and keeps the largest value seen so far in
`d0`. It keeps that value's **zero-based index** in `d3`: the first element has index 0, the second
has index 1, and so on. One value is negative, so the choice of signed comparison matters.

The previous sum example carried a running total from one pass to the next. Here the loop carries
both the best value and its index. Each new word either replaces that pair or leaves it alone.

```m68k|playground|memory|allow-open
count equ 8

    lea numbers, a0     ; a0 points at the first element
    clr.l d0            ; clear the upper word before loading a word
    move.w (a0)+, d0    ; best = numbers[0]
    clr.l d3            ; index of the best value = 0
    clr.l d4            ; index of the element being checked = 0
    move.l #count-2, d1 ; 6 gives seven passes with dbra
loop:
    addq.w #1, d4       ; move to the next index
    move.w (a0)+, d2    ; read the next word, then advance a0
    cmp.w d0, d2        ; compare this word with the best: d2 - d0
    ble not_bigger      ; signed: keep the best if this word <= it
    move.w d2, d0       ; new best value
    move.w d4, d3       ; new best index
not_bigger:
    dbra d1, loop

    org $2000
numbers: dc.w 12, -4, 37, 8, 99, 41, 2, 60
```

`org $2000` places the eight words at `$2000` through `$200F`, two bytes per word. The first
`move.w (a0)+, d0` reads 12 and moves `a0` to `$2002`. This gives the program a best value before
the loop starts. Starting the best at 0 would give the wrong answer if every element were negative.

Seven elements remain. The loop starts its `dbra` counter at `count-2`, or 6, so its seven passes
check the words at indices 1 through 7. `d4` advances to each index before that word is read.
`cmp.w d0, d2` prepares the flags from `d2 - d0` without changing either value. If the new word is
less than or equal to the best, `ble` skips both assignments. An equal value therefore keeps the
earlier index.

`move.w` writes only the low 16 bits of a data register. Clearing all of `d0` first makes its full
register display predictable when the positive word 12 is loaded; the later word moves replace only
that low word. `d3` and `d4` are also cleared as full registers before their word-sized updates, and
the long move initializes all of `d1`.

## Run it and follow the best value

Select **Build**, then **Run**. In the registers panel, `d0` is `00000063` (hexadecimal `$63` is
decimal 99) and `d3` is `00000004`: 99 is the fifth element, at index 4. `a0` is `00002010`, just
past the last word, and `d1` is `0000FFFF`. The loop does not read from `$2010`.

Select **Build** again to reset the program, then select **Step** once per instruction. After the
first read, `d0` is `0000000C` (12) and `a0` is `00002002`. On the first loop pass, `d4` becomes 1,
`d2` receives the word `FFFC` (-4), and `a0` advances to `00002004`. The signed `ble` is taken, so
`d0` stays 12 and `d3` stays 0. The first `dbra` changes `d1` from 6 to 5 and returns to `loop`.

Keep stepping until the word 99 is read from `$2008`. At that point `d4` is 4 and `a0` is
`0000200A`. Its comparison is greater, so the two moves put `00000063` in `d0` and `00000004` in
`d3`. The remaining words do not change that pair.

## Try an unsigned comparison

Change `ble not_bigger` to `bls not_bigger`, the unsigned “lower or same” condition. Before selecting
**Build** and **Run**, predict which value and index will remain in `d0` and `d3`. Think about the
bit pattern `FFFC`: as an unsigned word, is it smaller or larger than 12?

<details>
<summary>Show answer</summary>

`d0` ends at `0000FFFC` and `d3` at `00000001`. Read as an unsigned word, `FFFC` is 65532. The
unsigned comparison treats it as larger than every other word in this array, so the value at index
1 remains the best. The original signed `ble` treats the same bits as -4.

</details>
