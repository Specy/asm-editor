# The screen, keyboard and mouse through traps

The screen and input devices do not have addresses in this simulator's memory. A program reaches
them through `trap #15`: put a task number in `d0.b`, put that task's arguments in its specified
registers, then run `trap #15`. Some tasks return an answer in a register.

## The screen

The screen starts at **640 by 480** pixels. Its origin is the **top left**: `x` grows right and `y`
grows down. Individual pixels have `x = 0..639` and `y = 0..479`. Drawing outside the screen is
clipped without an error. A rectangle's _exclusive_ right and bottom boundaries may be `640` and
`480`, even though those are not pixel positions.

Two colours are kept for you: the **pen**, which draws lines, outlines, pixels and text, and the
**fill**, which fills the insides of rectangles and ellipses. A colour is a long written
`$00BBGGRR`: the highest byte is unused `$00`, followed by the blue byte, the green byte and the
red byte. Readers who know CSS may notice that this puts the colour bytes in the opposite order
from CSS's `#RRGGBB`.

| colour | value       |     | colour | value       |
| ------ | ----------- | --- | ------ | ----------- |
| black  | `$00000000` |     | red    | `$000000FF` |
| white  | `$00FFFFFF` |     | lime   | `$0000FF00` |
| gray   | `$00808080` |     | blue   | `$00FF0000` |
| yellow | `$0000FFFF` |     | aqua   | `$00FFFF00` |

Here are the drawing requests the first program uses. Each reads its arguments when `trap #15`
runs; setting a colour or pen width changes later drawing, while drawing tasks change the screen.

| task in `d0.b` | inputs                                                               | effect                                             |
| -------------: | -------------------------------------------------------------------- | -------------------------------------------------- |
|             80 | `d1.l` = `$00BBGGRR`                                                 | set the pen colour                                 |
|             81 | `d1.l` = `$00BBGGRR`                                                 | set the fill colour                                |
|             87 | `d1.w` = left x, `d2.w` = top y, `d3.w` = right x, `d4.w` = bottom y | filled rectangle with a pen outline                |
|             88 | the same four boundaries                                             | filled ellipse with a pen outline, inside that box |
|             93 | `d1.b` = width in pixels                                             | set the width of lines and outlines                |
|             84 | `d1.w` = start x, `d2.w` = start y, `d3.w` = end x, `d4.w` = end y   | pen-colour line; its end becomes the drawing point |
|             95 | `a1` = zero-terminated string address, `d1.w` = x, `d2.w` = y        | pen-colour text with its top left at that pixel    |

Tasks 87 and 88 exclude their right and bottom boundaries. A box from `(100, 80)` to `(300, 200)`
can affect columns `100..299` and rows `80..199`. If left equals right, it has zero width and
draws nothing. A square box makes an ellipse into a circle.

Press Run and watch the Screen panel. You should see a blue rectangle, a yellow ellipse, a thick
red line and a white label.

```m68k|playground|open-screen|no-registers|no-flags
WHITE   equ $00FFFFFF
RED     equ $000000FF
BLUE    equ $00FF0000
YELLOW  equ $0000FFFF

    move.l #BLUE, d1
    move.b #81, d0          ; task 81: the fill colour
    trap #15
    move.l #WHITE, d1
    move.b #80, d0          ; task 80: the pen colour
    trap #15

    move.l #100, d1         ; left
    move.l #80, d2          ; top
    move.l #300, d3         ; right
    move.l #200, d4         ; bottom
    move.b #87, d0          ; task 87: a filled rectangle
    trap #15

    move.l #YELLOW, d1
    move.b #81, d0
    trap #15
    move.l #360, d1
    move.l #80, d2
    move.l #480, d3
    move.l #200, d4
    move.b #88, d0          ; task 88: the ellipse inside that rectangle
    trap #15

    move.l #RED, d1
    move.b #80, d0
    trap #15
    move.b #5, d1
    move.b #93, d0          ; task 93: the pen width
    trap #15
    move.l #100, d1
    move.l #260, d2
    move.l #480, d3
    move.l #320, d4
    move.b #84, d0          ; task 84: a line
    trap #15

    move.l #WHITE, d1
    move.b #80, d0
    trap #15
    move.l #label, a1
    move.l #100, d1
    move.l #360, d2
    move.b #95, d0          ; task 95: text at a pixel position
    trap #15

    move.b #9, d0
    trap #15

    org $2000
label: dc.b 'Drawn with trap #15', 0
```

