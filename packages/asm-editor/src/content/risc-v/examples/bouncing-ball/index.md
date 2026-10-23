A ball crosses the screen, turns at all four edges, and leaves a growing time bar along the bottom.
Press Run, open the Screen panel, and press Stop when you have watched a few bounces.

Each frame does four jobs in order:

1. erase the ball at its old position;
2. update its position and direction;
3. draw it at its new position;
4. update the time bar and wait before the next frame.

The coordinates `x` and `y` name the ball's **top-left cell**. Its position, direction, and the
other values that must survive calls live in saved registers:

| Register   | Meaning                                         |
| ---------- | ----------------------------------------------- |
| `s0`       | address of the first display word               |
| `s1`       | colour used by the next rectangle call          |
| `s2`, `s3` | ball's top-left `x`, `y`                        |
| `s4`, `s5` | horizontal and vertical steps, each `-1` or `1` |
| `s6`       | current width of the bottom bar                 |
| `s7`       | largest valid top-left coordinate for the ball  |

`fill_rect` takes `x`, `y`, width, and height in `a0`–`a3`. It reads `s0` and `s1`, uses only
`t0`–`t3` as scratch registers, and leaves `s0`–`s7` unchanged. A zero or negative width or height
draws nothing. Positive rectangles must fit on the 32 by 32 display because the helper does not
clip them at an edge.

```riscv|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv SIDE, 32               # words across and down
.eqv BALL, 4                # ball width and height, in cells
.eqv LIMIT, 28              # SIDE - BALL, largest valid top-left x or y
.eqv FRAME, 60              # milliseconds per frame: about 17 frames per second
.eqv BACKGROUND, 0x00101820
.eqv BALLCOLOUR, 0x00FFCC33
.eqv BAR, 0x00808080

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, width, height)
# Reads s0=display base and s1=colour; changes only t0-t3.
fill_rect:
    blez a2, rect_done
    blez a3, rect_done
    mv t0, a1               # current row = y
    add t1, a1, a3          # one past the last row
rect_rows:
    slli t2, t0, 5          # row * SIDE
    add t2, t2, a0          # + x
    slli t2, t2, 2          # four bytes per word
    add t2, t2, s0          # address of the first cell in this row
    mv t3, a2               # cells left across the row
rect_cols:
    sw s1, 0(t2)
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, rect_cols
    addi t0, t0, 1
    blt t0, t1, rect_rows
rect_done:
    ret

main:
    addi sp, sp, -12        # align the Playground stack before calls
    la s0, display

    li s1, BACKGROUND       # paint the whole grid once
    li a0, 0
    li a1, 0
    li a2, SIDE
    li a3, SIDE
    jal fill_rect

    li s2, 6                # top-left x
    li s3, 9                # top-left y
    li s4, 1                # dx
    li s5, 1                # dy
    li s7, LIMIT

frame:
    li s1, BACKGROUND       # erase the ball at its old position
    mv a0, s2
    mv a1, s3
    li a2, BALL
    li a3, BALL
    jal fill_rect

    add s2, s2, s4          # move horizontally
    bltz s2, flip_x
    ble s2, s7, x_done
flip_x:
    neg s4, s4              # reverse direction
    add s2, s2, s4          # undo the move beyond the edge
    add s2, s2, s4          # take one step in the new direction
x_done:
    add s3, s3, s5          # move vertically
    bltz s3, flip_y
    ble s3, s7, y_done
flip_y:
    neg s5, s5
    add s3, s3, s5
    add s3, s3, s5
y_done:

    li s1, BALLCOLOUR       # draw the ball at its new position
    mv a0, s2
    mv a1, s3
    li a2, BALL
    li a3, BALL
    jal fill_rect

    li a7, 30               # elapsed milliseconds since the run started
    ecall
    li t0, 100
    div t1, a0, t0          # tenths of a second
    li t0, SIDE
    rem s6, t1, t0          # width modulo 32

    li s1, BACKGROUND       # clear the bottom row
    li a0, 0
    li a1, 31
    li a2, SIDE
    li a3, 1
    jal fill_rect

    li s1, BAR              # draw s6 cells of the time bar
    li a0, 0
    li a1, 31
    mv a2, s6
    li a3, 1
    jal fill_rect           # width 0 is safe: fill_rect draws nothing

    li a7, 32
    li a0, FRAME
    ecall
    j frame
```

