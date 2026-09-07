*-----------------------------------------------------------------------------
* FLAPPY 68K: a playable flappy bird, drawn and driven entirely through the
* EASy68K trap #15 tasks.
*
* Click the screen panel first, so it has the keyboard; the ring around it says
* the editor's own shortcuts are off while it does. Then tap SPACE, W, ENTER or
* the up arrow, or click on the screen itself, to flap. Fly through the gaps.
* Touching a pipe or the ground ends the run, and a flap starts the next one.
*
* Task 92 mode 17 draws every frame off screen and task 94 shows it finished,
* so nothing half drawn is ever visible; task 23 paces the animation in program
* time, which is what keeps it the same speed on a fast host and a slow one;
* task 19 reads the keys and task 61 the mouse, both without ever waiting, so
* the game keeps running whether or not anything is pressed. The score is drawn
* with task 95, straight onto the picture, rather than printed at the text
* cursor: printed text would also go to the terminal transcript, once a frame.
*
* Screen: 640 by 480, the size a program starts with. The tunables are the
* equates at the bottom, next to the colors.
*
* Coordinates are read as unsigned words, so nothing here is ever asked to draw
* at a negative X: the shapes that leave on the left are rectangles, and `rect`
* clamps them to the edge instead. That is also why the clouds do not drift.
*
* A frame costs about 61 instructions, so the editor's default two million
* instruction limit is worth something like a quarter of an hour of play before
* it ends the program with an error. Set "Instruction execution limit" to 0 in
* the settings to play for as long as you like.
*-----------------------------------------------------------------------------
    ORG     $1000

start:
    move.b  #92,d0
    move.b  #17,d1
    trap    #15                 ; mode 17: draw off screen until task 94

    move.b  #93,d0
    move.b  #1,d1
    trap    #15                 ; a one pixel pen for every outline

newgame:
    bsr     reset

* --- one frame ---------------------------------------------------------------
* d7 carries "a flap began this frame" from the input read to the state machine,
* so nothing called from here is allowed to touch it.
frame:
    bsr     readflap
    move.w  d0,d7

    move.w  state,d0
    cmp.w   #PLAYING,d0
    beq     playing
    cmp.w   #DEAD,d0
    beq     dead

* --- waiting to start: the bird hangs still until the first flap --------------
    tst.w   d7
    beq     draw
    move.b  #8,d0
    trap    #15                 ; hundredths of a second since the run started
    move.w  d1,seed             ; so the course depends on when the player began
    bsr     newpipes
    move.w  #PLAYING,state
    move.w  #FLAPV,birdv
    bra     draw

* --- playing -----------------------------------------------------------------
playing:
    tst.w   d7
    beq     fall
    move.w  #FLAPV,birdv        ; one tap is one flap, however long the key is held
    clr.w   wing                ; and the wing beat starts again with it
fall:
    move.w  birdv,d0
    add.w   #GRAV,d0
    cmp.w   #MAXFALL,d0
    ble     capped
    move.w  #MAXFALL,d0
capped:
    move.w  d0,birdv
    ext.l   d0
    add.l   d0,birdy            ; birdy counts sixteenths of a pixel

    tst.l   birdy
    bge     insky
    clr.l   birdy               ; the top of the screen is a bump, not a death
    clr.w   birdv
insky:
    bsr     movepipes
    bsr     hittest
    tst.w   d0
    beq     draw

    move.w  #DEAD,state
    move.w  points,d0
    cmp.w   record,d0
    ble     draw
    move.w  d0,record
    bra     draw

* --- dead: the bird drops to the ground, then waits for a flap ----------------
dead:
    move.w  birdv,d0
    add.w   #GRAV,d0
    cmp.w   #MAXFALL,d0
    ble     dcapped
    move.w  #MAXFALL,d0
dcapped:
    move.w  d0,birdv
    ext.l   d0
    add.l   d0,birdy

    move.l  birdy,d0
    asr.l   #4,d0
    cmp.w   #RESTY,d0
    blt     dfalling
    move.l  #RESTY16,birdy
    clr.w   birdv
dfalling:
    tst.w   d7
    beq     draw
    bra     newgame

