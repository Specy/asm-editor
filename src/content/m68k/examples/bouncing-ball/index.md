A ball crosses the screen and turns round at every edge, and a bar along the top grows with the time
the program has been running. It never stops on its own: press Run, watch it, and press Stop when you
have had enough.

Drawing shapes on the screen drew one picture and ended. This one draws a new picture forty or fifty
times a second, which brings two problems with it: the reader must never see a half drawn frame, and
the ball must move at the same speed whatever the machine underneath is doing.

**You need to know:** the "Drawing shapes on the screen" Example and the "The screen, keyboard and
mouse through traps" lecture. What is new here is double buffering, task 92 mode 17 sends every
drawing to an off screen image and task 94 shows the whole of it at once.

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
    trap #15                ; task 8: hundredths of a second since the run started
    divu #640, d1
    swap d1
    andi.l #$FFFF, d1       ; the remainder, so the bar wraps at the right edge
    move.l d1, d3           ; where the bar ends
    move.l #BAR, d1
    move.b #81, d0
    trap #15
    move.l #0, d1
    move.l #0, d2
    move.l #8, d4
    move.b #87, d0
    trap #15                ; a bar as wide as the program has been running

    move.b #94, d0
    trap #15                ; the whole frame becomes visible here, at once

    move.b #23, d0
    move.l #2, d1
    trap #15                ; two hundredths of a second of program time

    move.w ballx, d5
    add.w stepx, d5
    cmp.w #0, d5
    blt flipx
    cmp.w #LIMITX, d5
    bgt flipx
    move.w d5, ballx
    bra movey
flipx:
    neg.w stepx             ; turn it round at the edge
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
    neg.w stepy
    bra frame

ballx:  dc.w 100
bally:  dc.w 60
stepx:  dc.w 5
stepy:  dc.w 3
```

```testcase
{ "runFor": 100000 }
```

The frame is four steps and they are always in this order: clear the image, draw everything on it,
show it with task 94, and let some program time pass. Task 11 with `d1.w = $FF00` is the clear, and
it wipes text and graphics together. Without mode 17 the same four steps would draw straight onto
what you are looking at, and you would watch the screen go black and the ball appear, forty times a
second, which is what flicker is.

Task 8 answers with the hundredths of a second since the run started, and task 23 lets that many
hundredths pass before the next instruction runs. The two are the same clock, and it is **program
time**: the editor stays responsive while task 23 waits, so Stop still answers, and inside a testcase
the wait finishes at once so a test of an animation does not take a minute. The bar at the top is
that number turned into a width, wrapped at 640 with a `divu` whose remainder is what the program
keeps.

The ball's position and step are two words each in memory, and the four edges are four comparisons.
`neg.w stepx` flips the sign of the step where it lies in memory, which turns the ball round without
either branch knowing which way it was going. `LIMITX equ 640-40` is the largest `x` the ball's left
edge may have, worked out by the assembler out of the screen width and the ball's size.

Try changing `move.l #2, d1` under task 23 to `move.l #10, d1`. The ball crawls, because it moves
five pixels per frame and the frames are now a tenth of a second apart, while the bar at the top
races: it is drawn from program time, and program time is what you just made pass five times faster
per frame.
