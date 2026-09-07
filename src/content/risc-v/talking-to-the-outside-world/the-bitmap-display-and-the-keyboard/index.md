The M68K reaches its screen through a trap: every drawing operation is a task number and a request.
RISC-V has no such thing. Its screen is **memory**, its keyboard is **four addresses**, and the
instructions that reach both are `lw` and `sw`. Nothing is asked of the simulator at all.

Both devices are RARS's own tools, the **bitmap display** and the **keyboard and display simulator**,
which are ports of the MARS tools the MIPS course uses, with the same parameters and the same
register layout. So a program written for RARS runs here unchanged, and the MIPS version of this page
describes the same two devices.

## One word is one pixel

The bitmap display is a grid of words somewhere in memory. The **low 24 bits** of each word are its
colour: red in bits 23 to 16, green in 15 to 8, blue in 7 to 0, and the top byte is ignored. So
`0x00FF0000` is red, `0x0000FF00` is green, `0x000000FF` is blue and `0x00FFFFFF` is white, which is
the `#RRGGBB` order you write in CSS with a `0x` on the front.

The words run **left to right and then top to bottom**, so the pixel below a word is one row of words
further on. Four parameters say how big the grid is and where it starts, and a fifth says how large
each word is drawn:

- **unit width** and **unit height**, 1 to 32, how many screen pixels one word covers.
- **display width** and **height**, 64 to 1024. Divided by the unit size, they give the grid: 256 by
  256 at a unit of 16 is a 16 by 16 grid of words.
- **base address**, where the grid starts in memory.

Press Run on this one and watch the Screen panel next to it.

```riscv|playground|screen|memory
# @screen unit=16 width=256 height=256 base=display
.data
display: .space 1024        # 16 * 16 words, four bytes each

.text
.globl main
main:
    la t0, display
    li t1, 0x00FF0000       # red
    sw t1, 0(t0)            # the pixel at the top left
    li t1, 0x0000FF00       # green
    sw t1, 4(t0)            # the one to the right of it
    li t1, 0x000000FF       # blue
    sw t1, 64(t0)           # 16 words on, so the one below the first
    li t1, 0x00FFFFFF       # white
    sw t1, 1020(t0)         # the last word of the grid
    li a7, 10
    ecall
```

Four `sw` instructions and four pixels change. `.space 1024` is what reserves the memory the grid
covers: the screen shows whatever those words hold, so a program that writes past what it reserved is
writing over something else, and one that reserves too little shows whatever is next in the data
section.

Try changing `sw t1, 64(t0)` to `sw t1, 68(t0)` and running again: the blue pixel moves one to the
right, because one word is one pixel and four bytes.

## The @screen line

The five parameters are the Screen panel's **Display** button, and a program can ask for them itself
with a comment line naming `@screen`. Every Build reads it, before the first instruction runs.

```
# @screen unit=16 width=256 height=256 base=display
```

- **`width`** and **`height`** are the display area in pixels, one of 64, 128, 256, 512 or 1024.
- **`unit`** is how large one word is drawn, one of 1, 2, 4, 8, 16 or 32. `unitWidth` and
  `unitHeight` set the two separately.
- **`base`** is **a label your program defines**, which is the point of it, since the program then
  never has to know the address. An address such as `0x10010000` works too.

It is a comment, so the same file still assembles in RARS, where you set the five values in the
tool's window by hand. Anything the line gets wrong is a **warning** on that line and never an error:
a size that is not on the list is replaced by the nearest one that is, and a label that does not
exist leaves the base address alone. What the directive leaves out keeps the value it had.

## Working out which word

A pixel at column `x` and row `y` is at

```
base + (y * columns + x) * 4
```

which is the two dimensional array of "Arrays and strings" with an element size of 4. When the number
of columns is a power of two, both multiplications are shifts.

