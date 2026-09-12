The whole ladder in one program. A snake of green squares crosses a board of 32 by 24 cells, the
arrow keys steer it, it grows by one segment every time it reaches the food, and it ends when its
head leaves the board or runs into its own body. The score is drawn on the screen while you play and
printed to the console when you lose.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard,
and press Run again to play another game.

**You need to know:** everything above it on the ladder. The body is an array walked with a pointer
and moved with a loop, the drawing and the digits are subroutines, the score is turned into text the
way Print a number in any base without help does it, and the frame is drawn off screen and shown the
way A bouncing ball does. What is new is the board kept as **cells**, one byte for the column and
one for the row packed into a word, which becomes pixels only at the moment something is drawn.

```m68k|playground|open-screen|console|no-registers|no-flags|allow-open
COLS    equ 32              ; the board in cells
ROWS    equ 24
CELL    equ 20              ; and one cell in pixels
MAXLEN  equ 64
SNAKE   equ $0040D040
FOOD    equ $000040FF
WHITE   equ $00FFFFFF

    move.b #92, d0
    move.b #17, d1
    trap #15                ; task 92 mode 17: draw off screen

frame:
* --- the arrows, one poll for all four ---------------------------------------
    move.b #19, d0
    move.l #$25262728, d1   ; left $25, up $26, right $27, down $28
    trap #15
    btst #24, d1
    beq not_left
    move.w #-1, d2
    clr.w d3
    bsr try_direction
not_left:
    btst #16, d1
    beq not_up
    clr.w d2
    move.w #-1, d3
    bsr try_direction
not_up:
    btst #8, d1
    beq not_right
    move.w #1, d2
    clr.w d3
    bsr try_direction
not_right:
    btst #0, d1
    beq not_down
    clr.w d2
    move.w #1, d3
    bsr try_direction
not_down:

* --- every segment takes the place of the one in front of it -----------------
    lea body, a0
    move.w length, d1
    move.w d1, d2
    add.w d2, d2
    add.w d2, a0            ; a0 = one word past the last segment
    subq.w #2, d1           ; length - 1 copies, and dbra counts one less
    blt moved
shift:
    move.w -4(a0), -2(a0)   ; body[i] = body[i - 1]
    subq.l #2, a0
    dbra d1, shift
moved:

* --- the new head, one cell on from the old one ------------------------------
    move.w body, d4         ; the head, x in the high byte and y in the low
    move.w d4, d3
    andi.w #$FF, d3         ; y
    lsr.w #8, d4            ; x
    add.w dx, d4
    add.w dy, d3
    tst.w d4
    blt game_over           ; off the left
    cmp.w #COLS-1, d4
    bgt game_over           ; off the right
    tst.w d3
    blt game_over
    cmp.w #ROWS-1, d3
    bgt game_over
    move.w d4, d5
    lsl.w #8, d5
    or.w d3, d5             ; the new head, packed again
    move.w d5, body

* --- did it run into itself --------------------------------------------------
    lea body+2, a0
    move.w length, d1
    subq.w #2, d1
    blt no_bite
bite:
    cmp.w (a0)+, d5
    beq game_over
    dbra d1, bite
no_bite:

* --- did it reach the food ---------------------------------------------------
    cmp.w food, d5
    bne no_meal
    addq.w #1, score
    move.w length, d1
    cmp.w #MAXLEN, d1
    bge no_room
    move.w d1, d2
    add.w d2, d2
    lea body, a0
    add.w d2, a0
    move.w -2(a0), (a0)     ; the new tail starts on top of the old one
    addq.w #1, length
no_room:
    bsr place_food
no_meal:

* --- draw the whole frame off screen and show it in one go -------------------
    move.b #11, d0
    move.w #$FF00, d1
    trap #15                ; clear the off screen image

    move.l #FOOD, d1
    bsr both_colours
    move.w food, d5
    bsr draw_cell

    move.l #SNAKE, d1
    bsr both_colours
    lea body, a0
    move.w length, d6
    subq.w #1, d6
draw_body:
    move.w (a0)+, d5
    bsr draw_cell
    dbra d6, draw_body

    bsr draw_score

    move.b #94, d0
    trap #15                ; the frame becomes visible here, all at once
    move.b #23, d0
    move.l #12, d1
    trap #15                ; twelve hundredths of a second of program time
    bra frame

game_over:
    move.l #WHITE, d1
    move.b #80, d0
    trap #15
    lea over, a1
    move.l #250, d1
    move.l #230, d2
    move.b #95, d0
    trap #15                ; over the last frame, which is still there
    move.b #94, d0
    trap #15
    lea final, a1
    move.w score, d1
    andi.l #$FFFF, d1
    move.b #17, d0          ; task 17: the transcript gets the final score
    trap #15
    move.b #9, d0
    trap #15

* try_direction(nx, ny): take the new direction unless it turns the snake back
* on itself, which would be an instant bite
try_direction:
    move.w dx, d4
    add.w d2, d4
    move.w dy, d5
    add.w d3, d5
    or.w d4, d5             ; both zero means the new way is the opposite one
    beq no_turn
    move.w d2, dx
    move.w d3, dy
no_turn:
    rts

* draw_cell(c): the packed cell in d5, drawn as a square in the current colours
draw_cell:
    move.w d5, d1
    lsr.w #8, d1
    mulu #CELL, d1          ; x in pixels
    move.w d5, d2
    andi.w #$FF, d2
    mulu #CELL, d2          ; y in pixels
    move.l d1, d3
    add.l #CELL-1, d3       ; one pixel short, so the cells have a gap
    move.l d2, d4
    add.l #CELL-1, d4
    move.b #87, d0
    trap #15
    rts

* both_colours(c): the fill and the pen both become the colour in d1
both_colours:
    move.b #81, d0
    trap #15
    move.b #80, d0
    trap #15
    rts

* draw_score(): the label and the number, at the top left corner
draw_score:
    lea score_end, a1
    clr.b -(a1)             ; the digits are built backwards from the end
    move.w score, d2
    andi.l #$FFFF, d2
score_digit:
    divu #10, d2
    move.l d2, d3
    swap d3
    andi.l #$FFFF, d3       ; the digit
    andi.l #$FFFF, d2       ; what is left of the number
    add.b #'0', d3
    move.b d3, -(a1)
    tst.l d2
    bne score_digit
    move.l a1, a2           ; keep it, the label is drawn first
    move.l #WHITE, d1
    move.b #80, d0
    trap #15
    lea label, a1
    move.l #8, d1
    move.l #8, d2
    move.b #95, d0
    trap #15
    move.l a2, a1
    move.l #64, d1
    move.l #8, d2
    move.b #95, d0
    trap #15
    rts

* place_food(): a cell nobody chose, out of a sixteen bit generator
place_food:
    bsr next_random
    andi.w #COLS-1, d0      ; a column, 0 to 31
    lsl.w #8, d0
    move.w d0, d7
    bsr next_random
    andi.l #$FFFF, d0
    divu #ROWS, d0
    swap d0
    andi.w #$FF, d0         ; a row, 0 to 23
    or.w d0, d7
    move.w d7, food
    rts

* next_random(): the next number of an xorshift, in d0
next_random:
    move.w seed, d0
    move.w d0, d1
    lsl.w #7, d1
    eor.w d1, d0            ; x = x ^ (x << 7)
    move.w d0, d1
    move.w #9, d2
    lsr.w d2, d1
    eor.w d1, d0            ; x = x ^ (x >> 9)
    move.w d0, d1
    lsl.w #8, d1
    eor.w d1, d0            ; x = x ^ (x << 8)
    move.w d0, seed
    rts

    org $3000
dx:     dc.w 1              ; the direction, in cells
dy:     dc.w 0
length: dc.w 3
score:  dc.w 0
seed:   dc.w $ACE1
food:   dc.w $140C          ; column 20, row 12
body:   dc.w $050C, $040C, $030C
        ds.w MAXLEN-3
label:  dc.b 'Score:', 0
over:   dc.b 'Game over', 0
final:  dc.b 'Game over. Score: ', 0
score_buffer: ds.b 8
score_end:
```

