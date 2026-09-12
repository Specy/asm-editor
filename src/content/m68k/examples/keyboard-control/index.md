A square you steer. The arrow keys set which way it is going and it keeps going that way on its own,
coming back in at the opposite edge when it leaves the screen. **Click the Screen panel first**: the
screen only gets the keyboard when it has the focus, and a ring around it says so while it does.

A bouncing ball drew a picture that changed on its own. This one asks the keyboard, once per frame,
what is being held down right now, and the answer changes what the next frame will look like.

**You need to know:** the "A bouncing ball" Example and the "The screen, keyboard and mouse through
traps" lecture. What is new here is task 19, which takes four key codes packed into `d1.l` and
answers with four bytes saying which of them are down at this instant.

```m68k|playground|open-screen|no-registers|no-flags|allow-open
CELL    equ 40
STEP    equ 8
RIGHT   equ 640-40
BOTTOM  equ 480-40
BOX     equ $0060C000
WHITE   equ $00FFFFFF

    move.b #92, d0
    move.b #17, d1
    trap #15                ; task 92 mode 17: draw off screen
    move.l #WHITE, d1
    move.b #80, d0
    trap #15                ; the pen, for the outline and the title
    move.l #BOX, d1
    move.b #81, d0
    trap #15                ; the fill, for the square

frame:
    move.b #11, d0
    move.w #$FF00, d1
    trap #15                ; clear the off screen image

    lea title, a1
    move.l #16, d1
    move.l #16, d2
    move.b #95, d0          ; task 95: the title, drawn at a pixel position
    trap #15

    move.w boxx, d1
    move.w boxy, d2
    move.w d1, d3
    add.w #CELL, d3
    move.w d2, d4
    add.w #CELL, d4
    move.b #87, d0
    trap #15                ; the square

    move.b #94, d0
    trap #15                ; show the frame
    move.b #23, d0
    move.l #3, d1
    trap #15                ; three hundredths of a second

* --- the arrows set the direction, they do not move the square ---------------
    move.b #19, d0
    move.l #$25262728, d1   ; left $25, up $26, right $27, down $28
    trap #15
    btst #24, d1            ; the left arrow, the highest byte of the answer
    beq no_left
    move.w #-STEP, dx
    clr.w dy
no_left:
    btst #8, d1             ; the right arrow
    beq no_right
    move.w #STEP, dx
    clr.w dy
no_right:
    btst #16, d1            ; the up arrow
    beq no_up
    move.w #-STEP, dy
    clr.w dx
no_up:
    btst #0, d1             ; the down arrow
    beq no_down
    move.w #STEP, dy
    clr.w dx
no_down:

* --- and the square moves on its own, coming back in at the far edge ---------
    move.w boxx, d5
    add.w dx, d5
    cmp.w #RIGHT, d5
    ble x_low
    clr.w d5                ; off the right edge, back at the left
x_low:
    tst.w d5
    bge x_done
    move.w #RIGHT, d5       ; off the left edge, back at the right
x_done:
    move.w d5, boxx

    move.w boxy, d5
    add.w dy, d5
    cmp.w #BOTTOM, d5
    ble y_low
    clr.w d5
y_low:
    tst.w d5
    bge y_done
    move.w #BOTTOM, d5
y_done:
    move.w d5, boxy
    bra frame

boxx:   dc.w 300
boxy:   dc.w 220
dx:     dc.w STEP
dy:     dc.w 0
title:  dc.b 'Click the screen, then steer with the arrow keys', 0
```

```testcase
{ "runFor": 100000 }
```

`move.l #$25262728, d1` is four key codes in one long, `$25` for the left arrow, `$26` up, `$27`
right and `$28` down, and the answer comes back in `d1` with one byte per key in the same places:
`$FF` where the key is held and `$00` where it is not. `btst #24, d1` tests the lowest bit of the
highest byte, which is the byte that belongs to `$25`, and a `$FF` has that bit set. The four bit
numbers to test are 24, 16, 8 and 0, one per byte, in the order you packed the codes.

The keys do not move the square, they write `dx` and `dy` in memory, and the code under them moves
it. That separation is what makes the square keep going after you let go, and it is how anything that
moves in a game is written: the input decides the velocity, the frame applies it.

`clr.w dy` next to `move.w #-STEP, dx` is what keeps the movement to four directions. Take the four
`clr.w` lines out and holding right and then up leaves both steps set, and the square goes
diagonally.

Polling every frame is enough for keys held down: task 19 reports a key that was pressed and let go
between two polls, so a tap is not missed. What it does not tell you is that a key was pressed
**again**, which is why a game that wants one action per press keeps the last answer and compares.

Try changing the `clr.w d5` under `cmp.w #RIGHT, d5` to `move.w #RIGHT, d5`. The square stops against
the right edge instead of coming back in at the left, which is the same two instructions doing
clamping instead of wrapping.
