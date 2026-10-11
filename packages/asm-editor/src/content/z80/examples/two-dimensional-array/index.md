This grid has three rows of four words. The program first adds column 1 across all three rows,
leaving 222 (`00DE`) in `iy`. It then reads row 2, column 1 into `de`: that word is 200 (`00C8`).
Rows and columns are numbered from zero, so row 2 is the last row and column 1 is the second column.

Open the program in the editor and choose **Build**. Use **Step** to watch `ix` point to `9002`,
`900A`, and `9012` as the column loop reads 2, 20, and 200. Then choose **Run** to reach `halt`.
The register panel shows `iy = 00DE` and `de = 00C8`; enter `9000` in the memory panel to see the
grid's bytes.

```z80|playground|memory|no-flags|allow-open
ROWS    equ 3
COLS    equ 4
STRIDE  equ COLS * 2        ; one row of the array, in bytes

    .org 0x8000
    ld c, 1                 ; zero-based column 1, used by both parts

; --- the whole of that column added up, in iy ---
    ld a, c
    add a, a                ; col * 2, the size of a word
    ld e, a
    ld d, 0
    ld ix, grid
    add ix, de              ; ix = the top of the column
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
    ld a, 2                 ; zero-based row 2
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

The three `.dw` lines place twelve consecutive words at `9000`. Each line makes a row easy to see
in the source, but memory holds one sequence of bytes. Each word takes two bytes, so four words make
`STRIDE = 8` bytes per row. Column 1 begins two bytes into each row. The first part sets `ix` to
`9002`, reads a word, and advances it eight bytes for the next row. After the third read, `ix` moves
once more to `901A`; the loop is finished, so that address is never read.

Inside the loop, `de` first holds the word read through `ix`. `add hl, de` adds it to the running
total. The program then loads `STRIDE` into `de` to move `ix` down one row. The `+0` and `+1` in
`(ix+0)` and `(ix+1)` are fixed byte offsets within one word; `add ix, de` makes the larger move
between rows. When all three words have been added, `push hl` and `pop iy` save the total in `iy`.
That frees `hl` for the separate row-and-column lookup.

For that lookup, `row * COLS + col` gives the word's position in the sequence: `2 * 4 + 1 = 9`.
Doubling that position gives its byte offset, 18 (`0012`), so `grid + 18` is `9012`. Because
`COLS` is 4, the code doubles `hl` twice to multiply the row by four, then doubles it once more
after adding the column to account for two bytes per word. Other column counts need address
arithmetic suited to their width; for example, a width of three can use `row * 2 + row`.

The word at `9012` is `.dw 200`, stored as `C8` at `9012` and `00` at `9013`. `ld e, (hl)` reads
the low byte, `inc hl` moves to the next byte, and `ld d, (hl)` reads the high byte. Together they
make `de = 00C8`. This second part reuses `de`; its final value is the selected word, while `iy`
still holds the column total.
