# The four ghosts, after the arcade as The Pac-Man Dossier describes it. At every tile centre a
# ghost picks the open direction, never straight back, whose next tile is nearest its target
# tile, trying up, left, down, right in that order on a tie. Only the targets differ:
#
#   Blinky (red)     Pac-Man's own tile.
#   Pinky (pink)     four tiles ahead of Pac-Man; when he faces up, also four to the left, as the
#                    arcade's arithmetic overflow made it.
#   Inky (cyan)      the tile two ahead of Pac-Man (and two left when he faces up), doubled away
#                    from Blinky.
#   Clyde (orange)   Pac-Man's tile while more than eight tiles away, else his own corner.
#
# In scatter mode each heads for its corner instead; frightened, they turn at random. Modes change
# on a timetable, and every change turns the ghosts around.

        .text
# reset_ghosts: each ghost at its start, not frightened. Their dot counters are kept.
reset_ghosts:
        la      t0, ghosts
        la      t1, ghost_start
        li      t2, GHOST_COUNT
rsg_loop:
        lw      t3, 0(t1)
        sw      t3, G_X(t0)
        lw      t3, 4(t1)
        sw      t3, G_Y(t0)
        lw      t3, 8(t1)
        sw      t3, G_DIR(t0)
        lw      t3, 12(t1)
        sw      t3, G_STATE(t0)
        lw      t3, 16(t1)
        sw      t3, G_HOME_X(t0)
        lw      t3, 20(t1)
        sw      t3, G_SCATTER_X(t0)
        lw      t3, 24(t1)
        sw      t3, G_SCATTER_Y(t0)
        lw      t3, 28(t1)
        sw      t3, G_SHEET_ROW(t0)
        sw      zero, G_FRIGHT(t0)
        sw      zero, G_ACC(t0)
        addi    t0, t0, G_SIZE
        addi    t1, t1, 32
        addi    t2, t2, -1
        bnez    t2, rsg_loop
        ret

# clear_ghost_counters: a new level's dot counters.
clear_ghost_counters:
        la      t0, ghosts
        li      t1, GHOST_COUNT
cgc_loop:
        sw      zero, G_DOTS(t0)
        addi    t0, t0, G_SIZE
        addi    t1, t1, -1
        bnez    t1, cgc_loop
        ret

# waiting_ghost: the ghost next in line to leave the house, Pinky, then Inky, then Clyde.
# Returns its record in a0 and its number in a1, or a0 = 0 when the house is empty.
waiting_ghost:
        la      a0, ghosts
        addi    a0, a0, G_SIZE
        li      a1, 1
wg_loop:
        lw      t0, G_STATE(a0)
        li      t1, GS_HOUSE
        beq     t0, t1, wg_found
        addi    a0, a0, G_SIZE
        addi    a1, a1, 1
        li      t0, GHOST_COUNT
        blt     a1, t0, wg_loop
        li      a0, 0
wg_found:
        ret

# release_ghosts: lets the waiting ghost out when its dot counter says so, or when Pac-Man has
# gone four seconds (three from level 5) without eating. After a death one shared counter
# releases Pinky at 7 dots and Inky at 17; Clyde still in the house at 32 switches it off.
release_ghosts:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        jal     waiting_ghost
        beqz    a0, rel_done
        mv      s0, a0
        mv      s1, a1
        la      t0, dot_timer
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
        la      t2, level
        lw      t2, 0(t2)
        li      t3, 240
        li      t4, 4
        ble     t2, t4, rel_timer
        li      t3, 180
rel_timer:
        blt     t1, t3, rel_counters
        sw      zero, 0(t0)
        j       rel_go
rel_counters:
        la      t0, global_mode
        lw      t0, 0(t0)
        beqz    t0, rel_personal
        la      t0, global_dots
        lw      t0, 0(t0)
        li      t1, 1
        bne     s1, t1, rel_global_inky
        li      t1, 7
        beq     t0, t1, rel_go
        j       rel_done
