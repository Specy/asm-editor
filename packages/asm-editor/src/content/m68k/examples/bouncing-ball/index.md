This program draws a ball moving across the Screen and a gray bar growing along its top edge.
Choose **Build**, then **Run** to watch it. Choose **Stop** when you are done. The program keeps
looping until you stop it or the editor's run limit is reached.

The ball begins at `(100, 60)`. Each frame uses its current position, then changes that position
for the next frame. Its horizontal step is 5 pixels and its vertical step is 3 pixels.

```m68k|playground|open-screen|no-registers|no-flags|allow-open
SIZE    equ 40
LIMITX  equ 640-40
LIMITY  equ 480-40
BALL    equ $0000D2FF
BAR     equ $00808080
WHITE   equ $00FFFFFF

    move.b #92, d0
    move.b #17, d1
    trap #15                ; task 92 mode 17: draw off screen
    move.l #WHITE, d1
    move.b #80, d0
    trap #15                ; the pen, which outlines the ball

frame:
    move.b #11, d0
    move.w #$FF00, d1
    trap #15                ; clear the off screen image

    move.l #BALL, d1
    move.b #81, d0
    trap #15
    move.w ballx, d1        ; the box the ball is drawn inside
    move.w bally, d2
    move.w d1, d3
    add.w #SIZE, d3
    move.w d2, d4
    add.w #SIZE, d4
    move.b #88, d0
    trap #15                ; a filled ellipse in that box

    move.b #8, d0
    trap #15                ; elapsed hundredths of a second in d1.l
    divu #640, d1
    swap d1
    andi.l #$FFFF, d1       ; keep the remainder: a width from 0 to 639
    move.l d1, d3           ; the bar's right edge
    move.l #BAR, d1
    move.b #81, d0
    trap #15
    move.l #0, d1           ; left edge
    move.l #0, d2           ; top edge
    move.l #8, d4           ; bottom edge
    move.b #87, d0
    trap #15                ; draw the bar from x = 0 to x = d3

    move.b #94, d0
    trap #15                ; show the completed frame

    move.b #23, d0
    move.l #2, d1
    trap #15                ; wait two hundredths of a second

    move.w ballx, d5
    add.w stepx, d5
    cmp.w #0, d5
    blt flipx
    cmp.w #LIMITX, d5
    bgt flipx
    move.w d5, ballx
    bra movey
flipx:
    neg.w stepx             ; reverse the horizontal step
movey:
    move.w bally, d5
    add.w stepy, d5
    cmp.w #0, d5
    blt flipy
    cmp.w #LIMITY, d5
    bgt flipy
    move.w d5, bally
    bra frame
flipy:
    neg.w stepy             ; reverse the vertical step
    bra frame

ballx:  dc.w 100
bally:  dc.w 60
stepx:  dc.w 5
stepy:  dc.w 3
```

```testcase
{ "runFor": 100000 }
```

## One complete frame at a time

Before the loop, task 92 with mode 17 makes drawing go to a hidden image. In each pass through
`frame`, task 11 with `d1.w = $FF00` clears that image, including both graphics and text. The
program then draws the ball and the bar on it. Task 94 shows the completed image all at once.
Clearing and drawing happen while the previous frame remains visible, so you do not see the ball
disappear between frames.

After showing the frame, task 23 lets `d1.l` hundredths of a second pass before the program
continues. Here `2` means at least **0.02 seconds** between frames. This is program time: the editor
remains responsive to **Stop** during the wait. Drawing and running the instructions also take
time, so the code does not promise an exact number of frames per second.

## Turn before crossing an edge

`ballx` and `bally` hold the top-left corner of the ball's 40 by 40 box. The code copies each
coordinate to `d5` and adds its step to try the _next_ position. A 640-pixel-wide Screen lets the
box's left edge range from 0 to `640 - 40 = 600`; its top edge can range from 0 to
`480 - 40 = 440`.

If a proposed coordinate is within those bounds, the program saves it as the ball's new position.
If it crosses an edge, `neg.w` changes the sign of that step in memory and leaves the saved
position alone. For example, with `ballx = 600` and `stepx = 5`, the proposed X is 605. The
program keeps X at 600, changes `stepx` to -5, and tries 595 on the following frame. The same
logic handles the top and bottom edges using `bally` and `stepy`.

## A bar measured by the clock

Task 8 returns the elapsed program time in hundredths of a second in `d1.l`. The bar uses that
number as a width. `divu #640, d1` divides it by 640; as in the division example, the remainder
lands in the high word of `d1`. `swap` moves that remainder to the low word, and `andi.l #$FFFF`
clears the other word. The resulting width runs from 0 to 639, then starts again at 0. One full
cycle takes 640 hundredths, or 6.4 seconds of program time.

The width goes into `d3` for task 87. Its rectangle corners are `d1 = 0` (left), `d2 = 0` (top),
`d3 = width` (right), and `d4 = 8` (bottom). The right and bottom edges are excluded, so the gray
bar is eight pixels high and its visible width is exactly the remainder. If task 8 returned 645,
the remainder after dividing by 640 would be 5, and the rectangle would run from X 0 through X 4.

The bar follows elapsed time; the ball moves a fixed number of pixels _per frame_. If frames take
longer, the ball covers fewer pixels in the same amount of time, while the bar still reflects the
clock reading.

## Try a slower pace

Change the delay's `move.l #2, d1` to `move.l #5, d1`. Before choosing **Build** and **Run** again,
predict what happens to the ball's movement between frames and to the bar's growth between frames.
Use **Stop** when you have watched enough, then restore `2`.

<details>
<summary>Show what to expect</summary>

Each delay is now at least 0.05 seconds. The ball still moves 5 pixels horizontally and 3
vertically on each frame, so it generally travels more slowly across the Screen. More clock time
passes between frames, so the bar generally grows farther between pictures. The exact spacing
can vary because drawing and instruction execution take time too.

</details>
