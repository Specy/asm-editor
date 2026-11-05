*----------------------------------------------------------- 
* Title         : MouseWindowSize
* Written by    : Chuck Kelly 
* Date Created  : Feb-9-2007 
* Modification  : Oct-18-2008 by CK, Added trap task 32 #5 to enable exception processing
*                    Added test for Sim68K version number.
* Description   : Mouse read and Output Window size demo
*   Displays mouse coordinates, mouse button states,
*   double click and keyboard keys Shift, Alt and Ctrl.
*   Draws a green crosshair at mouse position.
*   Pressing '1', '2', or '3' changes screen size.
*
*   Trap #15 Task 60 Enable/Disable mouse IRQ
*      An IRQ is created when a mouse button is pressed, released or moved in the output window.
*      D1.W High Byte = IRQ level (1-7), 0 to turn off
*      D1.W Low Byte = Mouse event that triggers IRQ:
*                      Bit2 = Move, Bit1 = Button Up, Bit0 = Button Down
*      (Example D1.W = $0103, Enable mouse IRQ level 1 for Move, Button Up and Button Down)
*      (Example D1.W - $0002, Disable mouse IRQ for Button Up)
*
*   Trap #15 Task 61 reads mouse 
*      D1.B = 00 to read current state of mouse
*           = 01 to read mouse up state
*           = 02 to read mouse down state
*      The mouse data is contained in the following registers
*      D0 as bits = Ctrl, Alt, Shift, Double, Middle, Right, Left
*           Left is Bit0, Right is Bit 1 etc.
*           1 = true, 0 = false
*           Shift, Alt, Ctrl represent the state of the corresponding keys.
*      D1.L = 16 bits Y, 16 bits X in pixel coordinates. (0,0 is top left)
*
*   Trap #15 Task 33 - Get/Set Output Window Size
*       D1.L High 16 bits = Width in pixels, min = 640
*            Low 16 bits  = Height in pixels, min = 480
*       D1.L = 0, get current window size as
*            High 16 bits = Width
*            Low 16 bits  = Height
*
*----------------------------------------------------------- 
   ORG   $1000 

start 
    * Initialize Trap #15 vector
    move.l  #versionTrap,$BC    ; Trap #15
    move.b  #4,d1               ; request Sim68K version number
    move.b  #32,d0              ; task 32 Simulator Environment
    trap    #15
    * If Sim68K is new enough to have task 32 then the trap will return to here.
    * D1.L will contain the version number or be unchanged on versions that do not
    * understand the #4 version number request.
    * If the simulator is too old to have task 32 then the Trap will be
    * sent to versionTrap.
    if.l d1 <lo> #$040000 then.s    ; if version prior to 4.0.0
versionTrap
        move.b  #14,d0              ; display text
        lea     oldVerMsg,a1
        trap    #15
        MOVE.B  #9,D0
        TRAP    #15                 ; Halt Simulator
    endi

; Initialize IRQ vectors 
    move.l  #mouseDownIRQ,$64       ; IRQ1
    move.l  #mouseUpIRQ,$68         ; IRQ2
    move.l  #mouseMoveIRQ,$6C       ; IRQ3
    andi.w  #$00,SR                 ; put CPU in User mode 

    move.b  #60,d0                  ; set mouse IRQ
    move.w  #$0101,d1               ; IRQ1 for mouse down
    trap    #15
    move.b  #60,d0                  ; set mouse IRQ
    move.w  #$0202,d1               ; IRQ2 for mouse up
    trap    #15
    move.b  #60,d0                  ; set mouse IRQ
    move.w  #$0304,d1               ; IRQ3 for mouse move
    trap    #15

    move.b  #33,d0                  ; set window size
    move.l  #(800<<16+600),d1       ; 800 x 600
    trap    #15

    move.b  #32,d0                  ; trap task 32 Hardware/Simulator control
    move.b  #5,d1                   ; d1.b = 5, enable exception processing
    trap    #15
    
    bsr     heading

*---- main program loop ----
loop    nop 
    move.b  #7,d0                   ; check for pending key press
    trap    #15
    if.b d1 <ne> #0 then.s          ; if key is ready
      move.b    #5,d0               ; read key
      trap      #15
      if.b d1 <eq> #'1' then.s      ; if '1' pressed
        move.b  #33,d0              ; set window size
        move.l  #(640<<16+480),d1   ; 640 x 480
        trap    #15
      endi
      if.b d1 <eq> #'2' then.s      ; if '2' pressed
        move.b  #33,d0              ; set window size
        move.l  #(800<<16+600),d1   ; 800 x 600
        trap    #15
      endi
      if.b d1 <eq> #'3' then.s      ; if '3' pressed
        move.b  #33,d0              ; set window size
        move.l  #(1024<<16+768),d1  ; 1024 x 768
        trap    #15
      endi
    endi
    nop
    bra     loop 


