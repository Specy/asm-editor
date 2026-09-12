The whole ladder in one program. A snake of green squares crosses a board of 15 by 11 cells, the
arrow keys steer it, it grows by one segment every time it reaches the food, and it ends when its
head leaves the board or runs into its own body. The score sits above the board while you play and
the last one goes into the transcript when you lose.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard,
and press Run again to play another game.

**You need to know:** everything above it on the ladder. The body is an array walked with a pointer
and moved with a loop, the drawing and the digits are subroutines, the frame is drawn off screen and
shown the way A bouncing ball does, and the keys are polled the way Move a square with the keyboard
does. What is new is the board kept as **cells**, one byte for the whole of a position, which
becomes pixels only at the moment something is drawn.

```z80|playground|open-screen|console|no-registers|no-flags|allow-open
P_CHAR  equ 0x10        ; a character, on the Screen and in the transcript
P_NUM   equ 0x11        ; a byte as an unsigned decimal number
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_COL   equ 0x29        ; the text cursor, in 8 by 8 cells
P_ROW   equ 0x2A
P_KEY   equ 0x31        ; 1 while the key whose code is in b is held down
P_WAIT  equ 0x50        ; reading it waits for b hundredths of a second

C_RECT    equ 4
C_CLEAR   equ 9
C_RESIZE  equ 10
C_BUF_ON  equ 11
C_PRESENT equ 13

K_LEFT  equ 0x25
K_UP    equ 0x26
K_RIGHT equ 0x27
K_DOWN  equ 0x28

COLS    equ 15              ; the board, in cells
ROWS    equ 11
CELL    equ 16              ; and one cell, in pixels
TOP     equ 16              ; the board starts under the two text rows
WIDTH   equ COLS * CELL
HEIGHT  equ TOP + ROWS * CELL
MAXLEN  equ 48
PACE    equ 12              ; hundredths of a second per cell

BLACK   equ 0x00
SNAKE   equ 0x1C
RED     equ 0xE0
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
    out (P_CMD), a          ; black, and black becomes the text background
    ld a, WHITE
    out (P_PEN), a
    call draw_score
    ld a, C_BUF_ON
    out (P_CMD), a          ; the off-screen image starts as a copy of this one

frame:
; --- the arrows, one poll per key -------------------------------------------
    ld c, P_KEY
    ld b, K_LEFT
    in a, (c)
    or a
    jr z, not_left
    ld d, -1
    ld e, 0
    call try_direction
not_left:
    ld b, K_UP
    in a, (c)
    or a
    jr z, not_up
    ld d, 0
    ld e, -1
    call try_direction
not_up:
    ld b, K_RIGHT
    in a, (c)
    or a
    jr z, not_right
    ld d, 1
    ld e, 0
    call try_direction
not_right:
    ld b, K_DOWN
    in a, (c)
    or a
    jr z, not_down
    ld d, 0
    ld e, 1
    call try_direction
not_down:

; --- every segment takes the place of the one in front of it -----------------
    ld a, (length)
    ld e, a
    ld d, 0
    ld hl, body
    add hl, de
    dec hl                  ; hl = &body[length - 1]
    ld b, e
    dec b                   ; length - 1 copies
    jr z, moved             ; a snake of one segment has none
shift:
    dec hl
    ld a, (hl)
    inc hl
    ld (hl), a              ; body[i] = body[i - 1]
    dec hl
    djnz shift
moved:

; --- the new head, one cell on from the old one ------------------------------
    ld a, (body)            ; the head: the column in the high nibble
    and 0x0F
    ld e, a                 ; row
    ld a, (body)
    and 0xF0
    rrca
    rrca
    rrca
    rrca
    ld d, a                 ; column

    ld hl, dx
    ld a, d
    add a, (hl)
    cp COLS
    jp nc, game_over        ; off the left or the right, since -1 is 255 here
    ld d, a
    ld hl, dy
    ld a, e
    add a, (hl)
    cp ROWS
    jp nc, game_over        ; off the top or the bottom
    ld e, a

    ld a, d
    rlca
    rlca
    rlca
    rlca
    or e                    ; the new head, packed back into one byte
    ld (body), a
    ld c, a

; --- did it run into itself --------------------------------------------------
    ld a, (length)
    ld b, a
    dec b
    jr z, no_bite
    ld hl, body
    inc hl
    ld a, c
bite:
    cp (hl)
    jp z, game_over
    inc hl
    djnz bite
no_bite:

; --- did it reach the food ---------------------------------------------------
    ld a, (food)
    cp c
    jr nz, no_meal
    ld hl, score
    inc (hl)
    ld a, (length)
    cp MAXLEN
    jr nc, no_room
    ld e, a
    ld d, 0
    ld hl, body
    add hl, de
    dec hl
    ld a, (hl)
    inc hl
    ld (hl), a              ; the new tail starts on top of the old one
    ld hl, length
    inc (hl)
no_room:
    call place_food
    call draw_score
no_meal:

; --- draw the whole frame off screen and show it in one go -------------------
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
    out (P_CMD), a          ; wipe the board, leaving the score above it

    ld a, RED
    out (P_FILL), a
    out (P_PEN), a
    ld a, (food)
    call draw_cell

    ld a, SNAKE
    out (P_FILL), a
    ld a, WHITE
    out (P_PEN), a
    ld hl, body
    ld a, (length)
    ld b, a
draw_body:
    ld a, (hl)
    inc hl
    call draw_cell
    djnz draw_body

    ld a, C_PRESENT
    out (P_CMD), a          ; the frame becomes visible here, all at once
    ld b, PACE
    ld c, P_WAIT
    in a, (c)               ; twelve hundredths of a second of program time
    jp frame

game_over:
    xor a
    out (P_COL), a
    ld a, 1
    out (P_ROW), a
    ld hl, over
    call print
    ld a, (score)
    out (P_NUM), a
    ld a, 10
    out (P_CHAR), a
    ld a, C_PRESENT
    out (P_CMD), a          ; over the last frame, which is still there
    halt

; try_direction(nx, ny): nx in d and ny in e. Takes the new direction unless it
; is the exact opposite of the one the snake is going, which would be a bite.
try_direction:
    ld a, (dx)
    add a, d
    ld h, a
    ld a, (dy)
    add a, e
    or h                    ; both zero only when the new way is backwards
    ret z
    ld a, d
    ld (dx), a
    ld a, e
    ld (dy), a
    ret

; draw_cell(c): the packed cell in a, drawn in the colours already set
draw_cell:
    ld c, a
    and 0xF0                ; the column is the high nibble, so this is column * 16
    out (P_X), a
    add a, CELL - 1
    out (P_X2), a           ; one pixel short, so the cells have a gap
    ld a, c
    and 0x0F
    rlca
    rlca
    rlca
    rlca                    ; row * 16
    add a, TOP
    out (P_Y), a
    add a, CELL - 1
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a
    ret

; draw_score(): the label and the number, on the row the board never covers
draw_score:
    xor a
    out (P_COL), a
    out (P_ROW), a
    ld hl, label
    call print
    ld a, (score)
    out (P_NUM), a
    ld a, 10
    out (P_CHAR), a
    ret

; place_food(): a cell nobody chose, out of a sixteen bit generator
place_food:
    call next_random
    ld a, l
    and 0x0F
    cp COLS
    jr c, got_column
    sub COLS                ; the sixteenth column folds back onto the first
got_column:
    rlca
    rlca
    rlca
    rlca
    ld c, a                 ; the column, in the high nibble already
    call next_random
    ld a, h
    and 0x0F
    cp ROWS
    jr c, got_row
    sub ROWS
got_row:
    or c
    ld (food), a
    ret

; next_random(): the next value of a sixteen bit xorshift, in hl
next_random:
    ld hl, (seed)
    ld d, h
    ld e, l                 ; de = x
    ld b, 7
shift7:
    add hl, hl
    djnz shift7             ; hl = x << 7
    ld a, h
    xor d
    ld h, a
    ld a, l
    xor e
    ld l, a                 ; x = x ^ (x << 7)
    ld a, h
    srl a
    xor l
    ld l, a                 ; x = x ^ (x >> 9), whose high half is all zero
    ld a, l
    xor h
    ld h, a                 ; x = x ^ (x << 8), whose low half is all zero
    ld (seed), hl
    ret

; print(p): the zero terminated string at hl
print:
    ld a, (hl)
    or a
    ret z
    out (P_CHAR), a
    inc hl
    jr print

    .org 0x9000
dx:     .db 1               ; the direction, in cells
dy:     .db 0
length: .db 3
score:  .db 0
seed:   .dw 0xACE1
food:   .db 0x76            ; column 7, row 6
body:   .db 0x35, 0x25, 0x15
        .ds MAXLEN-3
label:  .asciz "SCORE: "
over:   .asciz "GAME OVER, SCORE: "
```