* --- the frame is painted back to front, then shown all at once ---------------
draw:
    bsr     drawsky
    bsr     drawpipes
    bsr     drawground
    bsr     drawbird
    bsr     drawhud

    move.b  #94,d0
    trap    #15                 ; the finished frame appears here, all at once

    move.b  #23,d0
    move.l  #DELAY,d1
    trap    #15                 ; and this is what sets the frame rate
    bra     frame

*-----------------------------------------------------------------------------
* Input
*-----------------------------------------------------------------------------
* Answers d0.w = 1 on the frame a flap begins. Both tasks report what is held
* right now, so the "began" part is this program's: a press only counts when
* the frame before it had nothing pressed.
readflap:
    move.b  #19,d0
    move.l  #KEYLIST,d1
    trap    #15                 ; one $FF/$00 byte per key, in the same order
    move.l  d1,d2

    btst    #24,d2              ; space
    bne     pressed
    btst    #16,d2              ; the up arrow
    bne     pressed
    btst    #8,d2               ; w
    bne     pressed
    btst    #0,d2               ; enter
    bne     pressed

    move.b  #61,d0
    move.b  #0,d1
    trap    #15                 ; the mouse as it is right now
    btst    #0,d0               ; bit 0 of the flags byte is the left button
    bne     pressed

    clr.w   held
    moveq   #0,d0
    rts
pressed:
    tst.w   held
    bne     stillheld
    move.w  #1,held
    moveq   #1,d0               ; this frame is where the press began
    rts
stillheld:
    moveq   #0,d0
    rts

*-----------------------------------------------------------------------------
* The world
*-----------------------------------------------------------------------------
* A new game, keeping the best score of the session.
reset:
    move.w  #READY,state
    move.l  #STARTY16,birdy
    clr.w   birdv
    clr.w   points
    clr.w   wing
    clr.w   scroll
    bsr     newpipes
    rts

* Three pipes, evenly spaced off to the right, each with a gap of its own.
newpipes:
    lea     pipes,a0
    move.w  #FIRSTX,d2
    moveq   #2,d3
npnext:
    move.w  d2,(a0)+            ; where its left edge is
    bsr     randgap
    move.w  d0,(a0)+            ; the middle of its gap
    clr.w   (a0)+               ; and it has not been counted yet
    add.w   #SPACING,d2
    dbra    d3,npnext
    rts

* The middle of the next gap, from a sixteen bit congruential generator: one
* seed always lays out the same course, and the seed comes from the clock.
* Answers in d0.w and leaves every other register alone.
randgap:
    moveq   #0,d0
    move.w  seed,d0
    mulu    #25173,d0
    add.l   #13849,d0
    move.w  d0,seed             ; the low word of the product is the next seed
    moveq   #0,d0
    move.w  seed,d0
    lsr.l   #8,d0               ; its high byte is the half worth using
    mulu    #GAPSPAN,d0
    lsr.l   #8,d0               ; nought to GAPSPAN, without dividing
    add.w   #GAPMIN,d0
    rts

* Everything scrolls left. A pipe that has left the screen jumps a whole cycle
* to the right with a new gap, which is why three pipes are an endless course.
movepipes:
    move.w  scroll,d0
    sub.w   #SPEED,d0
    bge     scrolled
    add.w   #TUFTGAP,d0         ; the tufts repeat, so this wrap is invisible
scrolled:
    move.w  d0,scroll

    lea     pipes,a0
    moveq   #2,d3
mpnext:
    move.w  (a0),d1
    sub.w   #SPEED,d1
    cmp.w   #NEGPIPE,d1
    bgt     mpmoved
    add.w   #CYCLE,d1
    bsr     randgap
    move.w  d0,2(a0)
    clr.w   4(a0)
mpmoved:
    move.w  d1,(a0)

    tst.w   4(a0)               ; already counted?
    bne     mpdone
    move.w  d1,d2
    add.w   #PIPEW,d2
    cmp.w   #BIRDX,d2
    bge     mpdone
    move.w  #1,4(a0)
    addq.w  #1,points           ; its right edge has passed the bird
mpdone:
    lea     6(a0),a0
    dbra    d3,mpnext
    rts

