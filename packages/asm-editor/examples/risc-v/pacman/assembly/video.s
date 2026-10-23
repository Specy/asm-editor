# Drawing. The picture is kept twice: `background` holds the maze, dots and text, and the Screen
# shows the background with the sprites on top. Moving a sprite is then two copies: the old place
# from the background, the new place from the sprite sheet. Every buffer has the Screen's row
# length, so y * ROW_BYTES + x * 4 is the same pixel in each.

# dst = y * ROW_BYTES, which is 896 = 7 << 7: (8y - y) << 7, with no register to spare for a mul.
# %dst and %y must be different registers.
.macro row_offset(%dst, %y)
        slli    %dst, %y, 3
        sub     %dst, %dst, %y
        slli    %dst, %dst, 7
.end_macro

        .text
# draw_glyph(a0 = tile column, a1 = tile row, a2 = tiles.bmp cell, a3 = tint, or 0 for the cell's
# own colors): one 8 by 8 tile into the background and onto the Screen. The cell's lit pixels are
# drawn, in the tint when there is one, and its black pixels show the maze picture underneath.
draw_glyph:
        srli    t0, a2, 4                       # source: tile_sheet + (cell / 16) * 8 rows
        slli    t0, t0, 12                      #   + (cell % 16) * 8 words
        andi    t1, a2, 15
        slli    t1, t1, 5
        add     t0, t0, t1
        la      t1, tile_sheet
        add     t0, t0, t1
        row_offset(t1, a1)                      # offset: row * 8 * ROW_BYTES + column * 8 * 4
        slli    t1, t1, 3
        slli    t2, a0, 5
        add     t1, t1, t2
        la      t2, maze_image
        add     t2, t2, t1
        la      t3, background
        add     t3, t3, t1
        la      t4, display
        add     t4, t4, t1
        li      t5, 8                           # rows left
dg_row:
        li      t6, 0                           # byte offset in the row
dg_px:
        add     a4, t0, t6
        lw      a4, 0(a4)
        beqz    a4, dg_maze
        beqz    a3, dg_store
        mv      a4, a3
        j       dg_store
dg_maze:
        add     a4, t2, t6
        lw      a4, 0(a4)
dg_store:
        add     a5, t3, t6
        sw      a4, 0(a5)
        add     a5, t4, t6
        sw      a4, 0(a5)
        addi    t6, t6, 4
        li      a5, 32
        blt     t6, a5, dg_px
        addi    t0, t0, TILES_ROW_BYTES
        addi    t2, t2, ROW_BYTES
        addi    t3, t3, ROW_BYTES
        addi    t4, t4, ROW_BYTES
        addi    t5, t5, -1
        bnez    t5, dg_row
        ret

# redraw_tile(a0 = tile column, a1 = tile row): the tile as the maze has it now: the maze picture,
# with the dot or energizer still in it on top.
redraw_tile:
        li      a2, 0                           # cell 0, the space: only the maze picture
        li      a3, 0
        li      t0, MAZE_FIRST_ROW
        blt     a1, t0, draw_glyph
        li      t0, MAZE_LAST_ROW
        bgt     a1, t0, draw_glyph
        bltz    a0, draw_glyph
        li      t0, MAZE_COLS
        bge     a0, t0, draw_glyph
        addi    t1, a1, -3
        mul     t1, t1, t0
        add     t1, t1, a0
        la      t0, tiles
        add     t1, t1, t0
        lbu     t1, 0(t1)
        li      t0, '.'
        bne     t1, t0, rt_energizer
        li      a2, TILE_DOT
        j       draw_glyph
rt_energizer:
        li      t0, 'o'
        bne     t1, t0, draw_glyph
        li      a2, TILE_ENERGIZER
        j       draw_glyph

# draw_text(a0 = string, a1 = tile column, a2 = tile row, a3 = color)
draw_text:
        addi    sp, sp, -32
        sw      ra, 28(sp)
        sw      s0, 24(sp)
        sw      s1, 20(sp)
        sw      s2, 16(sp)
        sw      s3, 12(sp)
        mv      s0, a0
        mv      s1, a1
        mv      s2, a2
        mv      s3, a3
dt_loop:
        lbu     t0, 0(s0)
        beqz    t0, dt_done
        mv      a0, s1
        mv      a1, s2
        addi    a2, t0, -32                     # tiles.bmp starts at the space, ASCII 32
        mv      a3, s3
        jal     draw_glyph
        addi    s0, s0, 1
        addi    s1, s1, 1
        j       dt_loop
dt_done:
        lw      ra, 28(sp)
        lw      s0, 24(sp)
        lw      s1, 20(sp)
        lw      s2, 16(sp)
        lw      s3, 12(sp)
        addi    sp, sp, 32
        ret