rel_global_inky:
        li      t1, 2
        bne     s1, t1, rel_global_clyde
        li      t1, 17
        beq     t0, t1, rel_go
        j       rel_done
rel_global_clyde:
        li      t1, 32
        bne     t0, t1, rel_done
        la      t0, global_mode
        sw      zero, 0(t0)
        j       rel_done
rel_personal:
        lw      t0, G_DOTS(s0)
        li      t1, 0                           # Pinky leaves at once
        la      t2, level_ptr
        lw      t2, 0(t2)
        li      t3, 2
        bne     s1, t3, rel_clyde
        lw      t1, LV_INKY_DOTS(t2)
        j       rel_check
rel_clyde:
        li      t3, 3
        bne     s1, t3, rel_check
        lw      t1, LV_CLYDE_DOTS(t2)
rel_check:
        blt     t0, t1, rel_done
rel_go:
        li      t0, GS_LEAVING
        sw      t0, G_STATE(s0)
rel_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# update_ghosts: one frame of each ghost.
update_ghosts:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        sw      s2, 0(sp)
        la      s0, ghosts
        li      s2, 0
ug_loop:
        mv      a0, s0
        mv      a1, s2
        jal     ghost_speed
        lw      t0, G_ACC(s0)
        add     t0, t0, a0
        srli    s1, t0, 8                       # whole pixels this frame
        andi    t0, t0, 255
        sw      t0, G_ACC(s0)
ug_step:
        beqz    s1, ug_next
        mv      a0, s0
        mv      a1, s2
        jal     ghost_step
        addi    s1, s1, -1
        j       ug_step
ug_next:
        addi    s0, s0, G_SIZE
        addi    s2, s2, 1
        li      t0, GHOST_COUNT
        blt     s2, t0, ug_loop
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        lw      s2, 0(sp)
        addi    sp, sp, 16
        ret

# ghost_speed(a0 = record, a1 = number): this frame's speed, in 1/256 pixel. Slow in the tunnel,
# slow and blue when frightened, and Blinky speeds up twice as the dots run out ("Cruise Elroy").
ghost_speed:
        lw      t0, G_STATE(a0)
        li      t1, GS_EYES
        beq     t0, t1, gsp_eyes
        li      t1, GS_ENTERING
        beq     t0, t1, gsp_eyes
        li      t1, GS_HOUSE
        beq     t0, t1, gsp_house
        li      t1, GS_LEAVING
        beq     t0, t1, gsp_leaving
        la      t2, level_ptr
        lw      t2, 0(t2)
        lw      t3, G_Y(a0)
        srai    t3, t3, 3
        li      t4, TUNNEL_ROW
        bne     t3, t4, gsp_open
        lw      t3, G_X(a0)
        srai    t3, t3, 3
        li      t4, 5
        ble     t3, t4, gsp_tunnel
        li      t4, 22
        bge     t3, t4, gsp_tunnel
gsp_open:
        lw      t3, G_FRIGHT(a0)
        bnez    t3, gsp_fright
        bnez    a1, gsp_normal
        la      t3, elroy_enabled
        lw      t3, 0(t3)
        beqz    t3, gsp_normal
        la      t3, dots_left
        lw      t3, 0(t3)
        lw      t4, LV_ELROY2_DOTS(t2)
        ble     t3, t4, gsp_elroy2
        lw      t4, LV_ELROY1_DOTS(t2)
        ble     t3, t4, gsp_elroy1
gsp_normal:
        lw      a0, LV_GHOST_SPEED(t2)
        ret
gsp_elroy1:
        lw      a0, LV_ELROY1_SPEED(t2)
        ret
gsp_elroy2:
        lw      a0, LV_ELROY2_SPEED(t2)
        ret
gsp_tunnel:
        lw      a0, LV_TUNNEL_SPEED(t2)
        ret
gsp_fright:
        lw      a0, LV_FRIGHT_GHOST_SPEED(t2)
        ret
gsp_eyes:
        li      a0, EYES_SPEED
        ret
gsp_house:
        li      a0, HOUSE_SPEED
        ret
