*-----------------------------------------------------------------------------
* Graphics tour: every drawing task the editor supports, on one screen, then
* the sound tasks of the standard player.
*
* Ported from EASy68K's own graphicSound.X68 (Chuck Kelly, GNU GPL; the
* original is kept verbatim in easy68k/), with its loop over the bitwise drawing
* modes removed: this editor supports drawing modes 2, 4, 16 and 17 only.
* Everything else draws what it draws in EASy68K. The sound tasks at the end
* play WAV Files the program writes itself, in place of the original's 0.wav,
* 1.wav and roger.wav.
*-----------------------------------------------------------------------------
SAMPLES equ     1200                ; samples in each WAV: 0.15 s at 8000 a second

    ORG     $1000

start:
* --- what size is the screen? task 33 with d1.l = 0 answers width:height ------
    move.b  #33,d0
    move.l  #0,d1
    trap    #15
    move.l  d1,d7               ; kept for the report at the end

* --- a pixel, and reading it back with task 83 --------------------------------
    move.l  #AQUA,d1
    move.b  #80,d0
    trap    #15                 ; pen color

    move.l  #80,d1
    move.l  #80,d2
    move.b  #82,d0
    trap    #15                 ; draw pixel

    move.b  #83,d0
    trap    #15                 ; get pixel color into d0.l
    move.l  d0,d6

* --- a line, drawn as a move and a line to ------------------------------------
    move.l  #RED,d1
    move.b  #80,d0
    trap    #15

    move.l  #100,d1
    move.l  #200,d2
    move.b  #86,d0
    trap    #15                 ; move to

    move.l  #300,d1
    move.l  #400,d2
    move.b  #85,d0
    trap    #15                 ; line to

* --- a filled rectangle -------------------------------------------------------
    move.l  #BLUE,d1
    move.b  #80,d0
    trap    #15
    move.l  #NAVY,d1
    move.b  #81,d0
    trap    #15                 ; fill color

    move.l  #20,d1
    move.l  #20,d2
    move.l  #60,d3
    move.l  #60,d4
    move.b  #87,d0
    trap    #15

* --- a filled ellipse ---------------------------------------------------------
    move.l  #YELLOW,d1
    move.b  #80,d0
    trap    #15
    move.l  #PURPLE,d1
    move.b  #81,d0
    trap    #15

    move.l  #20,d1
    move.l  #200,d2
    move.l  #80,d3
    move.l  #240,d4
    move.b  #88,d0
    trap    #15

* --- a wide pen, then the two unfilled shapes ---------------------------------
    move.b  #5,d1
    move.b  #93,d0
    trap    #15                 ; pen width

    move.l  #5,d1
    move.l  #200,d2
    move.l  #600,d3
    move.l  #260,d4
    move.b  #90,d0
    trap    #15                 ; unfilled rectangle

    move.l  #180,d1
    move.l  #200,d2
    move.l  #220,d3
    move.l  #240,d4
    move.b  #91,d0
    trap    #15                 ; unfilled ellipse

* --- flood fill the area inside the wide rectangle ----------------------------
    move.l  #BLUE,d1
    move.b  #81,d0
    trap    #15

    move.l  #90,d1
    move.l  #210,d2
    move.b  #89,d0
    trap    #15

* --- four thick lines ---------------------------------------------------------
    move.b  #30,d1
    move.b  #93,d0
    trap    #15

    move.l  #WHITE,d1
    move.b  #80,d0
    trap    #15
    move.l  #10,d1
    move.l  #350,d2
    move.l  #630,d3
    move.l  #350,d4
    move.b  #84,d0
    trap    #15

    move.l  #RED,d1
    move.b  #80,d0
    trap    #15
    move.l  #10,d1
    move.l  #380,d2
    move.l  #630,d3
    move.l  #380,d4
    move.b  #84,d0
    trap    #15

    move.l  #GREEN,d1
    move.b  #80,d0
    trap    #15
    move.l  #10,d1
    move.l  #410,d2
    move.l  #630,d3
    move.l  #410,d4
    move.b  #84,d0
    trap    #15

    move.l  #BLUE,d1
    move.b  #80,d0
    trap    #15
    move.l  #10,d1
    move.l  #440,d2
    move.l  #630,d3
    move.l  #440,d4
    move.b  #84,d0
    trap    #15

* --- drawing mode 2 moves the drawing point and leaves the pixels alone --------
    move.b  #1,d1
    move.b  #93,d0
    trap    #15                 ; back to a one pixel pen

    move.b  #92,d0
    move.b  #2,d1
    trap    #15                 ; mode 2

    move.l  #400,d1
    move.l  #100,d2
    move.b  #85,d0
    trap    #15                 ; nothing is drawn, but the point moves here

    move.b  #92,d0
    move.b  #4,d1
    trap    #15                 ; mode 4, draw normally again

    move.l  #LIME,d1
    move.b  #80,d0
    trap    #15
    move.l  #600,d1
    move.l  #100,d2
    move.b  #85,d0
    trap    #15                 ; and this line starts where the last one ended

