# The game's states, from the title to the game over, and everything drawn around the maze.
#
#   title       the maze and PUSH SPACE: any key starts a game
#   ready       READY! for two seconds, after PLAYER ONE at the start of a game
#   play        the game itself
#   eat ghost   a second's pause showing a ghost's points
#   dying       a second's pause, then Pac-Man shrivels away and pops
#   level done  a second's pause, then the maze flashes
#   game over   GAME OVER for five seconds, or until a key

        .text
# update_game: one frame of whichever state the game is in, then the sprites it shows.
update_game:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, paused                      # a paused game stands still, skirts and all
        lw      t0, 0(t0)
        bnez    t0, upd_count
        la      t0, frame_count
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
upd_count:
        la      t0, game_state
        lw      t0, 0(t0)
        li      t1, ST_PLAY
        beq     t0, t1, upd_play
        la      t1, pause_requested             # P only means something during play
        sw      zero, 0(t1)
        beqz    t0, upd_title
        li      t1, ST_READY
        beq     t0, t1, upd_ready
        li      t1, ST_EAT_GHOST
        beq     t0, t1, upd_eat_ghost
        li      t1, ST_DYING
        beq     t0, t1, upd_dying
        li      t1, ST_LEVEL_DONE
        beq     t0, t1, upd_level_done
        jal     game_over_update
        j       upd_after
upd_title:
        jal     title_update
        j       upd_after
upd_ready:
        jal     ready_update
        j       upd_after
upd_play:
        jal     play_update
        j       upd_after
upd_eat_ghost:
        jal     eat_ghost_update
        j       upd_after
upd_dying:
        jal     dying_update
        j       upd_after
upd_level_done:
        jal     level_done_update
upd_after:
        jal     blink_1up
        jal     compose_sprites
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# enter_state(a0 = state)
enter_state:
        la      t0, game_state
        sw      a0, 0(t0)
        la      t0, state_timer
        sw      zero, 0(t0)
        ret

# tick: state_timer + 1, returned in t1.
tick:
        la      t0, state_timer
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
        ret

# enter_title: a full maze, the scores of the last game, and PUSH SPACE.
enter_title:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, level                       # no lives and no fruit at the bottom
        sw      zero, 0(t0)
        la      t0, lives
        sw      zero, 0(t0)
        jal     reset_maze
        jal     draw_maze
        jal     draw_hud
        la      a0, text_push
        li      a1, 9
        li      a2, 14
        li      a3, COLOR_ORANGE
        jal     draw_text
        la      t0, key_pressed
        sw      zero, 0(t0)
        li      a0, ST_TITLE
        jal     enter_state
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

title_update:
        la      t0, key_pressed
        lw      t1, 0(t0)
        beqz    t1, tu_done
        sw      zero, 0(t0)
        j       start_game
tu_done:
        ret

# start_game: three Pac-Men, one playing and two spare, from level 1.
start_game:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, score
        sw      zero, 0(t0)
        la      t0, extra_life_given
        sw      zero, 0(t0)
        li      t1, 2
        la      t0, lives
        sw      t1, 0(t0)
        li      t1, 1
        la      t0, level
        sw      t1, 0(t0)
        li      a0, 1
        jal     start_level
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# start_level(a0 = 1 to show PLAYER ONE first): a full maze, and the level's settings.
start_level:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        mv      s0, a0
        la      t0, level
        lw      t1, 0(t0)
        li      t2, LEVEL_TABLE_LAST
        ble     t1, t2, sl_entry
        mv      t1, t2
sl_entry:
        addi    t1, t1, -1
        slli    t1, t1, 6                       # LV_SIZE
        la      t2, level_table
        add     t1, t1, t2
        la      t0, level_ptr
        sw      t1, 0(t0)
        jal     reset_maze
        jal     clear_ghost_counters
        la      t0, global_mode
        sw      zero, 0(t0)
        li      t1, 1
        la      t0, elroy_enabled
        sw      t1, 0(t0)
        la      t0, fruit_timer
        sw      zero, 0(t0)
        la      t0, fruit_score_timer
        sw      zero, 0(t0)
        jal     draw_maze
        jal     draw_hud
        mv      a0, s0
        jal     begin_life
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        addi    sp, sp, 16
        ret

