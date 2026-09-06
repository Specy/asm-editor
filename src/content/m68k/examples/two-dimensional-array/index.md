Twelve words laid out as three rows of four. The program reads one element by its row and column, and
then adds up a whole column, which means stepping through memory a row at a time instead of an
element at a time.

Every array up to here was one line of memory. A 2D array is the same line read in rows, and the two
numbers you write in C as `grid[row][col]` have to be turned into one offset before anything can be
read.

**You need to know:** the "Arrays, strings and `(a0)+`" lecture and the "Addressing modes" lecture.
What is new here is the stride, the distance in bytes between one row and the next, which is what
walking a column adds every pass.

```m68k|playground|memory|no-flags
ROWS equ 3
COLS equ 4

    lea grid, a0
    move.l #2, d0           ; row = 2
    move.l #1, d1           ; col = 1
    move.l d0, d2
    mulu #COLS, d2          ; row * COLS
    add.l d1, d2            ; + col
    add.l d2, d2            ; times 2, the size of a word
    move.w (a0, d2), d3     ; d3 = grid[row][col]

    lea grid, a1
    move.l d1, d4
    add.l d4, d4            ; col * 2
    add.l d4, a1            ; a1 = &grid[0][col]
    clr.w d5                ; total = 0
    move.w #ROWS-1, d6
column:
    add.w (a1), d5          ; total += grid[r][col]
    add.l #COLS*2, a1       ; down one row, a whole row of bytes
    dbra d6, column

    org $2000
grid:   dc.w 1, 2, 3, 4
        dc.w 10, 20, 30, 40
        dc.w 100, 200, 300, 400
```

The three `dc.w` lines are one array of twelve words at `$2000`, and the rows exist only in how they
are written down. `row * COLS + col` is the element's number in that one line, and doubling it turns
a number of elements into a number of bytes, which is what the address arithmetic actually needs.
`d3` comes out at `000000C8`, which is 200, the second element of the last row.

Walking a column is the same arithmetic done once. `a1` starts at the top of the column and then adds
`COLS*2`, eight bytes, at every pass: one row further down is one whole row of elements further along
in memory. The assembler works `COLS*2` out while assembling, so there is nothing multiplying at run
time. `d5` comes out at `000000DE`, which is 222, from 2, 20 and 200.

Walking a **row** would be the same loop with `(a1)+` and no `add` at all, since the elements of a
row sit next to each other and the postincrement mode steps by the size of what it read. A column is
the direction the array is not laid out in, and it costs one instruction per pass to say so.

Try changing `move.l #1, d1` to `move.l #3, d1`. `d3` comes out at `00000190`, which is 400, and the
column total in `d5` at `000001BC`, which is 444.
