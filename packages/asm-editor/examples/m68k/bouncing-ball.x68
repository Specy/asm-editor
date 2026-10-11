*-----------------------------------------------------------------------------
* Bouncing ball: double buffering and the delay task on the M68K screen.
*
* Every frame the program clears the off screen image, draws the ball on it,
* shows it with task 94 and lets two hundredths of a second of program time
* pass. Nothing half drawn is ever shown, and the ball moves at the same pace
* whatever the host does. Press Stop to end it.
*
* Screen: 640 by 480, the size a program starts with.
*-----------------------------------------------------------------------------
    ORG     $1000

start:
    move.b  #92,d0
    move.b  #17,d1
    trap    #15                 ; drawing mode 17: draw off screen

    move.l  #WHITE,d1
    move.b  #80,d0
    trap    #15                 ; pen color, the ball's outline

frame:
    move.b  #11,d0
    move.w  #$FF00,d1
    trap    #15                 ; clear the off screen image

    move.l  #YELLOW,d1
    move.b  #81,d0
    trap    #15                 ; fill color, the ball itself

    move.w  ballx,d1
    move.w  bally,d2
    move.w  d1,d3
    add.w   #SIZE,d3
    move.w  d2,d4
    add.w   #SIZE,d4
    move.b  #88,d0
    trap    #15                 ; filled ellipse inside (d1,d2)-(d3,d4)

    move.b  #94,d0
    trap    #15                 ; the frame becomes visible here, all at once

    move.b  #23,d0
    move.l  #2,d1
    trap    #15                 ; two hundredths of a second of program time

* --- move the ball, turning it around at the edges ---------------------------
    move.w  ballx,d5
    add.w   ballDx,d5
    cmp.w   #0,d5
    blt     flipx
    cmp.w   #LIMITX,d5
    bgt     flipx
    move.w  d5,ballx
    bra     movey
flipx:
    neg.w   ballDx

movey:
    move.w  bally,d5
    add.w   ballDy,d5
    cmp.w   #0,d5
    blt     flipy
    cmp.w   #LIMITY,d5
    bgt     flipy
    move.w  d5,bally
    bra     frame
flipy:
    neg.w   ballDy
    bra     frame

* --- state -------------------------------------------------------------------
ballx:  dc.w    100
bally:  dc.w    80
ballDx: dc.w    5
ballDy: dc.w    3

SIZE    equ     48
LIMITX  equ     640-SIZE
LIMITY  equ     480-SIZE

YELLOW  equ     $0000FFFF
WHITE   equ     $00FFFFFF