```testcase
{ "runFor": 20000 }
```

`body` is an array of words, one per segment, with the head at `body[0]`, and a segment is a cell:
`$050C` is column 5, row 12. Packing the two into one word is what makes a comparison between two
cells a single `cmp.w`, which the self collision test does once per segment.

The snake moves by shifting: every segment takes the place of the one in front of it, from the tail
backwards so that nothing is overwritten before it has been read, and then the head is given its new
cell. The tail therefore disappears from where it was without any code saying so. Growing is one
extra word: the new last segment is put on top of the old one, so for one frame two segments sit in
the same cell and the shift pulls them apart on the next.

The head's new cell is the old one plus the direction, and `dx` and `dy` are counted in cells, so
they are 1, 0 or -1. The four wall tests are what turn a cell that left the board into the end of the
game, and they have to run before the head is packed back into a byte, since `lsr.w #8, d4` cannot
tell -1 from 255.

The arrows do not move the snake, they call `try_direction`, and it refuses a direction that is the
exact opposite of the one the snake is going: `dx + nx` and `dy + ny` are both zero only when the new
way is backwards, and turning back means eating your own neck on the next frame.

The food goes wherever a sixteen bit **xorshift** generator says. Three shifts and three `eor`
instructions turn a number into the next one of a sequence that never repeats until it has been
through all 65535 of them, which is as random as a program with no clock and no dice can be. The
column is a mask, since 32 is a power of two, and the row is the remainder of a `divu` by 24.

A frame is a clear, the food, one square per segment, the score and then task 94, which shows the
whole thing at once, and task 23 sets the pace at twelve hundredths of a second per cell. The score
is drawn by the digits loop of Print a number in any base without help, and the same number goes to
the console through task 17 when the game ends.

Try changing `seed: dc.w $ACE1` to any other value that is not zero. The food falls in a different
order, because the sequence is fixed by where it starts: run the same program twice and you get the
same game twice, which is what makes a program with a generator like this one worth debugging.
