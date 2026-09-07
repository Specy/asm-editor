Twelve words laid out as three rows of four. The program adds up a whole column, which means
stepping through memory a row at a time, and then reads one element by its row and column. The
column total ends in `iy` and the element in `de`.

Every array up to here was one line of memory. A 2D array is the same line read in rows, and the two
numbers you write in C as `grid[row][col]` have to be turned into one offset before anything can be
read.

**You need to know:** the "Arrays, strings and ix" lecture and the "Addressing on the Z80" lecture.
What is new here is the stride, the distance in bytes between one row and the next, which is what
walking a column adds every pass.

```z80|playground|memory|no-flags|allow-open
ROWS    equ 3
COLS    equ 4
STRIDE  equ COLS * 2        ; one row of the array, in bytes

    .org 0x8000
    ld c, 1                 ; col = 1, the column both halves work on

; --- the whole of that column added up, in iy ---
    ld a, c
    add a, a                ; col * 2, the size of a word
    ld e, a
    ld d, 0
    ld ix, grid
    add ix, de              ; ix = &grid[0][col]
    ld hl, 0                ; total = 0
    ld b, ROWS
column:
    ld e, (ix+0)
    ld d, (ix+1)            ; de = grid[r][col]
    add hl, de
    ld de, STRIDE
    add ix, de              ; down one row, a whole row of bytes
    djnz column
    push hl
    pop iy                  ; the total, kept out of the way

; --- one element by its row and column, in de ---
    ld a, 2                 ; row = 2
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl              ; row * COLS, which is 4
    ld e, c
    ld d, 0
    add hl, de              ; + col
    add hl, hl              ; times 2, the size of a word
    ld de, grid
    add hl, de              ; the address of grid[row][col]
    ld e, (hl)
    inc hl
    ld d, (hl)              ; de = grid[row][col]
    halt

    .org 0x9000
grid:   .dw 1, 2, 3, 4
        .dw 10, 20, 30, 40
        .dw 100, 200, 300, 400
```

The three `.dw` lines are one array of twelve words at `0x9000`, and the rows exist only in how they
are written down. Walking a column is `ix` parked on the top of it and moved on by `STRIDE`, eight
bytes, at every pass: one row further down is one whole row of elements further along in memory. The
assembler works `COLS * 2` out while assembling, so nothing multiplies at run time, and `iy` comes
out at `00DE`, which is 222, from 2, 20 and 200.

`add ix, de` is the only way to move an index register by an amount the program computed, because
the displacement in `(ix+0)` is a constant written into the instruction. That is why `ld de, STRIDE`
sits inside the loop: `de` is used to read the element two lines above it, so the stride has to be
put back before the addition.

`row * COLS + col` is the element's number in that one line, and doubling it turns a number of
elements into a number of bytes, which is what the address arithmetic actually needs. `COLS` is 4
here, so `row * COLS` is two `add hl, hl`, and the doubling for the element size is a third. A
number of columns that is **not** a power of two would need the shift and add routine from Multiply
and divide, which is what makes a power of two the size every 8 bit program picks for a grid.

`de` comes out at `00C8`, which is 200, the second element of the last row. Reading it takes two
instructions, `ld e, (hl)` and then `ld d, (hl)` after an `inc hl`, because a word is two bytes and
every load here moves one.

Walking a **row** would be the same loop with `inc hl` twice and no `add` at all, since the elements
of a row sit next to each other. A column is the direction the array is not laid out in, and it
costs one addition per pass to say so.

Try changing `ld c, 1` to `ld c, 3`. `iy` comes out at `01BC`, which is 444, and `de` at `0190`,
which is 400: one line moves both halves, because the column is a value both of them read.
