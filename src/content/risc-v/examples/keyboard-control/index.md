A square you steer. The `w`, `a`, `s` and `d` keys set which way it is going and it keeps going that
way on its own, coming back in at the opposite edge when it leaves the grid. **Click the Screen panel
first**: the screen only gets the keyboard when it has the focus, and a ring around it says so while
it does.

A bouncing ball drew a picture that changed on its own. This one asks the keyboard, once per frame,
whether anything has been typed, and the answer changes what every frame after it will look like.

**You need to know:** the "A bouncing ball" Example and the "The bitmap display and the keyboard
registers" lecture. What is new here is the two receiver registers at `0xffff0000`, one whose bit 0
says a character is waiting and one that hands it over.

```riscv|playground|open-screen|no-registers|allow-open
# @screen unit=8 width=256 height=256 base=display
.eqv MMIO, 0xffff0000
.eqv SIDE, 32               # words across and down
.eqv BOX, 3                 # the square, in words
.eqv LAST, 29               # SIDE - BOX, the largest x or y
.eqv FRAME, 80              # milliseconds per frame
.eqv BACKGROUND, 0x00101820
.eqv BOXCOLOUR, 0x0000C060

.data
display: .space 4096        # SIDE * SIDE words, four bytes each

.text
.globl main

# fill_rect(x, y, w, h): the grid is in s0 and the colour in s1
fill_rect:
    mv t0, a1               # row = y
    add t1, a1, a3          # one past the last row
rect_rows:
    slli t2, t0, 5          # row * SIDE
    add t2, t2, a0          # + x
    slli t2, t2, 2          # four bytes per word
    add t2, t2, s0
    mv t3, a2
rect_cols:
    sw s1, 0(t2)
    addi t2, t2, 4
    addi t3, t3, -1
    bnez t3, rect_cols
    addi t0, t0, 1
    blt t0, t1, rect_rows
    ret

main:
    la s0, display
    li s6, MMIO
    li s7, LAST             # the edge, and the four keys, in registers
    li s8, 'a'              # because a branch compares two registers
    li s9, 'd'
    li s10, 'w'
    li s11, 's'

    li s1, BACKGROUND       # paint the grid once
    li a0, 0
    li a1, 0
    li a2, SIDE
    li a3, SIDE
    jal fill_rect

    li s2, 14               # x
    li s3, 14               # y
    li s4, 1                # dx
    li s5, 0                # dy

frame:
    li s1, BACKGROUND       # erase the square where it was
    mv a0, s2
    mv a1, s3
    li a2, BOX
    li a3, BOX
    jal fill_rect

# --- one key sets the direction, it does not move the square -----------------
    lw t4, 0(s6)            # the receiver control register
    andi t4, t4, 1          # the Ready bit
    beqz t4, no_key
    lw t5, 4(s6)            # the receiver data, which takes the character
    andi t5, t5, 0xFF
    bne t5, s8, not_a
    li s4, -1
    li s5, 0
not_a:
    bne t5, s9, not_d
    li s4, 1
    li s5, 0
not_d:
    bne t5, s10, not_w
    li s4, 0
    li s5, -1
not_w:
    bne t5, s11, no_key
    li s4, 0
    li s5, 1
no_key:

# --- and the square moves on its own, coming back in at the far edge ---------
    add s2, s2, s4
    ble s2, s7, x_low
    li s2, 0                # off the right edge, back at the left
x_low:
    bgez s2, x_done
    li s2, LAST             # off the left edge, back at the right
x_done:
    add s3, s3, s5
    ble s3, s7, y_low
    li s3, 0
y_low:
    bgez s3, y_done
    li s3, LAST
y_done:

    li s1, BOXCOLOUR        # and draw it where it is now
    mv a0, s2
    mv a1, s3
    li a2, BOX
    li a3, BOX
    jal fill_rect

    li a7, 32               # a frame of program time
    li a0, FRAME
    ecall
    j frame
```

```testcase
{ "runFor": 100000 }
```

`lw t4, 0(s6)` reads the **receiver control** register and `andi t4, t4, 1` keeps its Ready bit,
which is 1 when a character is waiting. `lw t5, 4(s6)` reads the **receiver data** register, whose
low byte is that character, and reading it takes the character out of the queue and makes room for
the next one. Neither of those is memory: `sw` and `lw` are how you talk to a device on this machine,
and the address is what says which one.

Polling once a frame is enough, because what is not read stays in the queue. Ready means "the queue
is not empty", so a key pressed between two polls is still waiting at the next one and nothing is
lost.

The four key codes are loaded into `s8` to `s11` before the loop and never touched again. MIPS writes
`bne $t5, 'a', not_a` and lets its assembler put the 97 into `$at` for you, one hidden instruction per
key per frame; RISC-V has no such register, so a branch against a character is a `li` you write, and
the place for it is outside the loop.

The M68K asks a different question. Its task 19 takes four key codes and answers with which of them
are held **down at this instant**, so a program there can tell that a key is still being held and that
another was let go. The receiver here has no such notion: it hands over characters that were typed,
one at a time, with no key code, no key up and no way to ask what is down now. That is why this
program is written around a direction that persists, and why it takes `w`, `a`, `s` and `d` and not
the arrow keys, which send nothing a receiver can carry.

The keys do not move the square, they write `s4` and `s5`, and the code under them moves it. That
separation is what makes the square keep going after you let go of the key, and it is how anything
that moves in a game is written: the input decides the velocity, the frame applies it.

Setting the other step to 0 next to each direction is what keeps the movement to four directions.
Take the four `li s5, 0` and `li s4, 0` lines out and pressing `d` and then `w` leaves both steps set,
and the square goes diagonally.

One frame is about 154 instructions, so the `runFor` of 100000 is around six hundred and fifty of
them. A testcase cannot type into the receiver, so the keys are yours to try by hand.

Try changing `li s2, 0` under `ble s2, s7, x_low` to `li s2, LAST`. The square stops against the right
edge instead of coming back in at the left, which is the same two instructions doing clamping instead
of wrapping.