* Answers d0.w = 1 when the bird is touching a pipe or the ground. The box it
* is tested with is smaller than the bird is drawn, which is what makes a near
* miss feel like one.
hittest:
    move.l  birdy,d1
    asr.l   #4,d1
    move.w  d1,d2
    add.w   #BIRDH,d2
    cmp.w   #GROUNDY,d2
    bge     hit                 ; the ground is met by the whole bird

    add.w   #HITIN,d1           ; the top of the box the pipes are tested with
    sub.w   #HITIN,d2           ; and its bottom

    lea     pipes,a0
    moveq   #2,d3
htnext:
    move.w  (a0),d4
    move.w  d4,d5
    add.w   #PIPEW,d5
    cmp.w   #HITR,d4
    bge     htskip              ; this pipe is still to the right of the bird
    cmp.w   #HITL,d5
    ble     htskip              ; and this one is already behind it

    move.w  2(a0),d6
    sub.w   #HALFGAP,d6
    cmp.w   d6,d1
    blt     hit                 ; above the gap
    add.w   #GAPH,d6
    cmp.w   d6,d2
    bgt     hit                 ; below it
htskip:
    lea     6(a0),a0
    dbra    d3,htnext

    moveq   #0,d0
    rts
hit:
    moveq   #1,d0
    rts

*-----------------------------------------------------------------------------
* Drawing
*-----------------------------------------------------------------------------
* The rectangle d1,d2 to d3,d4, with its left edge clamped to the screen, so a
* shape halfway off the left draws the half that is on it. Touches d0 and d1.
rect:
    tst.w   d3
    ble     rectdone            ; wholly off the left, nothing to draw
    tst.w   d1
    bge     rectgo
    moveq   #0,d1
rectgo:
    move.b  #87,d0
    trap    #15
rectdone:
    rts

* The sky, and two clouds sitting in it.
drawsky:
    move.l  #SKY,d1
    move.b  #80,d0
    trap    #15
    move.l  #SKY,d1
    move.b  #81,d0
    trap    #15
    moveq   #0,d1
    moveq   #0,d2
    move.w  #WIDTH,d3
    move.w  #HEIGHT,d4
    move.b  #87,d0
    trap    #15

    move.l  #CLOUDC,d1
    move.b  #80,d0
    trap    #15
    move.l  #CLOUDC,d1
    move.b  #81,d0
    trap    #15                 ; pen and fill alike, so the lobes have no seams

    move.w  #70,d5
    move.w  #56,d6
    bsr     cloud
    move.w  #390,d5
    move.w  #120,d6
    bsr     cloud
    rts

* One cloud: three overlapping discs, at d5.w across and d6.w down.
cloud:
    move.w  d5,d1
    move.w  d6,d2
    move.w  d1,d3
    add.w   #70,d3
    move.w  d2,d4
    add.w   #34,d4
    move.b  #88,d0
    trap    #15

    move.w  d5,d1
    add.w   #40,d1
    move.w  d6,d2
    sub.w   #16,d2
    move.w  d1,d3
    add.w   #60,d3
    move.w  d2,d4
    add.w   #50,d4
    move.b  #88,d0
    trap    #15

    move.w  d5,d1
    add.w   #86,d1
    move.w  d6,d2
    add.w   #6,d2
    move.w  d1,d3
    add.w   #54,d3
    move.w  d2,d4
    add.w   #28,d4
    move.b  #88,d0
    trap    #15
    rts

* The three pipes. a0 walks the table, one pipe per call.
drawpipes:
    move.l  #PIPEDK,d1
    move.b  #80,d0
    trap    #15
    move.l  #PIPEC,d1
    move.b  #81,d0
    trap    #15

    lea     pipes,a0
    bsr     onepipe
    bsr     onepipe
    bsr     onepipe
    rts

