The console ports exchanged one byte at a time with the world outside the CPU. The Screen, keyboard
and mouse work the same way. A program writes colours, coordinates and drawing commands to ports,
and reads live input from other ports.

The default Screen is 256 pixels wide and 192 pixels high. Its top-left pixel is `(0, 0)`: `x`
increases to the right and `y` increases downwards.

## Draw with a command

Drawing takes two steps. First write the settings for a shape. Then write a command number to port
`0x27`; the command uses the settings currently held by the Screen.

|           port | setting                                     |
| -------------: | ------------------------------------------- |
|         `0x20` | pen colour for lines and outlines           |
|         `0x21` | fill colour for shapes and clear            |
|         `0x22` | pen width in pixels                         |
| `0x23`, `0x24` | first point: X and Y                        |
| `0x25`, `0x26` | second point: X2 and Y2                     |
|         `0x27` | command: writing here performs the drawing  |
| `0x29`, `0x2A` | text cursor column and row, in 8 by 8 cells |

| command | operation                                          |
| ------: | -------------------------------------------------- |
|       1 | line from (X, Y) to (X2, Y2)                       |
|       4 | filled, outlined rectangle from (X, Y) to (X2, Y2) |
|       6 | filled, outlined ellipse inside that rectangle     |
|       9 | clear the whole Screen with the fill colour        |

The right and bottom coordinates of a rectangle are **excluded**. A rectangle from `(20, 20)` to
`(101, 81)` covers columns 20 through 100 and rows 20 through 80. Lines include both end points.

## Build a colour byte

A colour is one byte in **3-3-2** form:

```text
bits:  7 6 5 | 4 3 2 | 1 0
       red   | green | blue
```

Red and green are each from 0 to 7; blue is from 0 to 3. For orange, choose red 7, green 4 and blue 0. Red 7 fills the top three bits, giving `11100000` (`0xE0`). Green 4 gives `00010000`
(`0x10`) in the green field, and blue contributes zero. The byte is therefore
`0xE0 + 0x10 = 0xF0`.

Useful values include black `0x00`, blue `0x03`, green `0x1C`, cyan `0x1F`, red `0xE0`, orange
`0xF0`, yellow `0xFC` and white `0xFF`.

```z80|playground|open-screen|no-registers|no-flags
P_PEN   equ 0x20
P_FILL  equ 0x21
P_WIDTH equ 0x22
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_COL   equ 0x29
P_ROW   equ 0x2A

C_LINE  equ 1
C_RECT  equ 4
C_ELL   equ 6
C_CLEAR equ 9

BLUE   equ 0x03
RED    equ 0xE0
YELLOW equ 0xFC
WHITE  equ 0xFF

    .org 0x8000
    ld a, BLUE
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a

    ld a, RED
    out (P_FILL), a
    ld a, WHITE
    out (P_PEN), a
    ld a, 20
    out (P_X), a
    out (P_Y), a
    ld a, 101
    out (P_X2), a
    ld a, 81
    out (P_Y2), a       ; exclusive corner
    ld a, C_RECT
    out (P_CMD), a

    ld a, YELLOW
    out (P_FILL), a
    ld a, 140
    out (P_X), a
    ld a, 20
    out (P_Y), a
    ld a, 221
    out (P_X2), a
    ld a, 101
    out (P_Y2), a
    ld a, C_ELL
    out (P_CMD), a

    ld a, 3
    out (P_WIDTH), a
    ld a, RED
    out (P_PEN), a
    ld a, 20
    out (P_X), a
    ld a, 140
    out (P_Y), a
    ld a, 235
    out (P_X2), a
    ld a, 170
    out (P_Y2), a
    ld a, C_LINE
    out (P_CMD), a

    ld a, 4
    out (P_COL), a
    ld a, 14
    out (P_ROW), a
    ld hl, label
print:
    ld a, (hl)
    or a
    jr z, done
    out (0x10), a       ; console text also appears on the Screen
    inc hl
    jr print
done:
    halt

    .org 0x9000
label: .asciz "PORTS DRAW THIS"
```

Text and graphics share the image. The default Screen has 32 by 24 text cells. Clear command 9
removes both text and graphics.

## Present a complete frame

If animation draws directly on the visible Screen, the viewer can see the clear and partial redraw.
Command 11 turns on **double buffering**, sending drawing to an off-screen image. Command 13 presents
that completed image. Reading port `0x51` waits for the next animation frame.

