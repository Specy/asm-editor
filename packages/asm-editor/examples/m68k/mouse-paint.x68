*-----------------------------------------------------------------------------
* Mouse painting: task 61 reads the pointer and the buttons, and the program
* paints a disc under the pointer while the left button is held. Hold Shift for
* red; the right button clears the screen.
*
* Task 61 answers with the flags in d0 (Ctrl, Alt, Shift, Double, Middle,
* Right, Left from bit 6 down) and the position in d1 as Y in the high word and
* X in the low word, in screen pixels whatever the panel's zoom is.
* Press Stop to end it.
*-----------------------------------------------------------------------------
    ORG     $1000

start:
    move.b  #14,d0
    lea     title,a1
    trap    #15

frame:
    move.b  #61,d0
    move.b  #0,d1
    trap    #15                 ; the mouse right now

    move.l  d1,d5               ; d5 = Y:X, kept over the drawing tasks
    move.l  d0,d6               ; d6 = the flags

    btst    #1,d6
    bne     wipe                ; right button: start again

    btst    #0,d6
    beq     wait                ; left button up: nothing to paint

    move.l  #AQUA,d1
    btst    #4,d6
    beq     hascolor
    move.l  #RED,d1             ; Shift held
hascolor:
    move.b  #81,d0
    trap    #15                 ; fill color
    move.b  #80,d0
    trap    #15                 ; and the same pen color, so the disc has no rim

    move.l  d5,d1
    and.l   #$FFFF,d1           ; X
    move.l  d5,d2
    lsr.l   #8,d2
    lsr.l   #8,d2               ; Y
    move.w  d1,d3
    add.w   #BRUSH,d3
    move.w  d2,d4
    add.w   #BRUSH,d4
    sub.w   #BRUSH,d1
    sub.w   #BRUSH,d2
    move.b  #88,d0
    trap    #15                 ; a filled disc centred on the pointer

wait:
    move.b  #23,d0
    move.l  #1,d1
    trap    #15                 ; one hundredth of a second between polls
    bra     frame

wipe:
    move.b  #11,d0
    move.w  #$FF00,d1
    trap    #15
    move.b  #14,d0
    lea     title,a1
    trap    #15
    bra     wait

title:  dc.b    'Drag to paint, Shift for red, right button clears',0

BRUSH   equ     6
AQUA    equ     $00FFFF00
RED     equ     $000000FF