* A column down from the top and one up from the ground, each capped with a
* wider lip, then a0 moves on to the pipe after it.
onepipe:
    move.w  (a0),d5             ; its left edge
    move.w  2(a0),d6            ; and the middle of its gap

    move.w  d5,d1
    moveq   #0,d2
    move.w  d5,d3
    add.w   #PIPEW,d3
    move.w  d6,d4
    sub.w   #HALFGAP,d4         ; down to the top of the gap
    bsr     rect

    move.w  d5,d1
    sub.w   #LIPOUT,d1
    move.w  d4,d2
    sub.w   #LIPH,d2
    move.w  d5,d3
    add.w   #PIPER,d3
    bsr     rect                ; the lip, still ending at the gap

    move.w  d5,d1
    move.w  d6,d2
    add.w   #HALFGAP,d2         ; from the bottom of the gap
    move.w  d5,d3
    add.w   #PIPEW,d3
    move.w  #GROUNDY,d4
    bsr     rect

    move.w  d5,d1
    sub.w   #LIPOUT,d1
    move.w  d6,d2
    add.w   #HALFGAP,d2
    move.w  d5,d3
    add.w   #PIPER,d3
    move.w  d2,d4
    add.w   #LIPH,d4
    bsr     rect

    lea     6(a0),a0
    rts

* Sand, a band of grass on top of it, and tufts that scroll with the pipes.
drawground:
    move.l  #SAND,d1
    move.b  #80,d0
    trap    #15
    move.l  #SAND,d1
    move.b  #81,d0
    trap    #15
    moveq   #0,d1
    move.w  #GROUNDY,d2
    move.w  #WIDTH,d3
    move.w  #HEIGHT,d4
    move.b  #87,d0
    trap    #15

    move.l  #GRASS,d1
    move.b  #80,d0
    trap    #15
    move.l  #GRASS,d1
    move.b  #81,d0
    trap    #15
    moveq   #0,d1
    move.w  #GROUNDY,d2
    move.w  #WIDTH,d3
    move.w  #GRASSB,d4
    move.b  #87,d0
    trap    #15

    move.l  #GRASSDK,d1
    move.b  #80,d0
    trap    #15
    move.l  #GRASSDK,d1
    move.b  #81,d0
    trap    #15

* one tuft further left than the screen, so the row never runs out on that side
    move.w  scroll,d5
    sub.w   #TUFTGAP,d5
    moveq   #11,d6
gtnext:
    move.w  d5,d1
    move.w  #TUFTY,d2
    move.w  d5,d3
    add.w   #TUFTW,d3
    move.w  #TUFTB,d4
    bsr     rect
    add.w   #TUFTGAP,d5
    dbra    d6,gtnext
    rts

* The bird: a body, a wing that beats through three positions, an eye and a
* beak. Only the body's box is what `hittest` measures.
drawbird:
    move.l  birdy,d5
    asr.l   #4,d5               ; sixteenths of a pixel back down to pixels

    move.l  #INK,d1
    move.b  #80,d0
    trap    #15                 ; one dark outline for all of it

    move.l  #BODY,d1
    move.b  #81,d0
    trap    #15
    move.w  #BIRDX,d1
    move.w  d5,d2
    move.w  #BIRDR,d3
    move.w  d5,d4
    add.w   #BIRDH,d4
    move.b  #88,d0
    trap    #15

    moveq   #0,d6
    move.w  wing,d6
    move.w  state,d0
    cmp.w   #DEAD,d0
    beq     wingset             ; a dead bird stops beating
    addq.w  #1,d6
    cmp.w   #12,d6
    blt     wingheld
    moveq   #0,d6
wingheld:
    move.w  d6,wing
wingset:
    lsr.w   #2,d6               ; twelve frames, three positions
    mulu    #7,d6
    add.w   #WINGTOP,d6

    move.l  #WINGC,d1
    move.b  #81,d0
    trap    #15
    move.w  #WINGL,d1
    move.w  d5,d2
    add.w   d6,d2
    move.w  #WINGR,d3
    move.w  d2,d4
    add.w   #13,d4
    move.b  #88,d0
    trap    #15

    move.l  #PAPER,d1
    move.b  #81,d0
    trap    #15
    move.w  #EYEL,d1
    move.w  d5,d2
    add.w   #7,d2
    move.w  #EYER,d3
    move.w  d2,d4
    add.w   #14,d4
    move.b  #88,d0
    trap    #15

    move.l  #INK,d1
    move.b  #81,d0
    trap    #15
    move.w  #PUPL,d1
    move.w  d5,d2
    add.w   #11,d2
    move.w  #PUPR,d3
    move.w  d2,d4
    add.w   #7,d4
    move.b  #88,d0
    trap    #15

    move.l  #BEAKC,d1
    move.b  #81,d0
    trap    #15
    move.w  #BEAKL,d1
    move.w  d5,d2
    add.w   #19,d2
    move.w  #BEAKR,d3
    move.w  d2,d4
    add.w   #9,d4
    move.b  #87,d0
    trap    #15
    rts

