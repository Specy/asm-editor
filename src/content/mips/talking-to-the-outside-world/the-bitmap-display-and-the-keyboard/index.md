Framebuffer pixels, keyboard input and console output all use ordinary loads and stores. A program
stores colour words in a reserved memory area, and the Screen watches that area as a framebuffer. At
four special addresses, loads and stores talk to keyboard and console device registers instead. The
special-register arrangement is called **memory-mapped I/O**. The syscalls you already know still
have a place: service 10 exits, and service 32 gives a moving or polling program a controlled pause.

## One word is one pixel

The Screen's dimensions come from fixed choices:

- **Unit width** and **unit height** are each one of 1, 2, 4, 8, 16 or 32 display pixels. They say
  how large the Screen draws one framebuffer word.
- **Display width** and **display height** are each one of 64, 128, 256, 512 or 1024 pixels.

The word grid has `display width / unit width` columns and
`display height / unit height` rows. For example, a 256 by 256 display with 16 by 16 units holds a
16 by 16 grid, or 256 words.

The low 24 bits of each word hold a colour in **RRGGBB** order: red in bits 23–16, green in bits
15–8 and blue in bits 7–0. Write the full word as `0x00RRGGBB`. Thus `0x00FF0000` is red,
`0x0000FF00` is green, `0x000000FF` is blue and `0x00FFFFFF` is white.

This first program reserves a 16 by 16 framebuffer and changes four of its words.

```mips|playground|open-screen|memory
# @screen unit=16 width=256 height=256 base=display
.data
display: .space 1024        # 16 * 16 words * 4 bytes

.text
.globl main
main:
    la $t0, display
    li $t1, 0x00FF0000      # red: top left
    sw $t1, 0($t0)
    li $t1, 0x0000FF00      # green: one pixel to the right
    sw $t1, 4($t0)
    li $t1, 0x000000FF      # blue: one row below the first pixel
    sw $t1, 64($t0)
    li $t1, 0x00FFFFFF      # white: bottom right
    sw $t1, 1020($t0)
    li $v0, 10
    syscall
```

The words run left to right, then continue on the next row. Neighbouring words are four bytes apart,
and one row here occupies `16 * 4 = 64` bytes. The Screen observes these ordinary memory words; they
are different from the device registers used for the keyboard and console below.

## Build-time Screen configuration

The first `@screen` comment in the entry file configures the Screen on every Build, before the first
instruction runs:

```
# @screen unit=16 width=256 height=256 base=display
```

`unit` sets both unit dimensions; `unitWidth` and `unitHeight` can set them separately. `width` and
`height` use the fixed display-size choices above. `base` can name a label defined by the program or
give an address such as `0x10010000`. A label is convenient because the assembler chooses its
address.

Settings left out keep their current Screen values. With no directive, the current configuration
also remains; a new MIPS project starts with 1 by 1 units, a 512 by 256 display and base address
`0x10010000`. An unsupported size produces a warning and is replaced by the nearest allowed choice.
A malformed value or an unknown base label also produces a warning and leaves that setting as it
was. These warnings do not stop the Build. The assembler itself sees the line only as a comment.

## From a row and column to an address

Suppose `x` is the column and `y` is the row. First skip `y` complete rows, with `columns` words in
each row. Then move `x` words into that row. Finally convert the word count to bytes:

```
base + (y * columns + x) * 4
```

When the column count is a power of two, shifts perform both multiplications. This loop draws one
horizontal row in the 16-column framebuffer. It recomputes the formula for each value of `x` so the
connection between coordinates and addresses stays visible.

```mips|playground|open-screen|memory
# @screen unit=16 width=256 height=256 base=display
.eqv COLUMNS 16
.data
display: .space 1024

.text
.globl main
main:
    la $s0, display
    li $s1, 6                   # y: draw row 6
    li $s2, 0                   # x: start at column 0
draw:
    sll $t0, $s1, 4             # y * 16 columns
    add $t0, $t0, $s2           # y * columns + x
    sll $t0, $t0, 2             # four bytes per word
    add $t0, $t0, $s0           # add the framebuffer base
    sll $t1, $s2, 4             # increasing blue value
    sw $t1, 0($t0)
    addi $s2, $s2, 1
    blt $s2, COLUMNS, draw
    li $v0, 10
    syscall
```

## The keyboard and console registers

The addresses from `0xffff0000` through `0xffff000c` are special memory-mapped I/O registers. Each
register is a word, but the character itself is in the low byte.

|      address | register            | operation and effect                                                     |
| -----------: | ------------------- | ------------------------------------------------------------------------ |
| `0xffff0000` | receiver control    | Load it and test bit 0. Ready is 1 when receiver data holds a character. |
| `0xffff0004` | receiver data       | Load the waiting character. That read consumes it.                       |
| `0xffff0008` | transmitter control | Bit 0 is Ready and remains 1 because the console can accept a character. |
| `0xffff000c` | transmitter data    | Store a character code to append its low byte to the console.            |

Here is console output through the transmitter. Service 10 still ends the program; no output
syscall is involved.

```mips|playground|console|no-registers
.eqv TRANSMITTER_DATA 0xffff000c

.text
.globl main
main:
    li $s0, TRANSMITTER_DATA
    li $t0, 'H'
    sw $t0, 0($s0)
    li $t0, 'i'
    sw $t0, 0($s0)
    li $t0, '\n'
    sw $t0, 0($s0)
    li $v0, 10
    syscall
```

## Polling the keyboard

A key can arrive at any time, so a program repeatedly loads receiver control and checks Ready bit 0.
When Ready is 1, it loads receiver data. If another character is already queued, that next character
moves into receiver data and Ready stays 1; otherwise Ready becomes 0. The queue preserves the order
in which the keys were typed.

