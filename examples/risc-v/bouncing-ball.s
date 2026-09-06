# A ball bouncing on the bitmap display, paced by the sleep syscall.
#
# Screen configuration (the Display button in the screen panel's header):
#   unit width 4, unit height 4, display 512 by 512, base address 0x10010000 (static data),
#   which is a 128 by 128 grid of words, 64 KB of static data.
#
# Every frame the program erases the ball, moves it, draws it again and sleeps for one frame
# (ecall 32). It prints the elapsed program time (ecall 30) every 64 frames, which starts at zero
# for the run and, in a testcase, only advances through the sleeps. It runs until you Stop it.

        .eqv    SIDE, 128                       # words per row and per column
        .eqv    BALL, 6                         # the ball's side, in words
        .eqv    FRAME_MS, 16
        .eqv    BACKGROUND, 0x00101820
        .eqv    BALL_COLOR, 0x00ffcc33

        .data
display:.space  65536                           # SIDE * SIDE * 4
elapsed:.asciz  "ms of program time: "
newline:.asciz  "\n"

        .text
main:
        la      s0, display
        li      t0, BACKGROUND                  # paint the whole grid once
        li      t1, 0
        li      t2, 16384
fill:   slli    t3, t1, 2
        add     t3, t3, s0
        sw      t0, 0(t3)
        addi    t1, t1, 1
        blt     t1, t2, fill

        li      s1, 20                          # x
        li      s2, 30                          # y
        li      s3, 1                           # dx
        li      s4, 1                           # dy
        li      s5, 0                           # frame counter
        li      s6, 122                         # SIDE - BALL

frame:
        li      a2, BACKGROUND                  # erase where the ball was
        jal     ra, draw_ball

        add     s1, s1, s3                      # move and bounce off the edges
        add     s2, s2, s4
        blez    s1, flip_x
        blt     s1, s6, keep_x
flip_x: sub     s3, zero, s3
        add     s1, s1, s3
        add     s1, s1, s3
keep_x:
        blez    s2, flip_y
        blt     s2, s6, keep_y
flip_y: sub     s4, zero, s4
        add     s2, s2, s4
        add     s2, s2, s4
keep_y:

        li      a2, BALL_COLOR                  # draw it where it is now
        jal     ra, draw_ball

        li      a7, 32                          # sleep one frame
        li      a0, FRAME_MS
        ecall

        addi    s5, s5, 1
        andi    t0, s5, 63
        bnez    t0, frame

        li      a7, 30                          # program time, low word in a0
        ecall
        mv      s8, a0
        li      a7, 4
        la      a0, elapsed
        ecall
        li      a7, 1
        mv      a0, s8
        ecall
        li      a7, 4
        la      a0, newline
        ecall
        j       frame

# Fills the BALL by BALL square at (s1, s2) with the color in a2.
draw_ball:
        li      t3, 0                           # row
        li      t0, BALL
ball_row:
        add     t4, s2, t3
        slli    t4, t4, 9                       # SIDE * 4 bytes per row
        add     t4, t4, s0
        slli    t5, s1, 2
        add     t4, t4, t5
        li      t6, 0                           # column
ball_pixel:
        slli    a3, t6, 2
        add     a3, t4, a3
        sw      a2, 0(a3)
        addi    t6, t6, 1
        blt     t6, t0, ball_pixel
        addi    t3, t3, 1
        blt     t3, t0, ball_row
        ret
