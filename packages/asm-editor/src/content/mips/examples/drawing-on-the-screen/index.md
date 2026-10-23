This program draws a sky, ground, sun and house on a 32 by 32 word grid. Select **Build**, then
**Run**, and look at the Screen panel. Each word is one coloured cell. The program draws shapes by
calculating which words to change and storing colours with `sw`.

The grid starts at `display`. `x` counts columns from the left and `y` counts rows from the top;
both start at 0. A row has `SIDE = 32` words, and each word takes four bytes. For example, the
house's upper-left cell is `(x, y) = (10, 16)`: 16 complete rows and 10 more words give word index
`16 * 32 + 10 = 522`, or byte offset `522 * 4 = 2088` from `display`.

Two drawing helpers reuse that address calculation. `fill_rect` takes its left column, top row,
width and height in `$a0`–`$a3`. `fill_disc` takes a centre column, centre row and radius in
`$a0`–`$a2`. Both also read the current colour from `$s0` and the grid's base address from `$s1`.
`main` sets those shared values before each call. The helpers change only `$t` registers, so the
colour, base address and roof counter in `$s3` survive their calls. The coordinates used here keep
every stored cell inside the grid.

```mips|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE 32                # words across and down
.eqv SKY 0x0070B0E0
.eqv GRASS 0x003C9648
.eqv SUN 0x00FFD200
.eqv WALL 0x00C07040
.eqv ROOF 0x00A02020
.eqv DOOR 0x00704020

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): $a0-$a3 hold the dimensions;
# $s0 holds the colour and $s1 holds the grid base
fill_rect:
    blez $a2, rect_done     # nothing to draw when width or height is nonpositive
    blez $a3, rect_done
    move $t0, $a1           # row = y
    add $t1, $a1, $a3       # one past the last row
rect_rows:
    sll $t2, $t0, 5         # row * SIDE
    add $t2, $t2, $a0       # + x
    sll $t2, $t2, 2         # four bytes per word
    add $t2, $t2, $s1       # the first pixel of this run
    move $t3, $a2           # how many still to draw across
rect_cols:
    sw $s0, 0($t2)
    addi $t2, $t2, 4
    addi $t3, $t3, -1
    bnez $t3, rect_cols
    addi $t0, $t0, 1
    blt $t0, $t1, rect_rows
rect_done:
    jr $ra

# fill_disc(cx, cy, r): $a0-$a2 hold centre and radius;
# $s0 holds the colour and $s1 holds the grid base
fill_disc:
    mul $t7, $a2, $a2       # r * r
    sub $t0, $a1, $a2       # y = cy - r
    add $t1, $a1, $a2       # the last row
disc_rows:
    sub $t2, $a0, $a2       # x = cx - r
    add $t3, $a0, $a2
disc_cols:
    sub $t4, $t2, $a0       # dx
    sub $t5, $t0, $a1       # dy
    mul $t4, $t4, $t4
    mul $t5, $t5, $t5
    add $t4, $t4, $t5       # dx*dx + dy*dy
    bge $t4, $t7, disc_next
    sll $t6, $t0, 5         # the same address arithmetic again
    add $t6, $t6, $t2
    sll $t6, $t6, 2
    add $t6, $t6, $s1
    sw $s0, 0($t6)
disc_next:
    addi $t2, $t2, 1
    ble $t2, $t3, disc_cols
    addi $t0, $t0, 1
    ble $t0, $t1, disc_rows
    jr $ra

main:
    la $s1, display         # shared grid base for both helpers

    li $s0, SKY             # the sky, the top twenty rows
    li $a0, 0
    li $a1, 0
    li $a2, SIDE
    li $a3, 20
    jal fill_rect

    li $s0, GRASS           # the ground under it
    li $a0, 0
    li $a1, 20
    li $a2, SIDE
    li $a3, 12
    jal fill_rect

    li $s0, SUN             # a disc of radius 4, up in the corner
    li $a0, 26
    li $a1, 6
    li $a2, 4
    jal fill_disc

    li $s0, WALL            # the house
    li $a0, 10
    li $a1, 16
    li $a2, 12
    li $a3, 10
    jal fill_rect

    li $s0, ROOF            # six rows up from the wall, each two cells narrower
    li $s3, 0
roof:
    li $a0, 10
    add $a0, $a0, $s3
    li $a1, 15
    sub $a1, $a1, $s3
    li $a2, 12
    sll $t7, $s3, 1
    sub $a2, $a2, $t7
    li $a3, 1
    jal fill_rect
    addi $s3, $s3, 1
    blt $s3, 6, roof

    li $s0, DOOR            # and a door in the wall
    li $a0, 14
    li $a1, 21
    li $a2, 4
    li $a3, 5
    jal fill_rect

    li $v0, 10
    syscall
```

The `# @screen` line sets the Screen on every Build. `unit=8` draws each word as an 8 by 8 block;
`width=256 height=256` sets the display area. Thus 256 divided by 8 gives 32 cells across and
down. `base=display` connects the Screen to the reserved memory labelled `display`. The
`32 * 32` words need `32 * 32 * 4 = 4096` bytes, the amount reserved by `.space 4096`.

A colour is the low 24 bits of a word, red in bits 23 to 16, green in 15 to 8 and blue in 7 to 0.
So `0x0070B0E0` is a pale blue made of 112 red, 176 green and 224 blue, and the order is the
`#RRGGBB` you write in CSS with a `0x` on the front.

The address of the cell at `(x, y)` is `base + (y * SIDE + x) * 4`, the same calculation used for
a 2D array of words. Both helpers use `sll` by 5 for `y * 32`, add `x`, use `sll` by 2 for four
bytes per word, then add the base address.

`fill_rect` computes the first address in each row, then advances by four bytes for every cell
across. The roof loop calls it six times with height 1: each call moves one row upward, starts one
column farther right and draws two fewer cells. The wall and door are rectangles drawn in the same
way.

`fill_disc` checks each cell in the square from `cx - r` to `cx + r` and from `cy - r` to
`cy + r`. Only cells satisfying `dx * dx + dy * dy < r * r` receive a store. For this sun,
`r = 4`, so a cell three columns from the centre on the same row passes (`3 * 3 < 16`), while
one four columns away fails (`4 * 4` is not less than 16). The `bge` skips the store when the
distance squared is equal to or greater than 16. That includes the square's outer edge.

Try adding a window to the house. Select **Open in editor** and copy the door call, from
`li $s0, DOOR` through `jal fill_rect`. Paste the copy just before the original door call.
In the copy, set `$s0` to `SUN`, then pass `x = 12`, `y = 18`, `w = 3` and `h = 3` in
`$a0`–`$a3`. Build and run. You should see a yellow 3 by 3 window near the upper-left of the wall.

Now move the sun's centre three cells right by changing its `li $a0, 26` to `li $a0, 29`.
Build and run again. Part of the sun appears at the left edge one row lower: column 32 of a row
has the same memory address as column 0 of the next row. These helpers do not check whether a
coordinate is inside the 32 by 32 grid. Return the centre to 26 when finished.
