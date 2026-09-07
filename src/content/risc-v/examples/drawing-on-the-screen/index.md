A picture in a handful of shapes: two rectangles for the sky and the ground, a disc for the sun, a
rectangle for the house, six rows of decreasing width for its roof and one more rectangle for the
door. Press Run and watch the Screen panel next to the program.

Print a string asked the environment for a line of text. The screen asks nothing of anybody. It is a
block of memory, one word per pixel, and every shape on it is a loop of `sw` instructions that your
program writes.

**You need to know:** the "The bitmap display and the keyboard registers" lecture and the "A 2D
array" Example. What is new here is a shape as a subroutine: `fill_rect` and `fill_disc` are the two
the rest of the program calls, because nothing in the machine draws anything.

```riscv|playground|screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE, 32               # words across and down
.eqv SKY, 0x0070B0E0
.eqv GRASS, 0x003C9648
.eqv SUN, 0x00FFD200
.eqv WALL, 0x00C07040
.eqv ROOF, 0x00A02020
.eqv DOOR, 0x00704020

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): the grid is in s0 and the colour in s1
fill_rect:
    blez a2, rect_done      # nothing to draw when the width or height is 0
    blez a3, rect_done
    mv t0, a1               # row = y
    add t1, a1, a3          # one past the last row
rect_rows:
    slli t2, t0, 5          # row * SIDE
    add t2, t2, a0          # + x
    slli t2, t2, 2          # four bytes per word
    add t2, t2, s0          # the first pixel of this run
    mv t3, a2               # how many still to draw across
rect_cols:
    sw s1, 0(t2)
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, rect_cols
    addi t0, t0, 1
    blt t0, t1, rect_rows
rect_done:
    ret

# fill_disc(cx, cy, r): every cell whose distance from the centre is under r
fill_disc:
    mul t6, a2, a2          # r * r
    sub t0, a1, a2          # y = cy - r
    add t1, a1, a2          # the last row
disc_rows:
    sub t2, a0, a2          # x = cx - r
    add t3, a0, a2
disc_cols:
    sub t4, t2, a0          # dx
    sub t5, t0, a1          # dy
    mul t4, t4, t4
    mul t5, t5, t5
    add t4, t4, t5          # dx*dx + dy*dy
    bge t4, t6, disc_next
    slli t4, t0, 5          # the same address arithmetic again
    add t4, t4, t2
    slli t4, t4, 2
    add t4, t4, s0
    sw s1, 0(t4)
disc_next:
    addi t2, t2, 1
    ble t2, t3, disc_cols
    addi t0, t0, 1
    ble t0, t1, disc_rows
    ret

main:
    la s0, display

    li s1, SKY              # the sky, the top twenty rows
    li a0, 0
    li a1, 0
    li a2, SIDE
    li a3, 20
    jal fill_rect

    li s1, GRASS            # the ground under it
    li a0, 0
    li a1, 20
    li a2, SIDE
    li a3, 12
    jal fill_rect

    li s1, SUN              # a disc of radius 4, up in the corner
    li a0, 26
    li a1, 6
    li a2, 4
    jal fill_disc

    li s1, WALL             # the house
    li a0, 10
    li a1, 16
    li a2, 12
    li a3, 10
    jal fill_rect

    li s1, ROOF             # six rows up from the wall, each two cells narrower
    li s2, 0
    li s3, 6
roof:
    li a0, 10
    add a0, a0, s2
    li a1, 15
    sub a1, a1, s2
    li a2, 12
    slli t0, s2, 1
    sub a2, a2, t0
    li a3, 1
    jal fill_rect
    addi s2, s2, 1
    blt s2, s3, roof

    li s1, DOOR             # and a door in the wall
    li a0, 14
    li a1, 21
    li a2, 4
    li a3, 5
    jal fill_rect

    li a7, 10
    ecall
```

The `# @screen` line is read by every Build, before the first instruction runs. `unit=8` draws one
word as an 8 by 8 block, `width=256 height=256` is the display area, and `base=display` names a label
your own program defines, so the grid starts wherever the assembler put it. 256 divided by 8 is 32,
which is why `SIDE` is 32 and why `.space 4096` is exactly the right amount of room: 32 by 32 words
of four bytes each.

A colour is the low 24 bits of a word, red in bits 23 to 16, green in 15 to 8 and blue in 7 to 0. So
`0x0070B0E0` is `rgb(112, 176, 224)`, a pale blue, and the order is the `#RRGGBB` you write in CSS
with a `0x` on the front. The M68K's screen takes the same three bytes the other way round.

The address of the pixel at column `x` and row `y` is `base + (y * SIDE + x) * 4`, which is the two
dimensional array of the Example before this one with an element size of four. Both subroutines here
work that out the same way: `slli` by 5 for the `y * 32`, an `add` for the `x`, `slli` by 2 for the
four bytes, and an `add` for the base.

`fill_rect` computes that address once per row and then walks along the row with `addi t2, t2, 4`,
because the pixels of a row sit next to each other in memory. `fill_disc` computes it per pixel,
because it only writes the ones it keeps. A cell is inside the disc when `dx * dx + dy * dy` is under
`r * r`, which is Pythagoras with the square root left off both sides.

`fill_disc` writes the address into `t4`, the register that was holding the squared distance a line
earlier, and it has to: RISC-V has seven temporaries, `t0` to `t6`, and the loop is already using all
seven. MIPS has ten of them, so its version of this subroutine gives the address one of its
own. Once the `bge` has read `t4` the distance is finished with, so reusing it costs nothing but a
comment.

The grid's address is in `s0` and the colour in `s1`, and neither is an argument. The M68K's screen
has a pen colour and a fill colour of its own that a task sets; here the hardware has no such thing,
so this program keeps its own current colour in a saved register and every drawing subroutine reads
it from there. `s0` to `s11` are the registers a subroutine has to give back, so `fill_rect` writing
only `t` registers is what makes that work.

The whole picture is 6266 instructions out of the two million a Playground gets, and 1251 of those are
the `sw` instructions themselves: a 32 by 32 grid is 1024 words, and the sky and the ground between
them cover every one of those before anything else is drawn on top.

There is no text in the picture. The M68K has a task that draws a string at a pixel position; the
bitmap display has nothing of the kind, and a caption under a house has to be either drawn letter by
letter out of pixels or printed to the console instead.

Try changing the sun's `li a0, 26` to `li a0, 29`, which moves its centre three cells right. Its
right hand edge is cut off at column 31, and the cells that fell off it appear at the **left** of the
next row down, because nothing between the coordinates and the `sw` checks that the column is still
on the screen: a grid is one line of memory and column 32 of a row is column 0 of the next.
