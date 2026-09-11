A playable flappy bird. The bird falls all the time, one tap of the space bar gives it one flap
upwards, and the pipes scroll in from the right with their gaps in a different place every game. It
ends the moment the bird touches a pipe or the ground, and another tap starts the next one.

**Click the Screen panel before you press a key**, the same as in Move a square with the keyboard.
You can also click on the drawing itself, since the mouse counts as a flap too.

**You need to know:** everything above it on the ladder. The frame is drawn off screen and shown all
at once the way A bouncing ball does it, the keys are polled the way Move a square with the keyboard
polls them, and the pipes are a table of three byte records walked with `hl`. What is new is the
**state machine** a game is, the **sixteenths of a pixel** the bird's height is measured in, because
a bird that can only move in whole pixels cannot accelerate smoothly, and the clipping that byte
coordinates force on a pipe leaving the screen.

```z80|playground|open-screen|console|no-registers|no-flags|allow-open
P_CHAR  equ 0x10        ; a character, on the Screen and in the transcript
P_NUM   equ 0x11        ; a byte as an unsigned decimal number
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_COL   equ 0x29        ; the text cursor, in 8 by 8 cells
P_ROW   equ 0x2A
P_KEY   equ 0x31        ; 1 while the key whose code is in b is held down
P_MBTN  equ 0x42        ; the mouse buttons of the view in b
P_WAIT  equ 0x50        ; reading it waits for b hundredths of a second
P_TIME  equ 0x52        ; byte b of the hundredths since the run started

C_RECT    equ 4
C_ELLIPSE equ 6
C_CLEAR   equ 9
C_RESIZE  equ 10
C_BUF_ON  equ 11
C_PRESENT equ 13

K_ENTER equ 0x0D
K_SPACE equ 0x20
K_UP    equ 0x26
K_W     equ 0x57
M_NOW   equ 0           ; the mouse as it is right now
M_LEFT  equ 0x01

WIDTH   equ 208
HEIGHT  equ 192
TOP     equ 8           ; the sky starts under the one text row of the score
TOP16   equ 128         ; TOP * 16
GROUNDY equ 176         ; the top of the ground
GRASSB  equ 182
TUFTY   equ 174
TUFTB   equ 180
TUFTW   equ 8

BIRDX   equ 40          ; the bird only ever moves up and down
BIRDW   equ 16
BIRDH   equ 12
BIRDR   equ 88          ; BIRDX + MARGIN + BIRDW, its right edge in the world
STARTY  equ 1280        ; 80 * 16
RESTY   equ 2624        ; (GROUNDY - BIRDH) * 16, where a dead bird lands

MARGIN  equ 32          ; a pipe at 0 is this far off the left of the screen
PIPEW   equ 24
SPACING equ 80          ; between one pipe and the next
CYCLE   equ 240         ; SPACING * 3, what a recycled pipe jumps by
FIRSTX  equ 244         ; past the right edge of the screen, lip and all
SPEED   equ 2           ; pixels a frame, for everything that scrolls
LIPH    equ 6
LIPOUT  equ 3
HALFGAP equ 32
GAPMIN  equ 48          ; the highest the middle of a gap goes
GAPSPAN equ 88          ; and how far below that it can be
COUNTX  equ 48          ; BIRDX + MARGIN - PIPEW: a pipe left of this is passed

GRAV    equ 4           ; sixteenths of a pixel, per frame, per frame
FLAPV   equ -56         ; the speed one flap gives, upwards
MAXFALL equ 96
PACE    equ 4           ; hundredths of a second a frame

; the assembler reads a name without regard to case, so a PLAYING next to the
; playing label below would be one name written twice
S_READY   equ 0
S_PLAYING equ 1
S_DEAD    equ 2

; colours are 3-3-2 bytes: three bits of red, three of green and two of blue
SKY     equ 0x5B
PIPEC   equ 0x54
PIPEDK  equ 0x2C
GRASS   equ 0x79
GRASSDK equ 0x51
SAND    equ 0xDA
BODY    equ 0xF8
WINGC   equ 0xDF
BEAKC   equ 0xF0
INK     equ 0x20
WHITE   equ 0xFF

    .org 0x8000
    ld a, WIDTH
    out (P_X), a
    ld a, HEIGHT
    out (P_Y), a
    ld a, C_RESIZE
    out (P_CMD), a
    ld a, INK
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a      ; the fill of a clear becomes the text background too
    ld a, C_BUF_ON
    out (P_CMD), a      ; from here a frame is drawn off screen and shown at once

newgame:
    call reset
    ld hl, hint
    ld a, (best)
    call hud

; --- one frame ---------------------------------------------------------------
; c carries "a flap began this frame" from the input read to the state machine,
; so nothing called from here is allowed to touch it.
frame:
    call readflap
    ld c, a

    ld a, (state)
    cp S_PLAYING
    jp z, playing
    cp S_DEAD
    jp z, dead

; --- waiting to start: the bird hangs still until the first flap --------------
    ld a, c
    or a
    jp z, draw
    call seedclock
    call newpipes
    ld a, S_PLAYING
    ld (state), a
    ld a, FLAPV
    ld (birdv), a
    ld hl, scoremsg
    xor a
    call hud
    jp draw

; --- playing -----------------------------------------------------------------
playing:
    ld a, c
    or a
    jr z, fall
    ld a, FLAPV         ; one tap is one flap, however long the key is held
    ld (birdv), a
    xor a
    ld (wing), a        ; and the wing beat starts again with it
fall:
    call gravity
    call movepipes
    call hittest
    or a
    jp z, draw

    ld a, S_DEAD
    ld (state), a
    ld a, (score)
    ld hl, best
    cp (hl)
    jr c, kept
    ld (hl), a
kept:
    ld hl, overmsg
    ld a, (score)
    call hud
    jp draw

; --- dead: the bird drops to the ground, then waits for a flap ----------------
dead:
    call gravity
    ld hl, (birdy)
    ld de, RESTY
    or a
    sbc hl, de
    jr c, dfalling
    ld hl, RESTY
    ld (birdy), hl
    xor a
    ld (birdv), a
dfalling:
    ld a, c
    or a
    jp z, draw
    jp newgame

; --- the frame is painted back to front, then shown all at once ---------------
draw:
    call drawsky
    ld hl, pipes
    call drawpipe
    call drawpipe
    call drawpipe
    call drawground
    call drawbird

    ld a, C_PRESENT
    out (P_CMD), a      ; the finished frame appears here, all at once
    ld b, PACE
    ld c, P_WAIT
    in a, (c)           ; and this is what sets the frame rate
    jp frame

;------------------------------------------------------------------------------
; Input
;------------------------------------------------------------------------------
; Answers a = 1 on the frame a flap begins. Every port here reports what is held
; right now, so the "began" part is this program's: a press only counts when the
; frame before it had nothing pressed.
readflap:
    ld c, P_KEY
    ld b, K_SPACE
    in a, (c)
    or a
    jr nz, pressed
    ld b, K_UP
    in a, (c)
    or a
    jr nz, pressed
    ld b, K_W
    in a, (c)
    or a
    jr nz, pressed
    ld b, K_ENTER
    in a, (c)
    or a
    jr nz, pressed
    ld c, P_MBTN
    ld b, M_NOW
    in a, (c)
    and M_LEFT          ; bit 0 of the flags byte is the left button
    jr nz, pressed
    xor a
    ld (held), a
    ret
pressed:
    ld a, (held)
    or a
    jr nz, stillheld
    ld a, 1
    ld (held), a
    ret                 ; this frame is where the press began
stillheld:
    xor a
    ret

;------------------------------------------------------------------------------
; The world
;------------------------------------------------------------------------------
; A new game, keeping the best score of the session.
reset:
    ld a, S_READY
    ld (state), a
    xor a
    ld (birdv), a
    ld (score), a
    ld (wing), a
    ld (scroll), a
    ld hl, STARTY
    ld (birdy), hl
    call newpipes
    ret

; Three pipes, spread evenly round the world, each with a gap of its own. Only
; the one past the right edge of the screen is in play; the other two wait until
; they have come round, which is what leaves a game's first seconds empty.
newpipes:
    ld hl, pipes
    ld a, FIRSTX
    ld (tuftx), a       ; the scratch byte, for the x of the pipe being made
    ld b, 3
npnext:
    push bc
    ld a, (tuftx)
    ld (hl), a          ; where its left edge is, in the world
    inc hl
    push hl
    call randgap
    pop hl
    ld (hl), a          ; the middle of its gap
    inc hl
    ld a, (tuftx)
    cp FIRSTX
    jr c, npwaits       ; it starts behind the screen, so it waits its turn
    ld (hl), 0          ; not counted yet
    inc hl
    ld (hl), 1          ; and in play
    jr npmade
npwaits:
    ld (hl), 1          ; counted, so it cannot score while it is out of play
    inc hl
    ld (hl), 0          ; and out of play until it comes round from the right
npmade:
    inc hl
    ld a, (tuftx)
    sub SPACING
    ld (tuftx), a
    pop bc
    djnz npnext
    ret

; The clock, as the seed, so the course depends on when the player began.
seedclock:
    ld c, P_TIME
    ld b, 0
    in a, (c)           ; the low byte of the hundredths since the run started
    ld l, a
    ld b, 1
    in a, (c)
    ld h, a
    or l
    jr nz, seeded
    ld hl, 0xACE1       ; a zero seed would stop the generator dead
seeded:
    ld (seed), hl
    ret

; The middle of the next gap, in a, from a sixteen bit xorshift: one seed always
; lays out the same course. It destroys hl, de and b.
randgap:
    call nextrandom
    ld a, h             ; the high byte, which is the half worth using
    ld de, GAPSPAN
    call mul8           ; hl = a * GAPSPAN
    ld a, h             ; whose high byte is nought to GAPSPAN
    add a, GAPMIN
    ret

; hl = a * de, by the shift and add every machine without a multiply uses
mul8:
    ld b, 8
    ld hl, 0
mulnext:
    srl a               ; the low bit of what is left of the multiplier
    jr nc, mulskip
    add hl, de
mulskip:
    ex de, hl
    add hl, hl          ; de doubles for the next bit
    ex de, hl
    djnz mulnext
    ret

; The next value of a sixteen bit xorshift, in hl
nextrandom:
    ld hl, (seed)
    ld d, h
    ld e, l
    ld b, 7
shift7:
    add hl, hl
    djnz shift7         ; hl = x << 7
    ld a, h
    xor d
    ld h, a
    ld a, l
    xor e
    ld l, a             ; x = x ^ (x << 7)
    ld a, h
    srl a
    xor l
    ld l, a             ; x = x ^ (x >> 9), whose high half is all zero
    ld a, l
    xor h
    ld h, a             ; x = x ^ (x << 8), whose low half is all zero
    ld (seed), hl
    ret

; One frame of falling: the speed grows by GRAV and the bird moves by it.
gravity:
    ld a, (birdv)
    add a, GRAV
    bit 7, a
    jr nz, capped       ; still going up, so there is nothing to cap
    cp MAXFALL+1
    jr c, capped
    ld a, MAXFALL
capped:
    ld (birdv), a
    ld e, a
    add a, a
    sbc a, a
    ld d, a             ; d becomes 0xFF for a negative speed and 0 otherwise
    ld hl, (birdy)
    add hl, de
    bit 7, h
    jr nz, bumped       ; it went past the top of the screen
    ld a, h
    or a
    jr nz, insky
    ld a, l
    cp TOP16
    jr nc, insky
bumped:
    ld hl, TOP16        ; the top of the screen is a bump, not a death
    xor a
    ld (birdv), a
insky:
    ld (birdy), hl
    ret

; Everything scrolls left. A pipe that has left the world jumps a whole cycle to
; the right with a new gap, which is why three pipes are an endless course.
movepipes:
    ld a, (scroll)
    sub SPEED
    cp 16
    jr c, scrolled
    add a, 16           ; the tufts repeat every 16 pixels, so this wrap is invisible
scrolled:
    ld (scroll), a

    ld hl, pipes
    ld b, 3
mpnext:
    push bc
    push hl             ; the record it started at
    ld a, (hl)
    sub SPEED
    ld (hl), a
    jr nc, mpcount
    add a, CYCLE        ; it has left the world, so it comes round again
    ld (hl), a
    inc hl
    push hl
    call randgap
    pop hl
    ld (hl), a          ; with a gap of its own
    inc hl
    ld (hl), 0          ; counting again
    inc hl
    ld (hl), 1          ; and in play from here on
    jr mpdone
mpcount:
    cp COUNTX
    jr nc, mpdone       ; its right edge has not reached the bird yet
    inc hl
    inc hl
    ld a, (hl)          ; counted already?
    or a
    jr nz, mpdone
    ld (hl), 1
    ld hl, score
    inc (hl)
    ld a, (hl)
    ld hl, scoremsg
    call hud
mpdone:
    pop hl
    ld de, 4
    add hl, de          ; and on to the record after it
    pop bc
    djnz mpnext
    ret

; Answers a = 1 when the bird is touching a pipe or the ground.
hittest:
    call birdtop
    ld d, a             ; the top of the bird
    add a, BIRDH
    ld e, a             ; and one past its bottom
    cp GROUNDY
    jr nc, hit          ; the ground is met by the whole bird

    ld hl, pipes
    ld b, 3
htnext:
    push bc
    ld a, (hl)          ; its left edge
    inc hl
    ld c, (hl)          ; the middle of its gap
    inc hl
    inc hl
    ld b, (hl)          ; whether it is in play
    inc hl              ; and on to the record after it
    bit 0, b
    jr z, htskip        ; one out of play is not there to be touched
    cp BIRDR
    jr nc, htskip       ; this pipe is still to the right of the bird
    cp COUNTX+1
    jr c, htskip        ; and this one is already behind it
    ld a, c
    sub HALFGAP
    cp d
    jr nc, hitpop       ; the bird is above the gap
    ld a, c
    add a, HALFGAP
    cp e
    jr c, hitpop        ; or below it
htskip:
    pop bc
    djnz htnext
    xor a
    ret
hitpop:
    pop bc
hit:
    ld a, 1
    ret

; The bird's top edge in pixels, from the sixteenths it is kept in
birdtop:
    ld hl, (birdy)
    ld b, 4
btnext:
    srl h
    rr l
    djnz btnext
    ld a, l
    ret

;------------------------------------------------------------------------------
; Drawing
;------------------------------------------------------------------------------
; The pen and the fill both become the colour in a
bothcolours:
    out (P_FILL), a
    out (P_PEN), a
    ret

; A filled rectangle from (d, e) to (h, l), in the colours already set. The
; second corner is the one outside the shape, so a rectangle 8 wide ends at x+8.
rect:
    ld a, d
    out (P_X), a
    ld a, e
    out (P_Y), a
    ld a, h
    out (P_X2), a
    ld a, l
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a
    ret

; The ellipse inside that same rectangle
ellipse:
    ld a, d
    out (P_X), a
    ld a, e
    out (P_Y), a
    ld a, h
    out (P_X2), a
    ld a, l
    out (P_Y2), a
    ld a, C_ELLIPSE
    out (P_CMD), a
    ret

drawsky:
    ld a, SKY
    call bothcolours
    ld d, 0
    ld e, TOP
    ld h, WIDTH
    ld l, GROUNDY
    jp rect

; One pipe, from the record at hl, which moves on to the next one. The Screen's
; coordinates are single bytes, so a pipe half off the left edge is clipped here
; instead of being drawn at a negative x.
drawpipe:
    ld a, (hl)          ; its left edge in the world
    inc hl
    ld c, (hl)          ; the middle of its gap
    inc hl
    inc hl
    ld b, (hl)          ; whether it is in play
    inc hl              ; and on to the record after it
    push hl
    bit 0, b
    jr z, dpgone

    sub MARGIN          ; where it is on the screen, which may be off the left
    jr nc, dpwhole
    add a, PIPEW        ; its right edge, which may be off the left as well
    jr nc, dpgone
    or a
    jr z, dpgone
    ld d, 0             ; the left edge, clipped to the screen
    ld e, a
    jr dpedges
dpwhole:
    ld d, a
    add a, PIPEW
    ld e, a
dpedges:
    ld a, d
    ld (pleft), a
    ld a, e
    ld (pright), a
    ld a, c
    sub HALFGAP
    ld (ptop), a        ; the top of the gap
    add a, HALFGAP
    add a, HALFGAP
    ld (pbot), a        ; and the bottom of it

    ld a, PIPEC
    call bothcolours
    call pipeedges
    ld e, TOP
    ld a, (ptop)
    ld l, a
    call rect           ; the column down from the top of the sky
    call pipeedges
    ld a, (pbot)
    ld e, a
    ld l, GROUNDY
    call rect           ; and the column up from the ground

    ld a, PIPEDK
    call bothcolours
    call lipedges
    ld a, (ptop)
    ld l, a
    sub LIPH
    ld e, a
    call rect           ; the lip that ends at the top of the gap
    call lipedges
    ld a, (pbot)
    ld e, a
    add a, LIPH
    ld l, a
    call rect           ; and the one that starts at the bottom of it
dpgone:
    pop hl
    ret

; d and h, the two x coordinates of the column
pipeedges:
    ld a, (pleft)
    ld d, a
    ld a, (pright)
    ld h, a
    ret

; the same two, a lip's width wider on each side and clipped the same way
lipedges:
    ld a, (pleft)
    sub LIPOUT
    jr nc, lewide
    xor a
lewide:
    ld d, a
    ld a, (pright)
    add a, LIPOUT
    ld h, a
    ret

; Sand, a band of grass on top of it, and tufts that scroll with the pipes.
drawground:
    ld a, SAND
    call bothcolours
    ld d, 0
    ld e, GROUNDY
    ld h, WIDTH
    ld l, HEIGHT
    call rect
    ld a, GRASS
    call bothcolours
    ld d, 0
    ld e, GROUNDY
    ld h, WIDTH
    ld l, GRASSB
    call rect

    ld a, GRASSDK
    call bothcolours
    ld a, (scroll)
    ld (tuftx), a
    ld b, 13
dtnext:
    push bc
    ld a, (tuftx)
    ld d, a
    add a, TUFTW
    ld h, a
    ld e, TUFTY
    ld l, TUFTB
    call rect
    ld a, (tuftx)
    add a, 16
    ld (tuftx), a
    pop bc
    djnz dtnext
    ret

; The bird: a body, a wing that beats through three positions, an eye and a beak
drawbird:
    call birdtop
    ld (birdpix), a

    ld a, BODY
    call bothcolours
    ld a, (birdpix)
    ld d, BIRDX
    ld e, a
    ld h, BIRDX+BIRDW
    add a, BIRDH
    ld l, a
    call ellipse

    ld a, (state)
    cp S_DEAD
    jr z, wingset       ; a dead bird stops beating
    ld a, (wing)
    inc a
    cp 12
    jr c, wingheld
    xor a
wingheld:
    ld (wing), a
wingset:
    ld a, (wing)
    rrca
    rrca
    and 0x03            ; twelve frames, three positions
    add a, a
    add a, 3
    ld c, a             ; the wing sits this far down the body

    ld a, WINGC
    call bothcolours
    ld a, (birdpix)
    add a, c
    ld d, BIRDX+2
    ld e, a
    ld h, BIRDX+10
    add a, 5
    ld l, a
    call ellipse

    ld a, INK
    call bothcolours
    ld a, (birdpix)
    add a, 3
    ld d, BIRDX+10
    ld e, a
    ld h, BIRDX+13
    add a, 3
    ld l, a
    call ellipse

    ld a, BEAKC
    call bothcolours
    ld a, (birdpix)
    add a, 6
    ld d, BIRDX+13
    ld e, a
    ld h, BIRDX+20
    add a, 4
    ld l, a
    jp rect

; The one text row, above the sky, rewritten only when it changes: the console
; ports draw on the Screen and record in the transcript at the same time, so a
; line per point is a transcript worth reading and a line per frame is not.
; hud(message in hl, number in a)
hud:
    ld (hudnum), a
    push hl
    ld a, INK
    call bothcolours
    ld d, 0
    ld e, 0
    ld h, WIDTH
    ld l, TOP
    call rect
    ld a, WHITE
    out (P_PEN), a
    xor a
    out (P_COL), a
    out (P_ROW), a
    pop hl
    call print
    ld a, (hudnum)
    out (P_NUM), a
    ld a, 10
    out (P_CHAR), a
    ret

; The zero terminated string at hl
print:
    ld a, (hl)
    or a
    ret z
    out (P_CHAR), a
    inc hl
    jr print

;------------------------------------------------------------------------------
; State
;------------------------------------------------------------------------------
    .org 0x9000
state:   .db 0
birdv:   .db 0          ; sixteenths of a pixel a frame, and it fits in a byte
score:   .db 0
best:    .db 0
held:    .db 0          ; was a flap key or button down last frame?
wing:    .db 0
scroll:  .db 0
birdpix: .db 0          ; the bird's top edge in pixels, for one frame
hudnum:  .db 0
tuftx:   .db 0
pleft:   .db 0          ; the pipe being drawn, after its edges are clipped
pright:  .db 0
ptop:    .db 0
pbot:    .db 0
birdy:   .dw STARTY     ; sixteenths of a pixel, so gravity is smooth
seed:    .dw 0xACE1

; one pipe is its left edge in the world, the middle of its gap, whether it has
; been counted and whether it is in play at all
pipes:   .db 0, 0, 0, 0
         .db 0, 0, 0, 0
         .db 0, 0, 0, 0

hint:     .asciz "TAP SPACE, BEST "
scoremsg: .asciz "SCORE "
overmsg:  .asciz "GAME OVER, SCORE "
```

