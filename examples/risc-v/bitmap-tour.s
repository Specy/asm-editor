# Bitmap display tour: one word of memory is one pixel, its low 24 bits the color.
#
# Screen configuration (the Display button in the screen panel's header):
#   unit width 1, unit height 1, display 256 by 256, base address 0x10010000 (static data),
#   which is a 256 by 256 grid of words, 256 KB of static data.
#
# The program paints a red/green ramp over the whole grid, puts a blue square in the middle and
# draws a white line along the top and bottom rows, then stops. Nothing is animated: it is the
# picture the manual verification matrix compares against RARS's own bitmap display.

        .data
display:.space  262144                  # 256 * 256 * 4

        .text
main:
        la      s0, display
        li      s7, 256                 # the grid is square, so one bound serves both loops

        li      s1, 0                   # y
ramp_row:
        li      s2, 0                   # x
        slli    t4, s1, 10              # the row's first word, 256 pixels * 4 bytes
        add     t4, t4, s0
ramp_pixel:
        slli    t0, s2, 16              # red from x
        slli    t1, s1, 8               # green from y
        or      t0, t0, t1
        slli    t3, s2, 2
        add     t3, t3, t4
        sw      t0, 0(t3)
        addi    s2, s2, 1
        blt     s2, s7, ramp_pixel
        addi    s1, s1, 1
        blt     s1, s7, ramp_row

        li      t5, 0x000000ff          # a solid blue square in the middle
        li      s3, 160
        li      s1, 96
square_row:
        li      s2, 96
        slli    t4, s1, 10
        add     t4, t4, s0
square_pixel:
        slli    t3, s2, 2
        add     t3, t3, t4
        sw      t5, 0(t3)
        addi    s2, s2, 1
        blt     s2, s3, square_pixel
        addi    s1, s1, 1
        blt     s1, s3, square_row

        li      t5, 0x00ffffff          # a white line along the first and last rows
        li      t6, 261120              # (256 - 1) * 256 * 4
        li      s2, 0
border:
        slli    t3, s2, 2
        add     t3, t3, s0
        sw      t5, 0(t3)
        add     t3, t3, t6
        sw      t5, 0(t3)
        addi    s2, s2, 1
        blt     s2, s7, border

        li      a7, 10
        ecall
