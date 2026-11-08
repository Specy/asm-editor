This program draws a house beneath the sun and prints a label above it. Open it in the editor,
choose **Build**, then **Run**, and watch the Screen panel. The picture has six parts—the sky,
ground, sun, house, roof and door—but takes eleven drawing commands to make.

Like the console in Print a string, the Screen responds to bytes written to ports. Each drawing
operation has two steps: set its colours and coordinates, then write **one command** to `P_CMD`.
`C_RESIZE` sets the Screen's size from X and Y; `C_MOVE_TO` moves the drawing position;
`C_LINE_TO` draws from there to a new point; and `C_FLOOD` spreads colour from a starting point.
The other commands here clear the Screen or draw a rectangle or ellipse.

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

CMD     equ 0           ; offsets within each seven-byte command row
FILL    equ 1
PEN     equ 2
SX      equ 3
SY      equ 4
SX2     equ 5
SY2     equ 6
SHAPE_SIZE equ 7        ; bytes in one table row
COUNT   equ (shapes_end - shapes) / SHAPE_SIZE

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
    ld de, SHAPE_SIZE
    add ix, de          ; on to the next table row
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
the number 256 itself. The first command resizes it to **240 by 192**, so both dimensions fit in a
byte. A rectangle **excludes its right and bottom edges**. Using 240 and 192 as those edges lets a
rectangle reach the last column and row. The ground ends at row 192, so it paints through row 191,
the last row of the Screen.

A colour is one byte in a **3-3-2** layout: three bits of red in bits 7 to 5, three of green in bits
4 to 2 and two of blue in bits 1 and 0. `SKY equ 0x9B` is `100 110 11`: red is 4 out of a maximum
of 7, green is 6 out of 7, and blue is 3 out of 3. This gives a pale blue. Blue has fewer levels than
red and green, so shades of grey are not always exactly neutral.

Each table row holds one command and six values. `CMD` through `SY2` name the offsets of those
seven bytes, and `SHAPE_SIZE` is the number of bytes in a whole row. `(ix+FILL)` reads the fill
colour from the row `ix` points at. After the command runs, `add ix, de` moves `ix` forward by
`SHAPE_SIZE` bytes to the next row. The assembler works out `COUNT` from the labels around the
table, so another row also adds another turn through the loop.

If you use **Step**, watch the Screen after the first three writes to `P_CMD`: it changes size,
turns sky blue, then gains the ground. Each operation takes effect when the command is written,
after its colours and coordinates have been set.

The ground, sun and door have the same colour in their fill and pen fields, so they have no
contrasting rim. The house uses `WALL` inside and `WHITE` outside, and the three pixel pen
set before the loop is what makes that outline thick.

The roof is made from three lines. `C_MOVE_TO` moves the **drawing position** to the left eave
without drawing. Each `C_LINE_TO` then draws from that position to its new point and leaves the
position there. The three commands trace the two slopes and the base of the roof.

`C_FLOOD` colours the inside. It starts at the pixel in X and Y and spreads the **fill colour** over
connected pixels of the colour it started on, stopping at the three lines. The point `115, 65` lies
inside that outline. The flood row's fill field matters, which is why it says `ROOF` where the line
rows say `WALL`.

The label goes through the console character port, the same port Print a string used, because **the
Screen has no text command of its own**. The text cursor uses 8 by 8 character cells, so a 240 pixel Screen is 30 columns wide.
The label can only start on a cell boundary, rather than at an arbitrary pixel. Characters use the
pen colour and the Screen's background colour. `C_CLEAR` sets that background to its fill colour,
so the label appears in white on sky blue.

Try adding a window. Copy the door's `C_RECT` row to the end of the table, before `shapes_end`.
Choose two corners inside the house wall and set its fill and pen colours. Build and Run again;
`COUNT` will include the new row without changing the loop.

You can also test the roof fill. The `115` in the first `C_LINE_TO` row is the apex's X coordinate.
Move it left and run the program again. If the fill point at `115, 65` ends up outside the roof,
`C_FLOOD` has no enclosing lines to stop it and the roof colour spreads across the sky. A flood fill
needs a point inside a closed outline.
