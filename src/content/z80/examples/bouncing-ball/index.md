A ball crosses the screen and turns round at every edge, and a bar along the top grows with the time
the program has been running. It never stops on its own: press Run, watch it, and press Stop when
you have had enough.

Drawing shapes on the screen drew one picture and stopped. This one draws a new picture forty or
fifty times a second, which brings two problems with it: the reader must never see a half drawn
frame, and the ball must move at the same speed whatever the machine underneath is doing.

**You need to know:** the "Drawing shapes on the screen" Example and the "The screen, keyboard and
mouse through ports" lecture. What is new here is double buffering, command 11 sends every drawing
to an off-screen copy and command 13 shows the whole of it at once.

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

    ld b, 0             ; byte 0 of the time, the lowest eight bits
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
    jr c, keepx         ; still inside
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

The frame is four steps and they are always in this order: clear the image, draw everything on it,
show it with command 13, and wait for the next frame. Command 9 is the clear, and it wipes text and
graphics together, because they are one image. Without command 11 at the top the same four steps
would draw straight onto what you are looking at, and you would watch the screen go blue and the
ball appear, forty times a second, which is what flicker is.

`in a, (P_FRAME)` is the pacing. Reading port `0x51` suspends the program until the display's next
frame and gives back 0, so one read per pass is what makes the ball move at the same speed on a fast
machine and a slow one. It suspends the program without freezing the editor, so Stop still answers
and the Screen still repaints, and inside a testcase it returns at once so a test of an animation
does not take a minute.

Port `0x52` is the same clock read a different way: it gives one byte of the hundredths of a second
since the run started, and **`b` chooses which byte**, so `ld b, 0` asks for the lowest eight bits.
That byte is the width of the bar, and it wraps at 256 all by itself because the Screen is 256
pixels wide and a byte counts exactly that far. The M68K has to divide its clock by 640 to get the
same effect.

The ball's position and step are four bytes in memory, because the drawing already uses `a` for
every `out`, `b` and `c` for the time port and `e` to carry the bar's width across it.
`ld hl, stepx` and `add a, (hl)` is the step being read where it lies, and the three instructions
under the `jr c` negate it in place, which turns the ball round without either edge knowing which
way it was going.

`cp LIMITX` catches both edges with one unsigned comparison. A step that would take `x` past 232
fails it the obvious way, and a step that would take `x` below zero wraps the byte round past 250,
which fails it as well. `LIMITX equ 256 - SIZE` is worked out by the assembler out of the Screen
width and the ball, so neither number appears anywhere else.

Try changing `SIZE equ 24` to `SIZE equ 60`. The ball is more than twice as wide and turns round
earlier at every edge, because both limits are worked out from that one line.