# clear_text(a0 = tile column, a1 = tile row, a2 = tiles): puts the maze back under some text.
clear_text:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        sw      s2, 0(sp)
        mv      s0, a0
        mv      s1, a1
        mv      s2, a2
ct_loop:
        beqz    s2, ct_done
        mv      a0, s0
        mv      a1, s1
        jal     redraw_tile
        addi    s0, s0, 1
        addi    s2, s2, -1
        j       ct_loop
ct_done:
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        lw      s2, 0(sp)
        addi    sp, sp, 16
        ret

# draw_number(a0 = value, a1 = column of the last digit, a2 = tile row, a3 = width in tiles,
# a4 = fewest digits): the value right-aligned in white, leading tiles blank.
draw_number:
        addi    sp, sp, -32
        sw      ra, 28(sp)
        sw      s0, 24(sp)
        sw      s1, 20(sp)
        sw      s2, 16(sp)
        sw      s3, 12(sp)
        sw      s4, 8(sp)
        sw      s5, 4(sp)
        mv      s0, a0
        mv      s1, a1
        mv      s2, a2
        mv      s3, a3
        mv      s4, a4
        li      s5, 0                           # digits drawn
dn_loop:
        beqz    s3, dn_done
        li      a2, 0                           # a blank
        bnez    s0, dn_digit
        bge     s5, s4, dn_draw
dn_digit:
        li      t0, 10
        rem     t1, s0, t0
        div     s0, s0, t0
        addi    a2, t1, 16                      # '0' is cell 16
        addi    s5, s5, 1
dn_draw:
        mv      a0, s1
        mv      a1, s2
        li      a3, COLOR_WHITE
        jal     draw_glyph
        addi    s1, s1, -1
        addi    s3, s3, -1
        j       dn_loop
dn_done:
        lw      ra, 28(sp)
        lw      s0, 24(sp)
        lw      s1, 20(sp)
        lw      s2, 16(sp)
        lw      s3, 12(sp)
        lw      s4, 8(sp)
        lw      s5, 4(sp)
        addi    sp, sp, 32
        ret

# sheet_cell(a0 = column, a1 = row): the address of a 16 by 16 cell of sprites.bmp.
sheet_cell:
        slli    a1, a1, 14                      # SPRITE_ROW_BYTES
        slli    a0, a0, 6                       # 16 words
        add     a0, a0, a1
        la      a1, sprite_sheet
        add     a0, a0, a1
        ret

# One pixel of a sprite, `offset` bytes into the row: copied when it is not black. The two
# routines below use it sixteen times a row rather than looping over the pixels, which saves the
# loop's own three instructions a pixel; RARS gives the `skip` label of each copy its own name.
.macro sprite_px(%offset)
        lw      a6, %offset(a2)
        beqz    a6, skip
        sw      a6, %offset(a5)
skip:
.end_macro

# One pixel of an erase: where the sprite that was there had a pixel, the background's pixel.
.macro erase_px(%offset)
        lw      a6, %offset(a2)
        beqz    a6, skip
        lw      a6, %offset(a4)
        sw      a6, %offset(a5)
skip:
.end_macro

# draw_sprite(a0 = x, a1 = y, a2 = cell address): the cell's non-black pixels onto the Screen,
# with the top-left corner at (x, y).
draw_sprite:
        bltz    a0, draw_sprite_clipped         # partly off the game, in the side tunnel
        li      t0, 208                         # GAME_W - 16
        bgt     a0, t0, draw_sprite_clipped
        row_offset(t3, a1)                      # destination: y * ROW_BYTES + x * 4
        slli    t2, a0, 2
        add     t3, t3, t2
        la      t2, display
        add     a5, t3, t2
        li      t6, 16                          # rows left
ds_row:
        sprite_px(0)
        sprite_px(4)
        sprite_px(8)
        sprite_px(12)
        sprite_px(16)
        sprite_px(20)
        sprite_px(24)
        sprite_px(28)
        sprite_px(32)
        sprite_px(36)
        sprite_px(40)
        sprite_px(44)
        sprite_px(48)
        sprite_px(52)
        sprite_px(56)
        sprite_px(60)
        addi    a2, a2, SHEET_ROW_BYTES
        addi    a5, a5, ROW_BYTES
        addi    t6, t6, -1
        bnez    t6, ds_row
        ret

# erase_sprite(a0 = x, a1 = y, a2 = the cell drawn there): puts the background back over the
# pixels that sprite covered, and only those: every store to the Screen costs the simulator far
# more than an instruction does.
erase_sprite:
        bltz    a0, erase_sprite_clipped
        li      t0, 208
        bgt     a0, t0, erase_sprite_clipped
        row_offset(t3, a1)
        slli    t2, a0, 2
        add     t3, t3, t2
        la      t2, background
        add     a4, t3, t2
        la      t2, display
        add     a5, t3, t2
        li      t6, 16