```z80|playground|open-screen|no-registers|no-flags
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_FRAME equ 0x51

C_ELL     equ 6
C_CLEAR   equ 9
C_BUF_ON  equ 11
C_PRESENT equ 13

BLUE   equ 0x03
YELLOW equ 0xFC
WHITE  equ 0xFF
SIZE   equ 16
LIMITX equ 256 - SIZE
LIMITY equ 192 - SIZE

    .org 0x8000
    ld a, C_BUF_ON
    out (P_CMD), a
    ld a, WHITE
    out (P_PEN), a
    ld d, 40            ; x
    ld e, 30            ; y
    ld b, 3             ; dx
    ld c, 2             ; dy
frame:
    ld a, BLUE
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a      ; clear only the off-screen image
    ld a, YELLOW
    out (P_FILL), a
    ld a, d
    out (P_X), a
    add a, SIZE
    out (P_X2), a
    ld a, e
    out (P_Y), a
    add a, SIZE
    out (P_Y2), a
    ld a, C_ELL
    out (P_CMD), a
    ld a, C_PRESENT
    out (P_CMD), a
    in a, (P_FRAME)

    ld a, d
    add a, b
    cp LIMITX
    jr c, keepx
    ld a, b
    neg
    ld b, a
    ld a, d
keepx:
    ld d, a
    ld a, e
    add a, c
    cp LIMITY
    jr c, keepy
    ld a, c
    neg
    ld c, a
    ld a, e
keepy:
    ld e, a
    jp frame
```

```testcase
{ "runFor": 60000 }
```

A step below zero wraps to a large unsigned byte, so each `cp` catches both edges. To see why
buffering matters, change `ld a, C_BUF_ON` to `ld a, 12`, the command that turns it off. The ball
still moves, but the clear and redraw become visible as flicker.

## Read a key held down

The key-state port needs a port number and a key code together. This uses another input form:

- **`in r, (c)`** reads one byte into the 8-bit register `r`.
- `c` is the low byte of the I/O address, so here it selects the device port.
- `b` is the high byte of the I/O address. Port `0x31` also treats it as the key code to check.

For example, this asks about the left arrow and puts 1 or 0 in `a`:

```z80
    ld c, 0x31          ; key-state port
    ld b, 0x25          ; left-arrow code
    in a, (c)           ; a receives the answer
```

The read does not replace `b` or `c`. The keyboard ports are:

|   port | reading gives                                                      |
| -----: | ------------------------------------------------------------------ |
| `0x30` | 1 if a typed character waits on character port `0x10`, otherwise 0 |
| `0x31` | 1 while the key selected by `b` is held, otherwise 0               |
| `0x32` | code of the last key pressed, or 0 before any press                |
| `0x33` | code of the last key released, or 0 before any release             |

Letters use the ASCII code of their capital. Arrow codes are left `0x25`, up `0x26`, right `0x27`
and down `0x28`. Click the Screen before pressing a key; its focus ring shows where input goes.

```z80|playground|open-screen|no-registers|no-flags
P_CHAR  equ 0x10
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_KEY   equ 0x31
P_FRAME equ 0x51

C_LINE    equ 1
C_RECT    equ 4
C_BUF_ON  equ 11
C_PRESENT equ 13
K_LEFT  equ 0x25
K_UP    equ 0x26
K_RIGHT equ 0x27
K_DOWN  equ 0x28
BLACK   equ 0x00
CYAN    equ 0x1F
WHITE   equ 0xFF
TOP     equ 16
SIZE    equ 12
MAXX    equ 255 - SIZE  ; x + SIZE must fit in one byte
MAXY    equ 191 - SIZE  ; y + SIZE must fit in one byte

    .org 0x8000
    ld hl, title
print:
    ld a, (hl)
    or a
    jr z, ready
    out (P_CHAR), a
    inc hl
    jr print
ready:
    ld a, C_BUF_ON
    out (P_CMD), a
    ld d, 120
    ld e, 90
frame:
    ld a, BLACK
    out (P_FILL), a
    out (P_PEN), a
    xor a
    out (P_X), a
    ld a, TOP
    out (P_Y), a
    ld a, 255
    out (P_X2), a
    ld a, 192
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a      ; columns 0 through 254
    ld a, 255
    out (P_X), a
    out (P_X2), a
    ld a, TOP
    out (P_Y), a
    ld a, 191
    out (P_Y2), a
    ld a, C_LINE
    out (P_CMD), a      ; remaining last column

    ld a, CYAN
    out (P_FILL), a
    ld a, WHITE
    out (P_PEN), a
    ld a, d
    out (P_X), a
    add a, SIZE
    out (P_X2), a
    ld a, e
    out (P_Y), a
    add a, SIZE
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a
    ld a, C_PRESENT
    out (P_CMD), a
    in a, (P_FRAME)

    ld c, P_KEY
    ld b, K_LEFT
    in a, (c)
    or a
    jr z, noleft
    ld a, d
    or a
    jr z, noleft
    dec d
noleft:
    ld b, K_RIGHT
    in a, (c)
    or a
    jr z, noright
    ld a, d
    cp MAXX
    jr nc, noright
    inc d
noright:
    ld b, K_UP
    in a, (c)
    or a
    jr z, noup
    ld a, e
    cp TOP + 1
    jr c, noup          ; do not move above the title
    dec e
noup:
    ld b, K_DOWN
    in a, (c)
    or a
    jr z, nodown
    ld a, e
    cp MAXY
    jr nc, nodown
    inc e
nodown:
    jp frame
title: .asciz "ARROW KEYS MOVE", 10
```

