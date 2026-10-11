Select **Open in editor**, then **Build** and **Run**. Click the **Screen** before pressing keys;
click it again if you return to the editor. Type lowercase `w`, `a`, `s` or `d` to steer the square.
It keeps moving in the last direction you chose and reappears at the opposite edge when it crosses
the grid. Press **Stop** when you are done.

The Screen has a 32 by 32 grid of coloured cells. The square covers 3 by 3 cells, and its upper-left
corner starts at `(14, 14)`. `fill_rect` takes `x` in `$a0`, `y` in `$a1`, width in `$a2`, and
height in `$a3`. It uses the colour in `$s0` and the address of `display` in `$s1`. The program calls
it first to paint the background, then to erase and redraw the moving square.

The keyboard receiver is a device-address block beginning at `0xffff0000`. Its control register is
at that address, and its data register is four bytes later, at `0xffff0004`. Loads from these
addresses ask the device for input. Stores to `display` paint Screen cells; loads from `display`
read their current colour words.

```mips|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv MMIO 0xffff0000
.eqv SIDE 32                # words across and down
.eqv BOX 3                  # the square, in words
.eqv LAST 29                # SIDE - BOX, the largest x or y
.eqv FRAME 80               # milliseconds per frame
.eqv BACKGROUND 0x00101820
.eqv BOXCOLOUR 0x0000C060

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): $a0-$a3 hold the rectangle;
# $s0 holds the colour and $s1 holds the grid base
fill_rect:
    move $t0, $a1           # row = y
    add $t1, $a1, $a3       # one past the last row
rect_rows:
    sll $t2, $t0, 5         # row * SIDE
    add $t2, $t2, $a0       # + x
    sll $t2, $t2, 2         # four bytes per word
    add $t2, $t2, $s1
    move $t3, $a2
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
    li $s7, MMIO
    li $s0, BACKGROUND      # paint the grid once
    li $a0, 0
    li $a1, 0
    li $a2, SIDE
    li $a3, SIDE
    jal fill_rect

    li $s2, 14              # x
    li $s3, 14              # y
    li $s4, 1               # dx
    li $s5, 0               # dy

frame:
    li $s0, BACKGROUND      # erase the square where it was
    move $a0, $s2
    move $a1, $s3
    li $a2, BOX
    li $a3, BOX
    jal fill_rect

# --- one key sets the direction, it does not move the square -----------------
    lw $t4, 0($s7)          # the receiver control register
    andi $t4, $t4, 1        # the Ready bit
    beqz $t4, no_key
    lw $t5, 4($s7)          # read the waiting character
    andi $t5, $t5, 0xFF
    bne $t5, 'a', not_a
    li $s4, -1
    li $s5, 0
not_a:
    bne $t5, 'd', not_d
    li $s4, 1
    li $s5, 0
not_d:
    bne $t5, 'w', not_w
    li $s4, 0
    li $s5, -1
not_w:
    bne $t5, 's', no_key
    li $s4, 0
    li $s5, 1
no_key:

# --- and the square moves on its own, coming back in at the far edge ---------
    add $s2, $s2, $s4
    ble $s2, LAST, x_low
    li $s2, 0               # off the right edge, back at the left
x_low:
    bgez $s2, x_done
    li $s2, LAST            # off the left edge, back at the right
x_done:
    add $s3, $s3, $s5
    ble $s3, LAST, y_low
    li $s3, 0
y_low:
    bgez $s3, y_done
    li $s3, LAST
y_done:

    li $s0, BOXCOLOUR       # and draw it where it is now
    move $a0, $s2
    move $a1, $s3
    li $a2, BOX
    li $a3, BOX
    jal fill_rect

    li $v0, 32              # a frame of program time
    li $a0, FRAME
    syscall
    j frame
```

```testcase
{ "runFor": 100000 }
```

Each pass through `frame` erases the old square, polls the keyboard, moves its upper-left corner,
wraps that corner if it crosses an edge, draws the square at its new position, and waits before the
next pass. The background is painted only once. `$s2` and `$s3` hold the corner's `x` and `y`;
`$s4` and `$s5` hold the horizontal and vertical steps. The initial steps `(1, 0)` move it right.

`$s7` holds `0xffff0000`. The load at `0($s7)` reads receiver control; `andi` keeps Ready bit 0.
When that bit is 1, a character is waiting, so the load at `4($s7)` reads receiver data. The
character is in its low byte, and reading the data consumes it. If a character is waiting, it
remains available until the program reads it. If Ready is 0, the program skips the character checks
and keeps the previous steps.

Each `bne` compares the received character with one of the lowercase direction letters. The
assembler accepts a character literal such as `'d'` as shorthand for its numeric value. Pressing
`d` sets `($s4, $s5)` to `(1, 0)`: one cell right per frame and no vertical movement. Pressing `w`
sets it to `(0, -1)`. Setting the unused step to zero prevents diagonal movement when you change
direction. Uppercase `W` does not match lowercase `'w'` in this program.

The receiver supplies typed characters rather than a continuous report of held keys. A key changes
the stored direction; releasing it does not change the steps, so the square keeps moving. This
program checks for the four letter characters and does not use arrow-key input. The fixed testcase
runs the program without typing into the receiver; use the Screen to check the steering yourself.

`LAST` is 29 because a 3-cell square whose left edge is at column 29 occupies columns 29–31. If a
rightward step makes `x` greater than 29, the code sets `x` to 0. A step past the left edge sets
`x` to 29. The same checks wrap `y` at the top and bottom.

Try this first: while it moves right, press `w`, then `d`. Predict the steps after each key. They
should be `(0, -1)` and then `(1, 0)`, so the square turns up and then right without moving
diagonally. To change the edge behavior, replace the `li $s2, 0` immediately after
`ble $s2, LAST, x_low` with `li $s2, LAST`. Build and Run again, then press `d`. At the right edge
the square now stays in the last valid column instead of appearing on the left; the other three
edges still wrap.