# begin_life(a0 = 1 to show PLAYER ONE first): everyone back at the start, and READY!. With PLAYER
# ONE the start music plays, and the two last as long as it does.
begin_life:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        mv      s0, a0
        jal     stop_sounds
        jal     reset_pacman
        jal     reset_ghosts
        la      t0, mode_index
        sw      zero, 0(t0)
        la      t0, level_ptr
        lw      t0, 0(t0)
        lw      t0, LV_MODES(t0)
        lw      t1, 0(t0)
        la      t0, mode_timer
        sw      t1, 0(t0)
        la      t0, fright_timer
        sw      zero, 0(t0)
        la      t0, ghosts_eaten
        sw      zero, 0(t0)
        la      t0, dot_timer
        sw      zero, 0(t0)
        la      t0, paused
        sw      zero, 0(t0)
        li      a0, 1
        la      t0, energizers_lit
        sw      a0, 0(t0)
        jal     draw_energizers
        la      a0, text_ready
        li      a1, 11
        li      a2, 20
        li      a3, COLOR_YELLOW
        jal     draw_text
        li      t1, 1
        li      t2, 0
        beqz    s0, bl_state
        la      a0, text_player
        li      a1, 9
        li      a2, 14
        li      a3, COLOR_CYAN
        jal     draw_text
        li      a0, CHANNEL_1
        la      a1, music_bass
        jal     play_song
        li      a0, CHANNEL_2
        la      a1, music_melody
        jal     play_song
        li      t1, 0                           # no one on the maze until PLAYER ONE goes
        li      t2, 136
bl_state:
        la      t0, show_actors
        sw      t1, 0(t0)
        la      t0, ready_intro
        sw      t2, 0(t0)
        li      a0, ST_READY
        jal     enter_state
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        addi    sp, sp, 16
        ret

ready_update:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        jal     tick
        la      t2, ready_intro
        lw      t2, 0(t2)
        beqz    t2, ru_ready
        bne     t1, t2, ru_ready
        li      a0, 9                           # PLAYER ONE goes and the actors come
        li      a1, 14
        li      a2, 10
        jal     clear_text
        li      t1, 1
        la      t0, show_actors
        sw      t1, 0(t0)
        j       ru_done
ru_ready:
        addi    t2, t2, 120
        blt     t1, t2, ru_done
        li      a0, 11
        li      a1, 20
        li      a2, 6
        jal     clear_text
        li      a0, ST_PLAY
        jal     enter_state
ru_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

play_update:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, pause_requested
        lw      t1, 0(t0)
        beqz    t1, pu_paused
        sw      zero, 0(t0)
        la      t0, paused
        lw      t1, 0(t0)
        xori    t1, t1, 1
        sw      t1, 0(t0)
        beqz    t1, pu_resume
        la      a0, text_paused
        li      a1, 11
        li      a2, 20
        li      a3, COLOR_YELLOW
        jal     draw_text
        j       pu_done
pu_resume:
        li      a0, 11
        li      a1, 20
        li      a2, 6
        jal     clear_text
pu_paused:
        la      t0, paused
        lw      t0, 0(t0)
        bnez    t0, pu_done

        jal     update_pacman
        jal     still_playing
        beqz    a0, pu_done
        jal     check_collisions
        jal     still_playing
        beqz    a0, pu_done
        jal     update_ghosts
        jal     check_collisions
        jal     still_playing
        beqz    a0, pu_done
        jal     release_ghosts
        jal     update_timers

        la      t0, frame_count                 # the energizers blink
        lw      t0, 0(t0)
        li      t1, 10
        rem     t0, t0, t1
        bnez    t0, pu_done
        la      t0, energizers_lit
        lw      a0, 0(t0)
        xori    a0, a0, 1
        sw      a0, 0(t0)
        jal     draw_energizers