es_row:
        erase_px(0)
        erase_px(4)
        erase_px(8)
        erase_px(12)
        erase_px(16)
        erase_px(20)
        erase_px(24)
        erase_px(28)
        erase_px(32)
        erase_px(36)
        erase_px(40)
        erase_px(44)
        erase_px(48)
        erase_px(52)
        erase_px(56)
        erase_px(60)
        addi    a2, a2, SHEET_ROW_BYTES
        addi    a4, a4, ROW_BYTES
        addi    a5, a5, ROW_BYTES
        addi    t6, t6, -1
        bnez    t6, es_row
        ret

# draw_sprite_clipped and erase_sprite_clipped: the same, pixel by pixel, for a sprite whose left
# or right part is outside the game. a0 = x, a1 = y, a2 = cell address; a3 = 1 to erase.
draw_sprite_clipped:
        li      a3, 0
        j       sprite_clipped
erase_sprite_clipped:
        li      a3, 1
sprite_clipped:
        li      t0, 0                           # the first column inside the game
        bgez    a0, sc_right
        neg     t0, a0
sc_right:
        li      t1, GAME_W                      # and the column past the last one
        sub     t1, t1, a0
        li      t2, 16
        ble     t1, t2, sc_columns
        mv      t1, t2
sc_columns:
        bge     t0, t1, sc_done                 # wholly outside
        row_offset(t3, a1)
        add     t2, a0, t0
        slli    t2, t2, 2
        add     t3, t3, t2                      # offset of the first pixel inside
        la      t2, background
        add     a4, t3, t2
        la      t2, display
        add     a5, t3, t2
        slli    t2, t0, 2
        add     a2, a2, t2
        sub     t5, t1, t0
        slli    t5, t5, 2                       # bytes a row
        li      t6, 16
sc_row:
        li      t4, 0
sc_px:
        add     a7, a2, t4
        lw      a6, 0(a7)
        beqz    a6, sc_next
        beqz    a3, sc_store
        add     a7, a4, t4
        lw      a6, 0(a7)
sc_store:
        add     a7, a5, t4
        sw      a6, 0(a7)
sc_next:
        addi    t4, t4, 4
        blt     t4, t5, sc_px
        addi    a2, a2, SHEET_ROW_BYTES
        addi    a4, a4, ROW_BYTES
        addi    a5, a5, ROW_BYTES
        addi    t6, t6, -1
        bnez    t6, sc_row
sc_done:
        ret

# stamp_sprite(a0 = x, a1 = y, a2 = cell address): a sprite drawn into the background as well,
# for the icons at the bottom that never move.
stamp_sprite:
        row_offset(t3, a1)
        slli    t2, a0, 2
        add     t3, t3, t2
        la      t2, background
        add     t4, t3, t2
        la      t2, display
        add     t3, t3, t2
        li      t6, 16
ss_row:
        li      t5, 0
ss_px:
        add     a4, a2, t5
        lw      a6, 0(a4)
        beqz    a6, ss_skip
        add     a5, t4, t5
        sw      a6, 0(a5)
        add     a5, t3, t5
        sw      a6, 0(a5)
ss_skip:
        addi    t5, t5, 4
        li      a5, 64
        blt     t5, a5, ss_px
        addi    a2, a2, SHEET_ROW_BYTES
        addi    t3, t3, ROW_BYTES
        addi    t4, t4, ROW_BYTES
        addi    t6, t6, -1
        bnez    t6, ss_row
        ret

# restore_rect(a0 = x, a1 = y, a2 = width, a3 = height): the maze picture back over a rectangle,
# in the background and on the Screen.
restore_rect:
        row_offset(t3, a1)
        slli    t2, a0, 2
        add     t3, t3, t2
        la      t2, maze_image
        add     t0, t3, t2
        la      t2, background
        add     t1, t3, t2
        la      t2, display
        add     t3, t3, t2
        slli    a2, a2, 2                       # bytes a row
rr_row:
        li      t5, 0
rr_px:
        add     a4, t0, t5
        lw      a6, 0(a4)
        add     a4, t1, t5
        sw      a6, 0(a4)
        add     a4, t3, t5
        sw      a6, 0(a4)
        addi    t5, t5, 4
        blt     t5, a2, rr_px
        addi    t0, t0, ROW_BYTES
        addi    t1, t1, ROW_BYTES
        addi    t3, t3, ROW_BYTES
        addi    a3, a3, -1
        bnez    a3, rr_row
        ret

