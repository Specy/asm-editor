A square you steer. The arrow keys set which way it is going and it keeps going that way on its own,
coming back in at the opposite edge when it leaves the play area. **Click the Screen panel first**:
the Screen only gets the keyboard when it has the focus, and a ring around it says so while it does.

A bouncing ball drew a picture that changed on its own. This one asks the keyboard, once per frame,
what is being held down right now, and the answer changes what the next frame will look like.

**You need to know:** the "A bouncing ball" Example and the "The screen, keyboard and mouse through
ports" lecture. What is new here is port `0x31`, which answers 1 while the key whose code is in `b`
is held down, and consumes nothing, so a key held for a second answers 1 every frame.

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

The four polls all use the same `c`, since the port never changes, and only `b` is reloaded between
them. `in a, (c)` is the form that has to be used here, because the key code travels on the high
half of the address bus, which is `b`, and the short `in a, (n)` form puts `a` there instead. The
codes are EASy68K's, the same table every language in this editor uses: left `0x25`, up `0x26`,
right `0x27` and down `0x28`.

The keys do not move the square, they write `dx` and `dy` in memory, and the code under them moves
it. That separation is what makes the square keep going after you let go, and it is how anything
that moves in a game is written: the input decides the velocity, the frame applies it. The two lines
that clear the other step, `xor a` and the `ld` under it, are what keep the movement to four
directions; take those four pairs out and holding right and then up leaves both steps set, and the
square goes diagonally.

`jp p, off_right` is the one place a **signed** byte is read. `dx` is 6 or -6, and -6 is `FA`, whose
top bit is 1, so `or a` followed by `jp p` asks which way the square was going when it left the play
area, and that is what says which edge to bring it back in at. There is no `jr` form of `p`, so it
is a `jp` whatever the distance.

The `y` test needs two comparisons where the `x` test needs one, because the play area starts at 16
and not at the top of the Screen. The two text rows above it hold the title, which is printed once
before double buffering is turned on and then never touched again. Command 11 makes the off-screen
image start as a copy of what is on screen, and every frame clears only the rectangle below the
title, so those two rows survive for as long as the program runs.

Polling every frame is enough for keys held down. What port `0x31` does not tell you is that a key
was pressed **again**, which is why a game that wants one action per press keeps the last answer and
compares, or reads port `0x32`, the code of the last key pressed.

Try changing the `xor a` under `off_right` to `ld a, RIGHT`. The square stops against the right edge
instead of coming back in at the left, which is the same one instruction doing clamping instead of
wrapping.
