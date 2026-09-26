The twelve words in `grid` form three rows of four. In memory they are one continuous sequence;
we treat every four words as a row. The row and column numbers tell us which word in that
sequence to load.

| Row | Column 0 | Column 1 | Column 2 | Column 3 |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 1 | 2 | 3 | 4 |
| 1 | 10 | 20 | 30 | 40 |
| 2 | 100 | 200 | 300 | 400 |

For `grid[2][1]`, two complete rows come first: `2 * 4 = 8` words. One more word reaches column
1, so its index in the continuous sequence is **9**. Each word occupies four bytes; index 9 is
`9 * 4 = 36` bytes after `grid`. The program makes those two calculations, then adds the byte
offset to the base address. MIPS memory addresses count bytes, so the flat word index must be
scaled before it can be added to an address.

```mips|playground|memory|tests|allow-open
.eqv ROWS 3
.eqv COLS 4

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la $t0, grid
    li $t1, 2               # row
    li $t2, 1               # column
    li $t3, COLS
    mul $t4, $t1, $t3       # words in the complete rows before this one
    add $t4, $t4, $t2       # flat index = row * COLS + column
    sll $t4, $t4, 2         # byte offset = flat index * 4
    add $t4, $t0, $t4       # address of grid[row][column]
    lw $t5, 0($t4)          # grid[2][1] = 200

    sll $t3, $t3, 2         # row stride in bytes = COLS * 4
    sll $t6, $t2, 2         # byte offset of column 1 in row 0
    add $t6, $t0, $t6       # address of grid[0][1]
    li $t7, 0               # column total
    li $t8, ROWS            # rows remaining
column:
    lw $t9, 0($t6)          # current word in the column
    add $t7, $t7, $t9
    add $t6, $t6, $t3       # same column in the next row
    addi $t8, $t8, -1
    bnez $t8, column

    li $v0, 10              # exit
    syscall
```

```testcase
{
    "expectedRegisters": { "$t3": 16, "$t5": 200, "$t7": 222, "$t8": 0, "$v0": 10 }
}
```

`$t4` changes roles as the lookup proceeds: first it holds the flat index 9, then the byte offset
36, then the address `grid + 36`. `lw` reads the word at that address into `$t5`. In the
Playground's default layout, `grid` starts at `0x10010000`, so the word is at `0x10010024`.
Select **Build**, enter `10010024` in the Memory panel's address box, and select **W** to view
whole words. That word is `000000C8` in hexadecimal, or 200 in decimal. Then select **Run** and
check `$t5` in the register panel; it should hold the same value.

The second loop sums a whole column. It starts at `grid[0][1]`, four bytes after the base.
Each move to the next row crosses `COLS` words, or `COLS * 4` bytes. The `sll` puts that **row
stride**, 16 bytes here, in `$t3`; the loop adds it to `$t6` after every load.

| Row read | Offset from `grid` | Word added | Total after load |
| ---: | ---: | ---: | ---: |
| 0 | 4 bytes | 2 | 2 |
| 1 | 20 bytes | 20 | 22 |
| 2 | 36 bytes | 200 | 222 |

After the third load, `$t8` reaches zero and the branch stops the loop. `$t7` holds **222**. The
final pointer is one stride beyond the last word read; the program does not load from it.

`COLS` must match the number of words on each `.word` line, and `ROWS` must match the number of
rows in the data. The program uses those declarations as its dimensions; it cannot discover the
dimensions from memory. Deriving the stride from `COLS` keeps the lookup and column step in
agreement if the width changes. `li $t3, COLS` uses the named number, and `sll $t3, $t3, 2`
multiplies it by the four bytes per word.

Try two changes in **Open in editor**, restoring the original program between them. Use **Build**
and **Run** for each change; the embedded **Test** checks the original row and column.

1. Change the selected row to 1 and column to 3. Before running, calculate the flat index and
   byte offset. `$t5` should become **40**, read from `grid + 28`. The selected column total in `$t7`
   should become **444**.
2. Restore row 2, then change the column to 2. The column loop should add 3, 30, and 300, leaving
   **333** in `$t7`. Check all three words in the Memory panel at offsets 8, 24, and 40.

## Your turn: add a row

The starter below calculates the address of the first word in row 1 and sets `$t8` to the number
of columns. Fill in `row_loop` to load each word, add it to `$t7`, move `$t6` forward **four
bytes**, and count down until all four columns are used. Row 1 contains 10, 20, 30, and 40, so
the total should be **100**. Select **Test** to check the total, remaining count, and final
pointer.

```mips|playground|memory|exercise|allow-open
.eqv COLS 4

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la $t0, grid
    li $t1, 1               # row to add
    li $t2, COLS
    mul $t3, $t1, $t2       # flat index of row's first word
    sll $t3, $t3, 2         # its byte offset
    add $t6, $t0, $t3       # current word in row 1
    li $t7, 0               # row total
    li $t8, COLS            # words remaining

row_loop:
    # Load, add, advance by one word, count down, and repeat.

done:
    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": { "$t6": "0x10010020", "$t7": 100, "$t8": 0, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.eqv COLS 4

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la $t0, grid
    li $t1, 1
    li $t2, COLS
    mul $t3, $t1, $t2
    sll $t3, $t3, 2
    add $t6, $t0, $t3
    li $t7, 0
    li $t8, COLS

row_loop:
    lw $t9, 0($t6)
    add $t7, $t7, $t9
    addi $t6, $t6, 4
    addi $t8, $t8, -1
    bnez $t8, row_loop

done:
    li $v0, 10
    syscall
```

</details>
