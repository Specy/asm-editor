A picture in six shapes: the sky, the ground, an ellipse for the sun, a rectangle with an outline
for the house, three lines and a flood fill for its roof and one more rectangle for the door, with
a line of text over the top. Press Run and watch the Screen panel next to the program.

Print a string asked the environment for a line of text by writing one byte to a port. The Screen is
more ports, right next to the console ones, and drawing is always the same two steps: write the
colours and the coordinates to their ports, then write **one command** to the command port, which
runs one operation on whatever is currently set.

**You need to know:** the "The screen, keyboard and mouse through ports" lecture and the "Arrays,
strings and ix" lecture. What is new here is that the picture is a table: one shape is a record of
seven bytes, and the whole program is `ix` walking it.

```z80|playground|open-screen|no-registers|no-flags|allow-open
P_CHAR  equ 0x10        ; the console character port draws at the text cursor
P_PEN   equ 0x20        ; lines, outlines and text
P_FILL  equ 0x21        ; the inside of a shape, and the clear
P_WIDTH equ 0x22
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27        ; one write here runs one drawing operation
P_COL   equ 0x29        ; the text cursor, in 8 by 8 cells
P_ROW   equ 0x2A

C_LINE_TO equ 2
C_MOVE_TO equ 3
C_RECT    equ 4
C_ELLIPSE equ 6
C_FLOOD   equ 8
C_CLEAR   equ 9
C_RESIZE  equ 10

SKY     equ 0x9B        ; a colour is one byte: 3 bits of red, 3 of green, 2 of blue
GRASS   equ 0x35
SUN     equ 0xFC
WALL    equ 0xAD
ROOF    equ 0x64
DOOR    equ 0x44
WHITE   equ 0xFF

CMD     equ 0           ; the seven fields of one shape
FILL    equ 1
PEN     equ 2
SX      equ 3
SY      equ 4
SX2     equ 5
SY2     equ 6
SHAPE   equ 7
COUNT   equ (shapes_end - shapes) / SHAPE

    .org 0x8000
    ld a, 3
    out (P_WIDTH), a    ; a three pixel pen, for every outline in the picture

    ld ix, shapes
    ld b, COUNT
draw:
    ld a, (ix+FILL)
    out (P_FILL), a
    ld a, (ix+PEN)
    out (P_PEN), a
    ld a, (ix+SX)
    out (P_X), a
    ld a, (ix+SY)
    out (P_Y), a
    ld a, (ix+SX2)
    out (P_X2), a
    ld a, (ix+SY2)
    out (P_Y2), a
    ld a, (ix+CMD)
    out (P_CMD), a      ; and the command port draws it
    ld de, SHAPE
    add ix, de          ; on to the next shape
    djnz draw

    ld a, WHITE
    out (P_PEN), a
    ld a, 1
    out (P_COL), a      ; the text cursor is in cells, not in pixels
    xor a
    out (P_ROW), a
    ld hl, label
print:
    ld a, (hl)
    or a
    jr z, done
    out (P_CHAR), a
    inc hl
    jr print
done:
    halt

    .org 0x9000
shapes:
;        command     fill   pen     x    y    x2   y2
    .db C_RESIZE,    0,     0,      240, 192, 0,   0      ; the Screen itself
    .db C_CLEAR,     SKY,   SKY,    0,   0,   0,   0      ; the sky
    .db C_RECT,      GRASS, GRASS,  0,   130, 240, 192    ; the ground
    .db C_ELLIPSE,   SUN,   SUN,    180, 20,  225, 65     ; the sun
    .db C_RECT,      WALL,  WHITE,  70,  80,  160, 160    ; the house
    .db C_MOVE_TO,   WALL,  ROOF,   58,  80,  0,   0      ; over to the left eave
    .db C_LINE_TO,   WALL,  ROOF,   115, 40,  0,   0      ; up to the apex
    .db C_LINE_TO,   WALL,  ROOF,   172, 80,  0,   0      ; down to the right eave
    .db C_LINE_TO,   WALL,  ROOF,   58,  80,  0,   0      ; and back where it started
    .db C_FLOOD,     ROOF,  ROOF,   115, 65,  0,   0      ; and the inside of the roof
    .db C_RECT,      DOOR,  DOOR,   100, 125, 125, 160    ; the door
shapes_end:

label:  .asciz "A HOUSE IN ELEVEN COMMANDS"
```

Every coordinate is one byte, so the Screen is at most 256 by 256 pixels, and no coordinate can hold
the number 256 itself. The first shape resizes it to **240 by 192**, which is a size whose right and
bottom edges a byte can name, and after that a rectangle can reach every pixel there is. A rectangle
excludes its right and bottom edges, the way EASy68K's does, so the ground really does reach the
last row of the Screen.

A colour is one byte in a **3-3-2** layout: three bits of red in bits 7 to 5, three of green in bits
4 to 2 and two of blue in bits 1 and 0. `SKY equ 0x9B` is `100 110 11`, which is four of the seven
reds, six of the seven greens and all three of the blues, and comes out a pale blue. Two bits of
blue is what was left over, which is why the greys on this machine are not exactly neutral.

The seven fields of a shape are the seven ports a drawing operation reads, in the order the loop
writes them, and `equ` gives each one its offset. `(ix+FILL)` is `p->fill` in C, `add ix, de` with
`SHAPE` in `de` is `p++`, and adding an eighth field to every shape means changing `SHAPE` and one
line in the loop. `COUNT` is worked out by the assembler from the two labels around the table, so
adding a row to the picture is adding a row and nothing else.

The sky, the ground, the sun and the door have the same colour in both their fields, so those shapes
have no rim. The house sets them apart, `WALL` inside and `WHITE` outside, and the three pixel pen
set before the loop is what makes that outline thick.

The roof is three lines and no shape at all. Command 3 moves the **drawing position** without
drawing anything, and each command 2 after it draws from wherever that position is to the new place
and leaves it there, so a polyline costs one command per corner. Command 1 is the other line
command, the one that takes both ends at once.

Command 8 is what colours it in, because there is no triangle command: it starts at the pixel in X
and Y and spreads the **fill colour** in every direction, over every pixel of the colour it started
on, until it meets anything else. The three lines are the fence it stops at, and `115, 65` is just a
point inside them, any other would do the same. It is the one row of the roof whose fill field
matters, which is why it says `ROOF` where the lines above it say `WALL`.

The label goes through the console character port, the same port Print a string used, because **the
Screen has no text command of its own**. Text lands at the text cursor, which is counted in 8 by 8
character cells, so a 240 pixel Screen is 30 columns wide and the label can only start on a cell
boundary. The M68K draws a string at any pixel it likes with task 95; here you get cells. The
characters are painted in the pen colour on the background colour, and the background is whatever
the last clear filled the Screen with, which is why white on the sky looks right.

Try changing the `115` in the `C_LINE_TO` row of the roof to `70`. That row is the apex, so the roof
stops being a triangle and leans over to the left, and nothing else in the program has to know. The
fill point at `115, 65` is still inside the leaning roof, so command 8 still finds its fence. Push
the apex far enough that it is not and the fill spreads over the sky instead.
