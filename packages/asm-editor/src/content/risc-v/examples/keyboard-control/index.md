A square you steer. The `w`, `a`, `s` and `d` keys set which way it is going and it keeps going that
way on its own, coming back in at the opposite edge when it leaves the grid. **Click the Screen panel
first**: the Screen panel receives keyboard input only while it has focus, and a ring around it shows
when it does.

This animation also checks for keyboard input once per frame. A typed control key changes its
direction on that frame and every frame after it.

Each frame does five jobs in order:

```text
erase the old square
read at most one character and, if it is a control key, change dx and dy
add dx and dy to the position, wrapping at an edge
draw the square at its new position
wait 80 milliseconds
```

The values that must survive calls to `fill_rect` live in saved registers:

| Register   | Meaning                                               |
| ---------- | ----------------------------------------------------- |
| `s2`, `s3` | square's top-left `x`, `y`                            |
| `s4`, `s5` | horizontal and vertical steps, each `-1`, `0`, or `1` |
| `s6`       | base address of the keyboard's device registers       |
| `s7`       | largest valid top-left coordinate                     |
| `s8`–`s11` | character codes for `a`, `d`, `w`, and `s`            |

As before, `s0` holds the display address and `s1` holds the colour for the next rectangle call.

```riscv|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv MMIO, 0xffff0000
.eqv SIDE, 32               # words across and down
.eqv BOX, 3                 # the square, in words
.eqv LAST, 29               # SIDE - BOX, the largest x or y
.eqv FRAME, 80              # milliseconds per frame
.eqv BACKGROUND, 0x00101820
.eqv BOXCOLOUR, 0x0000C060

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, width, height)
# Reads s0=display base and s1=colour; changes only t0-t3.
fill_rect:
    blez a2, rect_done
    blez a3, rect_done
    mv t0, a1               # row = y
    add t1, a1, a3          # one past the last row
rect_rows:
    slli t2, t0, 5          # row * SIDE
    add t2, t2, a0          # + x
    slli t2, t2, 2          # four bytes per word
    add t2, t2, s0
    mv t3, a2
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
    li s6, MMIO
    li s7, LAST             # largest top-left x or y
    li s8, 'a'              # fixed key codes for branch comparisons
    li s9, 'd'
    li s10, 'w'
    li s11, 's'

    li s1, BACKGROUND       # paint the grid once
    li a0, 0
    li a1, 0
    li a2, SIDE
    li a3, SIDE
    jal fill_rect

    li s2, 14               # x
    li s3, 14               # y
    li s4, 1                # dx
    li s5, 0                # dy

frame:
    li s1, BACKGROUND       # erase the square where it was
    mv a0, s2
    mv a1, s3
    li a2, BOX
    li a3, BOX
    jal fill_rect

# --- one key sets the direction, it does not move the square -----------------
    lw t4, 0(s6)            # the receiver control register
    andi t4, t4, 1          # the Ready bit
    beqz t4, input_done
    lw t5, 4(s6)            # the receiver data, which takes the character
    andi t5, t5, 0xFF
    bne t5, s8, not_a
    li s4, -1
    li s5, 0
    j input_done
not_a:
    bne t5, s9, not_d
    li s4, 1
    li s5, 0
    j input_done
not_d:
    bne t5, s10, not_w
    li s4, 0
    li s5, -1
    j input_done
not_w:
    bne t5, s11, input_done
    li s4, 0
    li s5, 1
input_done:

# --- and the square moves on its own, coming back in at the far edge ---------
    add s2, s2, s4
    ble s2, s7, x_low
    li s2, 0                # off the right edge, back at the left
x_low:
    bgez s2, x_done
    li s2, LAST             # off the left edge, back at the right
x_done:
    add s3, s3, s5
    ble s3, s7, y_low
    li s3, 0
y_low:
    bgez s3, y_done
    li s3, LAST
y_done:

    li s1, BOXCOLOUR        # and draw it where it is now
    mv a0, s2
    mv a1, s3
    li a2, BOX
    li a3, BOX
    jal fill_rect

    li a7, 32               # wait one frame
    li a0, FRAME
    ecall
    j frame
```

```testcase
{ "runFor": 100000 }
```

`lw t4, 0(s6)` reads the **receiver control** register and `andi t4, t4, 1` keeps its Ready bit,
which is 1 when a character is waiting. `lw t5, 4(s6)` reads the **receiver data** register, whose
low byte is that character. Reading the data takes the character out of the queue. These addresses
select a device rather than ordinary display memory: the same `lw` instruction performs the read,
and the address says what is being read.

The program consumes at most one queued character per frame. Ready means "the queue is not empty",
so a character that arrives between two polls remains waiting for the next poll. That does not mean
the queue has unlimited capacity: input could be lost if characters arrive faster than the program
can consume them for long enough.

The four key codes are loaded into `s8` to `s11` once, before the loop, because branch comparisons
use registers and these values do not change. After a recognized key changes the direction, the
jump to `input_done` skips the other comparisons. An unrecognized character changes nothing.

The receiver hands over **characters that were typed**, one at a time. It cannot tell the program
that a key is being held down now, or that one has just been released. The key therefore sets a
direction that persists, and each frame applies it. This Playground receiver supplies typed
character input, so this example uses ordinary character keys: `w`, `a`, `s`, and `d`.

Setting the other step to 0 for every recognized direction keeps movement horizontal or vertical.
If those assignments were removed, pressing `d` and then `w` would leave both steps nonzero and the
square would move diagonally. Try the controls manually in the Screen panel.

## Fitting and wrapping the square

The coordinates name the square's top-left cell. A three-cell-wide square at `x = 29` occupies
columns 29, 30, and 31, so 29 is the last top-left position that fits. The same calculation applies
vertically. Therefore `LAST` is `SIDE - BOX`, or 29.

After the program adds a step, a coordinate above `LAST` wraps to 0, while a coordinate below 0
wraps to `LAST`. For example, moving left from `x = 0` produces `x = -1`; `li s2, LAST` then places
the square at the right edge. This is **wrapping**, not stopping or clamping at the edge.

`fill_rect` is safe when its width or height is zero or negative: its two entrance checks return
without drawing. Positive rectangles must still fit inside the 32 by 32 grid because the helper
does not clip them.

At startup, `main` lowers `sp` by 12 bytes so the Playground stack is aligned before the first
call. It never restores `sp` because this animation loops until you press Stop and does not return
from `main`.

## Exercises

1. Reverse the initial horizontal motion by changing `li s4, 1` to `li s4, -1`. Starting from
   `x = 14`, predict the first two drawn x-coordinates before running the program. They should be
   13 and 12.

2. Make the square 2 by 2. Change `BOX`, then derive and change `LAST`. The new value is 30: a
   square starting at column or row 30 occupies cells 30 and 31 exactly.

3. Change the movement from wrapping to **clamping**, so the square stops at an edge until another
   key changes its direction. For right or bottom overflow, write `LAST`; for left or top
   underflow, write 0. In other words, change the right-overflow assignment from `li s2, 0` to
   `li s2, LAST`, and the left-underflow assignment from `li s2, LAST` to `li s2, 0`. Make the
   matching changes for `s3`.
