Some machines put their devices at addresses and a program reaches them with `move`. This one has
none: there is no framebuffer to write into, no keyboard register to poll, no address anywhere in the
16 megabytes that is anything but memory. The screen, the keyboard and the mouse are all `trap #15`
tasks, one task per operation, and the request has the shape you already know: the task number in
`d0.b`, the arguments in `d1` and up.

## The screen

The screen is **640 by 480** pixels, which is the size a program starts with and the smallest it can
be set to. The origin is the **top left**, `x` grows right and `y` grows down, coordinates are pixels
and drawing outside the screen is quietly ignored.

Two colours are kept for you: the **pen**, which draws lines, outlines, pixels and text, and the
**fill**, which fills the insides of rectangles and ellipses. Each is one task, and the colour is a
long written `$00BBGGRR`: **blue in the high byte, then green, then red in the lowest**, which is
EASy68K's order and backwards from the `#RRGGBB` you write in CSS.

| colour | value       |     | colour | value       |
| ------ | ----------- | --- | ------ | ----------- |
| black  | `$00000000` |     | red    | `$000000FF` |
| white  | `$00FFFFFF` |     | lime   | `$0000FF00` |
| gray   | `$00808080` |     | blue   | `$00FF0000` |
| yellow | `$0000FFFF` |     | aqua   | `$00FFFF00` |

Press Run on this one and watch the Screen panel next to it.

```m68k|playground|screen|no-registers|no-flags
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
    lea label, a1
    move.l #100, d1
    move.l #360, d2
    move.b #95, d0          ; task 95: text at a pixel position
    trap #15

    move.b #9, d0
    trap #15

    org $2000
label: dc.b 'Drawn with trap #15', 0
```

A rectangle and an ellipse both take the same four numbers, the corners of a box: `d1` and `d2` are
its left and top, `d3` and `d4` its right and bottom. The ellipse is the one inscribed in that box,
so a square box draws a circle. Both **exclude their right and bottom edges**, the way the Windows
drawing calls EASy68K was built on do, which means a box whose edges meet draws nothing at all.

Try changing `move.l #480, d3` on the ellipse to `move.l #400, d3` and running again: the circle
becomes an egg, because the box stopped being square.

## The drawing tasks

| task | what it draws                                 | reads                                     |
| ---: | --------------------------------------------- | ----------------------------------------- |
|   80 | set the pen colour                            | `d1.l` = `$00BBGGRR`                      |
|   81 | set the fill colour                           | `d1.l` = `$00BBGGRR`                      |
|   82 | one pixel in the pen colour                   | `d1.w` = x, `d2.w` = y                    |
|   83 | read a pixel's colour                         | `d1.w` = x, `d2.w` = y, answers in `d0.l` |
|   84 | a line, and the drawing point ends at its end | `d1.w`, `d2.w`, `d3.w`, `d4.w`            |
|   85 | a line from the drawing point to here         | `d1.w` = x, `d2.w` = y                    |
|   86 | move the drawing point without drawing        | `d1.w` = x, `d2.w` = y                    |
|   87 | a filled rectangle, outlined with the pen     | `d1.w`, `d2.w`, `d3.w`, `d4.w`            |
|   88 | a filled ellipse in that rectangle            | `d1.w`, `d2.w`, `d3.w`, `d4.w`            |
|   89 | flood fill outwards from a pixel              | `d1.w` = x, `d2.w` = y                    |
|   90 | the outline of a rectangle, nothing inside    | `d1.w`, `d2.w`, `d3.w`, `d4.w`            |
|   91 | the outline of an ellipse, nothing inside     | `d1.w`, `d2.w`, `d3.w`, `d4.w`            |
|   92 | the drawing mode                              | `d1.b` = 2, 4, 16 or 17                   |
|   93 | the pen width in pixels                       | `d1.b`                                    |
|   94 | show the off screen image                     |                                           |
|   95 | text at a pixel position, over what is there  | `a1` = string, `d1.w` = x, `d2.w` = y     |
|   96 | where the drawing point is                    | answers `d1.w` = x, `d2.w` = y            |

Tasks 84, 85, 86 and 96 share one **drawing point**, which is where the next `85` starts from, so a
polyline is one `86` and then one `85` per corner.

Task 92 takes four modes. **4** draws normally and is what a program starts in. **2** moves the
drawing point and changes no pixel. **16** and **17** turn double buffering off and on. EASy68K's
other modes, the ones that combine the new pixel with the old one bitwise, stop the program here with
an error naming the mode.

Two more tasks belong to the screen without drawing on it. **Task 11** moves the text cursor, which
is where printed text lands, in character cells counted from the top left, and `d1.w = $FF00` clears
the whole screen, text and graphics together. **Task 33** sets or reads the screen size, with the
width in the high word of `d1.l` and the height in the low word, and `d1.l = 0` asks instead of
setting.

Text and graphics share one image here, because EASy68K had a single output window. So `trap #15`
task 14 both appends to the transcript above the screen **and** draws the string on the screen at the
text cursor, and clearing with task 11 wipes the drawing too.

