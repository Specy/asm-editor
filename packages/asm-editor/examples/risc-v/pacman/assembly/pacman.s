# Pac-Man himself. He moves one pixel at a time, as many pixels a frame as his speed allows, and
# keeps going until a wall stops him. The player's last direction is remembered and taken at the
# first opening, so a key can be pressed before the turn.
#
# Like the arcade, he may turn a few pixels before or after a tile's centre: he then moves
# diagonally, along the new direction and back onto the centre line at once, which is why he
# corners faster than the ghosts.

        .text
# reset_pacman: at his start, facing left.
reset_pacman:
        la      t0, pac_x
        li      t1, PAC_START_X
        sw      t1, 0(t0)
        la      t0, pac_y
        li      t1, PAC_START_Y
        sw      t1, 0(t0)
        li      t1, LEFT
        la      t0, pac_dir
        sw      t1, 0(t0)
        la      t0, pac_want
        sw      t1, 0(t0)
        la      t0, pac_acc
        sw      zero, 0(t0)
        la      t0, pac_stall
        sw      zero, 0(t0)
        la      t0, pac_anim
        sw      zero, 0(t0)
        ret

# update_pacman: one frame of Pac-Man.
update_pacman:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        la      t0, pac_stall                   # he stops for a frame after each dot
        lw      t1, 0(t0)
        beqz    t1, up_move
        addi    t1, t1, -1
        sw      t1, 0(t0)
        j       up_done
up_move:
        la      t0, level_ptr
        lw      t0, 0(t0)
        lw      s0, LV_PAC_SPEED(t0)
        la      t1, fright_timer
        lw      t1, 0(t1)
        beqz    t1, up_speed
        lw      s0, LV_FRIGHT_PAC_SPEED(t0)
up_speed:
        la      t0, pac_acc                     # whole pixels this frame, the rest carried
        lw      t1, 0(t0)
        add     t1, t1, s0
        srli    s1, t1, 8
        andi    t1, t1, 255
        sw      t1, 0(t0)
up_step:
        beqz    s1, up_done
        jal     pac_step
        jal     pac_eat
        la      t0, game_state                  # the last dot ends the level
        lw      t0, 0(t0)
        li      t1, ST_PLAY
        bne     t0, t1, up_done
        addi    s1, s1, -1
        j       up_step
up_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# pac_step: one pixel of movement.
pac_step:
        addi    sp, sp, -48
        sw      ra, 44(sp)
        sw      s0, 40(sp)
        sw      s1, 36(sp)
        sw      s2, 32(sp)
        sw      s3, 28(sp)
        sw      s4, 24(sp)
        sw      s5, 20(sp)
        sw      s6, 16(sp)
        sw      s7, 12(sp)
        sw      s8, 8(sp)
        la      t0, pac_x
        lw      s0, 0(t0)                       # x
        la      t0, pac_y
        lw      s1, 0(t0)                       # y
        la      t0, pac_dir
        lw      s2, 0(t0)                       # direction
        la      t0, pac_want
        lw      s3, 0(t0)                       # the direction asked for
        srai    s4, s0, 3                       # his tile
        srai    s5, s1, 3

        beq     s3, s2, ps_move
        xori    t0, s2, 1
        beq     s3, t0, ps_turn                 # turning back is always allowed
        slli    t0, s3, 2                       # a side turn needs an open tile that way
        la      t1, dir_dx
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     a0, s4, t1
        la      t1, dir_dy
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     a1, s5, t1
        jal     is_open
        beqz    a0, ps_move
ps_turn:
        mv      s2, s3
ps_move:
        slli    t0, s2, 2
        la      t1, dir_dx
        add     t1, t1, t0
        lw      s6, 0(t1)                       # dx
        la      t1, dir_dy
        add     t1, t1, t0
        lw      s7, 0(t1)                       # dy
        li      s8, 0                           # 1 once he has moved
        beqz    s6, ps_vertical

        slli    t0, s4, 3                       # along a row
        addi    t0, t0, 3                       # the tile's centre column
        bne     s0, t0, ps_h_go                 # off centre: on to it, or on past it
        add     a0, s4, s6
        mv      a1, s5
        jal     is_open
        beqz    a0, ps_h_line                   # a wall ahead: he stays on the centre
ps_h_go:
        add     s0, s0, s6
        li      s8, 1
ps_h_line:
        slli    t0, s5, 3                       # back onto the row's centre line
        addi    t0, t0, 3
        beq     s1, t0, ps_wrap
        li      s8, 1
        blt     s1, t0, ps_h_down
        addi    s1, s1, -1
        j       ps_wrap
ps_h_down:
        addi    s1, s1, 1
        j       ps_wrap

ps_vertical:
        slli    t0, s5, 3                       # along a column
        addi    t0, t0, 3
        bne     s1, t0, ps_v_go
        mv      a0, s4
        add     a1, s5, s7
        jal     is_open
        beqz    a0, ps_v_line
ps_v_go:
        add     s1, s1, s7
        li      s8, 1
