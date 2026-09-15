Twelve words laid out as three rows of four. The program reads one element by its row and column, and
then adds up a whole column, which means stepping through memory a row at a time instead of an
element at a time.

Memory is one long line of bytes and it has no idea what a row is. A grid of three rows by four
columns is twelve words in a line, and every row and column pair you want to read has to be turned
into one distance from the start before anything can happen.

```riscv|playground|memory|allow-open
.eqv ROWS, 3
.eqv COLS, 4

.data
grid:   .word 1, 2, 3, 4
        .word 10, 20, 30, 40
        .word 100, 200, 300, 400

.text
main:
    la t0, grid
    li t1, 2                # row = 2
    li t2, 1                # col = 1
    li t3, COLS
    mul t4, t1, t3          # row * COLS
    add t4, t4, t2          # + col
    slli t4, t4, 2          # times 4, the size of a word
    add t4, t0, t4
    lw t5, 0(t4)            # grid[row][col]

    slli t6, t2, 2          # col * 4
    add t6, t0, t6          # &grid[0][col]
    li s0, 0                # total = 0
    li s1, ROWS
column:
    lw s2, 0(t6)            # total += grid[r][col]
    add s0, s0, s2
    addi t6, t6, 16         # down one row, four words of four bytes
    addi s1, s1, -1
    bnez s1, column
```

The three `.word` lines are one run of twelve words starting at `0x10010000`. The rows exist only in
how the source is written out:

```
element  0    1    2    3    4    5    6    7    8    9   10   11
value    1    2    3    4   10   20   30   40  100  200  300  400
         \________ row 0 _____/\_______ row 1 ____/\______ row 2 ____/
byte     0    4    8   12   16   20   24   28   32   36   40   44
```

Row 2, column 1 is element `2 * 4 + 1`, which is 9, which is 36 bytes along. That is what the three
instructions work out: `row * COLS + col` gives the element number, and the `slli` by two turns
elements into bytes.

`mul t4, t1, t3` is a real instruction of the M extension and it is what a row of any width needs.
Here `COLS` is 4, a power of two, so `slli t4, t1, 2` would do the same job in one cheaper
instruction, and the two shifts could be one: `slli t4, t1, 4` scales the row all the way to bytes,
with the column shifted by 2 and added on.

Walking a column does that arithmetic once and then adds a fixed step: `t6` starts at the top of the
column and adds 16 every pass, because one row down is four words further along. That step has a
name, the **stride**, and walking a row is the same loop with a stride of 4. Neither direction is
harder for the machine.

The 16 is written as a plain number because `COLS*4` inside an instruction will not build. Either
the number goes in with a comment saying where it came from, as here, or the program multiplies it
out at run time.