pu_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# still_playing: 1 in a0 while the state is play.
still_playing:
        la      t0, game_state
        lw      t0, 0(t0)
        li      t1, ST_PLAY
        sub     t0, t0, t1
        seqz    a0, t0
        ret

eat_ghost_update:
        mv      t6, ra
        jal     tick
        mv      ra, t6
        li      t2, 60
        blt     t1, t2, egu_done
        li      a0, ST_PLAY
        j       enter_state
egu_done:
        ret

# dying_update: the arcade's death. Everything still for a second, Pac-Man alone for half a second,
# then nine frames of shrivelling to the falling wobble, and the pop as he vanishes.
dying_update:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        jal     tick
        li      t2, 90
        bne     t1, t2, du_pop
        li      a0, CHANNEL_3
        la      a1, sound_death
        jal     play_sound
        j       du_done
du_pop:
        li      t2, 225
        bne     t1, t2, du_timer
        li      a0, CHANNEL_3
        la      a1, sound_pop
        jal     play_sound
        j       du_done
du_timer:
        li      t2, 300
        blt     t1, t2, du_done
        la      t0, lives
        lw      t1, 0(t0)
        bnez    t1, du_again
        la      a0, text_game_over
        li      a1, 9
        li      a2, 20
        li      a3, COLOR_RED
        jal     draw_text
        li      a0, ST_GAME_OVER
        jal     enter_state
        j       du_done
du_again:
        addi    t1, t1, -1
        sw      t1, 0(t0)
        jal     draw_lives
        li      t1, 1                           # the house now runs on one shared counter
        la      t0, global_mode
        sw      t1, 0(t0)
        la      t0, global_dots
        sw      zero, 0(t0)
        la      t0, elroy_enabled               # until Clyde is out again
        sw      zero, 0(t0)
        la      t0, fruit_timer
        sw      zero, 0(t0)
        la      t0, fruit_score_timer
        sw      zero, 0(t0)
        li      a0, 0
        jal     begin_life
du_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

level_done_update:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        jal     tick
        li      t2, 60
        blt     t1, t2, ldu_done
        li      t2, 156
        bge     t1, t2, ldu_next
        addi    t3, t1, -60                     # every 12 frames, white then blue, four times
        li      t4, 12
        rem     t5, t3, t4
        bnez    t5, ldu_done
        div     t3, t3, t4
        andi    t3, t3, 1
        xori    a0, t3, 1
        jal     flash_walls
        j       ldu_done
ldu_next:
        li      a0, 0
        jal     flash_walls
        la      t0, level
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
        li      a0, 0
        jal     start_level
ldu_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

game_over_update:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        jal     tick
        la      t0, key_pressed
        li      t2, 60                          # keys from the last second of play do not count
        bge     t1, t2, gou_key
        sw      zero, 0(t0)
        j       gou_done
gou_key:
        lw      t3, 0(t0)
        bnez    t3, gou_title
        li      t2, 300
        blt     t1, t2, gou_done
gou_title:
        jal     enter_title
gou_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# add_score(a0 = points): the score, the extra life at 10,000 and the high score.
add_score:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, score
        lw      t1, 0(t0)
        add     t1, t1, a0
        sw      t1, 0(t0)
        la      t2, extra_life_given
        lw      t3, 0(t2)
        bnez    t3, as_high
        li      t3, 10000
        blt     t1, t3, as_high
        li      t3, 1
        sw      t3, 0(t2)
        la      t2, lives
        lw      t3, 0(t2)
        addi    t3, t3, 1
        sw      t3, 0(t2)
        jal     draw_lives
        li      a0, CHANNEL_1
        la      a1, sound_extra_life
        jal     play_sound
as_high:
        la      t0, score
        lw      t1, 0(t0)
        la      t2, high_score
        lw      t3, 0(t2)
        ble     t1, t3, as_draw
        sw      t1, 0(t2)
        jal     draw_high_score