```testcase
{ "runFor": 60000 }
```

Hold an arrow key and the square moves. `c` remains `P_KEY`; changing `b` selects another key.
Typed characters are different: ports `0x30` and `0x10` handle queued keystrokes, while `0x31`
reports whether a key is down **now** without consuming anything.

## Read the mouse

Mouse reads also use `in r, (c)`. Here `c` selects X `0x40`, Y `0x41`, buttons `0x42`, or event
count `0x43`. Register `b` selects a view: 0 is the current state, 1 the most recent button-release
snapshot, and 2 the most recent button-press snapshot.

In the buttons byte, bit 0 is left, bit 1 right, bit 2 middle, bit 3 marks a double click in the
last-press view, bit 4 is Shift, bit 5 Alt and bit 6 Ctrl.

A snapshot persists until another event of the same kind replaces it. It preserves the most recent
press after the button goes up, but it is not a queue: two presses before a poll leave only the
second snapshot. The event count increases for pointer movement and button changes, and wraps after 255. A changed count proves that activity happened; intervening events cannot be reconstructed.

The mouse example uses one additional drawing operation: command 0 draws one pixel at the current
`(X, Y)` in the pen colour.

```z80|playground|open-screen|no-registers|no-flags
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_CMD   equ 0x27
P_MX    equ 0x40
P_MY    equ 0x41
P_BTN   equ 0x42
P_FRAME equ 0x51
C_PIXEL equ 0
C_CLEAR equ 9
BLACK equ 0x00
CYAN  equ 0x1F
RED   equ 0xE0

    .org 0x8000
frame:
    in a, (P_FRAME)
    ld b, 0             ; current mouse view
    ld c, P_BTN
    in a, (c)
    ld e, a
    bit 1, e
    jr z, paint
    ld a, BLACK
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a
    jr frame
paint:
    bit 0, e
    jr z, frame
    ld a, CYAN
    bit 4, e
    jr z, colour
    ld a, RED
colour:
    out (P_PEN), a
    ld b, 0
    ld c, P_MX
    in a, (c)
    out (P_X), a
    ld c, P_MY
    in a, (c)
    out (P_Y), a
    ld a, C_PIXEL
    out (P_CMD), a
    jr frame
```

```testcase
{ "runFor": 60000 }
```

Click the Screen and drag with the left button. Shift paints red instead of cyan; the right button
clears. `bit 0, e` and `bit 1, e` test independent facts in the buttons byte.

## Read Screen state back

Drawing ports also let a program inspect the image and its text cursor:

|   port | reading gives                             |
| -----: | ----------------------------------------- |
| `0x28` | colour of the pixel at the current (X, Y) |
| `0x29` | current text cursor column                |
| `0x2A` | current text cursor row                   |

Set X and Y through ports `0x23` and `0x24` before reading `0x28`. With double buffering on, the
pixel comes from the off-screen image being drawn. The cursor ports use 8 by 8 character cells, and
printing a character advances the column by one.

## Two to draw

Fill a red rectangle over the box from `(10, 10)` up to but not including `(100, 100)`. Then read
the colour of pixel `(50, 50)` into `a`. Red is `0xE0`, so `a` should finish as `E0`. Set both pen
and fill to red so the entire shape has one colour.

```z80|playground|open-screen|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "a": "0xE0" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|open-screen|solution
RED equ 0xE0

    .org 0x8000
    ld a, RED
    out (0x20), a       ; pen colour
    out (0x21), a       ; fill colour
    ld a, 10
    out (0x23), a
    out (0x24), a       ; first corner (10, 10)
    ld a, 100
    out (0x25), a
    out (0x26), a       ; exclusive corner (100, 100)
    ld a, 4
    out (0x27), a       ; filled rectangle

    ld a, 50
    out (0x23), a
    out (0x24), a
    in a, (0x28)        ; colour at (50, 50)
    halt
```

</details>

Now put the text cursor at column 5, row 3 and print `HI`. Read its final column into `b` and its
row into `c`. Each character advances the cursor, so `bc` should finish as `0x0703`.

```z80|playground|open-screen|console|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedOutput": "HI",
    "expectedRegisters": { "bc": "0x0703" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|open-screen|console|solution
    .org 0x8000
    ld a, 5
    out (0x29), a       ; cursor column
    ld a, 3
    out (0x2A), a       ; cursor row
    ld a, 'H'
    out (0x10), a
    ld a, 'I'
    out (0x10), a
    in a, (0x29)
    ld b, a             ; final column: 7
    in a, (0x2A)
    ld c, a             ; final row: 3
    halt
```

</details>
