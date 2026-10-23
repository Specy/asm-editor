A complete game in one program. A snake of green squares crosses a board of 15 by 11 cells, the
arrow keys steer it, it grows by one segment every time it reaches the food, and it ends when its
head leaves the board or runs into its own body. The score sits above the board while you play and
the last one goes into the transcript when you lose.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard,
and press Run again to play another game.

The program is 360 lines, so the sections below take it a piece at a time and the whole thing is at
the bottom, ready to build and play.

## A cell is one byte

The board is 15 columns by 11 rows, and a position on it is **one byte**: the column in the high
four bits and the row in the low four, so `0x35` is column 3, row 5. Four bits hold a number up to
15, which is enough for this board. Fifteen columns of 16 pixels make the Screen 240 pixels wide;
eleven rows of 16 pixels sit below two text rows of 8 pixels each.

Packing it this way is what makes the game cheap to write. Comparing two positions is a single `cp`.
A position that took a whole pair would need an `or a` and an `sbc hl, de` every time the snake
checked whether it had hit itself, and that `sbc` destroys one of the two values it is comparing.

The packing pays again in the drawing. A column sitting in the high four bits **is** the column
times 16 already, so `and 0xF0` is the whole of the x arithmetic, and the row needs four `rlca` and
the offset of the two text rows above the board. No multiplication happens anywhere in `draw_cell`,
which matters on a machine that has none.

```z80
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
```

## Setting up, and one frame

The Screen is resized and cleared to black first, because the colour a clear uses also becomes the
background the text rows are painted on. Then double buffering goes on, and from there every frame
is painted off screen and shown in one go.

A frame is always the same six things: poll the arrows, move the snake, check whether it hit itself,
check whether it reached the food, draw, and wait. Port `0x50` sets the pace: put a number of
hundredths in `b`, read the port, and the program waits that long without freezing the editor, so
Stop still answers while the snake is between cells.

```z80
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
```

## The arrows, and the turn you are not allowed to make

The arrows do not move the snake. They call `try_direction`, which writes `dx` and `dy`, and the
move happens later in the frame from whatever those two say. The pair means a step in cells:
left is (-1, 0), up is (0, -1), right is (1, 0), and down is (0, 1).

`try_direction` refuses one thing: a direction that is the exact opposite of the way the snake is
already going. `dx + nx` and `dy + ny` are both zero only when the new direction is backwards, and
`or h` asks about the two of them in one test. Without that refusal, turning back would mean eating
your own neck on the very next frame.

```z80
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
```

## Moving, which is a shift

The snake moves by shifting. Every segment takes the place of the one in front of it, walking from
the tail backwards so that nothing is overwritten before it has been read, and then the head is
given its new cell. The tail disappears from where it was without any code saying so.

Growing is one extra byte: the new last segment is put on top of the old one, so for a single frame
two segments sit in the same cell, and the next shift pulls them apart.

The head's new cell is the old one plus the direction, and `dx` and `dy` are counted in cells, so
they are 1, 0 or -1. `cp COLS` catches both walls at once: a column of 15 fails it the obvious way,
and a column of -1 is `FF` as an unsigned byte, which is far above 15 and fails it as well. Both
tests have to run **before** the column is packed back into the high four bits, because once it is
packed, `rlca` cannot tell -1 from 15.

```z80
not_down:
; --- every segment takes the place of the one in front of it -----------------
    ld a, (length)
    ld e, a
    ld d, 0
    ld hl, body
    add hl, de
    dec hl                  ; hl = the last segment of the body
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
```

## Hitting yourself, and finding the food

The self collision is the single `cp` the packing bought: walk the body from the second segment on
and compare each one against the head. If the head reaches the food, increase the score, copy the
last segment into a new slot if there is room, and choose another food cell.

```z80
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
```

## Drawing the frame

The board is wiped with a rectangle that starts at `TOP` rather than with command 9, which would
clear the whole image including the score. Then one red square for the food, one green square per
segment, and command 13 to show the lot.

The score goes out through the character and number ports, the same ones Print a string used, so it
appears on the Screen and in the transcript at once. The cursor ports put it in the two 8-pixel text
rows above the board. `draw_score` runs at the start and once per point, which leaves the transcript
with one line per score instead of one per frame.

`place_food` uses two values from a **pseudorandom** sequence: one supplies a column and the next
supplies a row. `next_random` updates a 16-bit value with shifts and `xor`, then saves it for the
next call. The initial `seed` is fixed, so each new game follows the same sequence.

Each coordinate starts as a four-bit number from 0 to 15. A column of 15 folds to 0; rows 11 to
15 fold to 0 to 4. That gives column 0 two possible inputs and each of rows 0 to 4 two possible
inputs, so those cells are favoured. The routine also does not inspect `body`: food can appear under
the snake and be hidden by a green segment until that segment moves away.

```z80
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

; place_food(): choose a board cell from the pseudorandom sequence
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
```

## The state, in memory

Thirty-odd bytes hold the whole game. `body` is an array of cells with `length` saying how much of
it is in use, and `.ds MAXLEN-3` reserves the room the snake will grow into.

```z80
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

Try two small changes after you have played:

1. Start with `body` as `0x35, 0x25, 0x15`, moving right. On paper, write the three bytes after one frame with no turn and no food eaten. Trace the backward copy before you work out the new head.
2. Change `PACE` from 12 to 6 and run the game again. How does the time between moves change? Try another value that makes it comfortable to steer.

## The whole program

Build this one and play it.

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
    dec hl                  ; hl = the last segment of the body
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

; place_food(): choose a board cell from the pseudorandom sequence
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