gsp_leaving:
        li      a0, LEAVING_SPEED
        ret

# ghost_step(a0 = record, a1 = number): one pixel of a ghost.
ghost_step:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        mv      s0, a0
        mv      s1, a1
        lw      t0, G_STATE(s0)
        li      t1, GS_HOUSE
        beq     t0, t1, gst_house
        li      t1, GS_LEAVING
        beq     t0, t1, gst_leaving
        li      t1, GS_ENTERING
        beq     t0, t1, gst_entering

        lw      t2, G_X(s0)                     # in the maze: decide at each tile centre
        lw      t3, G_Y(s0)
        andi    t4, t2, 7
        li      t5, 3
        bne     t4, t5, gst_move
        andi    t4, t3, 7
        bne     t4, t5, gst_move
        mv      a0, s0
        mv      a1, s1
        jal     choose_direction
gst_move:
        lw      t0, G_DIR(s0)
        slli    t0, t0, 2
        la      t1, dir_dx
        add     t1, t1, t0
        lw      t1, 0(t1)
        la      t2, dir_dy
        add     t2, t2, t0
        lw      t2, 0(t2)
        lw      t3, G_X(s0)
        add     t3, t3, t1
        lw      t4, G_Y(s0)
        add     t4, t4, t2
        li      t5, -8                          # through the tunnel
        bge     t3, t5, gst_wrap_right
        addi    t3, t3, 240
gst_wrap_right:
        li      t5, 231
        ble     t3, t5, gst_moved
        addi    t3, t3, -240
gst_moved:
        sw      t3, G_X(s0)
        sw      t4, G_Y(s0)
        lw      t0, G_STATE(s0)                 # eyes above the door go in
        li      t1, GS_EYES
        bne     t0, t1, gst_done
        li      t1, HOUSE_DOOR_X
        bne     t3, t1, gst_done
        li      t1, HOUSE_DOOR_Y
        bne     t4, t1, gst_done
        li      t1, GS_ENTERING
        sw      t1, G_STATE(s0)
        li      t1, DOWN
        sw      t1, G_DIR(s0)
        j       gst_done

gst_house:                                      # bob up and down
        lw      t0, G_Y(s0)
        lw      t1, G_DIR(s0)
        li      t2, UP
        bne     t1, t2, gst_house_down
        addi    t0, t0, -1
        li      t2, HOUSE_TOP_Y
        bgt     t0, t2, gst_house_store
        li      t1, DOWN
        j       gst_house_store
gst_house_down:
        addi    t0, t0, 1
        li      t2, HOUSE_BOTTOM_Y
        blt     t0, t2, gst_house_store
        li      t1, UP
gst_house_store:
        sw      t0, G_Y(s0)
        sw      t1, G_DIR(s0)
        j       gst_done

gst_leaving:                                    # to the middle, across to the door, up and out
        lw      t0, G_X(s0)
        lw      t1, G_Y(s0)
        li      t2, HOUSE_DOOR_X
        beq     t0, t2, gst_leave_up
        li      t3, HOUSE_MID_Y
        beq     t1, t3, gst_leave_across
        li      t4, DOWN
        addi    t1, t1, 1
        blt     t1, t3, gst_leave_store
        bgt     t1, t3, gst_leave_back
        j       gst_leave_store
gst_leave_back:
        addi    t1, t1, -2
        li      t4, UP
        j       gst_leave_store
gst_leave_across:
        li      t4, RIGHT
        addi    t0, t0, 1
        blt     t0, t2, gst_leave_store
        beq     t0, t2, gst_leave_store
        addi    t0, t0, -2
        li      t4, LEFT
        j       gst_leave_store
gst_leave_up:
        addi    t1, t1, -1
        li      t4, UP
        li      t3, HOUSE_DOOR_Y
        bgt     t1, t3, gst_leave_store
        li      t4, LEFT                        # out: they always set off to the left
        li      t5, GS_ACTIVE
        sw      t5, G_STATE(s0)
        li      t5, 3                           # Clyde out again: Blinky's Elroy speed resumes
        bne     s1, t5, gst_leave_store
        la      t5, elroy_enabled
        li      t6, 1
        sw      t6, 0(t5)
