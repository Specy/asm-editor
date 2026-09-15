A ball crosses the screen and turns round at every edge, and a bar along the bottom grows with the
time the program has been running. It never stops on its own: press Run, watch it, and press Stop
when you have had enough.

Drawing a new picture fifteen or twenty times a second brings two problems with it: the person
watching must never see a half drawn frame, and the ball has to move at the same speed whatever the
machine underneath is doing.

```mips|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE 32                # words across and down
.eqv BALL 4                 # the ball, in words
.eqv LIMIT 27               # SIDE - BALL - 1, the largest x or y
.eqv FRAME 60               # milliseconds per frame
.eqv BACKGROUND 0x00101820
.eqv BALLCOLOUR 0x00FFCC33
.eqv BAR 0x00808080

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): the colour is in $s0 and the grid in $s1
fill_rect:
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
    ble $s2, LIMIT, x_done
flip_x:
    sub $s4, $zero, $s4     # turn it round at the edge
    add $s2, $s2, $s4
    add $s2, $s2, $s4
x_done:
    add $s3, $s3, $s5
    bltz $s3, flip_y
    ble $s3, LIMIT, y_done
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

    li $v0, 30              # service 30: milliseconds since the run started
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

    li $v0, 32              # service 32: let a frame of program time pass
    li $a0, FRAME
    syscall
    j frame
```

```testcase
{ "runFor": 200000 }
```

The frame is four steps and they are always in this order: erase the ball where it was, move it,
draw it where it is now, and let some program time pass. The grid is painted with the background
**once**, before the loop, and after that a frame writes only the sixteen cells the ball covers,
twice over as it is erased and drawn again, and the thirty two of the bottom row.

That is why a frame is cheap, and cheap is what it has to be. The words in memory **are** the
picture: there is no second copy being prepared out of sight and shown all at once, so every `sw`
changes what is on the screen the instant it runs. Repaint all 1024 words every frame and you are
writing a whole screen while it is being looked at, which shows up as a flicker, and you are
spending ten times as many instructions to do it.

So the rule for an animation here is to write as few pixels as you can get away with: erase what
moved, draw it where it now is, and leave every other word alone. The cost of a frame then depends
on what changed rather than on how big the grid is.

Service 32 waits for `$a0` milliseconds of **program time**. The wait costs no instructions at all,
so a program that idles never reaches the Playground's two million, and the editor stays responsive
so Stop still answers. Inside a testcase both clock services run on a virtual clock that starts at
zero and only moves through the program's own waits, which is why a test of an animation does not
take a minute.

Service 30 answers in `$a0`, and the bar is that number turned into a width: a `div` by 100 gives
tenths of a second, and the remainder of a second `div` by 32 wraps it at the width of the grid. The
bar is erased and redrawn every frame, and the `beqz $s6, no_bar` above it is there because a
rectangle of width 0 would still draw one cell: `fill_rect` tests its counter at the **bottom** of
the inner loop, so the body runs once before anything is checked.

The ball's position and step are four saved registers, and the four edges are four comparisons.
`sub $s4, $zero, $s4` flips the sign of the step, which turns the ball round without either branch
knowing which way it was going, and the two `add` instructions after it undo the move that took it
off the edge and then move it back the other way. `LIMIT` is 27 because the ball is four cells wide
and the grid is 32, so a left edge of 27 puts its right edge on column 30.

One frame is about 470 instructions, and a `runFor` of 200000 is 424 of them.

Change `.eqv FRAME 60` to `.eqv FRAME 200` and watch two things move at different speeds. The ball
crawls, because it still moves one cell per frame and the frames are now a fifth of a second apart.
The bar along the bottom races, because it is drawn from program time, and over the same 424 frames
that has gone from 25 seconds to 85. One number changed the relationship between how often you draw
and how fast time passes, which is the thing every animation has to get right.