ps_v_line:
        slli    t0, s4, 3
        addi    t0, t0, 3
        beq     s0, t0, ps_wrap
        li      s8, 1
        blt     s0, t0, ps_v_right
        addi    s0, s0, -1
        j       ps_wrap
ps_v_right:
        addi    s0, s0, 1

ps_wrap:
        li      t0, -8                          # out of one side of the tunnel, in at the other
        bge     s0, t0, ps_wrap_right
        addi    s0, s0, 240
ps_wrap_right:
        li      t0, 231
        ble     s0, t0, ps_store
        addi    s0, s0, -240
ps_store:
        la      t0, pac_x
        sw      s0, 0(t0)
        la      t0, pac_y
        sw      s1, 0(t0)
        la      t0, pac_dir
        sw      s2, 0(t0)
        beqz    s8, ps_done
        la      t0, pac_anim
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
ps_done:
        lw      ra, 44(sp)
        lw      s0, 40(sp)
        lw      s1, 36(sp)
        lw      s2, 32(sp)
        lw      s3, 28(sp)
        lw      s4, 24(sp)
        lw      s5, 20(sp)
        lw      s6, 16(sp)
        lw      s7, 12(sp)
        lw      s8, 8(sp)
        addi    sp, sp, 48
        ret

# pac_eat: whatever is on Pac-Man's tile: a dot, an energizer, the fruit.
pac_eat:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        la      t0, pac_x
        lw      s0, 0(t0)
        srai    s0, s0, 3
        la      t0, pac_y
        lw      s1, 0(t0)
        srai    s1, s1, 3
        mv      a0, s0
        mv      a1, s1
        jal     tile_at
        li      t0, '.'
        beq     a0, t0, pe_dot
        li      t0, 'o'
        beq     a0, t0, pe_energizer
        j       pe_fruit
pe_dot:
        li      t0, 1
        la      t1, pac_stall
        sw      t0, 0(t1)
        li      a0, 10
        jal     add_score
        j       pe_eaten
pe_energizer:
        li      t0, 3
        la      t1, pac_stall
        sw      t0, 0(t1)
        li      a0, 50
        jal     add_score
        jal     energize
pe_eaten:
        mv      a0, s0
        mv      a1, s1
        jal     eat_tile
        jal     dot_eaten
        j       pe_done
pe_fruit:
        la      t0, fruit_timer
        lw      t1, 0(t0)
        beqz    t1, pe_done
        li      t1, 20                          # the fruit sits on tiles 13 and 14 of row 20
        bne     s1, t1, pe_done
        li      t1, 13
        blt     s0, t1, pe_done
        li      t1, 14
        bgt     s0, t1, pe_done
        sw      zero, 0(t0)
        li      t1, 120                         # its points show for two seconds
        la      t0, fruit_score_timer
        sw      t1, 0(t0)
        la      t0, level_ptr
        lw      t0, 0(t0)
        lw      a0, LV_FRUIT_POINTS(t0)
        jal     add_score
pe_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# dot_eaten: the counting that follows every dot and energizer.
dot_eaten:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, dots_left
        lw      t1, 0(t0)
        addi    t1, t1, -1
        sw      t1, 0(t0)
        la      t0, dots_eaten
        lw      t2, 0(t0)
        addi    t2, t2, 1
        sw      t2, 0(t0)
        la      t0, dot_timer
        sw      zero, 0(t0)

        li      t3, 70                          # the fruit comes at 70 and 170 dots
        beq     t2, t3, dte_fruit
        li      t3, 170
        bne     t2, t3, dte_counters
dte_fruit:
        li      t3, 570                         # for nine and a half seconds
        la      t0, fruit_timer
        sw      t3, 0(t0)
dte_counters:
        la      t0, global_mode                 # the ghost house's dot counters
        lw      t0, 0(t0)
        beqz    t0, dte_personal
        la      t0, global_dots
        lw      t3, 0(t0)
        addi    t3, t3, 1
        sw      t3, 0(t0)
        j       dte_cleared
dte_personal:
        jal     waiting_ghost
        beqz    a0, dte_cleared
        lw      t3, G_DOTS(a0)
        addi    t3, t3, 1
        sw      t3, G_DOTS(a0)
dte_cleared:
        la      t0, dots_left
        lw      t0, 0(t0)
        bnez    t0, dte_done
        li      a0, ST_LEVEL_DONE
        jal     enter_state
dte_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# pacman_frame: the cell of sprites.bmp for Pac-Man now. His mouth goes half open, open, half
# open, shut as he moves, and stays as it was while he stands still.
pacman_frame:
        la      t0, pac_anim
        lw      t0, 0(t0)
        srli    t0, t0, 1
        andi    t0, t0, 3
        li      a0, 0                           # shut
        li      t1, 3
        beq     t0, t1, pf_cell
        la      t1, pac_dir
        lw      t1, 0(t1)
        slli    t1, t1, 1
        addi    a0, t1, 1                       # half open
        li      t1, 1
        bne     t0, t1, pf_cell
        addi    a0, a0, 1                       # open
pf_cell:
        li      a1, 0
        j       sheet_cell