gst_leave_store:
        sw      t0, G_X(s0)
        sw      t1, G_Y(s0)
        sw      t4, G_DIR(s0)
        j       gst_done

gst_entering:                                   # eyes: down into the house, across to home
        lw      t0, G_X(s0)
        lw      t1, G_Y(s0)
        lw      t4, G_DIR(s0)
        li      t2, HOUSE_MID_Y
        bge     t1, t2, gst_enter_across
        addi    t1, t1, 1
        li      t4, DOWN
        j       gst_enter_store
gst_enter_across:
        lw      t2, G_HOME_X(s0)
        beq     t0, t2, gst_revive
        li      t4, RIGHT
        addi    t0, t0, 1
        blt     t0, t2, gst_enter_store
        beq     t0, t2, gst_enter_store
        addi    t0, t0, -2
        li      t4, LEFT
        j       gst_enter_store
gst_revive:                                     # home: a ghost again, and straight back out
        li      t5, GS_LEAVING
        sw      t5, G_STATE(s0)
        sw      zero, G_FRIGHT(s0)
gst_enter_store:
        sw      t0, G_X(s0)
        sw      t1, G_Y(s0)
        sw      t4, G_DIR(s0)
gst_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# choose_direction(a0 = record, a1 = number): a ghost at a tile centre picks where to go next.
choose_direction:
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
        sw      s9, 4(sp)
        sw      s10, 0(sp)
        mv      s0, a0
        mv      s1, a1
        lw      t0, G_X(s0)
        srai    s2, t0, 3                       # its tile
        lw      t0, G_Y(s0)
        srai    s3, t0, 3
        lw      s4, G_DIR(s0)
        lw      t0, G_STATE(s0)
        li      t1, GS_EYES
        bne     t0, t1, cd_alive
        li      t1, 14                          # eyes beside the door turn to it
        bne     s3, t1, cd_eyes_target
        li      t1, 13
        beq     s2, t1, cd_go_right
        li      t1, 14
        beq     s2, t1, cd_go_left
cd_eyes_target:
        li      s5, 13
        li      s6, 14
        j       cd_pick
cd_go_right:
        li      s7, RIGHT
        j       cd_store
cd_go_left:
        li      s7, LEFT
        j       cd_store
cd_alive:
        lw      t0, G_FRIGHT(s0)
        bnez    t0, cd_random
        mv      a0, s0
        mv      a1, s1
        jal     ghost_target
        mv      s5, a0                          # target tile
        mv      s6, a1
cd_pick:
        li      s7, -1                          # the best direction so far
        li      s8, 0                           # its distance, squared
        li      s9, 0                           # place in choice_order
cd_try:
        la      t0, choice_order
        slli    t1, s9, 2
        add     t0, t0, t1
        lw      s10, 0(t0)
        xori    t0, s4, 1
        beq     s10, t0, cd_next                # never straight back
        slli    t0, s10, 2
        la      t1, dir_dx
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     a0, s2, t1
        la      t1, dir_dy
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     a1, s3, t1
        jal     is_open
        beqz    a0, cd_next
        li      t0, UP                          # no turning up just above the ghost house or
        bne     s10, t0, cd_distance            # Pac-Man's start, eyes excepted
        lw      t0, G_STATE(s0)
        li      t1, GS_EYES
        beq     t0, t1, cd_distance
        li      t0, 14
        beq     s3, t0, cd_red_row
        li      t0, 26
        bne     s3, t0, cd_distance
cd_red_row:
        li      t0, 12
        beq     s2, t0, cd_next
        li      t0, 15
        beq     s2, t0, cd_next
cd_distance:
        slli    t0, s10, 2
        la      t1, dir_dx
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     t1, t1, s2
        sub     t1, t1, s5
        la      t2, dir_dy
        add     t2, t2, t0
        lw      t2, 0(t2)
        add     t2, t2, s3
        sub     t2, t2, s6
        mul     t1, t1, t1
        mul     t2, t2, t2
        add     t1, t1, t2
        bltz    s7, cd_take
        bge     t1, s8, cd_next                 # a tie keeps the earlier direction
