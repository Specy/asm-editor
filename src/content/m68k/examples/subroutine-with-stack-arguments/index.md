`sum_of_squares(a, b)` takes its two arguments on the stack, calls a second subroutine twice to
square them, and returns their sum in `d0`. It needs a local variable to hold the first square while
the second call runs, and that local lives on the stack too, in a frame `link` builds for it.

The first call to `square` leaves its answer in `d0`. The second call uses `d0` for its own input
and answer, so `sum_of_squares` saves the first answer in its stack frame between calls. The
comments beside each routine state which registers it changes or preserves.

```m68k|playground|memory|no-flags|allow-open
    move.l #4, -(sp)        ; the second argument, b
    move.l #3, -(sp)        ; the first argument, a
    bsr sum_of_squares
    add.l #8, sp            ; the caller takes the two arguments back off
    move.l d0, d7           ; the answer
    bra end

* sum_of_squares(a, b): a at 8(a6), b at 12(a6); answer in d0; preserves a6
sum_of_squares:
    link a6, #-4            ; a frame with four bytes of local room
    move.l 8(a6), d0        ; a
    bsr square
    move.l d0, -4(a6)       ; local = a * a, kept across the next call
    move.l 12(a6), d0       ; b
    bsr square
    add.l -4(a6), d0        ; a * a + b * b
    unlk a6
    rts

* square(x): input and answer in d0; preserves d1
square:
    move.l d1, -(sp)        ; the caller's d1, saved
    move.l d0, d1
    mulu d1, d0             ; x * x
    move.l (sp)+, d1        ; and given back
    rts

end:
```

`link a6, #-4` pushes the caller's `a6`, copies `sp` into `a6`, then reserves four bytes for one
local long. That space has no value until `move.l d0, -4(a6)` writes the first square to it. The
arguments sit above `a6` because the caller pushed them before `bsr`; the local sits below it.

## Step through the stack frame

Select **Build**, then use **Step** until you have stepped past `move.l d0, -4(a6)` in
`sum_of_squares`. In the memory panel, enter `FFFFEC` in the address box. The playground starts
with `sp` (also called `a7`) at `$1000000`, so the frame now has these five longs. The table
shows their contents at this point; 🟢 marks `a7`.

| address   | reached as | contents                     |
| --------- | ---------- | ---------------------------- |
| `$FFFFEC` | `-4(a6)`   | 🟢 `00000009`, local `a * a` |
| `$FFFFF0` | `(a6)`     | saved caller's `a6`          |
| `$FFFFF4` | `4(a6)`    | return address               |
| `$FFFFF8` | `8(a6)`    | `00000003`, argument `a`     |
| `$FFFFFC` | `12(a6)`   | `00000004`, argument `b`     |

At this step, `a6` is `00FFFFF0` and `a7` is `00FFFFEC`. The local contains 9 because the first
`square` call has returned and the following `move.l` has stored its answer. `a6` stays fixed while
the second call temporarily uses the stack, so the routine can still read `b` at `12(a6)` and the
first square at `-4(a6)`.

`square` uses `d1` but saves and restores it. Its `mulu` multiplies the unsigned low 16-bit words
of `d0` and `d1`, replacing the whole 32-bit `d0` with the product. To get the ordinary numeric
sum of squares, each argument must fit in an unsigned word (0 through 65535), and the sum must fit
in a 32-bit long. The chosen arguments meet both limits.

Select **Run** to finish. `unlk a6` releases the local and restores the caller's `a6`, leaving the
return address at `(sp)` for `rts`. The caller then removes its two long arguments with
`add.l #8, sp`. The registers panel shows `d0` and `d7` as `00000019` (25, from 9 plus 16), and
`a7` as `01000000`, back where it began. Stack bytes can retain old values after the pointer
moves; they are no longer part of the current frame.

## Try another pair

Change the two pushes to `move.l #2, -(sp)` for `b` and `move.l #5, -(sp)` for `a`. Predict the
local long after its store and the final answer in `d0` and `d7`. Select **Build**, step to
the local store to check the memory panel, then select **Run** to check the answer and `a7`.

<details>
<summary>Show answer</summary>

The local at `$FFFFEC` becomes `00000019` (25). The second square is 4, so `d0` and `d7` finish
at `0000001D` (29). `a7` finishes at `01000000`.

</details>
