*-----------------------------------------------------------
* Title         : graphicSound
* Written by    : Chuck Kelly
* Date Created  : May-3-2002
* Description   : Test simulator graphics
*
* The graphics resolution is 640 x 480 with 0,0 at the top left.
*  (see help for information on graphics and sound)
* Modification    : Oct-18-2008 by CK
* Dec-25-2012 by CK, Uses SIMHALT
*-----------------------------------------------------------
    ORG    $1000

START

    move.l  #AQUA,d1        set pen color
    move.b  #80,d0
    trap    #15

    move.l  #80,d1          X = 80
    move.l  #80,d2          Y = 80
    move.b  #82,d0
    trap    #15             draw pixel

    move.b  #83,d0
    trap    #15             get pixel

    move.l  #RED,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #100,d1         X = 100
    move.l  #200,d2         Y = 200
    move.b  #86,d0
    trap    #15             move to X,Y

    move.l  #300,d1         X = 300
    move.l  #400,d2         Y = 400
    move.b  #85,d0
    trap    #15             line to X,Y
    
    move.l  #BLUE,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #NAVY,d1
    move.b  #81,d0
    trap    #15             set fill color

    move.l  #20,d1          X1 = 20
    move.l  #20,d2          Y1 = 20
    move.l  #60,d3          X2 = 60
    move.l  #60,d4          Y2 = 60
    move.b  #87,d0
    trap    #15             draw filled rectangle

    move.l  #YELLOW,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #PURPLE,d1
    move.b  #81,d0
    trap    #15             set fill color

    move.l  #20,d1          X1 = 20
    move.l  #200,d2         Y1 = 300
    move.l  #80,d3          X2 = 80
    move.l  #240,d4         Y2 = 340
    move.b  #88,d0
    trap    #15             draw filled ellipse

    move.b  #5,d1           pen width = 5
    move.b  #93,d0
    trap    #15             set pen width

    move.l  #5,d1           X1 = 5
    move.l  #200,d2         Y1 = 300
    move.l  #600,d3         X2 = 600
    move.l  #260,d4         Y2 = 360
    move.b  #90,d0
    trap    #15             draw unfilled rectangle

    move.l  #180,d1         X1 = 180
    move.l  #200,d2         Y1 = 300
    move.l  #220,d3         X2 = 220
    move.l  #240,d4         Y2 = 340
    move.b  #91,d0
    trap    #15             draw unfilled ellipse

    move.l  #BLUE,d1
    move.b  #81,d0
    trap    #15             set fill color

    move.l  #90,d1          X1 = 90
    move.l  #210,d2         Y1 = 310
    move.b  #89,d0
    trap    #15             flood fill

    move.b  #30,d1          pen width = 30
    move.b  #93,d0
    trap    #15             set pen width

    move.l  #WHITE,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #10,d1          X1 = 10
    move.l  #350,d2         Y1 = 400
    move.l  #630,d3         X2 = 400
    move.l  #350,d4         Y2 = 400
    move.b  #84,d0
    trap    #15             draw line from X1,Y1 to X2,Y2

    move.l  #RED,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #10,d1          X1 = 10
    move.l  #380,d2         Y1 = 420
    move.l  #630,d3         X2 = 400
    move.l  #380,d4         Y2 = 420
    move.b  #84,d0
    trap    #15             draw line from X1,Y1 to X2,Y2

    move.l  #GREEN,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #10,d1          X1 = 10
    move.l  #410,d2         Y1 = 440
    move.l  #630,d3         X2 = 400
    move.l  #410,d4         Y2 = 440
    move.b  #84,d0
    trap    #15             draw line from X1,Y1 to X2,Y2

    move.l  #BLUE,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.l  #10,d1          X1 = 10
    move.l  #440,d2         Y1 = 460
    move.l  #630,d3         X2 = 400
    move.l  #440,d4         Y2 = 460
    move.b  #84,d0
    trap    #15             draw line from X1,Y1 to X2,Y2


* demonstrate the different drawing modes
    move.b  #10,d1          pen width = 10
    move.b  #93,d0
    trap    #15             set pen width

    move.l  #TEAL,d1
    move.b  #80,d0
    trap    #15             set pen color

    move.b  #0,d5           drawing mode starts at 0
    move.w  #10,d6          X2, move this end of the line each time

    repeat     
        move.b  d5,d1       drawing mode
        move.b  #92,d0
        trap    #15         set drawing mode

        move.l  #320,d1     X1 = 320
        move.l  #640,d2     Y1 = 640, NOTE this is below the bottom of the screen
        move.l  d6,d3       X2 = d6
        move.l  #200,d4     Y2 = 200
        move.b  #84,d0
        trap    #15         draw line from X1,Y1 to X2,Y2

        add.w   #40,d6      move end of line for next mode
        addq.b  #1,d5       next drawing mode
        cmp.b   #15,d5      until all modes tried
    until.b d5 <hi> #15 do.s     

* Load sounds into memory
    lea     zero,a1         load "zero" wav
    move    #0,d1           sound number 0
    move    #71,d0
    trap    #15

    lea     one,a1          load "one" wav
    move    #1,d1           sound number 1
    move    #71,d0
    trap    #15

* Play sounds from memory
    move    #1,d1           play "one"
    move    #72,d0
    trap    #15

play0 move  #0,d1           play "zero"
    move    #72,d0
    trap    #15
    tst.w   d0              d0 = 0 if player is busy
    beq     play0           loop until sound plays

* Play sound directly from wav file
playr lea   roger,a1
    move    #70,d0
    trap    #15    
    tst.w   d0              d0 = 0 if player is busy
    beq     playr           loop until sound plays

    SIMHALT                 Halt Simulator

roger   dc.b    'roger.wav',0    sound file
zero    dc.b    '0.wav',0    
one     dc.b    '1.wav',0        

BLACK   EQU    $00000000
MAROON  EQU    $00000080
GREEN   EQU    $00008000
OLIVE   EQU    $00008080
NAVY    EQU    $00800000
PURPLE  EQU    $00800080
TEAL    EQU    $00808000
GRAY    EQU    $00808080
RED     EQU    $000000FF
LIME    EQU    $0000FF00
YELLOW  EQU    $0000FFFF
BLUE    EQU    $00FF0000
FUCHSIA EQU    $00FF00FF
AQUA    EQU    $00FFFF00
LTGRAY  EQU    $00C0C0C0
WHITE   EQU    $00FFFFFF

    END    START





*~Font name~Courier New~
*~Font size~10~
*~Tab type~1~
*~Tab size~4~
