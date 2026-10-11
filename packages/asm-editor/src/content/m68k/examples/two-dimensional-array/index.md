A grid in memory is still a line of values. This example stores three rows of four words at
`$2000`. It reads one value using a row and column, then adds the three values in that column.
Both row and column indices start at **0**: the rows are 0, 1 and 2, and the columns are 0, 1,
2 and 3.

```m68k|playground|memory|no-flags|allow-open
ROWS equ 3
COLS equ 4

    lea grid, a0
    move.l #2, d0           ; row 2, the third row
    move.l #1, d1           ; column 1, the second column
    move.l d0, d2
    mulu #COLS, d2          ; skip row * COLS words
    add.l d1, d2            ; then skip col more words
    add.l d2, d2            ; convert words to bytes
    moveq #0, d3
    move.w (a0, d2), d3     ; read grid[row][col]

    lea grid, a1
    move.l d1, d4
    add.l d4, d4            ; col * 2 bytes
    add.l d4, a1            ; address of grid[0][col]
    clr.l d5                ; sum starts at 0
    move.l #ROWS-1, d6     ; dbra runs ROWS times
column:
    add.w (a1), d5          ; add this row's word
    add.l #COLS*2, a1       ; advance by one whole row
    dbra d6, column

    org $2000
grid:   dc.w 1, 2, 3, 4
        dc.w 10, 20, 30, 40
        dc.w 100, 200, 300, 400
```

Each `dc.w` line shows a row, but the twelve words occupy consecutive addresses from `$2000`
through `$2017`. To find `grid[row][col]`, skip `row * COLS + col` words from the start. For
row 2, column 1, that is `2 * 4 + 1 = 9` words. Each word takes two bytes, so the byte offset
is 18 (`$12`). Starting at `$2000`, `(a0, d2)` reads the word at `$2012`: 200. `moveq #0, d3`
clears the whole register first; `move.w` then writes only its low 16 bits. After the read,
`d3` is `000000C8`.

For the column sum, `a1` starts at `$2002`, the address of row 0, column 1. The words below it
are at `$200A` and `$2012`: each next row starts `COLS * 2 = 8` bytes later. The loop reads 2,
20 and 200, so the low word of `d5` becomes 222 (`$00DE`). `clr.l d5` makes the upper word zero
here. The additions use `add.w`, though, so a larger sum that exceeds 16 bits would wrap in
the low word; it would not carry into the upper word. `dbra` uses the low word of `d6`. Starting
it at `ROWS-1`, or 2, gives three passes.

Select **Build**, then **Run**. Check `d3 = 000000C8` and `d5 = 000000DE` in the registers
panel. Select **Build** again to reset, then use **Step** to follow `a1` through `$2002`,
`$200A` and `$2012` as the three words are read. The final advance leaves `a1` at `$201A`,
outside the grid, but the loop ends without reading there.

## Try another cell and column

Change `#2` in `d0` to `#1`, and `#1` in `d1` to `#3`. Before selecting **Build** and **Run**,
predict the address and value read into `d3`, and the final sum in `d5`.

<details>
<summary>Show answer</summary>

Row 1, column 3 is word `1 * 4 + 3 = 7`, at `$2000 + 7 * 2 = $200E`. Its value is 40, so
`d3 = 00000028`. The column contains 4, 40 and 400; their sum is 444, so
`d5 = 000001BC`.

</details>

Use row indices 0 through 2 and column indices 0 through 3. The program has no bounds check:
column 4 with row 0 calculates the address of row 1, column 0, while row 3, column 0
calculates `$2018`, just beyond the grid. A column walk using column 4 would eventually read
beyond the grid as well.