Click the Screen before typing. A visible focus ring shows that it owns the keyboard; keys typed
while another part of the page has focus do not enter this receiver queue.

```mips|playground|open-screen|console|no-registers
.eqv RECEIVER_CONTROL 0xffff0000
.eqv RECEIVER_DATA    0xffff0004
.eqv TRANSMITTER_DATA 0xffff000c
.data
banner: .asciiz "Click the Screen, then type. q exits.\n"

.text
.globl main
main:
    li $v0, 4
    la $a0, banner
    syscall

poll:
    lw $t0, RECEIVER_CONTROL
    andi $t0, $t0, 1            # keep only Ready bit 0
    bnez $t0, receive

    li $v0, 32                  # avoid a busy-wait while the queue is empty
    li $a0, 10                  # let 10 ms of program time pass
    syscall
    j poll

receive:
    lw $t1, RECEIVER_DATA       # consuming read
    andi $t1, $t1, 0xFF
    sw $t1, TRANSMITTER_DATA    # echo through MMIO
    li $t2, 'q'
    bne $t1, $t2, poll
    li $v0, 10
    syscall
```

```testcase
{ "runFor": 40000 }
```

This is **polling**: repeatedly asking the device whether work is ready. Service 32 keeps an empty
poll from turning into a tight busy-wait. The loads, branches, `li` instructions and `syscall`
instruction still count toward the running instruction budget. The elapsed pause itself adds no
running instructions, so the program can wait without spending that budget merely to count time.

Keep bit 1 of both control registers clear in this lesson. It requests interrupt-driven I/O, which
the Playground does not support; the run stops if a program tries to set it. Poll Ready bit 0
instead.

Automated testcases cannot type into the Screen. A `runFor` testcase such as the one above only runs
up to that instruction budget and checks that no runtime error occurred. It does not verify the
keyboard interaction or the rendered Screen image, so try those parts interactively.

## Optional application: a moving dot

The same address calculation and service 32 are enough for a small animation. This program draws a
dot, waits, erases that word and advances `x`.

```mips|playground|open-screen
# @screen unit=16 width=256 height=256 base=display
.eqv COLUMNS 16
.eqv DOT 0x00FFCC33
.data
display: .space 1024

.text
.globl main
main:
    la $s0, display
    li $s1, 0                   # x
    li $s2, 1                   # direction
frame:
    sll $t0, $s1, 2             # x * 4
    addi $t0, $t0, 512          # row 8: 8 * 16 * 4
    add $t0, $t0, $s0
    li $t1, DOT
    sw $t1, 0($t0)

    li $v0, 32
    li $a0, 50
    syscall

    sw $zero, 0($t0)            # erase the old dot
    add $s1, $s1, $s2
    bltz $s1, reverse
    blt $s1, COLUMNS, frame
reverse:
    sub $s2, $zero, $s2
    add $s1, $s1, $s2
    add $s1, $s1, $s2
    j frame
```

```testcase
{ "runFor": 200000 }
```

Updating only the old and new dot positions is efficient for this animation because only one small
object changes. Partial redraw is not a universal rule: when most of an image changes, redrawing the
whole framebuffer can be the simpler approach.

## Your turn

The first exercise uses the 16 by 16 framebuffer below. Starting with `x = 5` and `y = 3`, derive
the pixel address from the coordinates and store white there. Do not replace the coordinates with a
precomputed word index, byte offset or absolute address. Leave the check after your code in place;
it loads through the address you calculated and prints the stored colour as a decimal number. That
output checks the store-and-load pair; the Screen shows whether you chose the requested pixel.

```mips|playground|open-screen|memory|console|exercise
# @screen unit=16 width=256 height=256 base=display
.eqv COLUMNS 16
.data
display: .space 1024

.text
.globl main
main:
    li $t0, 5                   # x
    li $t1, 3                   # y
    # Set $t2 to the pixel address and store 0x00FFFFFF there.
    # your code here

    lw $a0, 0($t2)              # exercise check
    li $v0, 1
    syscall
    li $v0, 10
    syscall
```

```testcase
{ "expectedOutput": "16777215" }
```

<details>
<summary>Show solution</summary>

```mips|playground|open-screen|memory|console|solution
# @screen unit=16 width=256 height=256 base=display
.eqv COLUMNS 16
.data
display: .space 1024

.text
.globl main
main:
    li $t0, 5                   # x
    li $t1, 3                   # y
    sll $t2, $t1, 4             # y * 16 columns
    add $t2, $t2, $t0           # y * columns + x
    sll $t2, $t2, 2             # four bytes per word
    la $t3, display
    add $t2, $t2, $t3           # framebuffer base + byte offset
    li $t4, 0x00FFFFFF
    sw $t4, 0($t2)

    lw $a0, 0($t2)              # exercise check
    li $v0, 1
    syscall
    li $v0, 10
    syscall
```

</details>

For the second exercise, print exactly `Hi` followed by a newline by storing each character in the
MMIO transmitter data register. Do not use syscall service 4 or 11. The automated check can compare
the exact console text, but output alone cannot prove which route produced it; checking that the
stores use `0xffff000c` is part of the exercise.

```mips|playground|console|exercise
.text
.globl main
main:
    # your code here
```

```testcase
{ "expectedOutput": "Hi\n" }
```

<details>
<summary>Show solution</summary>

```mips|playground|console|solution
.eqv TRANSMITTER_DATA 0xffff000c

.text
.globl main
main:
    li $s0, TRANSMITTER_DATA
    li $t0, 'H'
    sw $t0, 0($s0)
    li $t0, 'i'
    sw $t0, 0($s0)
    li $t0, '\n'
    sw $t0, 0($s0)
    li $v0, 10
    syscall
```

</details>
