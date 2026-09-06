# The memory-mapped keyboard and display, MARS's keyboard and display simulator.
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
# waiting for a key. MARS itself has no such limit and spins instead.
#
# Screen configuration (the Display button in the screen panel's header):
#   unit width 8, unit height 8, display 512 by 256, base address 0x10010000 (static data),
#   which is a 64 by 32 grid of words.

        .eqv    MMIO, 0xffff0000
        .eqv    READY, 1
        .eqv    FORM_FEED, 12
        .eqv    CELLS, 2048                     # 64 * 32

        .data
display:.space  8192                            # CELLS * 4
banner: .asciiz "Type on the screen panel. c clears this console, q quits.\n"

        .text
main:
        li      $v0, 4
        la      $a0, banner
        syscall

        la      $s0, display
        li      $s1, 0                          # the next cell to paint
        li      $s2, MMIO

poll:
        lw      $t0, 0($s2)                     # receiver control
        andi    $t0, $t0, READY
        bnez    $t0, take
        li      $v0, 32                         # nothing typed yet. Sleeping instead of spinning
        li      $a0, 10                         # costs no instructions, so the editor's execution
        syscall                                 # limit never ends a program that is only waiting
        j       poll

take:

        lw      $t1, 4($s2)                     # receiver data dequeues one character
        andi    $t1, $t1, 0xff

        sw      $t1, 12($s2)                    # echo it through the transmitter

        li      $t2, 'q'
        beq     $t1, $t2, quit
        li      $t2, 'c'
        bne     $t1, $t2, paint
        li      $t3, FORM_FEED                  # a form feed clears the console
        sw      $t3, 12($s2)
        j       poll

paint:
        sll     $t4, $t1, 17                    # a color that changes with the character
        sll     $t5, $t1, 9
        or      $t4, $t4, $t5
        or      $t4, $t4, $t1
        sll     $t6, $s1, 2
        add     $t6, $t6, $s0
        sw      $t4, 0($t6)
        addi    $s1, $s1, 1
        blt     $s1, CELLS, poll
        li      $s1, 0
        j       poll

quit:
        li      $v0, 10
        syscall