cd_take:
        mv      s7, s10
        mv      s8, t1
cd_next:
        addi    s9, s9, 1
        li      t0, 4
        blt     s9, t0, cd_try
        bgez    s7, cd_store
        xori    s7, s4, 1                       # a dead end: back the way it came
        j       cd_store

cd_random:                                      # frightened: a random way that is open
        jal     random
        andi    s9, a0, 3
        li      s8, 4
cd_random_try:
        la      t0, choice_order
        slli    t1, s9, 2
        add     t0, t0, t1
        lw      s10, 0(t0)
        xori    t0, s4, 1
        beq     s10, t0, cd_random_next
        slli    t0, s10, 2
        la      t1, dir_dx
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     a0, s2, t1
        la      t1, dir_dy
        add     t1, t1, t0
        lw      t1, 0(t1)
        add     a1, s3, t1
        jal     is_open
        beqz    a0, cd_random_next
        mv      s7, s10
        j       cd_store
cd_random_next:
        addi    s9, s9, 1
        andi    s9, s9, 3
        addi    s8, s8, -1
        bnez    s8, cd_random_try
        xori    s7, s4, 1

cd_store:
        sw      s7, G_DIR(s0)
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
        lw      s9, 4(sp)
        lw      s10, 0(sp)
        addi    sp, sp, 48
        ret

# ghost_target(a0 = record, a1 = number): the tile the ghost is heading for, in a0 and a1.
ghost_target:
        mv      t6, a0
        la      t0, mode_index
        lw      t0, 0(t0)
        andi    t0, t0, 1
        bnez    t0, gt_chase
        bnez    a1, gt_scatter
        la      t0, elroy_enabled               # Blinky as Elroy chases while the others scatter
        lw      t0, 0(t0)
        beqz    t0, gt_scatter
        la      t0, level_ptr
        lw      t0, 0(t0)
        lw      t0, LV_ELROY1_DOTS(t0)
        la      t1, dots_left
        lw      t1, 0(t1)
        ble     t1, t0, gt_chase
gt_scatter:
        lw      a0, G_SCATTER_X(t6)
        lw      a1, G_SCATTER_Y(t6)
        ret
gt_chase:
        la      t0, pac_x                       # Pac-Man's tile and direction
        lw      t2, 0(t0)
        srai    t2, t2, 3
        la      t0, pac_y
        lw      t3, 0(t0)
        srai    t3, t3, 3
        la      t0, pac_dir
        lw      t4, 0(t0)
        slli    t0, t4, 2
        la      t1, dir_dx
        add     t1, t1, t0
        lw      t5, 0(t1)                       # his dx
        la      t1, dir_dy
        add     t1, t1, t0
        lw      t1, 0(t1)                       # his dy
        li      t0, 1
        beq     a1, t0, gt_pinky
        li      t0, 2
        beq     a1, t0, gt_inky
        li      t0, 3
        beq     a1, t0, gt_clyde
        mv      a0, t2                          # Blinky
        mv      a1, t3
        ret
gt_pinky:
        slli    t5, t5, 2
        slli    t1, t1, 2
        add     a0, t2, t5
        add     a1, t3, t1
        li      t0, UP
        bne     t4, t0, gt_done
        addi    a0, a0, -4
gt_done:
        ret
gt_inky:
        slli    t5, t5, 1
        slli    t1, t1, 1
        add     a0, t2, t5
        add     a1, t3, t1
        li      t0, UP
        bne     t4, t0, gt_inky_pivot
        addi    a0, a0, -2
gt_inky_pivot:
        la      t0, ghosts                      # Blinky's tile, mirrored through the pivot
        lw      t2, G_X(t0)
        srai    t2, t2, 3
        lw      t3, G_Y(t0)
        srai    t3, t3, 3
        slli    a0, a0, 1
        sub     a0, a0, t2
        slli    a1, a1, 1
        sub     a1, a1, t3
        ret
