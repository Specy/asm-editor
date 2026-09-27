A square you steer. The arrow keys set its direction, and it keeps moving after you release them.
When it leaves the play area, it reappears at the opposite edge. Choose **Build**, then **Run**,
click the Screen panel so it has the keyboard focus, and press the arrows. A focus ring appears around
the Screen. Press **Stop** when you are done; the program keeps running until you stop it.

As in A bouncing ball, the program draws and presents one picture per frame. After each frame it
checks which arrows are held. For port `0x31`, put the port number in `c` and an arrow's key code in
`b`, then use `in a, (c)`: `a` becomes 1 while that key is held, or 0 otherwise. The code checks
left, right, up and down in turn, using their key codes `0x25` through `0x28`.

```z80|playground|open-screen|no-registers|no-flags|allow-open
P_CHAR  equ 0x10
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_KEY   equ 0x31        ; 1 while the key whose code is in b is held down
P_FRAME equ 0x51

C_RECT    equ 4
C_CLEAR   equ 9
C_RESIZE  equ 10
C_BUF_ON  equ 11
C_PRESENT equ 13

K_LEFT  equ 0x25
K_UP    equ 0x26
K_RIGHT equ 0x27
K_DOWN  equ 0x28

WIDTH   equ 240
HEIGHT  equ 192
TOP     equ 16          ; the play area starts under the two text rows
CELL    equ 24
STEP    equ 6
RIGHT   equ WIDTH - CELL
BOTTOM  equ HEIGHT - CELL

BLACK   equ 0x00
BOX     equ 0x1F
WHITE   equ 0xFF

    .org 0x8000
    ld a, WIDTH
    out (P_X), a
    ld a, HEIGHT
    out (P_Y), a
    ld a, C_RESIZE
    out (P_CMD), a
    ld a, BLACK
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a      ; black, and black becomes the text background
    ld a, WHITE
    out (P_PEN), a
    ld hl, title
title_loop:
    ld a, (hl)
    or a
    jr z, ready
    out (P_CHAR), a     ; the title, at the text cursor
    inc hl
    jr title_loop
ready:
    ld a, C_BUF_ON
    out (P_CMD), a      ; the off-screen image starts as a copy of this one

frame:
    ld a, BLACK
    out (P_FILL), a
    out (P_PEN), a
    xor a
    out (P_X), a
    ld a, TOP
    out (P_Y), a
    ld a, WIDTH
    out (P_X2), a
    ld a, HEIGHT
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a      ; wipe the play area, leaving the title above it

    ld a, BOX
    out (P_FILL), a
    ld a, WHITE
    out (P_PEN), a
    ld a, (boxx)
    out (P_X), a
    add a, CELL
    out (P_X2), a
    ld a, (boxy)
    out (P_Y), a
    add a, CELL
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a

    ld a, C_PRESENT
    out (P_CMD), a
    in a, (P_FRAME)     ; one pass per animation frame

; --- the arrows set the direction, they do not move the square ---------------
    ld c, P_KEY         ; c is the port, b is the key code
    ld b, K_LEFT
    in a, (c)
    or a
    jr z, no_left
    ld a, -STEP
    ld (dx), a
    xor a
    ld (dy), a
no_left:
    ld b, K_RIGHT
    in a, (c)
    or a
    jr z, no_right
    ld a, STEP
    ld (dx), a
    xor a
    ld (dy), a
no_right:
    ld b, K_UP
    in a, (c)
    or a
    jr z, no_up
    ld a, -STEP
    ld (dy), a
    xor a
    ld (dx), a
no_up:
    ld b, K_DOWN
    in a, (c)
    or a
    jr z, no_down
    ld a, STEP
    ld (dy), a
    xor a
    ld (dx), a
no_down:

; --- and the square moves on its own, coming back in at the far edge ---------
    ld hl, dx
    ld a, (boxx)
    add a, (hl)
    cp RIGHT + 1
    jr c, x_done        ; still inside
    ld a, (hl)
    or a
    jp p, off_right     ; a positive step means it left by the right edge
    ld a, RIGHT         ; so a negative one left by the left edge
    jr x_done
off_right:
    xor a               ; back in at the left
x_done:
    ld (boxx), a

    ld hl, dy
    ld a, (boxy)
    add a, (hl)
    cp TOP
    jr c, off_top       ; above the play area
    cp BOTTOM + 1
    jr c, y_done        ; still inside
    ld a, TOP           ; off the bottom, back in at the top
    jr y_done
off_top:
    ld a, BOTTOM        ; off the top, back in at the bottom
y_done:
    ld (boxy), a
    jp frame

    .org 0x9000
boxx:   .db 108
boxy:   .db 84
dx:     .db STEP
dy:     .db 0
title:  .asciz "CLICK THE SCREEN, THEN STEER"
```

```testcase
{ "runFor": 60000 }
```

The four reads keep `c = P_KEY` and change `b` to select the next arrow. After each read, `or a`
sets the zero flag if the key is not held, so `jr z` skips that arrow's direction change. The
`in a, (c)` form matters here: `b` supplies the high byte of the I/O address, which this port uses
as the key code. With `in a, (n)`, the old value of `a` supplies that byte instead.

The key handlers store the horizontal and vertical steps in `dx` and `dy`; the movement code adds
those stored steps to `boxx` and `boxy` every frame. Releasing a key leaves the steps alone, so the
square keeps moving. Each handler also clears the other step with `xor a` and `ld`, keeping movement
to one of the four directions.

`RIGHT` is 216, the last X position where a 24-pixel square fits. After adding `dx`, `cp RIGHT + 1`
keeps any proposed X below 217. A step left from X = 0 produces the byte `FA` (250): the negative
result wraps around to a large unsigned byte, so that same comparison catches the left edge as
well as the right. Once an edge is crossed, the code reads `dx` to choose where the square should
reappear. The stored `-STEP` is `FA` in hexadecimal, with its top bit set. `or a` sets the sign flag
from that bit without changing `a`; `jp p, off_right` jumps when the sign flag is clear, meaning
the step was positive. The Z80 has no `jr p` form, so this condition uses `jp`.

The play area starts at Y = `TOP = 16`, below two reserved 8-pixel text rows. The title occupies
the first of those rows; the second stays blank. An upward step below 16 can still be a small byte,
so Y needs one
comparison with `TOP` and another with `BOTTOM + 1` to catch both edges. The title is printed
before command 11 turns on double buffering. That command starts the off-screen image as a copy of
the visible one, and each frame clears only the rectangle from Y = 16 down. The title stays in
place while the square is redrawn.

Try allowing diagonal movement. How would you change the key handlers so a horizontal arrow
changes only `dx`, and a vertical arrow changes only `dy`? After editing, Build and Run, click the
Screen, then hold right and up together. Watch how the square behaves at both edges.