Try changing the ellipse's right boundary from `480` to `360`. Its box then has zero width, so
the yellow shape disappears.

## Double buffering

Drawing a moving picture straight onto the visible screen can reveal a half-finished frame. Task
**92** reads a mode from `d1.b`: mode `17` turns on double buffering, sending drawing to an
off-screen image; mode `16` turns it off. Task **94** takes no arguments and copies that image to
the visible screen. Its `d0.b` selector is the only register you need to set.

Each frame must erase the previous ball. Task **11** reads `d1.w = $FF00` to clear graphics and
text and put the text cursor at the top left. The same task can position the cursor for printed
text: put the column in the high byte of `d1.w` and the row in its low byte, both counted in
character cells from the top left. With `d1.w = $00FF`, it instead returns that packed cursor
position in `d1.w`. Task **23** reads `d1.l` as a delay in hundredths of a second of program time;
it lets the editor respond to Stop and repaint during the wait.

Run the animation: a yellow 48-pixel circle starts at `(100, 200)` and travels horizontally,
reversing before its next step would put its box beyond the screen. Each displayed frame is complete.
The editor gives each Run a finite instruction limit, so it eventually stops by itself; Stop can end
it sooner.

```m68k|playground|open-screen|no-registers|no-flags
SIZE    equ 48
LIMITX  equ 640-48
YELLOW  equ $0000FFFF
WHITE   equ $00FFFFFF

    move.b #92, d0
    move.b #17, d1
    trap #15                ; drawing mode 17: draw off screen
    move.l #WHITE, d1
    move.b #80, d0
    trap #15

frame:
    move.b #11, d0
    move.w #$FF00, d1
    trap #15                ; clear the off screen image

    move.l #YELLOW, d1
    move.b #81, d0
    trap #15

    move.w ballx, d1        ; the ball's box
    move.w #200, d2
    move.w d1, d3
    add.w #SIZE, d3
    move.w d2, d4
    add.w #SIZE, d4
    move.b #88, d0
    trap #15                ; the ball

    move.b #94, d0
    trap #15                ; the frame becomes visible here, all at once

    move.b #23, d0
    move.l #2, d1
    trap #15                ; two hundredths of a second of program time

    move.w ballx, d5
    add.w step, d5          ; move it
    cmp.w #0, d5
    blt flip
    cmp.w #LIMITX, d5
    bgt flip
    move.w d5, ballx
    bra frame
flip:
    neg.w step              ; reverse before the next step would cross an edge
    bra frame

ballx:  dc.w 100
step:   dc.w 6
```

```testcase
{ "runFor": 200000 }
```

Task 23 sets the frame pace here to two hundredths of a second of program time. The ball moves in
six-pixel steps: at the left it can turn at `x = 4`, because the following step would cross `0`.
`step` holds a signed word. `neg.w step` reverses its sign, from `6` to `-6` or back, so the next
addition moves the ball in the opposite direction.

Try changing `move.b #17, d1` to `move.b #16, d1`. With buffering off, the clear and redraw may
become visible as flicker.

## The keyboard

For movement, task **19** reads up to four named keys. Put their key codes in `d1.l`, one per
byte, then put `19` in `d0.b` and call `trap #15`. It returns four bytes in `d1.l`: `$FF` for an
observed down key and `$00` otherwise, in the same order. The highest answer byte belongs to the
highest request byte.

The keyboard queues presses and releases that reach the focused Screen panel. Each task 19 read
applies **at most one** queued change; after applying one, it waits at least 30 milliseconds before
applying the next. Its answer is therefore the key state the program has observed so far, which may
lag behind the physical key. A quick press and release of a repeatedly polled key is seen as down
on one read before its release is applied on a later read. A press that never reaches the Screen
panel—for example, because it lacks focus—cannot be reported. The program must keep polling the
same key while it runs.

The arrows used below have codes left `$25`, up `$26`, right `$27`, down `$28`. Packing them in
that order gives the request `$25262728`; the returned high byte answers for left, and the low
byte answers for down.

