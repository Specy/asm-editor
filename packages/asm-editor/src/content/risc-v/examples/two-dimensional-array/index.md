You have already used `row * COLS + column` to reach one element of a 2D array. This example uses
the same row-major layout for two jobs: it loads one word, then walks down a column and adds its
values. The new idea is the fixed byte step between two entries in the same column.

Rows and columns are numbered from zero. In this 3-by-4 grid, row 2 is the third row and column 1
is the second column:

```text
             column 0  column 1  column 2  column 3
row 0             1         2         3         4
row 1            10        20        30        40
row 2           100       200       300       400
```

The line breaks make the grid readable in the source. In memory, the values form one contiguous
row-major array: all of row 0, then all of row 1, then all of row 2. The program supplies the row
width whenever it calculates an address.

```riscv|playground|memory|allow-open
.eqv ROWS, 3
.eqv COLS, 4
.eqv ROW_STRIDE, 16       # 4 words per row * 4 bytes per word

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la   t0, grid
    li   t1, 2                # zero-based row
    li   t2, 1                # zero-based column
    li   t3, COLS
    mul  t4, t1, t3           # row * COLS
    add  t4, t4, t2           # element number = row * COLS + column
    slli t4, t4, 2            # byte offset = element number * 4
    add  t4, t0, t4           # address of grid[row][column]
    lw   t5, 0(t4)            # t5 = 200

    slli t6, t2, 2            # byte offset of grid[0][column]
    add  t6, t0, t6           # pointer to the top of column 1
    li   s0, 0                # column total
    li   t1, ROWS             # rows remaining; the old row value is no longer needed
column:
    lw   t3, 0(t6)            # reuse t3 for the current value
    add  s0, s0, t3
    addi t6, t6, ROW_STRIDE   # move to the same column in the next row
    addi t1, t1, -1
    bnez t1, column
```

The first calculation turns a row and column into a byte address in two stages:

```text
element number = row * COLS + column = 2 * 4 + 1 = 9
byte offset    = element number * 4  = 9 * 4     = 36
```

The word 36 bytes from `grid` is 200, so `t5` finishes with **200**.

For the column loop, `t6` first points at `grid[0][1]`, which is 4 bytes from the start. Each row
occupies four 4-byte words, so the same column in the next row is 16 bytes further on. That fixed
pointer advance is the **row stride**.

| Visit | Byte offset from `grid` | Value read | Total in `s0` |
| ----: | ----------------------: | ---------: | ------------: |
|     1 |                       4 |          2 |             2 |
|     2 |                      20 |         20 |            22 |
|     3 |                      36 |        200 |           222 |

After three passes, `s0` is **222**. `t1` is a countdown rather than a row index; it starts at
`ROWS` and reaches zero after every row has been visited. `t3` and `t1` are reused because their
earlier values are no longer needed. `s0` is the register chosen to hold the sum; this program makes
no subroutine calls.

`ROW_STRIDE` names the value 16 because this grid has a fixed layout. The name keeps the meaning
visible at the `addi`: changing the grid to five columns would require updating its `.eqv` to 20.

## Your turn: sum another column

Complete the loop so it adds zero-based column 2 and leaves the total in `t2`. The grid is fixed at
three nonempty rows of four words, so `ROW_STRIDE` is 16. Advance `t0` by one row stride on each
pass, use `t3` as the rows-remaining counter, and use `t4` to hold the word you load. The expected
total is 333.

```riscv|playground|memory|exercise
.eqv ROWS, 3
.eqv ROW_STRIDE, 16

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la   t0, grid
    addi t0, t0, 8            # grid[0][2]: column 2 * 4 bytes
    li   t2, 0                # total
    li   t3, ROWS             # rows remaining
    # load and add one word per row, advancing t0 by ROW_STRIDE
```

```testcase
{
    "expectedRegisters": { "t2": 333 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.eqv ROWS, 3
.eqv ROW_STRIDE, 16

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la   t0, grid
    addi t0, t0, 8
    li   t2, 0
    li   t3, ROWS
sum_column:
    lw   t4, 0(t0)
    add  t2, t2, t4
    addi t0, t0, ROW_STRIDE
    addi t3, t3, -1
    bnez t3, sum_column
```

</details>
