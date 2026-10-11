This program draws a house under a sun. Choose **Build**, then **Run**, and look at the Screen
panel: you should see blue sky, green ground, a round sun, a house with a white outline, a red roof,
a door and a label below it. The program draws these parts in that order, so later parts appear over
earlier ones.

Each drawing request puts a task number in `d0.b` and its arguments in registers, then calls
`trap #15`. The Screen holds the picture; the program does not store its pixels in M68K memory.

```m68k|playground|open-screen|no-registers|no-flags|allow-open
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
    move.b #87, d0          ; task 87: a filled rectangle
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
    move.b #88, d0          ; task 88: a filled ellipse in this square box
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
    bsr both_colours
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
    move.l #320, d1
    move.l #170, d2
    move.b #89, d0          ; task 89: fill from a point inside the roof
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

* both_colours: set both fill and pen to the colour in d1.l
both_colours:
    move.b #81, d0
    trap #15
    move.b #80, d0
    trap #15
    rts

    org $3000
label: dc.b 'A house under the sun', 0
```

## Colours and corners

The Screen keeps two colours. Task 81 sets the **fill** for the inside of a shape; task 80 sets the
**pen** for its outline, lines and text. Each takes a colour in `d1.l`. The `both_colours`
subroutine gives both the same colour. For example, `move.l #SKY, d1` followed by
`bsr both_colours` makes the sky rectangle blue throughout. The house instead sets `WALL` as its
fill and `WHITE` as its pen; task 93 makes that outline three pixels wide.

A colour is `$00BBGGRR`: blue, green and red are the last three bytes, in that order.
`$00E0B070` gives the sky red 112, green 176 and blue 224. After `both_colours` returns, the
program **replaces `d1` with the shape's left coordinate**. This is deliberate: tasks 80 and 81
read `d1.l` as a colour, but task 87 reads `d1.w` as an X coordinate. The next task determines
what a register means.

For tasks 87 (rectangle) and 88 (ellipse), `d1,d2` give the left and top of a box; `d3,d4` give
its right and bottom. The right and bottom boundaries are excluded, so `(0, 0)` to `(640, 320)`
covers the sky through row 319. The sun's box is 100 by 100 pixels, so its ellipse is a circle.
Tasks 80, 81 and 93 only need `d1`; the line and flood-fill tasks below need `d1,d2`.

## Closing the roof

Task 86 moves the drawing point to the left eave at `(180, 200)` without making a mark. Each task
85 draws a line from that point to the new `(d1,d2)` position and leaves the drawing point there.
The three lines go up to the peak, down to the right eave, then back to the left eave. That last
line is the roof's bottom edge.

Task 89 starts at `(320, 170)`, inside the triangle. It replaces the connected sky-coloured pixels
there with the current fill colour, `ROOF`. The drawn lines stop it spreading outside the triangle.
The house reaches from X 200 to 440, while the eaves reach X 180 and 460. The house's top edge
therefore cannot close the roof by itself: the line between the eaves matters. The door and label
are drawn later, after the roof is complete.

Task 95 draws the zero-terminated string at `(210, 420)` in the current pen colour. Its `a1`
argument points to `label`; `d1,d2` are pixel coordinates. Here the pen is reset to white just
before the text task, so the label appears white beneath the house.

## Try changing the picture

Make one change at a time, then choose **Build** and **Run** again:

1. Change `SUN equ $0000D2FF` to `SUN equ $0000FFFF`. Predict which part changes colour.
2. Restore `SUN`, then change the house's `move.b #87, d0` to `move.b #90, d0`. Predict what
   appears inside its outline. Task 90 draws only the rectangle's pen-coloured outline.
3. Restore task 87, then move the door 40 pixels right by changing its left X from `290` to `330`
   and its right X from `350` to `390`. Predict whether it still fits inside the house.

<details>
<summary>Show what to expect</summary>

1. The sun becomes yellow; its circle stays in the same place. `$0000FFFF` has full red and
   green, with no blue.
2. The house has a white frame. Sky shows through above the ground line, and grass shows through
   below it. The door remains in front because the program draws it after the house.
3. The door moves right without changing width. Its new right edge is 390, inside the house's
   right edge at 440.

</details>