A cell is **one byte**: the column in the high nibble and the row in the low one, so `0x35` is
column 3, row 5. Four bits hold a number up to 15, so the packing caps the board at 16 by 16 cells,
and the Screen settles it at 15 by 11: fifteen columns of 16 pixels is the 240 the Screen was
resized to, and eleven rows of 16 fill what is left under the two text rows. The reason for packing
it that way is that comparing two cells is then a single `cp`. The M68K uses a whole word per cell
and 32 by 24 cells, because it has a `cmp.w` to compare them with; here a 16 bit comparison would be
an `or a` and an `sbc hl, de` that destroys one of the two values, so the board was made to fit the
byte.

The nibbles are what make the drawing cheap. A column in the high nibble **is** the column times 16
already, so `and 0xF0` is the whole of the x arithmetic, and the row needs four `rlca` and the 16
pixel offset of the two text rows above the board. No multiplication happens anywhere in
`draw_cell`, which matters on a machine that has none.

The snake moves by shifting: every segment takes the place of the one in front of it, from the tail
backwards so that nothing is overwritten before it has been read, and then the head is given its new
cell. The tail therefore disappears from where it was without any code saying so. Growing is one
extra byte: the new last segment is put on top of the old one, so for one frame two segments sit in
the same cell and the shift pulls them apart on the next.

