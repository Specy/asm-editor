`sum_of_squares(x, y)` takes its two arguments on the stack, calls a second subroutine twice to
square them, and returns their sum in `hl`. It needs a local variable to hold the first square while
the second call runs, and that local lives on the stack too, in a frame built for it by hand.

In the previous example, the caller passed arguments in registers. Here the caller pushes two
arguments, and `sum_of_squares` makes room on the same stack for a value it must keep across a
second call. Each routine says which registers it changes; in this program, `square` preserves
`de` but changes `a` and `b`.

Open the program in the editor and choose **Build**. Use **Step** to watch the frame form, or
**Run** to see the answer. The register and memory panels show hexadecimal values; the inputs
`3` and `4` in the program are decimal.

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

; sum_of_squares(x, y): inputs 0..255, each pushed as a word with H=0;
; x at (ix+4), y at (ix+6), local at (ix-2), result in hl
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

; square(v): v is 0..255 in hl (h=0); result in hl.
; de comes back as it was found; a and b do not.
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

The five instructions after `sum_of_squares:` build its frame. The pointer changes in stages:

| After                         | `sp`   | `ix`   | What is on top of the stack |
| ----------------------------- | ------ | ------ | --------------------------- |
| Caller pushes `y` and `x`     | `FFFB` | —      | `x`                         |
| `call sum_of_squares`         | `FFF9` | —      | return address              |
| `push ix`; set `ix` from `sp` | `FFF7` | `FFF7` | saved `ix`                  |
| Both `dec sp` instructions    | `FFF5` | `FFF7` | two reserved bytes          |

In this playground, `sp` starts at `FFFF`.

`push ix` puts the caller's `ix` on the stack. The caller may have been using `ix` for something of
its own, and this subroutine is about to overwrite it, so it has to go back exactly as it was found.

`ld ix, 0` then `add ix, sp` copies `sp` into `ix`. It takes two instructions because there is no
`ld ix, sp`; zeroing `ix` and adding `sp` to it gets there. From this moment `ix` stops moving and
`sp` carries on, which is the whole point of the arrangement.

`dec sp` twice lowers the stack pointer by two bytes. Those bytes are reserved for this routine's
local, but they do not yet contain a useful value. The next `push` or `call` grows the stack below
the new `sp`, leaving the reserved bytes alone.

At the end, `ld sp, ix` throws the local room away by putting `sp` back where `ix` has been sitting
all along, and `pop ix` hands the caller's `ix` back.

After `ld (ix-1), h` stores the first square, and before `sum_of_squares` loads `y`, the frame is
this. 🟢 marks `sp`; `ix` still points at `FFF7`:

|  address | value        | reached as | what it is                                   |
| -------: | :----------- | ---------- | -------------------------------------------- |
| `0xFFF5` | 🟢 `09` `00` | `(ix-2)`   | the local, `x * x`                           |
| `0xFFF7` | `00` `00`    | `(ix+0)`   | the caller's `ix`, and where `ix` now points |
| `0xFFF9` | `0B` `80`    | `(ix+2)`   | the return address                           |
| `0xFFFB` | `03` `00`    | `(ix+4)`   | `x`                                          |
| `0xFFFD` | `04` `00`    | `(ix+6)`   | `y`                                          |

The arguments are above `ix` because the caller pushed them before the `call`. The local is below
`ix`, in the room reserved by the two `dec sp` instructions. To inspect this moment, **Step** past
`ld (ix-1), h` and enter `FFF5` in the memory panel. After **Run**, the same bytes remain in memory,
although `sp` has returned to `FFFF`: changing `sp` does not erase them.

A word takes two instructions to move through `(ix+dd)`, because the displaced mode reads and writes
one byte: `ld l, (ix+4)` and `ld h, (ix+5)` are one 16 bit argument arriving, low byte first. The
displacement is a constant written into the instruction, from -128 to 127. A byte farther away
needs its address worked out separately.

`square` keeps to a smaller agreement of its own: it uses `de` and puts it back. It changes `a`
and `b`, and uses `l` as its loop count, so its input must be from 0 to 255 with `h = 0`. The Z80
has no multiply instruction; repeated addition makes each square. With the shown inputs,
`hl` ends at `0019`, which is 25 in decimal: 9 plus 16. For larger inputs, the final sum can exceed
what 16 bits hold; `hl` then contains only the low 16 bits.

Try changing `x` from `3` to `5`, keeping `y` at `4`. Build and run again. What should `hl` show?
The squares are 25 and 16, so the sum is 41 in decimal, or `0029` in the hexadecimal register
panel. You can also **Step** to the store at `(ix-2)` and check that the local contains `19 00`:
the first square, low byte first.