```testcase
{ "runFor": 200000 }
```

## Keeping the ball inside the display

A four-cell-wide ball with left edge `x` occupies columns `x` through `x + 3`. The last position
that fits is therefore `x = 28`, which occupies columns 28 through 31. The same calculation applies
to `y`, so `LIMIT` is `SIDE - BALL`, or 28.

The program first tries one step. If the result lies below 0 or above `LIMIT`, it reverses the step
and corrects the position. For a concrete left-edge bounce, suppose `x = 0` and `dx = -1`:

```text
try the old step:       x = 0 + (-1) = -1
flip dx and correct:   dx = 1, then x = -1 + 1 + 1 = 1
```

The first added `1` returns to the old position 0; the second moves to position 1. The right, top,
and bottom edges use the same rule.

## Drawing a sequence of frames

The display words are the picture, so each `sw` changes a visible cell. The background is filled
once before the loop. Later frames erase the old 4 by 4 ball and draw the new one, leaving the rest
of the background alone. The bottom row is cleared and redrawn because its width changes over time.

The inner loop in `fill_rect` is bottom-tested: it stores a cell before `bnez` decides whether to
repeat. The two `blez` checks at the entrance are therefore important. They prevent a width or
height of zero from entering a loop that expects a positive count. In particular, the time bar can
safely call the helper when `s6` is zero.

Service 30 supplies elapsed milliseconds in `a0`. Dividing by 100 turns that reading into tenths of
a second, and the remainder after division by 32 gives a bar width from 0 through 31. The bar wraps
to zero every 3.2 seconds.

Service 32 controls the pace of the frames. During an interactive run it waits for the requested
duration, so `FRAME = 60` produces about seventeen frames per second. In a testcase, service 32
advances the testcase virtual clock immediately. Service 30 reads that same virtual clock, which
keeps the bar and animation deterministic without making the test wait in real time.

Change `FRAME` to 200 and run the program again. The ball moves one cell every 200 milliseconds, so
it moves more slowly. The bar still grows by one cell per tenth of a second; fewer animation frames
occur while it grows, but its rate in program time is unchanged.

At startup, `main` lowers `sp` by 12 bytes so it is aligned before the first call. There is no
matching restoration because this animation loops until you press Stop and never returns from
`main`.

## Exercises

1. Change only `li s4, 1` to `li s4, -1`. With the starting `x` still 6, predict the first two
   positions at which the ball is drawn, then run it. You should predict `x = 5` and `x = 4`; `y`
   continues to increase at the same time.

2. Make the ball 2 by 2 by changing `BALL`. Derive the new `LIMIT` before editing it. The correct
   value is 30: a ball whose top-left cell is `(30, 30)` reaches column and row 31 exactly. Check
   that it now travels closer to every edge.

3. Make the bar grow by one cell per second. Change the divisor used immediately after service 30
   from 100 to 1000. The bar should take 31 seconds to reach width 31 and wrap to zero at 32 seconds.

4. After the first full-screen background call and before the ball state is initialized, use
   `fill_rect` to draw a 6 by 2 grey rectangle at `(13, 13)`. Set `s1` to `BAR`, then pass
   `a0 = 13`, `a1 = 13`, `a2 = 6`, and `a3 = 2`. It appears immediately. When the ball eventually
   crosses it, the ball's background-colour erase also removes the cells it covered; this animation
   keeps only one uniform background rather than remembering what used to be under the ball.