as_draw:
        jal     draw_score
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# draw_hud: the two score rows at the top and the icons at the bottom.
draw_hud:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      a0, text_1up
        li      a1, 3
        li      a2, 0
        li      a3, COLOR_WHITE
        jal     draw_text
        li      t1, 1
        la      t0, oneup_lit
        sw      t1, 0(t0)
        la      a0, text_high
        li      a1, 9
        li      a2, 0
        li      a3, COLOR_WHITE
        jal     draw_text
        jal     draw_score
        jal     draw_high_score
        jal     draw_lives
        jal     draw_level_fruits
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

draw_score:
        la      a0, score
        lw      a0, 0(a0)
        li      a1, 6
        li      a2, 1
        li      a3, 7
        li      a4, 2
        j       draw_number

draw_high_score:
        la      a0, high_score
        lw      a0, 0(a0)
        li      a1, 16
        li      a2, 1
        li      a3, 7
        li      a4, 0                           # blank until there is one
        beqz    a0, dhs_draw
        li      a4, 2
dhs_draw:
        j       draw_number

# draw_lives: a Pac-Man for each spare life, five at most, at the bottom left.
draw_lives:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        li      a0, 0
        li      a1, 272
        li      a2, 112
        li      a3, 16
        jal     restore_rect
        la      t0, lives
        lw      s0, 0(t0)
        li      t1, 5
        ble     s0, t1, dl_loop_start
        mv      s0, t1
dl_loop_start:
        li      s1, 0
dl_loop:
        bge     s1, s0, dl_done
        li      a0, 3                           # Pac-Man facing left, mouth half open
        li      a1, 0
        jal     sheet_cell
        mv      a2, a0
        slli    a0, s1, 4
        addi    a0, a0, 16
        li      a1, 272
        jal     stamp_sprite
        addi    s1, s1, 1
        j       dl_loop
dl_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# draw_level_fruits: the fruit of this level and up to six before it, newest on the right.
draw_level_fruits:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        li      a0, 112
        li      a1, 272
        li      a2, 112
        li      a3, 16
        jal     restore_rect
        la      t0, level
        lw      s0, 0(t0)
        li      s1, 0
dlf_loop:
        blez    s0, dlf_done
        li      t0, 7
        bge     s1, t0, dlf_done
        mv      t0, s0
        li      t1, LEVEL_TABLE_LAST
        ble     t0, t1, dlf_entry
        mv      t0, t1
dlf_entry:
        addi    t0, t0, -1
        slli    t0, t0, 6
        la      t1, level_table
        add     t0, t0, t1
        lw      a0, LV_FRUIT(t0)
        li      a1, 7
        jal     sheet_cell
        mv      a2, a0
        slli    a0, s1, 4
        li      t0, 192
        sub     a0, t0, a0
        li      a1, 272
        jal     stamp_sprite
        addi    s0, s0, -1
        addi    s1, s1, 1
        j       dlf_loop
dlf_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# blink_1up: 1UP blinks while a game is on and stays lit otherwise.
blink_1up:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        la      t0, game_state
        lw      t0, 0(t0)
        li      a0, 1
        beqz    t0, b1_set
        li      t1, ST_GAME_OVER
        beq     t0, t1, b1_set
        la      t0, frame_count
        lw      t0, 0(t0)
        srli    t0, t0, 4
        andi    t0, t0, 1
        xori    a0, t0, 1
b1_set:
        la      t0, oneup_lit
        lw      t1, 0(t0)
        beq     t1, a0, b1_done
        sw      a0, 0(t0)
        beqz    a0, b1_clear
        la      a0, text_1up
        li      a1, 3
        li      a2, 0
        li      a3, COLOR_WHITE
        jal     draw_text
        j       b1_done
b1_clear:
        li      a0, 3
        li      a1, 0
        li      a2, 3
        jal     clear_text
b1_done:
        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# compose_sprites: which sprites this frame shows, and where.