The head's new cell is the old one plus the direction, and `dx` and `dy` are counted in cells, so
they are 1, 0 or -1. `cp COLS` catches both walls at once: a column of 15 fails it the obvious way,
and a column of -1 is `FF` as an unsigned byte, which fails it as well. Both tests have to run
**before** the column is packed back into a nibble, since `rlca` cannot tell -1 from 15.

The arrows do not move the snake, they call `try_direction`, and it refuses a direction that is the
exact opposite of the one the snake is going: `dx + nx` and `dy + ny` are both zero only when the
new way is backwards, and `or h` is what asks about the two of them in one test. Turning back means
eating your own neck on the next frame.

The food goes wherever a sixteen bit **xorshift** generator says. Three shifts and three `xor`
instructions turn a number into the next one of a sequence that goes through all 65535 non-zero
values before it repeats, which is as random as a program with no clock and no dice can be. Two of
the three shifts cost nothing at all here: `x ^ (x << 8)` only changes the high byte, because the
low half of `x << 8` is zero, and `x ^ (x >> 9)` only changes the low byte for the same reason. Only
the `x << 7` needs a loop. The column is masked down to four bits and the one value over the board
is folded back onto the first column, and the row is folded the same way, so the first five rows
come up twice as often as the other six.

The score goes out through the console character port and the number port, the same two ports Print
a string used, which is why it appears on the Screen and in the transcript at once. **The Screen has
no text command of its own**, so the two text rows above the board are the only place text can go.
The frame therefore clears the board with a rectangle that starts at `TOP`, and command 9, which
would wipe the whole image, is used once at the very start. `draw_score` runs once at the start and
once per point, and the transcript ends up with one line per score.

A frame is the polls, the move, the collisions, the food, then a clear, one square per segment, the
score row left alone and command 13 to show the lot. Port `0x50` sets the pace: put a number of
hundredths in `b`, read the port, and the program waits that long without freezing the editor, so
Stop still answers while the snake is between cells.

Press Run and touch nothing and the snake walks into the right hand wall after eleven moves, which
is 2458 instructions including the whole of the setup. Try changing `seed: .dw 0xACE1` to any other
value that is not zero. The food falls in a different order, because the sequence is fixed by where
it starts: run the same program twice and you get the same game twice, which is what makes a program
with a generator like this one worth debugging.