```testcase
{ "runFor": 40000 }
```

A game is always in one of three states, and `state` says which: `S_READY` while the bird hangs still
waiting for the first flap, `S_PLAYING`, and `S_DEAD` while it drops to the ground. The frame loop
reads the input once, branches on `state`, and every branch ends at `draw`, so one frame is one pass
and the three states differ only in what they do to the bird and the pipes in between.

`readflap` answers 1 only on the frame a press begins. Port `0x31` and port `0x42` both report what
is held _right now_, so a key held down for twenty frames reads as pressed twenty times, which would
be twenty flaps. `held` is the byte that turns that into one: a press counts when the frame before it
had nothing down. The answer travels in `c` from there to the state machine, which is why the comment
above `frame` says nothing called from there may touch it.

`birdy` is a sixteen bit value and it counts **sixteenths of a pixel**, which is what `add hl, de` is
for: `birdv` is one signed byte, `add a, a` and `sbc a, a` widen it into `d` by filling that register
with the sign bit, and the pair is then added to `hl` in one instruction. `birdtop` shifts the result
right four times, through `srl h` and `rr l` so the bit leaving the high byte arrives in the low one,
and what falls off the end is the fractional part the next frame keeps.

The Screen's coordinates are **single bytes**, and that decides the whole layout. The program resizes
the Screen to 208 by 192 and keeps the pipes in a world 240 wide, where `MARGIN` is how far left of
the screen a pipe at 0 sits. A pipe scrolls from 208 down to 0 and then jumps `CYCLE` to the right,
and the subtraction that wraps it is the byte arithmetic itself: 1 minus `SPEED` is 255, plus
`CYCLE` is 239, which is where it belongs.

