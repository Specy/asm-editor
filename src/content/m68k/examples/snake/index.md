Build and play Snake on a board of 32 columns by 24 rows. Choose **Build**, then **Run**. Click
inside the **Screen** so it has keyboard focus, then use the arrow keys to steer. The snake keeps
moving after you release a key. Reaching food adds one point and grows the snake; hitting a wall or
its own body ends the game. **Game over** appears on the Screen and the final score appears in the
console. Choose **Run** again to restart, or **Stop** when you are done.

The listing is long because it includes input, movement, drawing and a score. Read it first as one
pass through `frame`:

| Part | What happens each frame |
| --- | --- |
| Input | Poll the arrows; keep the last accepted direction. |
| Movement | Shift the body, move the head one cell, then check for a wall, body or food. |
| Picture | Clear the hidden image, draw food, snake and score, show it, then wait. |

Positions are **board cells** until `draw_cell` converts them to pixels. Each cell is 20 pixels
wide, so the 32 by 24 board fills the 640 by 480 Screen.

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
    trap #15                ; wait twelve hundredths of a second per frame
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

* place_food(): select a board cell from a sixteen bit generator
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

## One word per cell

`body` holds one word per segment. The first word, `body[0]`, is the head; `length` says how many
words are in use. In each word the high byte is the column and the low byte is the row:

| Word | Column | Row |
| --- | ---: | ---: |
| `$050C` | `$05` = 5 | `$0C` = 12 |
| `$040C` | `$04` = 4 | `$0C` = 12 |

The starting head is therefore at column 5, row 12, with two segments behind it. Packing a cell
this way lets `cmp.w` check whether the head and a body segment occupy the same place.

## Follow one move

The initial `length` is 3, `dx` is 1 and `dy` is 0. Before the first move, the body words are
`[$050C, $040C, $030C]`. The shift loop starts at the tail: it copies `body[1]` to `body[2]`,
then `body[0]` to `body[1]`. `dbra` makes those two copies. Finally the code adds the direction
to the old head and writes `$060C` into `body[0]`. The new body is
`[$060C, $050C, $040C]`. Copying backward preserves each old cell until it is needed; the old
tail at `$030C` disappears.

The code unpacks the old head into X and Y before adding `dx` and `dy`. It tests the new coordinates
against columns 0–31 and rows 0–23 before packing them again. A negative coordinate must be caught
here: squeezing -1 into an eight-bit coordinate would lose the fact that it crossed an edge.
After writing the new head, the collision loop starts at `body+2`, which is `body[1]`. It compares
the head with each body segment and skips `body[0]` because that is the head itself.

If the new head reaches food, `score` increases. When there is room below `MAXLEN`, the code copies
the current last segment into one new word and increases `length`. The last two segments overlap
for this frame; the next backward shift separates them as the snake moves.

## Arrow keys and food

Task 19 receives the packed key codes `$25262728`: left, up, right and down, one byte each. Its
answer uses the same byte order, with `$FF` for a held key and `$00` otherwise. The four `btst`
instructions inspect bits 24, 16, 8 and 0 of that answer. For instance, a held left arrow sets bit
24. A direction remains in `dx` and `dy` until an accepted arrow changes it.

`try_direction` rejects a turn straight back. While the snake moves right, its direction is
`(dx, dy) = (1, 0)`. A left press proposes `(-1, 0)`. Both sums, `1 + (-1)` and `0 + 0`, are
zero, so the routine leaves the direction alone. An up press proposes `(0, -1)`, whose sums are
not both zero, and turns the snake upward.

`place_food` uses the saved `seed` to generate two new values. It masks one value to get a column
from 0 to 31. It divides the other by 24: after `divu`, the remainder is in the high word, so
`swap` brings it down to obtain a row from 0 to 23. The routine does **not** check the body; a
new food cell can land on a segment. The fixed starting seed makes the sequence repeat on each run.

## Draw the frame

The board position becomes pixels only in `draw_cell`: column 5 becomes X = `5 × 20 = 100`, and
row 12 becomes Y = `12 × 20 = 240`. Task 87 fills a square at those coordinates. Each frame clears
the hidden image, draws the food and all `length` body cells, then draws the score. Task 94 shows
that complete image at once. Task 23 waits at least 12 hundredths of a second (0.12 seconds) before
the next frame; drawing and instructions also take time. `draw_score` builds the decimal digits
backward in `score_buffer`. At game over, task 17 writes the final score to the console.

## Try a different food colour

Screen colours use `$00BBGGRR`: blue is the highest colour byte, and red is the lowest. Change
`FOOD` from `$000040FF` to `$00FF0000` (blue `$FF`, green `$00`, red `$00`). Before choosing
**Build** and **Run** again, predict what will change on the Screen and what will happen to the
score when the head reaches food. Click the Screen to steer, then choose **Stop** when you are done.
Restore the original value afterward.

<details>
<summary>Show what to expect</summary>

The food squares become blue. The snake stays green, and reaching food still increases the
score by one: `FOOD` is passed to the drawing tasks as a colour, while the food's board cell is
stored separately in `food`.

</details>
