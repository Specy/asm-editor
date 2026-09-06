# A ball bouncing on the bitmap display, paced by the sleep syscall.
#
# Screen configuration (the Display button in the screen panel's header):
#   unit width 4, unit height 4, display 512 by 512, base address 0x10010000 (static data),
#   which is a 128 by 128 grid of words, 64 KB of static data.
#
# Every frame the program erases the ball, moves it, draws it again and sleeps for one frame
# (syscall 32). It prints the elapsed program time (syscall 30) every 64 frames, which starts at
# zero for the run and, in a testcase, only advances through the sleeps. It runs until you Stop it.

        .eqv    SIDE, 128                       # words per row and per column
        .eqv    ROW_BYTES, 512                  # SIDE * 4
        .eqv    BALL, 6                          # the ball's side, in words
        .eqv    FRAME_MS, 16
        .eqv    BACKGROUND, 0x00101820
        .eqv    BALL_COLOR, 0x00ffcc33

        .data
display:.space  65536                            # SIDE * SIDE * 4
elapsed:.asciiz "ms of program time: "
newline:.asciiz "\n"

        .text
main:
        la      $s0, display
        li      $t0, BACKGROUND                  # paint the whole grid once
        li      $t1, 0
fill:   sll     $t2, $t1, 2
        add     $t2, $t2, $s0
        sw      $t0, 0($t2)
        addi    $t1, $t1, 1
        blt     $t1, 16384, fill

        li      $s1, 20                          # x
        li      $s2, 30                          # y
        li      $s3, 1                           # dx
        li      $s4, 1                           # dy
        li      $s5, 0                           # frame counter

frame:
        li      $a2, BACKGROUND                  # erase where the ball was
        jal     draw_ball

        add     $s1, $s1, $s3                    # move and bounce off the edges
        add     $s2, $s2, $s4
        blez    $s1, flip_x
        li      $t0, 122                         # SIDE - BALL
        blt     $s1, $t0, keep_x
flip_x: sub     $s3, $zero, $s3
        add     $s1, $s1, $s3
        add     $s1, $s1, $s3
keep_x:
        blez    $s2, flip_y
        li      $t0, 122                         # SIDE - BALL
        blt     $s2, $t0, keep_y
flip_y: sub     $s4, $zero, $s4
        add     $s2, $s2, $s4
        add     $s2, $s2, $s4
keep_y:

        li      $a2, BALL_COLOR                  # draw it where it is now
        jal     draw_ball

        li      $v0, 32                          # sleep one frame
        li      $a0, FRAME_MS
        syscall

        addi    $s5, $s5, 1
        andi    $t0, $s5, 63
        bnez    $t0, frame

        li      $v0, 30                          # program time, low word in $a0
        syscall
        move    $t9, $a0
        li      $v0, 4
        la      $a0, elapsed
        syscall
        li      $v0, 1
        move    $a0, $t9
        syscall
        li      $v0, 4
        la      $a0, newline
        syscall
        j       frame

# Fills the BALL by BALL square at ($s1, $s2) with the color in $a2.
draw_ball:
        li      $t3, 0                           # row
ball_row:
        add     $t4, $s2, $t3
        mul     $t4, $t4, ROW_BYTES
        add     $t4, $t4, $s0
        sll     $t5, $s1, 2
        add     $t4, $t4, $t5
        li      $t6, 0                           # column
ball_pixel:
        sll     $t7, $t6, 2
        add     $t8, $t4, $t7
        sw      $a2, 0($t8)
        addi    $t6, $t6, 1
        blt     $t6, BALL, ball_pixel
        addi    $t3, $t3, 1
        blt     $t3, BALL, ball_row
        jr      $ra
