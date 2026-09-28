This square starts moving to the right. An arrow key changes its direction, and it keeps moving
after you release the key. When its next step would take it past an edge, it reappears at the
opposite edge.

Choose **Build**, then **Run**. Click inside the **Screen** once, then hold an arrow key to steer.
The ring around the Screen shows that it has keyboard focus. One click is enough while that ring
remains; if you click elsewhere, click the Screen again before steering. Choose **Stop** when you
are done. The program keeps looping until you stop it or the editor's run limit is reached.

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

* --- read the arrows and set the direction ----------------------------------
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

* --- move the square and wrap at an edge ------------------------------------
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

## Four keys in one read

Task 19 checks up to four keys at once. Before `trap #15`, `d1.l` contains `$25262728`: four
one-byte key codes packed into a long. From highest byte to lowest, they mean left (`$25`), up
(`$26`), right (`$27`) and down (`$28`). Task 19 replaces `d1.l` with four answer bytes in that
same order. A held key gets `$FF`; a key not held gets `$00`. For example, if only
left is down, the answer is `$FF000000`.

`btst #24, d1` checks a bit in the highest answer byte, the one for left. `$FF` has that bit set
and `$00` does not. The other tests use bits 16, 8 and 0 for up, right and down. The program checks
the keys in a different order—left, right, up, down—so the last held key it checks wins if several
are down together. For example, holding left and down sets the direction to down. You can use the
bit positions as a guide; there is no need to memorize them.

Each poll returns the state the program has *observed so far*. The focused Screen queues key
presses and releases, and task 19 applies at most one queued change per read, at least 30
milliseconds apart. A quick tap that reaches the Screen can therefore appear as down on one read
and up on a later read, even if both events arrived between reads. Keep polling while the program
runs. Keys pressed while the Screen lacks focus do not enter its queue.

## Direction kept between frames

`dx` and `dy` are the square's horizontal and vertical steps, measured in pixels per frame. They
start at `8` and `0`, so the square initially moves right. Pressing left writes `-8` to `dx` and
clears `dy`; pressing up writes `-8` to `dy` and clears `dx`. The other arrows do the corresponding
work. Clearing the other step keeps each new direction horizontal or vertical.

On every frame, the program adds `dx` to `boxx` and `dy` to `boxy`. A poll with no arrow down
leaves those steps in memory, so releasing an arrow does not stop the square. A later arrow changes
the stored steps. The square is drawn at its saved position before the program polls and computes
the next position, so you see a direction change in the following picture.

The Screen is 640 by 480 pixels, and the square is 40 by 40. Its top-left corner can reach X =
`640 - 40 = 600` and Y = `480 - 40 = 440` while the whole square remains visible. `RIGHT` and
`BOTTOM` hold those limits. When the proposed X exceeds 600, the code saves X = 0; when it falls
below 0, it saves X = 600. The Y code similarly uses 0 and 440. For example, from X = 596 with
`dx = 8`, the proposed X is 604, so the next saved X is 0. The four pixels past 600 are discarded.

## Try a smaller step

Change `STEP` from `8` to `4`. Before choosing **Build** and **Run** again, predict how far the
square moves between frames, whether it still keeps moving after you release an arrow, and what
happens when it crosses an edge. Click the Screen to steer, then choose **Stop** when you have seen
enough. Restore `8` afterward.

<details>
<summary>Show what to expect</summary>

Each frame changes one coordinate by 4 pixels instead of 8. Releasing a key still leaves `dx` and
`dy` unchanged. The edge limits remain 600 and 440 because the square and Screen sizes have not
changed; a proposed position beyond a limit still wraps to the opposite edge.

</details>