compose_sprites:
        addi    sp, sp, -32
        sw      ra, 28(sp)
        sw      s0, 24(sp)
        sw      s1, 20(sp)
        sw      s2, 16(sp)
        sw      s3, 12(sp)
        sw      s4, 8(sp)
        jal     hide_slots
        la      t0, game_state
        lw      s0, 0(t0)
        la      t0, state_timer
        lw      s1, 0(t0)
        li      s2, 0                           # show the fruit
        li      s3, 0                           # Pac-Man: 0 none, 1 round, 2 moving, 3 dying
        li      s4, 0                           # show the ghosts
        li      t0, ST_READY
        bne     s0, t0, cs_play
        la      t0, show_actors
        lw      t0, 0(t0)
        beqz    t0, cs_fruit
        li      s3, 1
        li      s4, 1
        j       cs_fruit
cs_play:
        li      t0, ST_PLAY
        bne     s0, t0, cs_eat
        li      s2, 1
        li      s3, 2
        li      s4, 1
        j       cs_fruit
cs_eat:
        li      t0, ST_EAT_GHOST
        bne     s0, t0, cs_dying
        li      s2, 1
        li      s4, 1
        j       cs_fruit
cs_dying:
        li      t0, ST_DYING
        bne     s0, t0, cs_level
        li      s3, 3
        li      t0, 60
        bge     s1, t0, cs_fruit
        li      s2, 1
        li      s3, 2
        li      s4, 1
        j       cs_fruit
cs_level:
        li      t0, ST_LEVEL_DONE
        bne     s0, t0, cs_fruit
        li      s3, 1
        li      t0, 60
        bge     s1, t0, cs_fruit
        li      s4, 1

cs_fruit:
        beqz    s2, cs_pacman
        la      t0, level_ptr
        lw      t0, 0(t0)
        lw      a0, LV_FRUIT(t0)
        la      t1, fruit_timer
        lw      t1, 0(t1)
        li      a1, 7                           # the fruit itself
        bnez    t1, cs_fruit_slot
        la      t1, fruit_score_timer
        lw      t1, 0(t1)
        beqz    t1, cs_pacman
        addi    a0, a0, 4                       # or its points
        li      a1, 8
cs_fruit_slot:
        jal     sheet_cell
        mv      a1, a0
        li      a0, SLOT_FRUIT
        li      a2, 111
        li      a3, 163
        jal     set_slot

cs_pacman:
        beqz    s3, cs_ghosts
        li      t0, 2
        beq     s3, t0, cs_pac_moving
        li      t0, 3
        beq     s3, t0, cs_pac_dying
        li      a0, 0                           # round
        li      a1, 0
        jal     sheet_cell
        j       cs_pac_slot
cs_pac_moving:
        jal     pacman_frame
        j       cs_pac_slot
cs_pac_dying:                                   # the first, nine of 15 frames, then the pop
        li      t0, 255
        bge     s1, t0, cs_ghosts
        li      a0, 0
        li      t0, 90
        blt     s1, t0, cs_pac_cell
        li      a0, 10
        li      t0, 225
        bge     s1, t0, cs_pac_cell
        addi    a0, s1, -90
        li      t0, 15
        divu    a0, a0, t0
        addi    a0, a0, 1
cs_pac_cell:
        li      a1, 1
        jal     sheet_cell
cs_pac_slot:
        mv      a1, a0
        li      a0, SLOT_PACMAN
        la      t0, pac_x
        lw      a2, 0(t0)
        la      t0, pac_y
        lw      a3, 0(t0)
        jal     set_slot

cs_ghosts:
        beqz    s4, cs_done
        la      s1, ghosts
        li      s2, 0
cs_ghost_loop:
        li      t0, ST_EAT_GHOST                # the ghost just eaten shows its points
        bne     s0, t0, cs_ghost_frame
        la      t0, eaten_ghost
        lw      t0, 0(t0)
        bne     t0, s1, cs_ghost_frame
        la      t0, ghosts_eaten
        lw      a0, 0(t0)
        addi    a0, a0, -1
        li      a1, 8
        jal     sheet_cell
        j       cs_ghost_slot