**Click the Screen panel before you press a key**: the screen only gets the keyboard when it has the
focus, and a ring around it says so while it does.

The next program uses task 95 for its label. It draws directly on the screen at `(8, 8)` each time
the frame is cleared, without adding another line to the transcript. Run it and hold an arrow key:
a lime 40-pixel square begins at `(300, 220)` and moves eight pixels per frame, staying inside the
screen. The editor's finite instruction limit will end the run unless you press Stop first.

```m68k|playground|open-screen|no-registers|no-flags
SIZE    equ 40
STEP    equ 8
LIMITX  equ 640-40
LIMITY  equ 480-40
LIME    equ $0000FF00
WHITE   equ $00FFFFFF

    move.b #92, d0
    move.b #17, d1
    trap #15                ; draw off screen, so the square never flickers

frame:
    move.b #11, d0
    move.w #$FF00, d1
    trap #15                ; clear, which also puts the text cursor home

    move.l #WHITE, d1
    move.b #80, d0
    trap #15
    move.l #title, a1
    move.w #8, d1
    move.w #8, d2
    move.b #95, d0
    trap #15                ; the title at (8, 8), on this frame only

    move.l #LIME, d1
    move.b #81, d0
    trap #15
    move.w boxx, d1
    move.w boxy, d2
    move.w d1, d3
    add.w #SIZE, d3
    move.w d2, d4
    add.w #SIZE, d4
    move.b #87, d0
    trap #15                ; the square

    move.b #94, d0
    trap #15                ; show the frame

    move.b #23, d0
    move.l #2, d1
    trap #15

    move.b #19, d0
    move.l #$25262728, d1   ; left $25, up $26, right $27, down $28
    trap #15

    btst #24, d1            ; the left arrow, the highest byte of the answer
    beq noleft
    sub.w #STEP, boxx
noleft:
    btst #8, d1             ; the right arrow
    beq noright
    add.w #STEP, boxx
noright:
    btst #16, d1            ; the up arrow
    beq noup
    sub.w #STEP, boxy
noup:
    btst #0, d1             ; the down arrow
    beq nodown
    add.w #STEP, boxy
nodown:

    move.w boxx, d5         ; keep the square on the screen
    cmp.w #0, d5
    bge xlow
    move.w #0, boxx
xlow:
    cmp.w #LIMITX, d5
    ble xhigh
    move.w #LIMITX, boxx
xhigh:
    move.w boxy, d5
    cmp.w #0, d5
    bge ylow
    move.w #0, boxy
ylow:
    cmp.w #LIMITY, d5
    ble yhigh
    move.w #LIMITY, boxy
yhigh:
    bra frame

boxx:   dc.w 300
boxy:   dc.w 220
title:  dc.b 'Click the screen, then hold the arrow keys', 0
```

```testcase
{ "runFor": 200000 }
```

`btst #24, d1` tests the lowest bit of the highest answer byte. That bit is set in `$FF` and clear
in `$00`. The other `btst` instructions test the corresponding bits in the other three bytes.

## The mouse

Task **61** reads the mouse. Put `61` in `d0.b` and choose a view in `d1.b`: **0** for the current
pointer position and buttons, **1** for the latest button-release snapshot, or **2** for the latest
button-press snapshot. It returns:

- **`d0.b`** is the buttons and modifiers, one bit each: bit 6 Ctrl, 5 Alt, 4 Shift, 3 Double,
  2 Middle, 1 Right, 0 Left. Double is set only in a press snapshot.
- **`d1.l`** is the position, **y in the high word and x in the low word**, in screen pixels whatever
  the panel's zoom is.

The two event snapshots stay until the next event of the same kind. If two presses happen before
you read mode 2, only the latest press remains; the same is true of releases in mode 1. Mode 0 is
the current state and can miss a complete click between polls. This program uses mode 0 to paint
while the left button is held, so a very fast click or pointer movement between polls may leave no
mark at some positions.

Task **14**, already used for printed strings, reads the zero-terminated address in `a1`. On this
screen it puts text both at the text cursor and in the transcript. The mouse program uses it once
for its starting title. Run it and drag with the left button: aqua discs follow the pointer. Hold
Shift while dragging for red; hold the right button to clear the image, including the title. The
editor's finite instruction limit ends the run eventually, and Stop can end it sooner.