* The score, and whatever state the game is in has to say.
drawhud:
    move.w  state,d0
    cmp.w   #READY,d0
    beq     hudready

    move.l  #INK,d1
    move.b  #81,d0
    trap    #15
    move.l  #PAPER,d1
    move.b  #80,d0
    trap    #15
    move.w  #PLATEL,d1
    move.w  #14,d2
    move.w  #PLATER,d3
    move.w  #46,d4
    move.b  #87,d0
    trap    #15

    lea     line,a1
    moveq   #0,d1
    move.w  points,d1
    bsr     appnum
    lea     line,a1
    move.w  #22,d6
    bsr     ctext

    move.w  state,d0
    cmp.w   #DEAD,d0
    beq     huddead
    rts

hudready:
    move.w  #250,d1
    move.w  #392,d2
    bsr     plate

    lea     title,a1
    move.w  #266,d6
    bsr     ctext
    lea     hint1,a1
    move.w  #302,d6
    bsr     ctext
    lea     hint2,a1
    move.w  #326,d6
    bsr     ctext
    lea     hint3,a1
    move.w  #358,d6
    bsr     ctext
    rts

huddead:
    move.w  #150,d1
    move.w  #330,d2
    bsr     plate

    lea     overmsg,a1
    move.w  #172,d6
    bsr     ctext

    lea     line,a1
    lea     pointsmsg,a0
    bsr     append
    moveq   #0,d1
    move.w  points,d1
    bsr     appnum
    lea     line,a1
    move.w  #210,d6
    bsr     ctext

    lea     line,a1
    lea     recordmsg,a0
    bsr     append
    moveq   #0,d1
    move.w  record,d1
    bsr     appnum
    lea     line,a1
    move.w  #238,d6
    bsr     ctext

    lea     againmsg,a1
    move.w  #286,d6
    bsr     ctext
    rts

* A plate across the middle of the screen, from d1.w down to d2.w.
plate:
    move.w  d1,d5
    move.w  d2,d6
    move.l  #INK,d1
    move.b  #81,d0
    trap    #15
    move.l  #PAPER,d1
    move.b  #80,d0
    trap    #15
    move.w  #PANELL,d1
    move.w  d5,d2
    move.w  #PANELR,d3
    move.w  d6,d4
    move.b  #87,d0
    trap    #15
    rts

*-----------------------------------------------------------------------------
* Text
*-----------------------------------------------------------------------------
* Draws the NULL terminated string at (a1) centred across the screen with its
* top at d6.w. The screen's font is an 8 by 16 cell, so half a character is the
* four pixels each one takes off the centre.
ctext:
    movea.l a1,a0
    moveq   #0,d5
ctlen:
    move.b  (a0)+,d0
    beq     ctdraw
    addq.w  #1,d5
    bra     ctlen
ctdraw:
    asl.w   #2,d5
    move.w  #CENTREX,d1
    sub.w   d5,d1
    move.w  d6,d2
    move.b  #95,d0
    trap    #15
    rts

* Appends the NULL terminated string at (a0) to the one at (a1), leaving a1 on
* the new terminator so the next call carries straight on from there.
append:
    move.b  (a0)+,d0
    beq     appdone
    move.b  d0,(a1)+
    bra     append
appdone:
    clr.b   (a1)
    rts

* Appends d1.l, a number up to 65535, as decimal at (a1). Digits come out least
* significant first, so they are written backwards into a scratch buffer and
* the whole thing is appended at the end.
appnum:
    lea     numend,a0
    clr.b   -(a0)
annext:
    divu    #10,d1
    move.l  d1,d2
    swap    d2                  ; the remainder is this digit
    add.w   #$30,d2
    move.b  d2,-(a0)
    andi.l  #$FFFF,d1           ; and the quotient is what is left to do
    bne     annext
    bra     append

