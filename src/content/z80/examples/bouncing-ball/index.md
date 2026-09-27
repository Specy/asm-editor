A ball moves across the Screen and turns at each edge. A bar along the top grows as time passes,
then starts again when its one-byte time value wraps to zero. Choose **Build**, then **Run** to
watch the animation in the Screen panel. Press **Stop** when you are done; the program keeps running
until you stop it.

Drawing shapes on the screen made one picture. This program repeats four steps for each new
picture, or **frame**:

1. Clear the off-screen image.
2. Draw the ball and the time bar on it.
3. Present the finished image all at once.
4. Wait for the next display frame before moving the ball and starting again.

Command 11 turns on **double buffering**, so drawing goes to an off-screen image. Command 13
presents that image. The viewer sees complete pictures instead of the clear and the partly drawn
ball.

```z80|playground|open-screen|no-registers|no-flags|allow-open
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_FRAME equ 0x51        ; reading it waits for the next animation frame
P_TIME  equ 0x52        ; one byte of the hundredths since the run started

C_RECT    equ 4
C_ELLIPSE equ 6
C_CLEAR   equ 9
C_BUF_ON  equ 11
C_PRESENT equ 13

SIZE    equ 24
LIMITX  equ 256 - SIZE
LIMITY  equ 192 - SIZE
SKY     equ 0x03
BALL    equ 0xFC
BAR     equ 0x92
WHITE   equ 0xFF

    .org 0x8000
    ld a, C_BUF_ON
    out (P_CMD), a      ; every drawing goes to an off-screen copy from here on

frame:
    ld a, SKY
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a      ; wipe the off-screen image, not the one you can see

    ld a, BALL
    out (P_FILL), a
    ld a, WHITE
    out (P_PEN), a      ; a white rim on the ball
    ld a, (ballx)
    out (P_X), a
    add a, SIZE
    out (P_X2), a
    ld a, (bally)
    out (P_Y), a
    add a, SIZE
    out (P_Y2), a
    ld a, C_ELLIPSE
    out (P_CMD), a      ; the ellipse that fits in that box, which is a circle

    ld b, 0             ; select the lowest byte of the time value
    ld c, P_TIME
    in a, (c)           ; hundredths of a second since the run started
    ld e, a             ; the bar's right hand end
    ld a, BAR
    out (P_FILL), a
    out (P_PEN), a
    xor a
    out (P_X), a
    out (P_Y), a        ; from the top left corner
    ld a, e
    out (P_X2), a
    ld a, 6
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a      ; a bar as wide as the program has been running

    ld a, C_PRESENT
    out (P_CMD), a      ; the whole frame becomes visible here, at once
    in a, (P_FRAME)     ; and the program waits for the next one

    ld hl, stepx
    ld a, (ballx)
    add a, (hl)         ; x = x + dx
    cp LIMITX
    jr c, keepx         ; proposed x is below LIMITX
    ld a, (hl)
    neg
    ld (hl), a          ; dx = -dx, turning it round at the edge
    ld a, (ballx)       ; and stay where we were this frame
keepx:
    ld (ballx), a

    ld hl, stepy
    ld a, (bally)
    add a, (hl)         ; y = y + dy
    cp LIMITY
    jr c, keepy
    ld a, (hl)
    neg
    ld (hl), a
    ld a, (bally)
keepy:
    ld (bally), a
    jp frame

    .org 0x9000
ballx:  .db 100
bally:  .db 60
stepx:  .db 3
stepy:  .db 2
```

```testcase
{ "runFor": 60000 }
```

Command 9 clears the off-screen image to `SKY`. It clears text and graphics together because they
share one image. The ball's X and Y coordinates are its upper-left corner. Both dimensions of its
bounding box use `SIZE`, so command 6 draws a circular ellipse. The rectangle command adds the
bar, and command 13 presents the completed frame.

`in a, (P_FRAME)` paces the loop. Reading port `0x51` waits for the next display frame and returns
0. One read per pass prevents a fast machine from racing through the animation. The editor stays
responsive while the program waits, so Stop still works. In a testcase the read returns at once,
letting an animation test finish without waiting for real time.

Port `0x52` gives the elapsed time in hundredths of a second. This read uses the Z80's `in a, (c)`
form: `c` holds the port number `0x52`, while `b`, the high byte of the port address, selects which
byte of the clock to read. `ld b, 0` selects the lowest byte. The code uses that byte as the bar's
right edge, starting at X = 0. Its value rises from 0 to 255, then wraps to 0 and the bar begins
growing again. No separate reset is needed.

The ball's X and Y positions and their steps are four bytes in memory. Each pass proposes a new
position by adding its step. `stepx` begins at `3`; after `neg`, it holds 253 (`0xFD`), the
two's-complement byte pattern for `-3`.
`ld hl, stepx` lets `add a, (hl)` read that step directly from memory. The Y code does the same with
`stepy`.

`LIMITX` is `256 - SIZE`, or 232. After `cp LIMITX`, `jr c, keepx` runs when the proposed X is
**unsigned less than 232**: the comparison needed a borrow, so the carry flag is set. If X is 231
and the step is `+3`, the proposal is 234. It is too far right, so the branch is skipped. The code
negates the step and keeps the old X for this frame.

The same test catches the left edge. If X is 1 and the step is `-3`, the byte addition is
`1 + 253 = 254`: the proposed position has wrapped around from below zero. As an unsigned byte,
254 is also above the limit, so the code
negates the step back to `+3` and leaves X at 1. The Y test works in the same way with `LIMITY`,
which is `192 - SIZE`, or 168. Keeping each proposed coordinate below its limit also lets the
second corner, position plus `SIZE`, fit in one byte.

Try changing `stepx: .db 3` to `.db 5`, then Build and Run again. The ball should travel farther
across the Screen on each frame, while the bar still follows elapsed time.