```m68k|playground|open-screen|no-registers|no-flags
BRUSH   equ 6
AQUA    equ $00FFFF00
RED     equ $000000FF

    move.b #14, d0
    move.l #title, a1
    trap #15

frame:
    move.b #61, d0
    move.b #0, d1
    trap #15                ; the mouse right now

    move.l d1, d5           ; d5 = y in the high word, x in the low
    move.l d0, d6           ; d6 = the buttons

    btst #1, d6             ; the right button clears the screen
    bne wipe
    btst #0, d6             ; the left button paints
    beq wait

    move.l #AQUA, d1
    btst #4, d6             ; Shift held
    beq hascolor
    move.l #RED, d1
hascolor:
    move.b #81, d0
    trap #15                ; the same fill and pen colour, so the disc has no rim
    move.b #80, d0
    trap #15

    move.l d5, d1
    and.l #$FFFF, d1        ; x
    move.l d5, d2
    lsr.l #8, d2
    lsr.l #8, d2            ; y, sixteen places down in two shifts of eight
    move.w d1, d3
    add.w #BRUSH, d3
    move.w d2, d4
    add.w #BRUSH, d4
    sub.w #BRUSH, d1
    sub.w #BRUSH, d2
    move.b #88, d0
    trap #15                ; a filled disc centred on the pointer

wait:
    move.b #23, d0
    move.l #1, d1
    trap #15
    bra frame

wipe:
    move.b #11, d0
    move.w #$FF00, d1
    trap #15
    bra wait

title:  dc.b 'Drag to paint, hold Shift for red, right button clears', 0
```

```testcase
{ "runFor": 200000 }
```

`lsr.l #8, d2` twice brings y down sixteen places, since a constant shift count is limited to 8.

## How much you can draw

Each Playground run has a two-million-instruction limit. Drawing tasks do different amounts of
work, but each `trap #15` call spends one instruction from that limit. Use a shape task for a shape,
and task 23 to pace repeated frames.

## Your turn

Task **83** reads one pixel: put its x coordinate in `d1.w` and y coordinate in `d2.w`, select
`83` in `d0.b`, and call `trap #15`. It returns the pixel colour in `d0.l` as `$00BBGGRR`. If
double buffering is on, it reads the off-screen image being drawn.

Fill a red rectangle over the box from `(10, 10)` to `(100, 100)`, then read the pixel at
`(50, 50)` and leave its colour in `d0.l`. You should see the red rectangle; the register check
expects 255 because red is `$000000FF`.

```m68k|playground|open-screen|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "d0": 255 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|open-screen|solution
RED equ $000000FF

    move.l #RED, d1
    move.b #81, d0      ; task 81: the fill colour
    trap #15
    move.l #RED, d1
    move.b #80, d0      ; task 80: the pen, so the outline is red too
    trap #15

    move.l #10, d1
    move.l #10, d2
    move.l #100, d3
    move.l #100, d4
    move.b #87, d0      ; task 87: the filled rectangle
    trap #15

    move.l #50, d1
    move.l #50, d2
    move.b #83, d0      ; task 83: read that pixel back into d0.l
    trap #15
```

</details>

Now draw a blue rectangle whose bottom-right boundary is `(640, 480)`, starting at `(630, 470)`.
Set both pen and fill to blue (`$00FF0000`). Read the last pixel, `(639, 479)`, with task 83 and
leave its colour in `d0.l`. The rectangle should appear in the bottom-right corner, and the colour
check expects `$00FF0000`. This uses the boundary values without treating `(640, 480)` as a pixel.

```m68k|playground|open-screen|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "d0": 16711680 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|open-screen|solution
BLUE equ $00FF0000

    move.l #BLUE, d1
    move.b #80, d0      ; blue pen
    trap #15
    move.l #BLUE, d1
    move.b #81, d0      ; blue fill
    trap #15

    move.w #630, d1
    move.w #470, d2
    move.w #640, d3
    move.w #480, d4
    move.b #87, d0
    trap #15

    move.w #639, d1
    move.w #479, d2
    move.b #83, d0
    trap #15
```

</details>