What byte coordinates cannot express is a pipe that is half off the left edge, since its x would be
negative. `drawpipe` settles that before it draws anything: `sub MARGIN` gives the screen x and sets
the carry when it went below zero, `add a, PIPEW` then gives the right edge, and a pipe whose right
edge is still negative returns without drawing. Otherwise the left edge is clamped to 0 and `pleft`
and `pright` are what every rectangle of that pipe is built from. The right hand side needs none of
this, because the Screen clips a rectangle that runs off the edge on its own.

Three pipes make an endless course, and `CYCLE` is `SPACING * 3`, so a recycled pipe lands exactly
where a fourth pipe would have been and the spacing never drifts. A world 240 wide has nowhere to
park three pipes 80 apart off the right of a 208 wide screen, so a game starts with two of them **out
of play**: the fourth byte of a record says whether a pipe is there at all, and `newpipes` gives it
only to the one that starts past the right edge. The drawing and the hit test skip the other two
until they have come round from the right, which is what leaves the first three seconds of a game
with nothing in it but sky. Those two start marked as counted as well, so neither can take a point on
its way past the bird while it is invisible.

`randgap` has to multiply, and the Z80 has no multiply instruction. `mul8` is the shift and add every
machine without one uses: look at the low bit of the multiplier, add the multiplicand if it is set,
double the multiplicand, and do it eight times. `srl a` is what feeds it, since `rra` would rotate
the carry that `add hl, de` just left into the number.

The xorshift underneath it is sixteen bits, and two of its three shifts cost almost nothing. The low
half of `x << 8` is all zero, so `x ^ (x << 8)` only changes the high byte, and the high half of
`x >> 9` is all zero for the same reason, so only the `x << 7` needs a loop. The seed comes from the
time port on the frame the first flap happens, so the course depends on when you started playing
instead of on a number written into the program.

The one text row above the sky is the score, and `hud` writes it only when it changes: on a new game,
on the first flap, on every point and on a death. The console ports draw at the text cursor **and**
record in the transcript, so a row rewritten every frame would leave a transcript of two thousand
identical lines. The sky is painted from `TOP` down and never over that row, which is what leaves it
standing between one call and the next.

Try changing `HALFGAP equ 32` to `24` and playing again. A gap is measured from its middle in both
directions, by the drawing and by the hit test alike, so that one number is the whole of the
difficulty.
