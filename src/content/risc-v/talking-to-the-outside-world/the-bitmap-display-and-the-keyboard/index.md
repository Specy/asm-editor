`ecall` asks the Playground to do work. A screen and a console device can also be reached through
addresses. RISC-V still uses the load and store instructions you already know: `lw` reads a word
from an address and `sw` writes one.

This is **memory-mapped I/O**. The important distinction is what sits behind the address. The
bitmap display uses an ordinary region of memory as its backing store. The console addresses below
belong to device registers, so reading or writing them can have an effect outside the program.

## One word is one pixel

The Screen panel can display a region of memory as a grid of pixels. Each pixel is one four-byte
word. Its low 24 bits are colour bytes:

| bits | colour byte |
| ---- | ----------- |
| 23 through 16 | red |
| 15 through 8 | green |
| 7 through 0 | blue |

The high byte is ignored. Thus `0x00FF0000` is red, `0x0000FF00` is green,
`0x000000FF` is blue, and `0x00FFFFFF` is white. This is the familiar `#RRGGBB` order written as
a hexadecimal word.

Pixels occupy consecutive words: left to right across a row, then the next row. Here the grid has
16 words in each row, so `.space 1024` reserves its 256 words. Run the program and inspect the
Screen panel.

```riscv|playground|open-screen|memory
# @screen unit=16 width=256 height=256 base=display
.data
display: .space 1024        # 16 * 16 words, four bytes each

.text
.globl main
main:
    la t0, display
    li t1, 0x00FF0000       # red: column 0, row 0
    sw t1, 0(t0)
    li t1, 0x0000FF00       # green: one word to the right
    sw t1, 4(t0)
    li t1, 0x000000FF       # blue: one row below the first pixel
    sw t1, 64(t0)
    li t1, 0x00FFFFFF       # white: the final word in the grid
    sw t1, 1020(t0)
    li a7, 10
    ecall
```

The offsets are bytes. `4(t0)` moves by one word and `64(t0)` moves by 16 words, one full row.
The display reads these reserved words; loading or storing them otherwise behaves like loading or
storing any data memory.

## Configuring the Screen panel

The Screen panel's **Display** button lets you choose a display size, pixel-unit size, and backing
address. A complete `@screen` directive gives the same settings in the program. Each Build applies
them before the program begins, which makes the display setup repeatable:

```
# @screen unit=16 width=256 height=256 base=display
```

Here `width=256` and `height=256` make a 256-by-256-pixel display. `unit=16` draws every backing
word as a 16-by-16 screen-pixel square, leaving a 16-by-16 grid of words. The allowed display
widths and heights are 64, 128, 256, 512, and 1024. The allowed unit dimensions are 1, 2, 4, 8,
16, and 32; `unit` sets both dimensions, while `unitWidth` and `unitHeight` can set them separately.
Finally, `base=display` tells the panel that the word at the label `display` is the first pixel.
An address may be used for `base` too, but a label keeps the program independent of the data
section's numeric address.

## Finding a pixel

For a 16-column display, begin at the base, skip `y` whole rows of 16 words, then skip `x` more
words within that row. Since each word has four bytes, the address is:

```
base + (y * 16 + x) * 4
```

For example, column 15 in row 15 is the final word: skip 15 rows, then 15 words. A simple
blue-and-green ramp can use `x << 4` for the blue byte and `y << 12` for the green byte. At
`x = 15`, `y = 15`, those pieces are `0x000000F0` and `0x0000F000`, giving the colour
`0x0000F0F0`.

This program calculates the address for one chosen pixel. Change `x`, `y`, or `colour`, build, and
run it to place a different pixel.

```riscv|playground|open-screen|memory
# @screen unit=16 width=256 height=256 base=display
.data
display: .space 1024

.text
.globl main
main:
    li t0, 15                   # x: column
    li t1, 15                   # y: row
    li t2, 0x0000F0F0           # green and blue
    la t3, display              # base address

    slli t4, t1, 4              # y * 16 words
    add  t4, t4, t0             # word number: rows, then x words
    slli t4, t4, 2              # byte offset: four bytes per word
    add  t4, t4, t3             # address of this pixel
    sw   t2, 0(t4)

    li a7, 10
    ecall
```

## The console registers at `0xffff0000`

