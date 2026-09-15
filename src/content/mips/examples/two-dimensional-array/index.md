Twelve words laid out as three rows of four. The program reads one element by its row and column,
and then adds up a whole column, which means stepping through memory a row at a time instead of an
element at a time.

A 2D array is one line of memory read in rows. A row number and a column number have to be turned
into a single offset before anything can be read.

```mips|playground|memory|allow-open
.eqv ROWS 3
.eqv COLS 4

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la $t0, grid
    li $t1, 2               # row = 2
    li $t2, 1               # col = 1
    li $t3, COLS
    mul $t4, $t1, $t3       # row * COLS
    add $t4, $t4, $t2       # + col
    sll $t4, $t4, 2         # times 4, the size of a word
    add $t4, $t0, $t4
    lw $t5, 0($t4)          # the element at that row and column

    sll $t6, $t2, 2         # col * 4
    add $t6, $t0, $t6       # the address of that column, top row
    li $t7, 0               # the running total
    li $t8, ROWS
column:
    lw $t9, 0($t6)          # this row of that column
    add $t7, $t7, $t9
    addi $t6, $t6, 16       # down one row, four words of four bytes
    addi $t8, $t8, -1
    bnez $t8, column
```

The three `.word` lines are one array of twelve words at `0x10010000`. The rows exist only in how
the source is laid out; memory is a single line and always was. `row * COLS + col` works out which
element of that single line you meant, and the `sll` by two then turns a count of elements into a
count of bytes, which is the only unit an address understands. `$t5` is 200, the second element of
the last row.

`mul $t4, $t1, $t3` is a real instruction and it is what a row of any width needs. Here `COLS` is 4,
a power of two, so `sll $t4, $t1, 2` would do the same job in one cheaper instruction, and the two
shifts could be one: `sll $t4, $t1, 4` scales the row all the way to bytes, with the column shifted
by 2 and added on.

Walking a column is the same arithmetic done once. `$t6` starts at the top of the column and then
adds 16 at every pass: one row further down is one whole row of elements further along in memory.
`$t7` ends at 222, which is 2 plus 20 plus 200, the three elements of that column.

That 16 is the **stride**: the distance in bytes from one row to the row below it, which is `COLS`
elements of four bytes each. It is written out as a number because the assembler does no arithmetic,
so `COLS*4` in an instruction is a build error. Either the number goes in with a comment saying
where it came from, as here, or the program works it out with a shift, and the danger of the first
is that changing `COLS` at the top of the file leaves the 16 behind.

Walking a **row** would be the same loop with `addi $t6, $t6, 4`, because the elements of a row sit
next to each other. Walking a column costs exactly the same one instruction per pass, with 16 in it
instead of 4. The array is laid out in rows, and the column loop pays nothing extra for going across
the grain, because memory does not care which direction you meant.
