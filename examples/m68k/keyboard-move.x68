*-----------------------------------------------------------------------------
* Key state movement: task 19 polls four keys and moves a square while they are
* held. Click the screen panel first, so it has the keyboard; the ring around it
* says the editor's own shortcuts are off while it does.
*
* The title is printed with task 14, which puts it in the terminal transcript
* and draws it at the screen's text cursor at the same time: EASy68K has one
* output window, and so does this. Press Stop to end it.
*-----------------------------------------------------------------------------
    ORG     $1000

start:
    move.b  #92,d0
    move.b  #17,d1
    trap    #15                 ; draw off screen, so the square never flickers

    move.b  #14,d0
    lea     title,a1
    trap    #15                 ; transcript and text cursor at once

frame:
    move.b  #11,d0
    move.w  #$FF00,d1
    trap    #15                 ; clear, which also homes the text cursor

    move.b  #14,d0
    lea     title,a1
    trap    #15                 ; the title is redrawn on every frame

    move.l  #LIME,d1
    move.b  #81,d0
    trap    #15
    move.l  #WHITE,d1
    move.b  #80,d0
    trap    #15

    move.w  boxx,d1
    move.w  boxy,d2
    move.w  d1,d3
    add.w   #SIZE,d3
    move.w  d2,d4
    add.w   #SIZE,d4
    move.b  #87,d0
    trap    #15                 ; filled rectangle

    move.b  #94,d0
    trap    #15                 ; show the frame

    move.b  #23,d0
    move.l  #2,d1
    trap    #15

* --- read the four arrow keys ------------------------------------------------
* d1.l holds one key code per byte, and comes back with one $FF/$00 byte each,
* in the same order: left, up, right, down.
    move.b  #19,d0
    move.l  #$25262728,d1       ; left $25, up $26, right $27, down $28
    trap    #15

    btst    #24,d1
    beq     noleft
    sub.w   #STEP,boxx
noleft:
    btst    #8,d1
    beq     noright
    add.w   #STEP,boxx
noright:
    btst    #16,d1
    beq     noup
    sub.w   #STEP,boxy
noup:
    btst    #0,d1
    beq     nodown
    add.w   #STEP,boxy
nodown:

* --- keep the square on the screen -------------------------------------------
    move.w  boxx,d5
    cmp.w   #0,d5
    bge     xnotlow
    move.w  #0,boxx
xnotlow:
    cmp.w   #LIMITX,d5
    ble     xnothigh
    move.w  #LIMITX,boxx
xnothigh:
    move.w  boxy,d5
    cmp.w   #0,d5
    bge     ynotlow
    move.w  #0,boxy
ynotlow:
    cmp.w   #LIMITY,d5
    ble     ynothigh
    move.w  #LIMITY,boxy
ynothigh:
    bra     frame

* --- state -------------------------------------------------------------------
boxx:   dc.w    300
boxy:   dc.w    220
title:  dc.b    'Arrow keys move the square',0

SIZE    equ     40
STEP    equ     8
LIMITX  equ     640-SIZE
LIMITY  equ     480-SIZE

LIME    equ     $0000FF00
WHITE   equ     $00FFFFFF
