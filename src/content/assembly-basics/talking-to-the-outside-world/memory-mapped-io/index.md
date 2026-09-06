A trap is one way to reach the outside world: the program asks and the environment answers. The other
way turns it around. Some addresses are not memory at all: writing to them tells a device to do
something, reading from them asks the device how it is. That is **memory-mapped I/O**, and the
instructions for it are the `lw` and `sw` we already have, pointed at an address nobody put a
variable in.

The address is decided by whoever built the machine, and a program that wants that device has to know
the number. There is no `open`, no handle and no name, only an agreed address.

## A framebuffer

The most useful device to map that way is the screen. A **framebuffer** is a run of memory where each
element is one pixel, laid out row by row from a base address, so the pixel at column `x` and row `y`
is at `base + (y * columns + x) * 4` when a pixel is a word. Writing a colour into that word paints
the pixel, and nothing else has to happen: the display reads that memory and shows it.

The MIPS and RISC-V simulators this editor follows, MARS and RARS, both have such a display, and this
editor has the same one. One word is one pixel, the low 24 bits are the colour as `0x00RRGGBB`, and
four numbers say how the grid is laid out: the size of a word on screen, the width and height of the
drawing area, and the address the grid starts at.

The program states them itself in a comment:

```
# @screen unit=16 width=256 height=256 base=display
```

The editor reads that line at every Build and configures the screen panel from it, so there is
nothing to set by hand. MARS and RARS read it as the ordinary comment it is, where you type the same
four numbers into the tool's own window. `unit=16` draws one word as a 16 by 16 square, and 256
divided by 16 is 16, so this one is a 16 by 16 grid of chunky pixels, 256 words in all.

This program walks the grid and writes a colour that grows redder to the right and greener downwards.
Build it and press Run.

```riscv|playground|screen
# @screen unit=16 width=256 height=256 base=display

.data
display: .space 1024        # 16 * 16 words, one per pixel

.text
main:
    la t0, display          # p = &display[0]
    li t6, 16               # the grid is 16 by 16
    li t1, 0                # y = 0
row:
    li t2, 0                # x = 0
pixel:
    slli t3, t2, 20         # red grows with x
    slli t4, t1, 12         # green grows with y
    or t3, t3, t4           # the colour, 0x00RRGGBB
    sw t3, 0(t0)            # one word is one pixel
    addi t0, t0, 4          # p++
    addi t2, t2, 1          # x++
    blt t2, t6, pixel
    addi t1, t1, 1          # y++
    blt t1, t6, row

    li a7, 10
    ecall
```

Nothing in it is a syscall except the one that ends it. The loop is the array walk of the previous
lecture, and the only thing that makes it a picture is that `display` is where the screen is looking.
The top left square comes out black, the top right `#F00000`, the bottom left `#00F000` and the
bottom right `#F0F000`.

The `.space 1024` matters: the grid has to be inside memory the program actually reserved, and
`base=display` is what points the display at that label. Try changing `slli t3, t2, 20` to
`slli t3, t2, 4`. The ramp along the top turns blue, because a colour is `0x00RRGGBB` and the lowest
eight bits are the blue byte, sixteen bits below the red one.

## Polling a status bit

A screen is written to. A keyboard has to be read from, and a program cannot know when somebody will
type. MARS and RARS put the keyboard and a character display behind four registers:

| address      | register            | what it holds                                     |
| ------------ | ------------------- | ------------------------------------------------- |
| `0xffff0000` | receiver control    | bit 0 is **Ready**: a character is waiting        |
| `0xffff0004` | receiver data       | that character, in the low byte                   |
| `0xffff0008` | transmitter control | bit 0 is Ready: the display will take a character |
| `0xffff000c` | transmitter data    | store a character here and it is printed          |

A **status bit** like Ready is how a device says whether it is worth talking to, and reading it in a
loop until it turns on is called **polling**. The loop is the whole of the program's idea of waiting:
look, nothing there, look again.

Click the screen panel of this one to give it the keyboard, then type. Each key is echoed into the
console through the transmitter and paints one square of the grid in a colour made from its character
code. It never ends by itself, so press **Stop** when you have had enough.

```riscv|playground|screen|console
# @screen unit=16 width=256 height=256 base=display

.eqv MMIO, 0xffff0000

.data
display: .space 1024        # 16 * 16 words

.text
main:
    la s0, display
    li s1, 0                # the next square to paint
    li s2, MMIO
poll:
    lw t0, 0(s2)            # the receiver's control register
    andi t0, t0, 1          # bit 0, Ready
    bnez t0, take           # something is waiting, go and take it
    li a7, 32               # nothing yet, let ten milliseconds pass
    li a0, 10
    ecall
    j poll
take:
    lw t1, 4(s2)            # the receiver's data register, one character
    andi t1, t1, 0xff
    sw t1, 12(s2)           # the transmitter's data register prints it
    slli t2, t1, 17         # a colour made out of the character code
    or t2, t2, t1
    slli t3, s1, 2
    add t3, t3, s0
    sw t2, 0(t3)            # paint one square
    addi s1, s1, 1
    andi s1, s1, 255        # 256 squares, then start over
    j poll
```

```testcase
{
    "runFor": 40000
}
```

Reading the data register is what takes the character out of the device: Ready goes back to 0 and the
next key can arrive. That is why the program reads `0xffff0004` exactly once per character, and why a
program that reads it twice loses one.

The `li a7, 32` inside the poll loop is a sleep, and it is there because a loop that only looks is a
loop that burns the whole instruction budget looking. A wait costs no instructions here, so a program
that is doing nothing but waiting for a key can wait all day.

## The other two machines

Not every environment maps its devices into memory. The M68K in this editor follows EASy68K, which
has no framebuffer at all: drawing is more trap tasks, tasks 80 to 96, one per operation, so a pixel
is `trap #15` with 82 in `d0` and the coordinates in `d1` and `d2`, and there is no address you could
write a picture into. The Z80 draws through its ports, the same doors we used for the console: the
colour goes out of port `0x10`, the coordinates out of `0x13` to `0x16`, and a write to port `0x17`
performs one drawing operation with whatever was set.

So a screen can be an address, a task number or a port number, and only the middle part, working out
which pixel to paint, is the same everywhere.