The console appears as four **device registers**. The two control registers carry status and
control bits; the two data registers carry characters. They are accessed with ordinary `lw` and
`sw` spelling, but they are not a buffer in your data section. In particular, reading receiver data
takes a character from the input queue, and storing transmitter data sends a character to the
console.

| address | register | use |
| ------: | -------- | --- |
| `0xffff0000` | receiver control | bit 0 is **Ready** when a typed character is waiting |
| `0xffff0004` | receiver data | low byte is the next character; reading it takes that character |
| `0xffff0008` | transmitter control | bit 0 is Ready; it is always 1 here |
| `0xffff000c` | transmitter data | storing a low-byte character prints it on the console |

For the programs on this page, inspect bit 0 of either control register.

The transmitter is ready to accept a character, so this prints without using an `ecall` printing
service:

```riscv|playground|console
.eqv MMIO, 0xffff0000

.text
.globl main
main:
    li s0, MMIO
    li t0, 'H'
    sw t0, 12(s0)           # transmitter data register
    li t0, 'i'
    sw t0, 12(s0)
    li t0, '\n'
    sw t0, 12(s0)
    li a7, 10
    ecall
```

The base in `s0` is `0xffff0000`, so the four word registers are at byte offsets 0, 4, 8, and 12.
When the registers panel shows that base as a signed number, it may display a negative value; the
same 32 address bits still select these registers.

## Polling and echoing keys

No instruction announces that a key was pressed. Instead, a program can repeatedly load receiver
control, keep bit 0, and branch back while that bit is zero. This is **polling**. Once Ready is one,
loading receiver data obtains one queued character. The following program sends that character back
through transmitter data and ends when it receives `q`.

Click the Screen panel before typing so that it has keyboard focus.

```riscv|playground|open-screen|console|no-registers
.eqv MMIO, 0xffff0000
.data
banner: .asciz "Click the screen, then type. q ends the program.\n"

.text
.globl main
main:
    li a7, 4
    la a0, banner
    ecall

    li s0, MMIO
    li s1, 'q'
poll:
    lw t0, 0(s0)            # receiver control
    andi t0, t0, 1          # retain Ready, bit 0
    bnez t0, take

    li a7, 32               # wait briefly before checking again
    li a0, 10
    ecall
    j poll
take:
    lw t1, 4(s0)            # receiver data: take one queued character
    andi t1, t1, 0xFF
    sw t1, 12(s0)           # transmitter data: echo it
    beq t1, s1, quit
    j poll
quit:
    li a7, 10
    ecall
```

In this Playground, service 32 lets an empty polling loop wait without spending its instruction
budget. During an interactive run it waits for the requested time; a testcase advances its virtual
clock immediately. The wait makes the program pleasant to leave idle while it is waiting for a key.

## Your turn

The Screen panel is a 16-by-16 word grid whose base label is `display`. Put white at the pixel with
the supplied `x` and `y` values. Derive the row-and-column offset, convert it to bytes, and store
`0x00FFFFFF` at the resulting address.

```riscv|playground|open-screen|memory|exercise
# @screen unit=16 width=256 height=256 base=display
.eqv SIDE, 16
.data
display: .space 1024

.text
.globl main
main:
    li t0, 5                # x
    li t1, 3                # y
    # your code here
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x100100D4", "bytes": 4, "expected": ["0x00FFFFFF"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|open-screen|memory|solution
# @screen unit=16 width=256 height=256 base=display
.eqv SIDE, 16
.data
display: .space 1024

.text
.globl main
main:
    li t0, 5                # x
    li t1, 3                # y
    la t2, display
    li t3, SIDE
    mul t4, t1, t3          # y * SIDE rows of words
    add t4, t4, t0          # then x words
    slli t4, t4, 2          # four bytes per word
    add t4, t4, t2
    li t5, 0x00FFFFFF
    sw t5, 0(t4)
    li a7, 10
    ecall
```

</details>

Print `Hi` by storing its character codes in the transmitter data register, without printing
services 4 or 11. You may still use service 10 to end the run.

```riscv|playground|console|exercise
.text
.globl main
main:
    # your code here
```

```testcase
{
    "expectedOutput": "Hi"
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|console|solution
.text
.globl main
main:
    li s0, 0xffff0000
    li t0, 'H'
    sw t0, 12(s0)           # transmitter data
    li t0, 'i'
    sw t0, 12(s0)
    li a7, 10
    ecall
```

</details>
