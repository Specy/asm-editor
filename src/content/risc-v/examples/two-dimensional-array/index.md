Twelve words laid out as three rows of four. The program reads one element by its row and column, and
then adds up a whole column, which means stepping through memory a row at a time instead of an
element at a time.

Every array up to here was one line of memory. A 2D array is the same line read in rows, and the two
numbers you write in C as `grid[row][col]` have to be turned into one offset before anything can be
read.

**You need to know:** the "Arrays and strings" lecture and the "Loads, stores and immediates"
lecture. What is new here is the stride, the distance in bytes between one row and the next, which is
what walking a column adds every pass.

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

The three `.word` lines are one array of twelve words at `0x10010000`, and the rows exist only in how
they are written down. `row * COLS + col` is the element's number in that one line, and the `slli` by
two turns a number of elements into a number of bytes, which is what the address arithmetic actually
needs. `t5` comes out at `000000C8`, which is 200, the second element of the last row.

`mul t4, t1, t3` is a real instruction of the M extension and it is what a row of any width needs.
Here `COLS` is 4, a power of two, so `slli t4, t1, 2` would do the same job in one cheaper
instruction, and the two shifts could be one: `slli t4, t1, 4` scales the row all the way to bytes,
with the column shifted by 2 and added on.

Walking a column is the same arithmetic done once. `t6` starts at the top of the column and then adds
16 at every pass: one row further down is one whole row of elements further along in memory. `s0`
comes out at `000000DE`, which is 222, from 2, 20 and 200.

That 16 is written as a number because the assembler does no arithmetic. The M68K writes the same
stride as `#COLS*2` and lets the assembler multiply; here `COLS*4` in an instruction is a build error,
so either the number goes in with a comment saying where it came from, or the program computes it.

Walking a **row** would be the same loop with `addi t6, t6, 4`, since the elements of a row sit next
to each other. A column is the direction the array is not laid out in, and it costs the same one
instruction per pass to say so, with a bigger number in it.

Try changing `li t2, 1` to `li t2, 3`. `t5` comes out at `00000190`, which is 400, and the column
total in `s0` at `000001BC`, which is 444.