```riscv|playground|screen|memory
# @screen unit=16 width=256 height=256 base=display
.data
display: .space 1024

.text
.globl main
main:
    la s0, display
    li s3, 16                   # the side of the grid, since a branch needs a register
    li s1, 0                    # y
row:
    li s2, 0                    # x
pixel:
    slli t0, s2, 4              # blue from x
    slli t1, s1, 12             # green from y
    or t0, t0, t1               # the colour of this pixel
    slli t2, s1, 4              # y * 16, the number of columns
    add t2, t2, s2              # + x
    slli t2, t2, 2              # times four bytes per word
    add t2, t2, s0
    sw t0, 0(t2)
    addi s2, s2, 1
    blt s2, s3, pixel
    addi s1, s1, 1
    blt s1, s3, row
    li a7, 10
    ecall
```

A blue and green ramp over the whole grid, 256 pixels drawn by two nested loops. `slli t2, s1, 4` is
the `y * 16`, and `slli t2, t2, 2` afterwards is the four bytes; the two could be one shift of 6, and
they are written apart so the formula is readable.

`li s3, 16` is outside both loops because every RISC-V branch compares two registers, so the bound of
a loop lives in one of its own.

`slli t0, s2, 4` puts `x`, which runs 0 to 15, into bits 4 to 7 of the colour, which is the top half
of the blue byte. Try changing it to `slli t0, s2, 20` and running again: `x` lands in the red byte
instead, and the ramp runs the other way across the colours.

## An animation

A moving picture is a loop that erases, moves, draws and then **waits**. Service 32 is what makes it
move at the same speed whatever your machine is doing, and it costs no instructions, so the
Playground's budget is spent on drawing instead of on counting.

This one runs until you press Stop.

```riscv|playground|screen
# @screen unit=16 width=256 height=256 base=display
.eqv SIDE, 16
.eqv CELLS, 256
.eqv BACKGROUND, 0x00101820
.eqv DOT, 0x00FFCC33
.data
display: .space 1024

.text
.globl main
main:
    la s0, display
    li s1, 0                    # x
    li s2, 1                    # the step, which flips at the edges
    li s3, SIDE
    li s4, CELLS
frame:
    li t0, BACKGROUND           # paint the whole grid over
    li t1, 0
fill:
    slli t2, t1, 2
    add t2, t2, s0
    sw t0, 0(t2)
    addi t1, t1, 1
    blt t1, s4, fill

    slli t3, s1, 2              # the dot, on row 8
    addi t3, t3, 512            # 8 rows of 16 words, four bytes each
    add t3, t3, s0
    li t4, DOT
    sw t4, 0(t3)

    li a7, 32                   # let 50 milliseconds of program time pass
    li a0, 50
    ecall

    add s1, s1, s2              # move it
    bltz s1, flip
    blt s1, s3, frame
flip:
    sub s2, zero, s2            # turn it round at the edge
    add s1, s1, s2
    add s1, s1, s2
    j frame
```

```testcase
{ "runFor": 200000 }
```

Take the `ecall` out and the dot moves as fast as the instruction budget allows and then the program
stops, which is not the same thing as fast. Try changing `li a0, 50` to `li a0, 200` and watching it
slow down.

The whole grid is repainted every frame, which is 256 stores, and then one more for the dot. Erasing
only the pixel the dot was at last time would be two stores a frame, and that is what a program with
a bigger grid does.

## The keyboard and the console at 0xffff0000

Four words carry one character each way. They are not memory: reading one asks the device something
and writing one tells it to do something.

|      address | name                | what it does                                                    |
| -----------: | ------------------- | --------------------------------------------------------------- |
| `0xffff0000` | receiver control    | bit 0 is **Ready**: a typed character is waiting                |
| `0xffff0004` | receiver data       | the character, in the low byte. Reading it takes that character |
| `0xffff0008` | transmitter control | bit 0 is Ready, and here it is always 1                         |
| `0xffff000c` | transmitter data    | storing a character in the low byte prints it on the console    |

The transmitter is the simpler of the two: a `sw` of a character code appends it to the console, the
same console `ecall` service 4 writes to. ASCII 12, a form feed, clears the console instead.

