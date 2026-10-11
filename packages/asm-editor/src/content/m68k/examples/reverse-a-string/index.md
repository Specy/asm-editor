This program reverses `Assembly` in the same memory where it starts, at `$2000`. `a0` points to
the first character. `a1` finds the last character, then the two addresses move towards each other
as the program swaps pairs of bytes. The `0` after `'Assembly'` in the `dc.b` line is the string's
terminator, not a character to reverse.

```m68k|playground|memory|no-flags|allow-open
    lea text, a0        ; a0 points to the first character
    move.l a0, a1       ; begin the search at the same address
find_end:
    tst.b (a1)+         ; test a byte, then advance a1
    bne find_end
    subq.l #2, a1       ; a1 now points to the last character
swap_loop:
    cmp.l a0, a1        ; compare the right address with the left
    bls done            ; stop if a1 is at or before a0
    move.b (a0), d0     ; save the left byte
    move.b (a1), d1     ; save the right byte
    move.b d1, (a0)+    ; write right byte on left, then advance a0
    move.b d0, (a1)     ; write left byte on right
    subq.l #1, a1       ; move a1 one byte to the left
    bra swap_loop
done:

    org $2000
text: dc.b 'Assembly', 0
```

The `subq.l #2, a1` takes two steps back because `(a1)+` advances even when it reads the zero byte.
For `Assembly`, the end of memory looks like this:

```text
$2007  'y'   last character; a1 after subq.l #2, a1
$2008   00   terminator
$2009        a1 after tst.b (a1)+ reads the terminator
```

The swap needs both bytes in registers before either is written, which is why `d0` and `d1` are both
loaded first. `move.b d1, (a0)+` writes and steps the left pointer in one instruction, and the right
pointer is written with a plain `(a1)` and moved by the `subq` under it, because `-(a1)` would
subtract **before** the write and put the byte in the wrong place.

`cmp.l a0, a1` compares the two addresses, and `bls` stops the loop when `a1` is at or before
`a0`. It uses an unsigned comparison, which is appropriate for addresses. For an odd number of
characters, the pointers meet at the middle character; that byte stays where it is. With an empty
string at `$2000`, the search finds the terminator immediately and the comparison skips the swap.

Select **Build**, then **Run**, and set the memory panel to `2000`. The eight character bytes read
`79 6C 62 6D 65 73 73 41`, spelling `ylbmessA`. The next byte, the terminator, is still `00`.

## Try an odd-length string

Change the data line to `text: dc.b 'Level', 0`. Before selecting **Build** and **Run** again,
predict the five character bytes and which character will stay in its original position. Check
the memory panel at `2000`.

<details>
<summary>Show answer</summary>

The result is `leveL`: the first and last characters swap, then the second and fourth swap. The
pointers meet at `v`, so the loop stops without moving it. The zero terminator remains after the
five characters.

</details>
