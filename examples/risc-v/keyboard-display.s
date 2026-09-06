# The memory-mapped keyboard and display, RARS's keyboard and display simulator.
#
#   0xffff0000  receiver control      bit 0 Ready: a character is waiting
#   0xffff0004  receiver data         the character, in the low byte
#   0xffff0008  transmitter control   bit 0 Ready: the display will take a character (always set)
#   0xffff000c  transmitter data      store a character here to print it
#
# Click the screen panel to give the program the keyboard, then type. Every key is echoed through
# the transmitter, so it appears in the console, and paints one word of the bitmap display in a
# color made from its character code. Typing "c" clears the console with a form feed (ASCII 12)
# and "q" ends the program. The poll loop sleeps for ten milliseconds when nothing is waiting:
# a wait costs no instructions, so the editor's execution limit never ends a program that is only
# waiting for a key. RARS itself has no such limit and spins instead.
#
# @screen unit=8 width=512 height=256 base=display
#
# That comment configures the screen, and every Build reads it: one word drawn eight pixels square,
# a 512 by 256 display area and the grid starting wherever the `display` label ends up, which makes
# a 64 by 32 grid of words. RARS reads the line as the ordinary comment it is, and you set the same
# five values in its keyboard and display windows by hand.

        .eqv    MMIO, 0xffff0000
        .eqv    READY, 1
        .eqv    FORM_FEED, 12
        .eqv    CELLS, 2048                     # 64 * 32

        .data
display:.space  8192                            # CELLS * 4
banner: .asciz  "Type on the screen panel. c clears this console, q quits.\n"

        .text
main:
        li      a7, 4
        la      a0, banner
        ecall

        la      s0, display
        li      s1, 0                           # the next cell to paint
        li      s2, MMIO
        li      s3, CELLS
        li      s4, 'q'
        li      s5, 'c'

poll:
        lw      t0, 0(s2)                       # receiver control
        andi    t0, t0, READY
        bnez    t0, take
        li      a7, 32                          # nothing typed yet. Sleeping instead of spinning
        li      a0, 10                          # costs no instructions, so the editor's execution
        ecall                                   # limit never ends a program that is only waiting
        j       poll

take:

        lw      t1, 4(s2)                       # receiver data dequeues one character
        andi    t1, t1, 0xff

        sw      t1, 12(s2)                      # echo it through the transmitter

        beq     t1, s4, quit
        bne     t1, s5, paint
        li      t3, FORM_FEED                   # a form feed clears the console
        sw      t3, 12(s2)
        j       poll

paint:
        slli    t4, t1, 17                      # a color that changes with the character
        slli    t5, t1, 9
        or      t4, t4, t5
        or      t4, t4, t1
        slli    t6, s1, 2
        add     t6, t6, s0
        sw      t4, 0(t6)
        addi    s1, s1, 1
        blt     s1, s3, poll
        li      s1, 0
        j       poll

quit:
        li      a7, 10
        ecall
