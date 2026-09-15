A ball crosses the screen and turns round at every edge, and a bar along the bottom grows with the
time the program has been running. It never stops on its own: press Run, watch it, and press Stop
when you have had enough.

Drawing one picture and stopping is easy. Drawing a new one fifteen times a second brings two
problems along with it: nobody must ever see a half finished frame, and the ball has to move at the
same speed no matter how fast the machine underneath happens to be.

```riscv|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE, 32               # words across and down
.eqv BALL, 4                # the ball, in words
.eqv LIMIT, 27              # SIDE - BALL - 1, the largest x or y
.eqv FRAME, 60              # milliseconds per frame
.eqv BACKGROUND, 0x00101820
.eqv BALLCOLOUR, 0x00FFCC33
.eqv BAR, 0x00808080

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): the grid is in s0 and the colour in s1
fill_rect:
    mv t0, a1               # row = y
    add t1, a1, a3          # one past the last row
rect_rows:
    slli t2, t0, 5          # row * SIDE
    add t2, t2, a0          # + x
    slli t2, t2, 2          # four bytes per word
    add t2, t2, s0
    mv t3, a2               # how many still to draw across
rect_cols:
    sw s1, 0(t2)
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, rect_cols
    addi t0, t0, 1
    blt t0, t1, rect_rows
    ret

main:
    la s0, display
    li s1, BACKGROUND       # paint the whole grid once, and once only
    li a0, 0
    li a1, 0
    li a2, SIDE
    li a3, SIDE
    jal fill_rect

    li s2, 6                # x
    li s3, 9                # y
    li s4, 1                # dx
    li s5, 1                # dy
    li s7, LIMIT            # the edge, which a branch needs in a register

frame:
    li s1, BACKGROUND       # erase the ball where it was
    mv a0, s2
    mv a1, s3
    li a2, BALL
    li a3, BALL
    jal fill_rect

    add s2, s2, s4          # move it
    bltz s2, flip_x
    ble s2, s7, x_done
flip_x:
    sub s4, zero, s4        # turn it round at the edge
    add s2, s2, s4
    add s2, s2, s4
x_done:
    add s3, s3, s5
    bltz s3, flip_y
    ble s3, s7, y_done
flip_y:
    sub s5, zero, s5
    add s3, s3, s5
    add s3, s3, s5
y_done:

    li s1, BALLCOLOUR       # and draw it where it is now
    mv a0, s2
    mv a1, s3
    li a2, BALL
    li a3, BALL
    jal fill_rect

    li a7, 30               # service 30: milliseconds since the run started
    ecall
    li t0, 100
    div t1, a0, t0          # tenths of a second
    li t0, SIDE
    rem s6, t1, t0          # wrapped at the width of the grid

    li s1, BACKGROUND       # the bar along the bottom row
    li a0, 0
    li a1, 31
    li a2, SIDE
    li a3, 1
    jal fill_rect
    beqz s6, no_bar
    li s1, BAR
    li a0, 0
    li a1, 31
    mv a2, s6
    li a3, 1
    jal fill_rect
no_bar:

    li a7, 32               # service 32: let a frame of program time pass
    li a0, FRAME
    ecall
    j frame
```

```testcase
{ "runFor": 200000 }
```

The frame is four steps and they are always in this order: erase the ball where it was, move it, draw
it where it is now, and let some program time pass. The grid is painted with the background **once**,
before the loop, and after that a frame writes only the sixteen cells the ball covers, twice over as
it is erased and drawn again, and the thirty two of the bottom row.

These words in memory **are** the picture. There is no hidden copy being prepared and swapped in:
every `sw` changes what you are looking at the instant it runs. So the way to keep a frame from
tearing is to write as little as possible. Erase what moved, draw it where it now is, leave the
other thousand cells alone. Repainting the whole grid every frame would be visible as a flicker, and
it would cost ten times as much.

Service 32 waits for `a0` milliseconds of **program time**. The wait costs no instructions at all, so
a program that idles never reaches the Playground's two million, and the editor stays responsive so
Stop still answers. Inside a testcase both clock services run on a virtual clock that starts at zero
and only moves through the program's own waits, which is why a test of an animation does not take a
minute.

Service 30 answers with the milliseconds in `a0`, and with the top half of the count in `a1` for a
run long enough to need it. The bar is that number turned into a width: `div` by 100 for tenths of a
second, `rem` by 32 to wrap it at the width of the grid. The `beqz s6, no_bar` in front of it is
there because a rectangle of width 0 would still draw one cell. `fill_rect` tests its counter at the
**bottom** of its inner loop, so the body always runs once before anything is checked.

The ball's position and its step are four saved registers, and the step is what makes the bounce
simple: `sub s4, zero, s4` flips its sign, so the ball turns round without the code having to know
which way it was going. The two `add` instructions after it undo the move that took it off the edge
and then apply the new step instead. `LIMIT` is 27 because the ball is four cells wide on a grid of
32, so a left edge at 27 puts its right edge on column 30.

Raise `FRAME` from 60 to 200 and two things happen that are worth telling apart. The ball crawls,
because it still moves one cell per frame and the frames are now a fifth of a second apart. The bar
along the bottom races, because it is drawn from the clock, not from the frame count, and the same
number of frames now covers three times as much program time.
