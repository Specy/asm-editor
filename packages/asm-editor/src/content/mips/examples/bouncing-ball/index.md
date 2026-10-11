A 4 by 4 cell ball moves across a 32 by 32 Screen and bounces when it reaches the sides of its
play area. Row 31 is reserved for a bar that shows elapsed program time, so the ball occupies only
rows 0–30. Select **Open in editor**, then **Build** and **Run** to watch it. Press **Stop** when
you are done; the program keeps running until then.

The `# @screen` line connects the Screen to the memory labelled `display`. Each word there is one
coloured cell. With 8 display pixels per cell and a 256 by 256 display, the grid has 32 columns and
32 rows. A rectangle at `(x, y)` begins at byte address `display + (y * 32 + x) * 4`.

`fill_rect` takes `x`, `y`, width and height in `$a0`–`$a3`. It reads the colour from `$s0` and
the address of `display` from `$s1`. It returns immediately for a nonpositive width or height; for
a positive size, the caller must keep the whole rectangle inside the grid.

```mips|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE 32                # words across and down
.eqv BALL 4                 # the ball, in words
.eqv LIMIT_X 28             # rightmost ball cell is column 31
.eqv LIMIT_Y 27             # bottom ball cell is row 30; row 31 is the bar
.eqv FRAME 60               # milliseconds per frame
.eqv BACKGROUND 0x00101820
.eqv BALLCOLOUR 0x00FFCC33
.eqv BAR 0x00808080

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): $a0-$a3 hold the rectangle;
# $s0 holds the colour and $s1 holds the grid base
fill_rect:
    blez $a2, rect_done     # no cells for a nonpositive width or height
    blez $a3, rect_done
    move $t0, $a1           # row = y
    add $t1, $a1, $a3       # one past the last row
rect_rows:
    sll $t2, $t0, 5         # row * SIDE
    add $t2, $t2, $a0       # + x
    sll $t2, $t2, 2         # four bytes per word
    add $t2, $t2, $s1
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

main:
    la $s1, display
    li $s0, BACKGROUND      # paint the whole grid once, and once only
    li $a0, 0
    li $a1, 0
    li $a2, SIDE
    li $a3, SIDE
    jal fill_rect

    li $s2, 6               # x
    li $s3, 9               # y
    li $s4, 1               # dx
    li $s5, 1               # dy

frame:
    li $s0, BACKGROUND      # erase the ball where it was
    move $a0, $s2
    move $a1, $s3
    li $a2, BALL
    li $a3, BALL
    jal fill_rect

    add $s2, $s2, $s4       # move it
    bltz $s2, flip_x
    ble $s2, LIMIT_X, x_done
flip_x:
    sub $s4, $zero, $s4     # turn it round at the edge
    add $s2, $s2, $s4
    add $s2, $s2, $s4
x_done:
    add $s3, $s3, $s5
    bltz $s3, flip_y
    ble $s3, LIMIT_Y, y_done
flip_y:
    sub $s5, $zero, $s5
    add $s3, $s3, $s5
    add $s3, $s3, $s5
y_done:

    li $s0, BALLCOLOUR      # and draw it where it is now
    move $a0, $s2
    move $a1, $s3
    li $a2, BALL
    li $a3, BALL
    jal fill_rect

    li $v0, 30              # service 30: elapsed milliseconds in $a0
    syscall
    li $t4, 100
    div $a0, $t4
    mflo $t5                # tenths of a second
    li $t4, SIDE
    div $t5, $t4
    mfhi $s6                # wrapped at the width of the grid

    li $s0, BACKGROUND      # the bar along the bottom row
    li $a0, 0
    li $a1, 31
    li $a2, SIDE
    li $a3, 1
    jal fill_rect
    beqz $s6, no_bar
    li $s0, BAR
    li $a0, 0
    li $a1, 31
    move $a2, $s6
    li $a3, 1
    jal fill_rect
no_bar:

    li $v0, 32              # service 32: wait $a0 milliseconds
    li $a0, FRAME
    syscall
    j frame
```

```testcase
{ "runFor": 200000 }
```

The loop erases the old ball, moves its upper-left corner, draws it again, updates the bar, and
waits. The background is painted once before the loop. Later frames change the moving ball and the
bottom row, leaving the rest of the grid alone. Stores to `display` appear on the Screen as they
happen, so the ball can briefly be partly erased or drawn. Touching fewer cells makes that interval
shorter.

`$s2` and `$s3` hold the ball's upper-left column and row. `$s4` and `$s5` hold its steps, each
either `1` or `-1`. The ball is four cells wide, so its left edge can reach column 28 and still
cover only columns 28–31. Its top edge can reach row 27 and cover rows 27–30 without covering the
bar. These are the reasons for `LIMIT_X` and `LIMIT_Y`. After a step crosses either limit, `sub`
reverses that step; the two following `add` instructions undo the crossing and take one step back
into the play area. For example, moving right from `x = 28` first gives 29, then reflects to 27.

The bar uses two clock services. Put `30` in `$v0` and call `syscall` to receive elapsed program
milliseconds in `$a0`. `div $a0, $t4` divides by 100; `mflo` copies the quotient from `lo`, giving
tenths of a second. A second `div` divides that count by 32, and `mfhi` copies the remainder from
`hi` into `$s6`. That remainder is a width from 0 to 31, so the bar grows and then starts again.
When it is zero, `beqz` skips drawing the coloured bar. `fill_rect` would also do nothing with a
zero width, but skipping the call avoids needless setup. Put `32` in `$v0` and the frame delay in
`$a0` to wait that many milliseconds of program time before the next frame.

Try changing `.eqv FRAME 60` to `.eqv FRAME 200` in the editor. Build and Run again. The ball still
moves one cell each frame, but the frames are farther apart, so it moves more slowly. The bar uses
elapsed time, so it advances farther between frames. Restore `FRAME` to 60 afterward.

Then try a bounce near both limits. Change the initial `li $s2, 6` to `li $s2, 27` and
`li $s3, 9` to `li $s3, 26`; leave both steps at `1`. Before running, predict the next two
positions of the upper-left corner. Build and Run to see the ball reach the right and bottom edges,
then turn back. The positions are `(28, 27)` and `(27, 26)`: the first step reaches both limits,
and the second tries to cross them, so both steps reverse. You can change `FRAME` to 200 again if
you want more time to watch each position.