* --- text drawn as graphics, at a pixel position ------------------------------
    move.l  #WHITE,d1
    move.b  #80,d0
    trap    #15
    move.l  #360,d1
    move.l  #60,d2
    lea     label,a1
    move.b  #95,d0
    trap    #15

* --- text printed at the text cursor, which task 11 puts where we want it ------
    move.b  #11,d0
    move.w  #$0202,d1           ; column 2, row 2
    trap    #15

    move.b  #17,d0
    lea     pixelmsg,a1
    move.l  d6,d1
    trap    #15                 ; the string, then the color read back by task 83

    move.b  #11,d0
    move.w  #$0203,d1
    trap    #15
    move.b  #17,d0
    lea     sizemsg,a1
    move.l  d7,d1
    trap    #15                 ; the screen size packed as width:height

* --- where did the pen end up? ------------------------------------------------
    move.b  #96,d0
    trap    #15                 ; d1.w = X, d2.w = Y

* --- three WAV Files, square waves written with the file tasks ----------------
    lea     wav0,a1
    move.w  #20,d3              ; 20 samples at each level: 200 Hz
    bsr     makewav
    lea     wav1,a1
    move.w  #10,d3              ; 400 Hz
    bsr     makewav
    lea     wavbeep,a1
    move.w  #5,d3               ; 800 Hz
    bsr     makewav

* --- load sounds into slots 0 and 1 of the standard player --------------------
    lea     wav0,a1
    move.b  #0,d1
    move.b  #71,d0
    trap    #15
    lea     wav1,a1
    move.b  #1,d1
    move.b  #71,d0
    trap    #15

* --- play sounds from the slots: the player plays one at a time ---------------
    move.b  #1,d1
    move.b  #72,d0
    trap    #15                 ; play slot 1
play0:
    bsr     tick
    move.b  #0,d1
    move.b  #72,d0
    trap    #15                 ; play slot 0
    tst.w   d0                  ; d0 = 0 while the player is busy
    beq     play0               ; try again until it plays

* --- play a sound straight from its WAV File ----------------------------------
playbeep:
    bsr     tick
    lea     wavbeep,a1
    move.b  #70,d0
    trap    #15
    tst.w   d0
    beq     playbeep            ; try again until it plays

    move.b  #9,d0
    trap    #15                 ; terminate

* tick: waits a hundredth of a second, so a loop that tries again and again
* does not spend the instruction limit while the player is busy, where the
* original tries without waiting
tick:
    move.l  #1,d1
    move.b  #23,d0
    trap    #15
    rts

* makewav: writes the File named at (a1), a WAV of SAMPLES samples whose level
* changes every d3.w samples
makewav:
    lea     samples,a0
    move.w  #SAMPLES-1,d1
    move.w  d3,d2
    move.b  #$C0,d4             ; 8-bit samples are unsigned: $80 is silence
square:
    move.b  d4,(a0)+
    subq.w  #1,d2
    bne.s   level
    eori.b  #$80,d4             ; $C0 and $40 in turn
    move.w  d3,d2
level:
    dbra    d1,square
    move.b  #52,d0
    trap    #15                 ; create the File, its number in d1.l
    lea     wav,a1
    move.l  #44+SAMPLES,d2
    move.b  #54,d0
    trap    #15                 ; write the header and the samples
    move.b  #56,d0
    trap    #15                 ; close the File
    rts

label:      dc.b    'Graphics tour',0
pixelmsg:   dc.b    'pixel color $00BBGGRR = ',0
sizemsg:    dc.b    'screen width:height = ',0
wav0:       dc.b    '0.wav',0
wav1:       dc.b    '1.wav',0
wavbeep:    dc.b    'beep.wav',0

* A WAV header for 8-bit samples, one channel, 8000 samples a second. A WAV
* stores its numbers low byte first, the opposite of the 68000.
wav:        dc.b    'RIFF',(36+SAMPLES)&$FF,(36+SAMPLES)>>8,0,0,'WAVE'
            dc.b    'fmt ',16,0,0,0,1,0,1,0
            dc.b    $40,$1F,0,0,$40,$1F,0,0,1,0,8,0
            dc.b    'data',SAMPLES&$FF,SAMPLES>>8,0,0
samples:    ds.b    SAMPLES

BLACK   equ     $00000000
GREEN   equ     $00008000
NAVY    equ     $00800000
PURPLE  equ     $00800080
RED     equ     $000000FF
LIME    equ     $0000FF00
YELLOW  equ     $0000FFFF
BLUE    equ     $00FF0000
AQUA    equ     $00FFFF00
WHITE   equ     $00FFFFFF