cs_ghost_frame:
        mv      a0, s1
        jal     ghost_frame
cs_ghost_slot:
        mv      a1, a0
        li      a0, 5                           # Blinky in the last slot, on top
        sub     a0, a0, s2
        lw      a2, G_X(s1)
        lw      a3, G_Y(s1)
        jal     set_slot
        addi    s1, s1, G_SIZE
        addi    s2, s2, 1
        li      t0, GHOST_COUNT
        blt     s2, t0, cs_ghost_loop
cs_done:
        lw      ra, 28(sp)
        lw      s0, 24(sp)
        lw      s1, 20(sp)
        lw      s2, 16(sp)
        lw      s3, 12(sp)
        lw      s4, 8(sp)
        addi    sp, sp, 32
        ret

# read_input: every character typed since the last frame. The last direction key wins.
read_input:
        li      t0, MMIO_BASE
ri_loop:
        lw      t1, 0(t0)                       # receiver control: bit 0, a character waits
        andi    t1, t1, 1
        beqz    t1, ri_done
        lw      t2, 4(t0)                       # receiver data: reading it takes the character
        andi    t2, t2, 0xff
        li      t4, 1
        la      t3, key_pressed
        sw      t4, 0(t3)
        li      t3, 'A'                         # upper case to lower case
        blt     t2, t3, ri_map
        li      t3, 'Z'
        bgt     t2, t3, ri_map
        addi    t2, t2, 32
ri_map:
        li      t4, UP
        li      t3, 'w'
        beq     t2, t3, ri_want
        li      t3, 'z'
        beq     t2, t3, ri_want
        li      t3, '8'
        beq     t2, t3, ri_want
        li      t4, LEFT
        li      t3, 'a'
        beq     t2, t3, ri_want
        li      t3, 'q'
        beq     t2, t3, ri_want
        li      t3, '4'
        beq     t2, t3, ri_want
        li      t4, DOWN
        li      t3, 's'
        beq     t2, t3, ri_want
        li      t3, '2'
        beq     t2, t3, ri_want
        li      t3, '5'
        beq     t2, t3, ri_want
        li      t4, RIGHT
        li      t3, 'd'
        beq     t2, t3, ri_want
        li      t3, '6'
        beq     t2, t3, ri_want
        li      t3, 'p'
        bne     t2, t3, ri_loop
        li      t4, 1
        la      t3, pause_requested
        sw      t4, 0(t3)
        j       ri_loop
ri_want:
        la      t3, pac_want
        sw      t4, 0(t3)
        j       ri_loop
ri_done:
        ret

# wait_frame: sleeps until this frame's 1/60 s is up. The deadline moves on by 16 2/3 ms a frame;
# a frame that ran late sleeps for no time at all, and one a long way off the deadline, after the
# program was paused, starts the count again. The sleep is also what puts the frame on the Screen.
wait_frame:
        li      a7, SYS_TIME
        ecall                                   # a0 = milliseconds, low word
        la      t0, next_deadline
        lw      t1, 0(t0)
        la      t2, deadline_thirds
        lw      t3, 0(t2)
        addi    t1, t1, 16
        addi    t3, t3, 2
        li      t4, 3
        blt     t3, t4, wf_thirds
        addi    t3, t3, -3
        addi    t1, t1, 1
wf_thirds:
        sw      t3, 0(t2)
        sub     t4, t1, a0                      # milliseconds left
        li      t5, 100
        bgt     t4, t5, wf_resync
        li      t5, -100
        blt     t4, t5, wf_resync
        bgez    t4, wf_sleep
        li      t4, 0
        j       wf_sleep
wf_resync:
        addi    t1, a0, 16
        li      t4, 16
wf_sleep:
        sw      t1, 0(t0)
        mv      a0, t4
        li      a7, SYS_SLEEP
        ecall
        ret