```riscv|playground|console
.eqv MMIO, 0xffff0000

.text
.globl main
main:
    li s0, MMIO
    lw t0, 8(s0)            # the transmitter control register, always Ready
    li t1, 'H'
    sw t1, 12(s0)           # printed, with no ecall anywhere
    li t1, 'i'
    sw t1, 12(s0)
    li t1, '\n'
    sw t1, 12(s0)
    lw t2, 0(s0)            # the receiver control, with nobody typing
    li a7, 10
    ecall
```

The console shows `Hi`. `t0` comes out at 1, the Ready bit of a device that is always willing to take
a character, and `t2` at 0, because nothing was typed.

`li s0, MMIO` puts `0xFFFF0000` in a register, and the registers panel shows it as `FFFF0000` while
hovering it says -65536: an address with its top bit set is a negative number read as signed, which
changes nothing about the `lw` and is what to expect when you look at the row.

## Polling the keyboard

A program cannot know when somebody will press a key. What it can do is read the receiver control
register over and over until the Ready bit turns on, and then read the receiver data register, which
takes the character and makes room for the next one. That loop is **polling**.

**Click the Screen panel before you type**: the screen only gets the keyboard when it has the focus,
and a ring around it says so while it does.

```riscv|playground|screen|console|no-registers
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
    andi t0, t0, 1          # the Ready bit
    bnez t0, take
    li a7, 32               # nothing typed yet, so wait instead of spinning
    li a0, 10
    ecall
    j poll
take:
    lw t1, 4(s0)            # receiver data, which dequeues one character
    andi t1, t1, 0xFF
    sw t1, 12(s0)           # echo it through the transmitter
    beq t1, s1, quit
    j poll
quit:
    li a7, 10
    ecall
```

```testcase
{ "runFor": 40000 }
```

Type into the screen panel and every character comes back in the console; type `q` and the program
ends. The `ecall` service 32 in the middle is what stops the poll from burning the instruction
budget while nothing is happening: a wait costs no instructions, so a program idling on the keyboard
can idle for as long as you like.

Ready means "the queue is not empty" instead of "exactly one character is here". What does not fit in
the data register waits behind it, so a program that polls slowly still gets every keystroke in
order.

## Interrupts, and why the program stops

Bit 1 of either control register is the device's **interrupt enable** bit: setting it asks the device
to interrupt the program when it has something, instead of being polled. This editor does not deliver
device interrupts. A program that set the bit would wait for one forever, so a `sw` that sets it ends
the run instead, with

```
Interrupt-driven I/O is not supported: the program set the interrupt-enable bit (bit 1) of the
receiver control register at 0xffff0000. Poll the Ready bit (bit 0) instead.
```

The next lecture is about the interrupt and exception machinery that message is refusing, and about
the part of it this editor does run.

## What this editor does differently

- The display is always there, as a panel, instead of a tool you connect to a program before running
  it.
- Service 30 counts from the start of the run, and a testcase runs on a virtual clock.
- There is no mouse. Neither RARS nor MARS has one, and the M68K course's mouse is a trap task with
  no equivalent here.
- A testcase cannot type: an automated run leaves the receiver empty, so the keyboard programs on
  this page are yours to try by hand and cannot be checked by a test.

The five display parameters, the four registers and the `@screen` settings are all on the
[RISC-V screen documentation page](/documentation/risc-v/screen).

## Your turn

The grid is 16 by 16 words at `display`. Paint the pixel at column 5, row 3 white, which is
`0x00FFFFFF`, working the address out from the two coordinates instead of counting the bytes
yourself. Row 3 column 5 is word `3 * 16 + 5`, which is 53, so the store lands at `0x10010000` plus 212.

```riscv|playground|screen|memory|exercise
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

```riscv|playground|screen|memory|solution
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
    mul t4, t1, t3          # y * SIDE
    add t4, t4, t0          # + x
    slli t4, t4, 2          # four bytes per word
    add t4, t4, t2
    li t5, 0x00FFFFFF
    sw t5, 0(t4)
    li a7, 10
    ecall
```

</details>

The second one prints `Hi` on the console through the **transmitter data register**, with no `ecall`
service 4 and no `ecall` service 11.

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