*----------------------------------------------------------------------------
* Draw cursor
* Pre: D1.L = 16 bits Y, 16 bits X in pixel coordinates. (0,0 is top left)

cursor    
    movem.l d0-d3,-(a7)             ; save registers
    move.l  d1,d3                   ; save mouse X,Y
    
* erase old cursor
    move.l  #BLACK,d1               ; set pen color
    move.b  #80,d0
    trap    #15

    move.w  cursorX,d1
    sub.w   #5,d1
    move.w  cursorY,d2
    move.b  #86,d0
    trap    #15                     ; move to X-5,Y of old cursor

    move.b  #85,d0                  ; draw line to
    add.w   #10,d1
    trap    #15                     ; draw to X,Y (d1 = X, d2 = Y)
    sub.w   #5,d1
    trap    #15
    add.w   #5,d2
    trap    #15
    sub.w   #10,d2
    trap    #15


* draw new cursor
    move.l  #LIME,d1                ; set pen color
    move.b  #80,d0
    trap    #15

    move.l  d3,d1
    move.l  d3,d2
    swap    d2
    move.w  d1,cursorX              ; save cursor X
    move.w  d2,cursorY              ; save cursor Y
    sub.w   #5,d1
    move.b  #86,d0
    trap    #15                     ; move to X-5,Y of current cursor

    move.b  #85,d0                  ; draw line to
    add.w   #10,d1
    trap    #15                     ; draw to X,Y (d1 = X, d2 = Y)
    sub.w   #5,d1
    trap    #15
    add.w   #5,d2
    trap    #15
    sub.w   #10,d2
    trap    #15
    movem.l (a7)+,d0-d3             ; restore registers
       rts

* IRQ handlers

; mouse down handler 
mouseDownIRQ
    movem.l d0-d1,-(a7)
    bsr     heading
    move.b  #61,d0                  ; read mouse
    move.b  #2,d1                   ; mouse down state
    trap    #15
    bsr     showMouseData
    movem.l (a7)+,d0-d1
    rte

; mouse up handler
mouseUpIRQ
    movem.l d0-d1,-(a7)
    bsr     heading
    move.b  #61,d0                  ; read mouse
    move.b  #1,d1                   ; mouse up state
    trap    #15
    bsr     showMouseData
    movem.l (a7)+,d0-d1
    rte 

; mouse move handler
mouseMoveIRQ
    movem.l d0-d1,-(a7)
    bsr     heading
    move.b  #61,d0                  ; read mouse
    move.b  #0,d1                   ; current mouse state
    trap    #15
    bsr     showMouseData
    movem.l (a7)+,d0-d1
    rte

* Pre: D0 & D1 contain mouse data
showMouseData
    movem.l d0-d4/a1,-(a7)
    move.l  d0,d4                   ; save mouse buttons
    bsr     cursor                  ; draw cursor
    move.l  d1,d3                   ; save mouse Y
    and.l   #$0000FFFF,d1           ; remove Y from D1
    move.b  #6,d2                   ; field width 6
    move.b  #20,d0                  ; display signed number in D1.L in field D2.B columns wide
    trap    #15                     ; dislay X
    move.l  d3,d1
    swap    d1
    and.l   #$0000FFFF,d1           ; mouse Y
    trap    #15                     ; display Y
    move.b  #14,d0                  ; task 14, display string without CR,LF
    for.b d3 = #1 to #7 do.s
      lsr.b #1,d4                   ; check mouse data bit in d4
      if <cs> then.s                ; if set
        lea strYes,a1               ; get Yes message
      else
        lea strNo,a1                ; get No message
      endi
      trap  #15                     ; display
    endf

    movem.l (a7)+,d0-d4/a1
    rts 

* Display Heading
heading
    movem.l d0/a1,-(a7)
    clr.w   d1
    move.b  #11,d0
    trap    #15                     ; position at text 0,0
    lea     strHeading,a1
    move.b  #14,d0
    trap    #15
    movem.l (a7)+,d0/a1
    rts

* Text
strHeading  dc.b    '    X     Y   Left  Rght  Midl   Dbl  Shft   Alt  Ctrl',CR,LF
            dc.b    '  ----  ----  ----  ----  ----  ----  ----  ----  ----',CR,LF,0
strYes      dc.b    '  Yes ',0
strNo       dc.b    '   No ',0
oldVerMsg   dc.b    'This program requires Sim68K version 4.0.0 or later.',CR,LF
            dc.b    'The latest version may be downloaded from www.easy68k.com',0


cursorX dc.w    0
cursorY dc.w    0

BLACK   EQU    $00000000
LIME    EQU    $0000FF00
CR      EQU    $0D
LF      EQU    $0A
    
    END    START 




*~Font name~Courier New~
*~Font size~10~
*~Tab type~1~
*~Tab size~4~