*-----------------------------------------------------------------------------
* State
*-----------------------------------------------------------------------------
state:      dc.w    0
birdy:      dc.l    STARTY16    ; sixteenths of a pixel, so gravity is smooth
birdv:      dc.w    0
points:     dc.w    0
record:     dc.w    0
wing:       dc.w    0
held:       dc.w    0           ; was a flap key or button down last frame?
scroll:     dc.w    0
seed:       dc.w    $1D4B

* one pipe is its left edge, the middle of its gap, and whether it is counted
pipes:      dc.w    0,0,0
            dc.w    0,0,0
            dc.w    0,0,0

title:      dc.b    'FLAPPY 68K',0
hint1:      dc.b    'TAP SPACE, W, ENTER OR THE UP ARROW',0
hint2:      dc.b    'OR CLICK ON THE SCREEN ITSELF',0
hint3:      dc.b    'CLICK THE SCREEN PANEL SO IT TAKES THE KEYS',0
overmsg:    dc.b    'GAME OVER',0
pointsmsg:  dc.b    'SCORE ',0
recordmsg:  dc.b    'BEST ',0
againmsg:   dc.b    'FLAP TO PLAY AGAIN',0

line:       ds.b    48
numbuf:     ds.b    8
numend:     ds.b    1

*-----------------------------------------------------------------------------
* Tunables
*-----------------------------------------------------------------------------
WIDTH   equ     640
HEIGHT  equ     480
CENTREX equ     320
GROUNDY equ     416             ; the top of the ground
GRASSH  equ     10
GRASSB  equ     426             ; GROUNDY+GRASSH
TUFTY   equ     410
TUFTB   equ     418
TUFTW   equ     20
TUFTGAP equ     56

READY   equ     0
PLAYING equ     1
DEAD    equ     2

BIRDX   equ     150             ; the bird only ever moves up and down
BIRDW   equ     46
BIRDH   equ     34
BIRDR   equ     196             ; BIRDX+BIRDW
HITIN   equ     6               ; the hit box is this much smaller on each side
HITL    equ     156             ; BIRDX+HITIN
HITR    equ     190             ; BIRDX+BIRDW-HITIN
STARTY  equ     196
STARTY16 equ    3136            ; STARTY*16
RESTY   equ     382             ; GROUNDY-BIRDH, where a dead bird lands
RESTY16 equ     6112            ; RESTY*16

GRAV    equ     5               ; sixteenths of a pixel, per frame, per frame
FLAPV   equ     -80             ; the speed one flap gives, upwards
MAXFALL equ     150

WINGTOP equ     5
WINGL   equ     159             ; BIRDX+9
WINGR   equ     183             ; BIRDX+33
EYEL    equ     174             ; BIRDX+24
EYER    equ     188             ; BIRDX+38
PUPL    equ     180             ; BIRDX+30
PUPR    equ     187             ; BIRDX+37
BEAKL   equ     190             ; BIRDX+40
BEAKR   equ     208             ; BIRDX+58

PIPEW   equ     70
PIPER   equ     76              ; PIPEW+LIPOUT
NEGPIPE equ     -70             ; -PIPEW, where a pipe is recycled
LIPH    equ     18
LIPOUT  equ     6
GAPH    equ     140
HALFGAP equ     70
SPEED   equ     4               ; pixels a frame, for everything that scrolls
SPACING equ     240             ; between one pipe and the next
CYCLE   equ     720             ; SPACING*3, what a recycled pipe jumps by
FIRSTX  equ     620
GAPMIN  equ     120             ; the highest the middle of a gap goes
GAPSPAN equ     180             ; and how far below that it can be

DELAY   equ     3               ; hundredths of a second a frame
KEYLIST equ     $2026570D       ; space, up arrow, w, enter

PLATEL  equ     284
PLATER  equ     356
PANELL  equ     104
PANELR  equ     536

* colors are $00BBGGRR longs, the encoding EASy68K uses
SKY     equ     $00E8C04E
CLOUDC  equ     $00F8FBFF
PIPEC   equ     $0039BB58
PIPEDK  equ     $00347A29
SAND    equ     $0095D8DE
GRASS   equ     $0058C474
GRASSDK equ     $0040A04C
BODY    equ     $003ECEFA
WINGC   equ     $00D2F5FF
BEAKC   equ     $002882F0
INK     equ     $00101820
PAPER   equ     $00FFFFFF
