A picture in seven shapes: two rectangles for the sky and the ground, an ellipse for the sun, a
rectangle with an outline for the house, three lines for its roof, one more rectangle for the door
and a line of text under it. Press Run and watch the Screen panel next to the program.

Print a string asked the environment for a line of text. The screen is the same kind of request, one
`trap #15` per shape, with the numbers in `d1` to `d4` and nothing written to any address.

**You need to know:** the "The screen, keyboard and mouse through traps" lecture and the "Print a
string" Example. What is new here is that the screen has two colours of its own, a pen for lines,
outlines and text and a fill for the insides of shapes, and each of them is set by a task of its own.

```m68k|playground|screen|no-registers|no-flags
SKY     equ $00E0B070       ; a colour is $00BBGGRR: blue, green, then red
GRASS   equ $003C9648
SUN     equ $0000D2FF
WALL    equ $004070C0
ROOF    equ $002020A0
DOOR    equ $00204070
WHITE   equ $00FFFFFF

    move.l #SKY, d1
    bsr both_colours
    move.l #0, d1           ; left
    move.l #0, d2           ; top
    move.l #640, d3         ; right
    move.l #320, d4         ; bottom
    move.b #87, d0          ; task 87: a filled rectangle, the sky
    trap #15

    move.l #GRASS, d1
    bsr both_colours
    move.l #0, d1
    move.l #320, d2
    move.l #640, d3
    move.l #480, d4
    move.b #87, d0          ; the ground
    trap #15

    move.l #SUN, d1
    bsr both_colours
    move.l #500, d1
    move.l #40, d2
    move.l #600, d3
    move.l #140, d4
    move.b #88, d0          ; task 88: a filled ellipse in a square box, the sun
    trap #15

    move.l #WALL, d1
    move.b #81, d0          ; task 81: the fill colour on its own
    trap #15
    move.l #WHITE, d1
    move.b #80, d0          ; task 80: a different pen, so the walls get an outline
    trap #15
    move.b #3, d1
    move.b #93, d0          ; task 93: the pen width, three pixels
    trap #15
    move.l #200, d1
    move.l #200, d2
    move.l #440, d3
    move.l #380, d4
    move.b #87, d0          ; the house
    trap #15

    move.l #ROOF, d1
    move.b #80, d0
    trap #15
    move.l #180, d1
    move.l #200, d2
    move.b #86, d0          ; task 86: move the drawing point, drawing nothing
    trap #15
    move.l #320, d1
    move.l #110, d2
    move.b #85, d0          ; task 85: a line from the drawing point to here
    trap #15
    move.l #460, d1
    move.l #200, d2
    move.b #85, d0          ; and on to the other eave
    trap #15
    move.l #180, d1
    move.l #200, d2
    move.b #85, d0          ; and back where it started
    trap #15

    move.l #DOOR, d1
    bsr both_colours
    move.l #290, d1
    move.l #290, d2
    move.l #350, d3
    move.l #380, d4
    move.b #87, d0          ; the door
    trap #15

    move.l #WHITE, d1
    move.b #80, d0
    trap #15
    lea label, a1
    move.l #210, d1
    move.l #420, d2
    move.b #95, d0          ; task 95: text at a pixel position
    trap #15

    move.b #9, d0
    trap #15

* both_colours(c): the fill and the pen both become the colour in d1
both_colours:
    move.b #81, d0
    trap #15
    move.b #80, d0
    trap #15
    rts

    org $3000
label: dc.b 'Seven shapes and a line of text', 0
```

A colour is a long written `$00BBGGRR`, blue in the high byte and red in the lowest, which is
EASy68K's order and backwards from the `#RRGGBB` of CSS. `SKY equ $00E0B070` is therefore
`rgb(112, 176, 224)`, a pale blue.

A rectangle and an ellipse take the same four numbers, the corners of a box: `d1` and `d2` are its
left and top, `d3` and `d4` its right and bottom, and the ellipse is the one that fits inside that
box, so a square box draws a circle. Both of them fill with the fill colour and outline with the pen,
which is why `both_colours` exists: when the two are the same the shape has no rim, and the sky, the
grass and the door are drawn that way. The house sets them apart, `WALL` inside and white outside,
with a pen three pixels wide.

The roof is three lines and no shape at all. Task 86 moves the **drawing point** without drawing
anything, and each task 85 after it draws from wherever that point is to the new place and leaves it
there, so a polyline is one 86 and one 85 per corner. Task 84 is the other line task, the one that
takes both ends at once.

Task 95 draws a string at a pixel position in the pen colour, over whatever is already there. That is
different from task 14, which prints at the text cursor and into the transcript above the screen;
task 95 only draws.

Every `trap #15` costs one instruction out of the two million a Playground gets, whatever the task
does, so a picture is counted in shapes: this one is 24 traps and a filled rectangle is one of them,
while the same rectangle drawn a pixel at a time with task 82 would be 43200.

Try changing the `move.b #87, d0` under the house's four corners to `move.b #90, d0`. Task 90 draws
the outline of that same box and nothing inside it, so the walls become a white frame with the sky
showing through.