gt_clyde:
        lw      t0, G_X(t6)
        srai    t0, t0, 3
        sub     t0, t0, t2
        mul     t0, t0, t0
        lw      t5, G_Y(t6)
        srai    t5, t5, 3
        sub     t5, t5, t3
        mul     t5, t5, t5
        add     t0, t0, t5
        li      t5, 64                          # eight tiles, squared
        blt     t0, t5, gt_scatter
        mv      a0, t2
        mv      a1, t3
        ret

# reverse_ghosts: every ghost in the maze turns around, as at every change of mode.
reverse_ghosts:
        la      t0, ghosts
        li      t1, GHOST_COUNT
rvg_loop:
        lw      t2, G_STATE(t0)
        li      t3, GS_ACTIVE
        bne     t2, t3, rvg_next
        lw      t2, G_DIR(t0)
        xori    t2, t2, 1
        sw      t2, G_DIR(t0)
rvg_next:
        addi    t0, t0, G_SIZE
        addi    t1, t1, -1
        bnez    t1, rvg_loop
        ret

# energize: Pac-Man ate an energizer. The ghosts turn around and, while the level still has a
# frightened time, turn blue: those in the house too, not the eyes.
energize:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, ghosts_eaten
        sw      zero, 0(t0)
        jal     reverse_ghosts
        la      t0, level_ptr
        lw      t0, 0(t0)
        lw      t1, LV_FRIGHT_FRAMES(t0)
        beqz    t1, en_done
        la      t0, fright_timer
        sw      t1, 0(t0)
        la      t0, ghosts
        li      t2, GHOST_COUNT
en_loop:
        lw      t3, G_STATE(t0)
        li      t4, GS_EYES
        beq     t3, t4, en_next
        li      t4, GS_ENTERING
        beq     t3, t4, en_next
        li      t4, 1
        sw      t4, G_FRIGHT(t0)
en_next:
        addi    t0, t0, G_SIZE
        addi    t2, t2, -1
        bnez    t2, en_loop
en_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# update_timers: frightened time, then the scatter and chase timetable, which stands still while
# the ghosts are blue, then the fruit.
update_timers:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, fright_timer
        lw      t1, 0(t0)
        beqz    t1, ut_modes
        addi    t1, t1, -1
        sw      t1, 0(t0)
        bnez    t1, ut_fruit
        la      t0, ghosts                      # blue no more
        li      t2, GHOST_COUNT
ut_calm:
        sw      zero, G_FRIGHT(t0)
        addi    t0, t0, G_SIZE
        addi    t2, t2, -1
        bnez    t2, ut_calm
        j       ut_fruit
ut_modes:
        la      t0, mode_index
        lw      t1, 0(t0)
        li      t2, 7                           # the eighth mode, chase, never ends
        bge     t1, t2, ut_fruit
        la      t3, mode_timer
        lw      t4, 0(t3)
        addi    t4, t4, -1
        sw      t4, 0(t3)
        bnez    t4, ut_fruit
        addi    t1, t1, 1
        sw      t1, 0(t0)
        bge     t1, t2, ut_switch
        la      t5, level_ptr
        lw      t5, 0(t5)
        lw      t5, LV_MODES(t5)
        slli    t6, t1, 2
        add     t5, t5, t6
        lw      t5, 0(t5)
        sw      t5, 0(t3)
ut_switch:
        jal     reverse_ghosts
ut_fruit:
        la      t0, fruit_timer
        lw      t1, 0(t0)
        beqz    t1, ut_fruit_score
        addi    t1, t1, -1
        sw      t1, 0(t0)
ut_fruit_score:
        la      t0, fruit_score_timer
        lw      t1, 0(t0)
        beqz    t1, ut_done
        addi    t1, t1, -1
        sw      t1, 0(t0)
