# The maze as the game plays it: `tiles` is this level's copy of maze.txt, one byte a tile, which
# loses its dots as Pac-Man eats them. Positions are screen tiles: the maze's row 0 is tile row 3,
# under the score.

        .text
# tile_at(a0 = tile column, a1 = tile row): the maze's character there. Above and below the maze
# is wall; left and right of it is wall too, except on the tunnel row, which goes on for ever.
# Uses only t0 and t1, which is_open counts on.
tile_at:
        li      t0, MAZE_FIRST_ROW
        blt     a1, t0, ta_wall
        li      t0, MAZE_LAST_ROW
        bgt     a1, t0, ta_wall
        bltz    a0, ta_outside
        li      t0, MAZE_COLS
        bge     a0, t0, ta_outside
        addi    t1, a1, -3
        mul     t1, t1, t0
        add     t1, t1, a0
        la      t0, tiles
        add     t1, t1, t0
        lbu     a0, 0(t1)
        ret
ta_outside:
        li      t0, TUNNEL_ROW
        bne     a1, t0, ta_wall
        li      a0, ' '
        ret
ta_wall:
        li      a0, '#'
        ret

# is_open(a0 = tile column, a1 = tile row): 1 when Pac-Man or a ghost in the maze may walk onto
# that tile, else 0. The ghost house door is not open: only eyes and ghosts leaving go through it,
# on their own paths.
is_open:
        mv      t6, ra
        jal     tile_at
        mv      ra, t6
        li      t0, ' '
        beq     a0, t0, io_yes
        li      t0, '.'
        beq     a0, t0, io_yes
        li      t0, 'o'
        beq     a0, t0, io_yes
        li      a0, 0
        ret
io_yes:
        li      a0, 1
        ret

# reset_maze: a full maze for a new level, and where its energizers are, for the blinking.
reset_maze:
        la      t0, maze_layout
        la      t1, tiles
        la      t2, energizers
        li      t3, 0                           # index
        li      t4, 0                           # energizers found
rm_loop:
        add     t5, t0, t3
        lbu     t5, 0(t5)
        add     t6, t1, t3
        sb      t5, 0(t6)
        li      t6, 'o'
        bne     t5, t6, rm_next
        li      t6, 8                           # the list holds eight
        bge     t4, t6, rm_next
        li      t6, MAZE_COLS                   # column and screen row of the tile
        rem     a0, t3, t6
        div     a1, t3, t6
        addi    a1, a1, 3
        slli    t6, t4, 3
        add     t6, t6, t2
        sw      a0, 0(t6)
        sw      a1, 4(t6)
        addi    t4, t4, 1
rm_next:
        addi    t3, t3, 1
        li      t6, MAZE_CELLS
        blt     t3, t6, rm_loop
        la      t0, energizer_count
        sw      t4, 0(t0)
        la      t0, dots_total
        lw      t0, 0(t0)
        la      t1, dots_left
        sw      t0, 0(t1)
        la      t1, dots_eaten
        sw      zero, 0(t1)
        ret

# draw_energizers(a0 = 1 lit, 0 dark): the energizers still in the maze, for their blinking.
draw_energizers:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        sw      s2, 0(sp)
        mv      s2, a0
        la      s0, energizers
        la      s1, energizer_count
        lw      s1, 0(s1)
de_loop:
        beqz    s1, de_done
        lw      a0, 0(s0)
        lw      a1, 4(s0)
        jal     tile_at
        li      t0, 'o'
        bne     a0, t0, de_next                 # eaten already
        lw      a0, 0(s0)
        lw      a1, 4(s0)
        beqz    s2, de_dark
        jal     redraw_tile
        j       de_next
de_dark:
        li      a2, 0                           # the maze picture alone
        li      a3, 0
        jal     draw_glyph
de_next:
        addi    s0, s0, 8
        addi    s1, s1, -1
        j       de_loop
de_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        lw      s2, 0(sp)
        addi    sp, sp, 16
        ret

# eat_tile(a0 = tile column, a1 = tile row): the dot or energizer there is gone.
eat_tile:
        addi    t1, a1, -3
        li      t0, MAZE_COLS
        mul     t1, t1, t0
        add     t1, t1, a0
        la      t0, tiles
        add     t1, t1, t0
        li      t0, ' '
        sb      t0, 0(t1)
        j       redraw_tile
