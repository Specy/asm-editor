A **framebuffer** is a run of memory in which each element is one pixel, and it is how the MIPS and
RISC-V simulators here reach their screens. This Z80 has none, and the reason is arithmetic: 256 by
192 pixels at one byte each is 48 KB, three quarters of the whole address space, spent on a picture.
So the Screen, the Keyboard and the Mouse are more ports, decoded next to the console ports of the
previous lecture
([ADR 0011](https://github.com/Specy/asm-editor/blob/main/docs/adr/0011-z80-peripherals-through-the-port-map.md)).

## The Screen ports

Drawing is always the same two steps: write the colours and the coordinates to their ports, then
write **one command** to the command port, which runs one operation on whatever is currently set.

| port   | what it holds                                                   |
| ------ | --------------------------------------------------------------- |
| `0x20` | pen colour: lines, outlines, single pixels and text             |
| `0x21` | fill colour: the inside of shapes, the flood fill and the clear |
| `0x22` | pen width in pixels, at least 1                                 |
| `0x23` | X, the first coordinate                                         |
| `0x24` | Y                                                               |
| `0x25` | X2, the second coordinate: the end of a line, the far corner    |
| `0x26` | Y2                                                              |
| `0x27` | the command port: one write runs one drawing operation          |
| `0x28` | reading it gives the colour of the pixel at (X, Y)              |
| `0x29` | the text cursor's column, in 8 by 8 character cells             |
| `0x2A` | the text cursor's row                                           |

Every one of those is a byte, which is why **the Screen is at most 256 by 256 pixels**, and it is 256
by 192 until a program resizes it. The origin is the top left, `x` grows right and `y` grows down,
and drawing outside the Screen is quietly ignored.

The commands are numbers written to `0x27`:

| command | what it draws                                                |
| ------: | ------------------------------------------------------------ |
|       0 | one pixel at (X, Y), in the pen colour                       |
|       1 | a line from (X, Y) to (X2, Y2)                               |
|       2 | a line from the drawing position to (X, Y)                   |
|       3 | move the drawing position to (X, Y) without drawing          |
|       4 | a rectangle from (X, Y) to (X2, Y2), filled and outlined     |
|       5 | the same rectangle, outline only                             |
|       6 | the ellipse inscribed in that rectangle, filled and outlined |
|       7 | the same ellipse, outline only                               |
|       8 | flood fill outwards from (X, Y)                              |
|       9 | fill the whole Screen with the fill colour                   |
|      10 | resize the Screen to X by Y and clear it; a 0 means 256      |
|      11 | double buffering on                                          |
|      12 | double buffering off                                         |
|      13 | present: show the off-screen image                           |

A rectangle **excludes its right and bottom edges**, the way EASy68K's does, so a box whose corners
meet draws nothing.

## The colour byte

A colour is one byte in a **3-3-2** layout: three bits of red in bits 7 to 5, three of green in bits 4
to 2 and two of blue in bits 1 and 0. Two bits of blue is what is left over, and it is why the greys
are not exactly neutral.

| colour | byte   | colour  | byte   |
| ------ | ------ | ------- | ------ |
| black  | `0x00` | red     | `0xE0` |
| blue   | `0x03` | magenta | `0xE3` |
| green  | `0x1C` | yellow  | `0xFC` |
| cyan   | `0x1F` | white   | `0xFF` |
| grey   | `0x92` | orange  | `0xF0` |

Press Run on this one and watch the Screen panel next to it.

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

BLUE    equ 0x03
RED     equ 0xE0
YELLOW  equ 0xFC
WHITE   equ 0xFF

    .org 0x8000
    ld a, BLUE
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a      ; the whole Screen, in the fill colour

    ld a, RED
    out (P_FILL), a
    ld a, WHITE
    out (P_PEN), a
    ld a, 20
    out (P_X), a
    out (P_Y), a        ; from (20, 20)
    ld a, 100
    out (P_X2), a
    ld a, 80
    out (P_Y2), a       ; to (100, 80)
    ld a, C_RECT
    out (P_CMD), a

    ld a, YELLOW
    out (P_FILL), a
    ld a, 140
    out (P_X), a
    ld a, 20
    out (P_Y), a
    ld a, 220
    out (P_X2), a
    ld a, 100
    out (P_Y2), a
    ld a, C_ELL
    out (P_CMD), a      ; the ellipse inside that box

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
    out (P_COL), a      ; the text cursor, in character cells
    ld a, 14
    out (P_ROW), a
    ld hl, label
print:
    ld a, (hl)
    or a
    jr z, done
    out (0x10), a          ; the console character port draws at the cursor
    inc hl
    jr print
done:
    halt

    .org 0x9000
label:  .asciz "PORTS DRAW THIS"
```

Try changing `ld a, 220` on the ellipse to `ld a, 180`: the box stops being wide and the ellipse
becomes a circle.

The last loop is the character port from the previous lecture, unchanged. Text and graphics share one
image here, the way EASy68K's single output window did, so anything printed on the console ports also
lands on the Screen at the text cursor, in 8 by 8 cells: 32 columns by 24 rows on the default Screen.
Command 9 wipes both.

## Double buffering and the frame

Drawing a moving picture straight onto the visible Screen shows every half finished frame. **Command
11** sends the drawing to an off-screen copy instead and **command 13** shows it, so the reader only
ever sees whole frames.

Pacing is port `0x51`: reading it waits for the next animation frame and gives back 0. One read per
frame is how an animation runs at the display's pace instead of as fast as the host can go.

This one runs until you press Stop.

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

BLUE    equ 0x03
YELLOW  equ 0xFC
WHITE   equ 0xFF
SIZE    equ 16
LIMITX  equ 256 - SIZE
LIMITY  equ 192 - SIZE

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
    out (P_CMD), a      ; wipes the off-screen image only

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
    out (P_CMD), a      ; the frame becomes visible here, all at once
    in a, (P_FRAME)     ; and the program waits for the next one

    ld a, d             ; move it, turning round at the edges
    add a, b
    cp LIMITX
    jr c, keepx
    ld a, b
    neg
    ld b, a             ; dx = -dx
    ld a, d             ; and stay where we were
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

`cp LIMITX` catches both edges with one unsigned comparison: a step that would take `x` below zero
wraps it round past 250, which is above the limit as well.

Try changing `ld a, C_BUF_ON` to `ld a, 12`, which turns double buffering off. The ball still moves
and now it flickers, because you are watching the clear and the draw happen.

Port `0x50` is the other way to pace a program: put a number of hundredths of a second in `b` and read
it, and the program waits that long. Port `0x52` reads one byte of the hundredths since the run
started, with `b` choosing which byte. All three of these suspend the program without freezing the
editor, so Stop still answers and the Screen still repaints.

## The keyboard

Four ports, and they are all reads:

| port   | reading gives                                                     |
| ------ | ----------------------------------------------------------------- |
| `0x30` | 1 when a typed character is waiting on the character port, else 0 |
| `0x31` | 1 while the key whose code is in **`b`** is held down, else 0     |
| `0x32` | the code of the last key pressed, 0 before the first press        |
| `0x33` | the code of the last key released                                 |

Port `0x31` is what a game reads: it consumes nothing, so a key held down answers 1 every time round
the loop, and it needs the `in r,(c)` form because the key code travels in `b`.

The key codes are EASy68K's, the same table every language in this editor uses. A letter is the
ASCII code of its **capital**, so `A` is `0x41` whether or not Shift is held; a digit is its ASCII
code; and the arrows are left `0x25`, up `0x26`, right `0x27`, down `0x28`.

**Click the Screen panel before you press a key**: the Screen only gets the keyboard when it has the
focus, and a ring around it says so while it does.

```z80|playground|open-screen|no-registers|no-flags
P_CHAR  equ 0x10
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_KEY   equ 0x31        ; 1 while the key whose code is in b is held
P_FRAME equ 0x51

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
TOP     equ 16          ; the play area starts below the two text rows
SIZE    equ 12
LIMITX  equ 256 - SIZE
LIMITY  equ 192 - SIZE

    .org 0x8000
    ld hl, title
print:
    ld a, (hl)
    or a
    jr z, ready
    out (P_CHAR), a     ; the title, printed at the text cursor
    inc hl
    jr print

ready:
    ld a, C_BUF_ON      ; the off-screen image starts as a copy of what is on screen
    out (P_CMD), a
    ld d, 120           ; x
    ld e, 90            ; y

frame:
    ld a, BLACK         ; wipe the play area, not the title above it
    out (P_FILL), a
    out (P_PEN), a
    xor a
    out (P_X), a
    ld a, TOP
    out (P_Y), a
    ld a, 255
    out (P_X2), a       ; the last column: a byte cannot say 256
    ld a, 191
    out (P_Y2), a
    ld a, C_RECT
    out (P_CMD), a

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

    ld c, P_KEY         ; c is the port, b is the key code
    ld b, K_LEFT
    in a, (c)
    or a
    jr z, noleft
    ld a, d
    or a
    jr z, noleft        ; already against the left edge
    dec d
    dec d
noleft:
    ld b, K_RIGHT
    in a, (c)
    or a
    jr z, noright
    ld a, d
    cp LIMITX - 2
    jr nc, noright
    inc d
    inc d
noright:
    ld b, K_UP
    in a, (c)
    or a
    jr z, noup
    ld a, e
    cp TOP + 2
    jr c, noup
    dec e
    dec e
noup:
    ld b, K_DOWN
    in a, (c)
    or a
    jr z, nodown
    ld a, e
    cp LIMITY - 2
    jr nc, nodown
    inc e
    inc e
nodown:
    jp frame

title:  .asciz "ARROW KEYS MOVE", 10
```

```testcase
{ "runFor": 60000 }
```

Click the Screen, hold an arrow key and the square moves. The four reads all use the same `c`, since
the port never changes, and only `b` is reloaded between them.

The typed characters and the key state are two different things. Port `0x30` and the character port
`0x10` are the ones that answer "what did they type", one keystroke at a time; port `0x31` answers
"is this key down now" and consumes nothing, which is what a game wants.

## The mouse

Four ports again, and `b` selects which **view** the read answers with: **0** is where the pointer is
and which buttons are down now, **1** is the state at the last button release, **2** at the last
button press. The two snapshots persist until the next one, so a program that polls slowly still sees
every click.

| port   | reading gives                                          |
| ------ | ------------------------------------------------------ |
| `0x40` | the pointer's X in the selected view, in Screen pixels |
| `0x41` | its Y                                                  |
| `0x42` | the buttons and modifiers of that view                 |
| `0x43` | the mouse event count, a byte that wraps               |

The buttons byte is one bit each: bit 0 left, bit 1 right, bit 2 middle, bit 3 the double-click flag
(only in the last-press view), bit 4 Shift, bit 5 Alt, bit 6 Ctrl.

```z80|playground|open-screen|no-registers|no-flags
P_PEN   equ 0x20
P_FILL  equ 0x21
P_X     equ 0x23
P_Y     equ 0x24
P_X2    equ 0x25
P_Y2    equ 0x26
P_CMD   equ 0x27
P_MX    equ 0x40
P_MY    equ 0x41
P_BTN   equ 0x42
P_FRAME equ 0x51

C_ELL   equ 6
C_CLEAR equ 9

BLACK   equ 0x00
CYAN    equ 0x1F
RED     equ 0xE0
BRUSH   equ 4

    .org 0x8000
frame:
    in a, (P_FRAME)     ; one pass per animation frame

    ld b, 0             ; view 0: where the pointer is right now
    ld c, P_BTN
    in a, (c)
    ld e, a             ; keep the buttons

    bit 1, e            ; the right button clears the Screen
    jr z, paint
    ld a, BLACK
    out (P_FILL), a
    ld a, C_CLEAR
    out (P_CMD), a
    jr frame

paint:
    bit 0, e            ; the left button paints
    jr z, frame

    ld a, CYAN
    bit 4, e            ; Shift held, so paint red instead
    jr z, colour
    ld a, RED
colour:
    out (P_FILL), a
    out (P_PEN), a      ; the same pen, so the disc has no rim

    ld b, 0
    ld c, P_MX
    in a, (c)           ; the pointer's x
    sub BRUSH
    out (P_X), a
    add a, BRUSH * 2
    out (P_X2), a
    ld c, P_MY
    in a, (c)           ; and its y
    sub BRUSH
    out (P_Y), a
    add a, BRUSH * 2
    out (P_Y2), a
    ld a, C_ELL
    out (P_CMD), a
    jr frame
```

```testcase
{ "runFor": 60000 }
```

Click the Screen, then drag with the left button held: a cyan disc follows the pointer, Shift makes
it red and the right button clears. `bit 0, e` and `bit 1, e` are the bit test from the arithmetic
lecture, reading two bits of the one byte the port answered with.

Port `0x43` is how a program tells a **new** click from one it has already handled: read the count,
compare it with the count you saw last time, and act only when it has changed. Polling the buttons
alone cannot do that, since a button held for half a second reads as down every frame.

## Your turn

Fill a red rectangle over the box from (10, 10) to (100, 100), then read the colour of the pixel at
(50, 50) back and leave it in `a`. Red is `0xE0`, so `a` comes out at `E0`. The pen and the fill both
have to be red, or the pixel you read might be on the outline.

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
RED     equ 0xE0

    .org 0x8000
    ld a, RED
    out (0x21), a   ; the fill colour
    out (0x20), a   ; and the pen, so the outline is red too
    ld a, 10
    out (0x23), a
    out (0x24), a   ; from (10, 10)
    ld a, 100
    out (0x25), a
    out (0x26), a   ; to (100, 100)
    ld a, 4
    out (0x27), a   ; command 4: a filled rectangle

    ld a, 50
    out (0x23), a
    out (0x24), a   ; the pixel to read
    in a, (0x28)    ; and its colour comes back in a
    halt
```

</details>

The second one uses the text cursor. Put it at column 5 and row 3, print `HI` there, and then read
the two cursor ports back into `b` and `c`. The cursor moves as it prints, so `b` comes out at 7,
two cells further right, and `c` at 3.

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
    out (0x29), a   ; the column
    ld a, 3
    out (0x2A), a   ; the row
    ld a, 'H'
    out (0x10), a
    ld a, 'I'
    out (0x10), a
    in a, (0x29)    ; where the cursor ended up
    ld b, a
    in a, (0x2A)
    ld c, a
    halt
```

</details>