## Double buffering

Drawing a moving picture straight onto the visible screen shows every half finished frame. Mode 17
sends the drawing to an off screen image instead, and task 94 shows it, so the reader only ever sees
whole frames.

This one runs until you press Stop.

```m68k|playground|screen|no-registers|no-flags
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
    neg.w step              ; turn it round at the edge
    bra frame

ballx:  dc.w 100
step:   dc.w 6
```

```testcase
{ "runFor": 200000 }
```

Task 23 is what makes it move at the same speed whatever your machine is doing: it lets two
hundredths of a second of **program time** pass, and the editor stays responsive throughout, so Stop
still answers and the screen still repaints. Take the delay out and the ball moves as fast as the
instruction budget allows and then the program stops, which is not the same thing as fast.

Try changing `move.b #17, d1` to `move.b #16, d1`, which turns double buffering off. The ball still
moves and now it flickers, because you are watching the clear and the draw happen.

## The keyboard

Two ways to read it. Typed characters come through the text tasks: task 7 says whether one is
waiting, task 5 takes one, task 2 takes a whole line. **Key state** is different: task 19 asks
whether up to four named keys are held down **right now**, which is what a game wants.

Task 19 takes four key codes packed into `d1.l`, one per byte, and answers in `d1.l` with one
`$FF` or `$00` byte per key, in the same order. So the highest byte of the answer belongs to the
highest byte of the question.

The key codes are EASy68K's, and most of them you can work out:

- A letter is the ASCII code of its **capital**, so `A` is `$41` and `Z` is `$5A`, whether or not
  Shift is held.
- A digit on the top row is its ASCII code, `0` is `$30` and `9` is `$39`.
- The function keys run from F1 at `$70`.
- The arrows are left `$25`, up `$26`, right `$27`, down `$28`.

The rest, and there are thirty of them, are on the
[trap tasks documentation page](/documentation/m68k/traps).

**Click the Screen panel before you press a key**: the screen only gets the keyboard when it has the
focus, and a ring around it says so while it does.

```m68k|playground|screen|no-registers|no-flags
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

    move.b #14, d0
    lea title, a1
    trap #15                ; the title, at the text cursor

    move.l #LIME, d1
    move.b #81, d0
    trap #15
    move.l #WHITE, d1
    move.b #80, d0
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

`btst #24, d1` tests bit 24, which is the lowest bit of the highest byte, and a byte of `$FF` has
that bit set while a byte of `$00` does not. A key held down is reported at least once however
briefly it was tapped, so a loop that polls every two hundredths of a second never misses one.

## The mouse

Task 61 reads it, and `d1.b` says which reading you want: **0** for where the pointer is and which
buttons are down **now**, **1** for the last button release, **2** for the last button press. The
answer comes back in two registers:

- **`d0.b`** is the buttons and modifiers, one bit each, from bit 6 down: Ctrl, Alt, Shift, Double,
  Middle, Right, Left. So bit 0 is the left button and bit 4 is Shift.
- **`d1.l`** is the position, **y in the high word and x in the low word**, in screen pixels whatever
  the panel's zoom is.

The last press and the last release stay until the next one, so a program that polls slowly still
sees every click.

```m68k|playground|screen|no-registers|no-flags
BRUSH   equ 6
AQUA    equ $00FFFF00
RED     equ $000000FF

    move.b #14, d0
    lea title, a1
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
    move.b #14, d0
    lea title, a1
    trap #15
    bra wait

title:  dc.b 'Drag to paint, hold Shift for red, right button clears', 0
```

```testcase
{ "runFor": 200000 }
```

`lsr.l #8, d2` twice is how the y is brought down sixteen places, since a constant shift count is
limited to 8. `swap d2` and a mask would do the same in two instructions.

## How much you can draw

Every `trap #15` costs the simulator one instruction out of the two million a Playground is given,
whatever the task does. So a drawing loop is counted in traps: a filled rectangle is one of them, and
the same rectangle drawn with task 82 is one per pixel. Use the shape tasks, keep the work of a frame
to a few dozen traps, and let task 23 set the pace.

## Your turn

Fill a red rectangle over the box from (10, 10) to (100, 100), then read the colour of the pixel at
(50, 50) back with task 83 and leave it in `d0`. Red is `$000000FF`, so `d0` comes out at 255.

```m68k|playground|screen|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "d0": 255 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|screen|solution
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

The second one asks the screen how big it is with task 33 and takes the packed answer apart: the
width in `d1` and the height in `d2`, each on its own. A program that has not resized the screen gets
640 and 480.

```m68k|playground|screen|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "d1": 640, "d2": 480 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|screen|solution
    move.b #33, d0
    move.l #0, d1       ; 0 asks instead of setting
    trap #15            ; d1 = width in the high word, height in the low
    move.l d1, d2
    andi.l #$FFFF, d2   ; the height
    swap d1
    andi.l #$FFFF, d1   ; the width
```

</details>
