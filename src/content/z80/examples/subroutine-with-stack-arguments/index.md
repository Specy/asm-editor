`sum_of_squares(x, y)` takes its two arguments on the stack, calls a second subroutine twice to
square them, and returns their sum in `hl`. It needs a local variable to hold the first square while
the second call runs, and that local lives on the stack too, in a frame built for it by hand.

A subroutine with its arguments in registers passed everything in `a` and `b`. That works until a
subroutine has to keep something across a call, because the call is free to destroy any register it
likes.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld hl, 4
    push hl             ; the second argument, y
    ld hl, 3
    push hl             ; the first argument, x
    call sum_of_squares
    pop bc              ; the caller takes the two arguments back
    pop bc
    jp done

; sum_of_squares(x, y): x at (ix+4), y at (ix+6), one word of local room at
; (ix-2), and the answer leaves in hl
sum_of_squares:
    push ix             ; the caller's ix, kept
    ld ix, 0
    add ix, sp          ; ix = sp, and now it stops moving
    dec sp
    dec sp              ; two bytes of local room, below the frame
    ld l, (ix+4)
    ld h, (ix+5)        ; x
    call square
    ld (ix-2), l
    ld (ix-1), h        ; local = x * x, kept across the next call
    ld l, (ix+6)
    ld h, (ix+7)        ; y
    call square
    ld e, (ix-2)
    ld d, (ix-1)
    add hl, de          ; x * x + y * y
    ld sp, ix           ; the local room given back
    pop ix
    ret

; square(v): v in hl, the answer in hl. de comes back as it was found, a and b do not.
square:
    push de
    ld d, h
    ld e, l             ; de = v
    ld b, l             ; v times round
    ld hl, 0
    ld a, b
    or a
    jr z, square_done   ; nothing times nothing
loop:
    add hl, de
    djnz loop
square_done:
    pop de
    ret

done:
    halt
```

The four instructions after the label are the frame being built, and each one has a job.

`push ix` puts the caller's `ix` on the stack. The caller may have been using `ix` for something of
its own, and this subroutine is about to overwrite it, so it has to go back exactly as it was found.

`ld ix, 0` then `add ix, sp` copies `sp` into `ix`. It takes two instructions because there is no
`ld ix, sp`; zeroing `ix` and adding `sp` to it gets there. From this moment `ix` stops moving and
`sp` carries on, which is the whole point of the arrangement.

`dec sp` twice lowers the stack pointer by two bytes. Nothing is written there; lowering `sp` is how
you claim room, because everything below `sp` is fair game for the next `push` and everything above
it is yours.

At the end, `ld sp, ix` throws the local room away by putting `sp` back where `ix` has been sitting
all along, and `pop ix` hands the caller's `ix` back.

Once that has run, the frame is this, with 🟢 on the stack pointer:

|  address | value        | reached as | what it is                                   |
| -------: | :----------- | ---------- | -------------------------------------------- |
| `0xFFF5` | 🟢 `09` `00` | `(ix-2)`   | the local, `x * x`                           |
| `0xFFF7` | `00` `00`    | `(ix+0)`   | the caller's `ix`, and where `ix` now points |
| `0xFFF9` | `0B` `80`    | `(ix+2)`   | the return address                           |
| `0xFFFB` | `03` `00`    | `(ix+4)`   | `x`                                          |
| `0xFFFD` | `04` `00`    | `(ix+6)`   | `y`                                          |

The arguments are above `ix` because the caller pushed them before the `call`, and the local is
below it in the room the two `dec sp` reserved. Type `FFF5` in the memory panel after running and
the five words are still lying there, since popping moves a pointer and erases nothing.

A word takes two instructions to move through `(ix+dd)`, because the displaced mode reads and writes
one byte: `ld l, (ix+4)` and `ld h, (ix+5)` are one 16 bit argument arriving, low byte first. The
displacement is a constant written into the instruction, from -128 to 127, so a frame bigger than
that would need a second pointer.

`square` keeps to a smaller agreement of its own: it uses `de` and puts it back, so a caller in the
middle of a computation does not lose what it was holding. It destroys `a` and `b` and says so, and
the multiplication is a loop because the Z80 has no `mulu`. `hl` comes out at `0019`, which is 25,
from 9 plus 16.

Try taking one of the two `pop bc` lines out. The answer is still right, and `sp` ends at `FFFD`
instead of `FFFF`: two bytes of stack the program will never get back, which in a loop is how a
program runs out of it.