ut_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# check_collisions: a ghost on Pac-Man's tile either is eaten or catches him.
check_collisions:
        addi    sp, sp, -32
        sw      ra, 28(sp)
        sw      s0, 24(sp)
        sw      s1, 20(sp)
        sw      s2, 16(sp)
        sw      s3, 12(sp)
        la      t0, pac_x
        lw      s1, 0(t0)
        srai    s1, s1, 3
        la      t0, pac_y
        lw      s2, 0(t0)
        srai    s2, s2, 3
        la      s0, ghosts
        li      s3, GHOST_COUNT
cc_loop:
        lw      t0, G_STATE(s0)
        li      t1, GS_ACTIVE
        bne     t0, t1, cc_next
        lw      t0, G_X(s0)
        srai    t0, t0, 3
        bne     t0, s1, cc_next
        lw      t0, G_Y(s0)
        srai    t0, t0, 3
        bne     t0, s2, cc_next
        lw      t0, G_FRIGHT(s0)
        beqz    t0, cc_caught
        mv      a0, s0
        jal     eat_ghost
        j       cc_done
cc_caught:
        li      a0, ST_DYING
        jal     enter_state
        j       cc_done
cc_next:
        addi    s0, s0, G_SIZE
        addi    s3, s3, -1
        bnez    s3, cc_loop
cc_done:
        lw      ra, 28(sp)
        lw      s0, 24(sp)
        lw      s1, 20(sp)
        lw      s2, 16(sp)
        lw      s3, 12(sp)
        addi    sp, sp, 32
        ret

# eat_ghost(a0 = record): 200, 400, 800 then 1600 points, and the game stops for a second to show
# them where the ghost was. The ghost becomes a pair of eyes.
eat_ghost:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        mv      s0, a0
        la      t0, ghosts_eaten
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
        li      a0, 100
        sll     a0, a0, t1
        jal     add_score
        li      t0, GS_EYES
        sw      t0, G_STATE(s0)
        sw      zero, G_FRIGHT(s0)
        la      t0, eaten_ghost
        sw      s0, 0(t0)
        li      a0, ST_EAT_GHOST
        jal     enter_state
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        addi    sp, sp, 16
        ret

# ghost_frame(a0 = record): the cell of sprites.bmp for this ghost now. Its skirt changes every
# eight frames; frightened, it flashes white for the last few seconds.
ghost_frame:
        la      t0, frame_count
        lw      t0, 0(t0)
        srli    t0, t0, 3
        andi    t2, t0, 1                       # which skirt
        lw      t1, G_STATE(a0)
        li      t3, GS_EYES
        beq     t1, t3, gf_eyes
        li      t3, GS_ENTERING
        beq     t1, t3, gf_eyes
        lw      t3, G_FRIGHT(a0)
        bnez    t3, gf_fright
        lw      t3, G_DIR(a0)                   # its own row, two cells per direction
        slli    t3, t3, 1
        add     t3, t3, t2
        lw      a1, G_SHEET_ROW(a0)
        mv      a0, t3
        j       sheet_cell
gf_eyes:
        lw      t3, G_DIR(a0)
        addi    a0, t3, 4
        li      a1, 6
        j       sheet_cell
gf_fright:
        mv      a0, t2
        li      a1, 6
        la      t3, fright_timer
        lw      t3, 0(t3)
        la      t4, level_ptr
        lw      t4, 0(t4)
        lw      t4, LV_FLASHES(t4)
        li      t5, 28                          # one flash: 14 frames white, 14 blue
        mul     t4, t4, t5
        bgt     t3, t4, gf_cell                 # not flashing yet
        rem     t3, t3, t5
        li      t5, 14
        bge     t3, t5, gf_cell
        addi    a0, a0, 2
gf_cell:
        j       sheet_cell

# random: the next number of a xorshift generator, in a0.
random:
        la      t0, rng_state
        lw      a0, 0(t0)
        slli    t1, a0, 13
        xor     a0, a0, t1
        srli    t1, a0, 17
        xor     a0, a0, t1
        slli    t1, a0, 5
        xor     a0, a0, t1
        sw      a0, 0(t0)
        ret
