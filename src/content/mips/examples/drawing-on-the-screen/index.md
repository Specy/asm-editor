A picture in a handful of shapes: two rectangles for the sky and the ground, a disc for the sun, a
rectangle for the house, six rows of decreasing width for its roof and one more rectangle for the
door. Press Run and watch the Screen panel next to the program.

The screen asks nothing of anybody. It is a block of memory, one word per pixel, and every shape on
it is a loop of `sw` instructions that your program writes.

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

# fill_rect(x, y, w, h): the colour is in $s0 and the grid in $s1
fill_rect:
    blez $a2, rect_done     # nothing to draw when the width or height is 0
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

# fill_disc(cx, cy, r): every cell whose distance from the centre is under r
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
    la $s1, display

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

    li $s0, SUN             # a disc of radius 3, up in the corner
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

The `# @screen` line is read by every Build, before the first instruction runs. `unit=8` draws one
word as an 8 by 8 block, `width=256 height=256` is the display area, and `base=display` names a
label your own program defines, so the grid starts wherever the assembler put it. 256 divided by 8
is 32, which is why `SIDE` is 32 and why `.space 4096` is exactly the right amount of room: 32 by 32
words of four bytes each.

A colour is the low 24 bits of a word, red in bits 23 to 16, green in 15 to 8 and blue in 7 to 0.
So `0x0070B0E0` is a pale blue made of 112 red, 176 green and 224 blue, and the order is the
`#RRGGBB` you write in CSS with a `0x` on the front.

The address of the pixel at column `x` and row `y` is `base + (y * SIDE + x) * 4`, which is the 2D
array of the Example before this one with an element size of four. Both subroutines here work that
out the same way: `sll` by 5 for the `y * 32`, an `add` for the `x`, `sll` by 2 for the four bytes,
and an `add` for the base.

`fill_rect` computes that address once per row and then walks along the row with `addi $t2, $t2, 4`,
because the pixels of a row sit next to each other in memory. `fill_disc` computes it per pixel,
because it only writes the ones it keeps. A cell is inside the disc when `dx * dx + dy * dy` is
under `r * r`, which is Pythagoras with the square root left off both sides.

The colour is in `$s0` and the grid's address in `$s1`, and neither is passed as an argument. That
is a decision this program made: both are the same for nearly every shape it draws, so instead of
handing them to every subroutine it keeps them in two saved registers and the subroutines read them
from there. It works because `$s0` to `$s7` are the registers a subroutine has to hand back
untouched, and `fill_rect` writes nothing but `$t` registers.

The whole picture is 6495 instructions out of the two million a Playground gets, and 1251 of those
are the `sw` instructions themselves: a 32 by 32 grid is 1024 words, and the sky and the ground
between them cover every one of those before anything else is drawn on top.

Notice that there is no writing anywhere in the picture. The screen here is pixels and nothing but
pixels: there is no service that puts a string at a position on it, so a caption under the house
would have to be drawn letter by letter out of coloured cells, out of a font you had built yourself.
Text goes to the console instead, which is why the games later on print their scores there.

Move the sun's centre three cells right, by changing its `li $a0, 26` to `li $a0, 29`, and run it.
Part of the sun appears at the **left** hand edge of the row below it. Nothing between the
coordinates and the `sw` checks that a column is still on the screen, and since the grid is one long
line of memory, column 32 of a row is simply column 0 of the next one. Clipping is something a
program does for itself or does not get.
