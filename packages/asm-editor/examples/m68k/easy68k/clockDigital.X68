*-----------------------------------------------------------
* Title         : clockDigital
* Written by    : Chuck Kelly
* Date Created  : Jan-9-2007
* Description   : A digital clock for EASy68K.
*
* Simulator Trap task for timer
* 8 - Return time in hundredths of a second since midnight in D1.L. 
*
* A2 & A4 - Address of 7-segment display
* A3 - Address of LEDs
* Modifications:
* Oct-17-2008 by CK, Added DELAY
* Dec-25-2012 by CK, Uses SIMHALT
*-----------------------------------------------------------

NOON    EQU    12*60*60*100    noon in 100's of a second

* Delay for hundredths of a second in param 1
DELAY    MACRO
    move.b  #23,d0          trap task 23
    move.l  #\1,d1          delay amount
    trap    #15
    ENDM


*-------------------------- PROGRAM START ---------------------------
    ORG    $1000

START
    * initialize
    clr.w   seconds
    move.b  #32,d0          trap task to get address of hardware
    move.b  #0,d1
    trap    #15             display hardware window
    move.b  #1,d1
    trap    #15             get address of 7-segment display
    move.l  d1,a4           A4 = Address of 7-segment display
    move.b  #2,d1
    trap    #15             get address of LEDs
    move.l  d1,a3           A3 = Address of LEDs

loop
    move.l  a4,a2
    repeat
        move.b  #8,d0       Read timer, get 100ths of a second since midnight in D1.L
        trap    #15
        if.l d1 <hs> #NOON then.s
            sub.l #NOON,d1      time = time - NOON
        endi
        * Calculate total minutes (D5), minutes this hour (D6), seconds (D7)
        divu    #100,d1         convert to seconds
        move.l  d1,d4           save fractional seconds
        andi.l  #$0000ffff,d1   discard fractional seconds
        divu    #60,d1          convert to minutes
        move.l  d1,d7
        move.l  #16,d0    
        lsr.l   d0,d7           d7 = seconds
        andi.l  #$0000ffff,d1   discard seconds from d1
        move.l  d1,d5           d5 = total minutes
        divu    #60,d1          convert to hours
        move.l  d1,d6
        move.l  #16,d0
        lsr.l   d0,d6           minutes this hour to d6
        swap    d4              display fractional seconds on LEDs
        move.b  d4,(a3)
        DELAY    1              1/100 sec delay to reduce CPU workload
    until.w d7 <ne> seconds do  until a second has elapsed

* update the display on the 7-segment readouts

* display hour as digits
    divu    #60,d5              hours as 1-11 with 0 for 12
    if.w d5 <eq> #0 then.s      if hours = 0
        move.w    #12,d5        hours as 1-12
    endi
    move.b  #10,d3              blank digit code
    if.b d5 <hi> #9 then.s      if hours > 9
        sub     #10,d5        
        move.b  #1,d3           display a 1
    endi
    bsr    segment7             hour 10s digit
    move.w d5,d3
    bsr    segment7             hour 1s digit

* dash after hours
    move.b #11,d3               dash digit code
    bsr    segment7             display dash

* display minutes as digits
    move.b d6,d0
    bsr    Hex2BCD
    move.b #0,d3                0 digit code
    if.b d0 <hi> #9 then.s      if minutes > 9
        move.b  d0,d3
        lsr.b   #4,d3           10's minute digit
    endi
    bsr     segment7
    move.b  d0,d3
    and.b   #$F,d3              1's minute digit
    bsr     segment7

* dash after minutes
    move.b  #11,d3              dash digit code
    bsr     segment7            display dash

* display seconds as digits
    move.w  d7,seconds          save seconds
    move.w  d7,d0
    bsr     Hex2BCD
    move.b  #0,d3               0 digit code
    if.b d0 <hi> #9 then.s
        move.b  d0,d3
        lsr.b   #4,d3           10's seconds digit
    endi
    bsr     segment7
    move.b  d0,d3
    and.b   #$F,d3              1's second digit
    bsr     segment7

    bra     loop                loop forever

    * Halt the Simulator
    SIMHALT


*-----------------------------------------------------------
*         A
*       -----
*     F|     |B
*      |  G  |
*       -----
*     E|     |C
*      |  D  |
*       -----   .H
*
* Bit Number  7 6 5 4 3 2 1 0
* Segment     H G F E D C B A

* bit patterns to form digits on readout
digits:
    dc.b  $3F           digit 0
    dc.b  $06           digit 1
    dc.b  $5B           digit 2
    dc.b  $4F           digit 3
    dc.b  $66           digit 4
    dc.b  $6D           digit 5
    dc.b  $7D           digit 6
    dc.b  $07           digit 7
    dc.b  $7F           digit 8
    dc.b  $6F           digit 9
    dc.b  $00           digit off
    dc.b  $40           dash

    ds.w  0             force word boundary

*----------------------------------------------------------
* Display a digit on the 7-segment display
* Pre:  D3.B contains 1 digit to display
*       A2 points to 7-segment LED to use
* Post: A2 points to next 7-segment LED

segment7:
    movem.l d3/a0,-(a7)     save registers
    lea     digits,a0       bit pattern table
    and.l   #$00ff,d3
    move.b  (a0,d3),(a2)    display digit
    adda.l  #2,a2
    movem.l (a7)+,d3/a0     restore registers
    rts


*-----------------------------------
* Convert 2 digit Hex to 2 digit BCD
* Pre:  D0.B 2 digit Hex
* Post: D0.B 2 digit BCD
Hex2BCD:
    movem.l d1,-(a7)        save registers
    clr     d1
    and.l   #$00FF,d0
    divu    #10,d0
    move.l  d0,d1
    asl.w   #4,d0           shift tens to proper location
    swap    d1              put units in proper location
    or.b    d1,d0           combine units with tens
    movem.l (a7)+,d1        restore registers
    rts

* variables
seconds     ds.w    1

    END     START










*~Font name~Courier New~
*~Font size~10~
*~Tab type~1~
*~Tab size~4~