# draw_maze: the whole game area from the maze picture, then the dots and energizers left in
# `tiles`. The score rows come out blank; draw_hud fills them.
draw_maze:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        la      t0, maze_image
        la      t1, background
        la      t2, display
        li      t3, GAME_H
        li      t5, ROW_BYTES                   # a row is GAME_W words
dm_row:
        li      t4, 0
dm_px:
        add     a0, t0, t4
        lw      a1, 0(a0)
        add     a0, t1, t4
        sw      a1, 0(a0)
        add     a0, t2, t4
        lw      a2, 0(a0)
        beq     a1, a2, dm_same
        sw      a1, 0(a0)
dm_same:
        addi    t4, t4, 4
        blt     t4, t5, dm_px
        addi    t0, t0, ROW_BYTES
        addi    t1, t1, ROW_BYTES
        addi    t2, t2, ROW_BYTES
        addi    t3, t3, -1
        bnez    t3, dm_row

        li      s1, MAZE_FIRST_ROW
dm_tile_row:
        li      s0, 0
dm_tile:
        addi    t0, s1, -3
        li      t1, MAZE_COLS
        mul     t0, t0, t1
        add     t0, t0, s0
        la      t1, tiles
        add     t0, t0, t1
        lbu     t0, 0(t0)
        li      t1, '.'
        beq     t0, t1, dm_dot
        li      t1, 'o'
        bne     t0, t1, dm_next
dm_dot:
        mv      a0, s0
        mv      a1, s1
        jal     redraw_tile
dm_next:
        addi    s0, s0, 1
        li      t0, MAZE_COLS
        blt     s0, t0, dm_tile
        addi    s1, s1, 1
        li      t0, MAZE_LAST_ROW
        ble     s1, t0, dm_tile_row
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret

# flash_walls(a0 = 1 for white, 0 for the maze picture's own colors): repaints the maze's lines.
flash_walls:
        la      t0, wall_pixels
        la      t1, wall_pixel_count
        lw      t1, 0(t1)
        la      t2, maze_image
        la      t3, background
        la      t4, display
        li      t5, COLOR_FLASH
fw_loop:
        beqz    t1, fw_done
        lw      t6, 0(t0)                       # the pixel's offset
        mv      a1, t5
        bnez    a0, fw_store
        add     a2, t2, t6
        lw      a1, 0(a2)
fw_store:
        add     a2, t3, t6
        sw      a1, 0(a2)
        add     a2, t4, t6
        sw      a1, 0(a2)
        addi    t0, t0, 4
        addi    t1, t1, -1
        j       fw_loop
fw_done:
        ret

# set_slot(a0 = slot, a1 = cell address, a2 = centre x, a3 = centre y): shows a sprite this frame.
set_slot:
        la      t0, slots
        slli    t1, a0, 5                       # SP_SIZE
        add     t0, t0, t1
        li      t1, 1
        sw      t1, SP_VISIBLE(t0)
        addi    a2, a2, -7
        sw      a2, SP_X(t0)
        addi    a3, a3, -7
        sw      a3, SP_Y(t0)
        sw      a1, SP_SOURCE(t0)
        ret

# hide_slots: nothing is drawn this frame until set_slot says so.
hide_slots:
        la      t0, slots
        li      t1, SLOT_COUNT
hs_loop:
        sw      zero, SP_VISIBLE(t0)
        addi    t0, t0, SP_SIZE
        addi    t1, t1, -1
        bnez    t1, hs_loop
        ret

# render_sprites: last frame's sprites off the Screen, then this frame's on, in slot order, so a
# later slot is drawn over an earlier one.
render_sprites:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        la      s0, slots
        li      s1, SLOT_COUNT
rs_erase:
        lw      t0, SP_WAS_VISIBLE(s0)
        beqz    t0, rs_erase_next
        lw      a0, SP_WAS_X(s0)
        lw      a1, SP_WAS_Y(s0)
        lw      a2, SP_WAS_SOURCE(s0)
        jal     erase_sprite
rs_erase_next:
        addi    s0, s0, SP_SIZE
        addi    s1, s1, -1
        bnez    s1, rs_erase
        la      s0, slots
        li      s1, SLOT_COUNT
rs_draw:
        lw      t0, SP_VISIBLE(s0)
        sw      t0, SP_WAS_VISIBLE(s0)
        beqz    t0, rs_draw_next
        lw      a0, SP_X(s0)
        lw      a1, SP_Y(s0)
        sw      a0, SP_WAS_X(s0)
        sw      a1, SP_WAS_Y(s0)
        lw      a2, SP_SOURCE(s0)
        sw      a2, SP_WAS_SOURCE(s0)
        jal     draw_sprite
rs_draw_next:
        addi    s0, s0, SP_SIZE
        addi    s1, s1, -1
        bnez    s1, rs_draw
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
        ret
