# Loading the game's pictures and maze from the Project's Files, through the RARS file services:
# 1024 opens a File by name, 63 reads from it and 57 closes it.
#
# The pictures are BMP files, unpacked here into words of 0x00RRGGBB, the Screen's own format, so
# drawing them is a copy. Black is transparent in sprites.bmp, so a sprite needs no mask.

        .text
# load_assets: reads maze.txt, maze.bmp, sprites.bmp and tiles.bmp. A File that is missing or not
# what the game expects stops the program with a message saying which File and what is wrong.
load_assets:
        addi    sp, sp, -16
        sw      ra, 12(sp)

        la      a0, name_maze_txt
        jal     read_file
        la      a0, name_maze_txt
        jal     parse_maze

        la      a0, name_maze_bmp
        jal     read_file
        la      a0, maze_image                  # the picture goes below the three score rows
        li      t0, MAZE_TOP_BYTES
        add     a0, a0, t0
        li      a1, MAZE_IMAGE_W
        li      a2, MAZE_IMAGE_H
        li      a3, ROW_BYTES
        la      a4, name_maze_bmp
        jal     decode_bmp

        la      a0, name_sprites
        jal     read_file
        la      a0, sprite_sheet
        li      a1, SHEET_W
        li      a2, SHEET_H
        li      a3, SHEET_ROW_BYTES
        la      a4, name_sprites
        jal     decode_bmp

        la      a0, name_tiles
        jal     read_file
        la      a0, tile_sheet
        li      a1, TILES_W
        li      a2, TILES_H
        li      a3, TILES_ROW_BYTES
        la      a4, name_tiles
        jal     decode_bmp

        jal     collect_wall_pixels

        lw      ra, 12(sp)
        addi    sp, sp, 16
        ret

# read_file(a0 = name): the whole File into file_buffer. Returns its length, also in file_length.
read_file:
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        sw      s2, 0(sp)
        mv      s2, a0
        li      a1, 0                           # read only
        li      a7, SYS_OPEN
        ecall
        bltz    a0, rf_cannot_open
        mv      s0, a0                          # the descriptor
        li      s1, 0                           # bytes read so far
rf_loop:
        li      a2, FILE_BUFFER_BYTES
        sub     a2, a2, s1
        beqz    a2, rf_too_big
        la      a1, file_buffer
        add     a1, a1, s1
        mv      a0, s0
        li      a7, SYS_READ
        ecall
        bltz    a0, rf_cannot_open
        beqz    a0, rf_done                     # end of the File
        add     s1, s1, a0
        j       rf_loop
rf_done:
        mv      a0, s0
        li      a7, SYS_CLOSE
        ecall
        la      t0, file_length
        sw      s1, 0(t0)
        mv      a0, s1
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        lw      s2, 0(sp)
        addi    sp, sp, 16
        ret
rf_cannot_open:
        mv      a0, s2
        la      a1, text_cannot_open
        j       fail
rf_too_big:
        mv      a0, s2
        la      a1, text_too_big
        j       fail

# fail(a0 = File name, a1 = message): prints "pacman: <name><message>" and ends the program.
fail:
        mv      s0, a0
        mv      s1, a1
        la      a0, text_error
        li      a7, SYS_PRINT_STRING
        ecall
        mv      a0, s0
        li      a7, SYS_PRINT_STRING
        ecall
        mv      a0, s1
        li      a7, SYS_PRINT_STRING
        ecall
        li      a7, SYS_EXIT
        ecall

# parse_maze(a0 = name): maze.txt from file_buffer into maze_layout, 31 lines of 28 characters.
# '#' is a wall, '.' a dot, 'o' an energizer, ' ' an empty corridor and '-' the ghost house door;
# any other character is a wall too. Blank lines and carriage returns are skipped.
parse_maze:
        mv      a6, a0
        la      t0, file_buffer
        la      t1, file_length
        lw      t1, 0(t1)
        add     t1, t1, t0                      # the end of the text
        li      t3, 0                           # row
        li      t4, 0                           # column
        li      t5, 0                           # dots and energizers
        li      t6, 1                           # line number, for the message
pm_loop:
        beq     t0, t1, pm_end
        lbu     a1, 0(t0)
        addi    t0, t0, 1
        li      a2, 13
        beq     a1, a2, pm_loop                 # carriage return
        li      a2, 10
        beq     a1, a2, pm_newline
        li      a2, MAZE_ROWS
        bge     t3, a2, pm_bad_rows
        li      a2, MAZE_COLS
        bge     t4, a2, pm_bad_line
        mul     a3, t3, a2                      # maze_layout[row * 28 + column]
        add     a3, a3, t4
        la      a2, maze_layout
        add     a3, a3, a2
        sb      a1, 0(a3)
        addi    t4, t4, 1
        li      a2, '.'
        beq     a1, a2, pm_dot
        li      a2, 'o'
        bne     a1, a2, pm_loop
pm_dot:
        addi    t5, t5, 1
        j       pm_loop
pm_newline:
        beqz    t4, pm_next_line                # a blank line
        li      a2, MAZE_COLS
        bne     t4, a2, pm_bad_line
        addi    t3, t3, 1
        li      t4, 0
pm_next_line:
        addi    t6, t6, 1
        j       pm_loop
pm_end:
        beqz    t4, pm_check                    # the last line had its newline
        li      a2, MAZE_COLS
        bne     t4, a2, pm_bad_line
        addi    t3, t3, 1
pm_check:
        li      a2, MAZE_ROWS
        bne     t3, a2, pm_bad_rows
        la      a2, dots_total
        sw      t5, 0(a2)
        ret
pm_bad_rows:
        mv      a0, a6
        la      a1, text_bad_rows
        j       fail
pm_bad_line:
        mv      s0, a6
        mv      s1, t6
        la      a0, text_error
        li      a7, SYS_PRINT_STRING
        ecall
        mv      a0, s0
        ecall
        la      a0, text_bad_line
        ecall
        mv      a0, s1
        li      a7, SYS_PRINT_INT
        ecall
        la      a0, text_newline
        li      a7, SYS_PRINT_STRING
        ecall
        li      a7, SYS_EXIT
        ecall

# read_u32(a0 = address): the little-endian word there, one byte at a time, since BMP header
# fields are not word aligned and RISC-V would stop on an unaligned lw.
read_u32:
        lbu     t0, 0(a0)
        lbu     t1, 1(a0)
        slli    t1, t1, 8
        or      t0, t0, t1
        lbu     t1, 2(a0)
        slli    t1, t1, 16
        or      t0, t0, t1
        lbu     t1, 3(a0)
        slli    t1, t1, 24
        or      a0, t0, t1
        ret

# decode_bmp(a0 = destination, a1 = width, a2 = height, a3 = destination row bytes, a4 = name):
# unpacks the BMP in file_buffer into 0x00RRGGBB words. It must be exactly width by height pixels,
# 24 or 32 bits a pixel, uncompressed, rows bottom-up or top-down. A 32 bit picture with an alpha
# channel makes its transparent pixels black, which is transparent to the sprite routines.
decode_bmp:
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
        mv      s2, a0                          # destination
        mv      s3, a1                          # width
        mv      s4, a2                          # height
        mv      s5, a3                          # destination row bytes
        mv      s6, a4                          # name
        la      s0, file_buffer
        la      t0, file_length
        lw      s1, 0(t0)                       # file length

        li      t0, 54                          # the smallest header we read
        blt     s1, t0, db_not_bmp
        lbu     t0, 0(s0)
        li      t1, 'B'
        bne     t0, t1, db_not_bmp
        lbu     t0, 1(s0)
        li      t1, 'M'
        bne     t0, t1, db_not_bmp

        addi    a0, s0, 10
        jal     read_u32
        mv      s7, a0                          # where the pixels start
        addi    a0, s0, 14
        jal     read_u32
        mv      s10, a0                         # header size
        li      t0, 40
        blt     s10, t0, db_bad_header
        addi    a0, s0, 18
        jal     read_u32
        bne     a0, s3, db_bad_size
        addi    a0, s0, 22
        jal     read_u32
        li      s9, 0                           # 1 when the rows are stored top-down
        bgez    a0, db_height
        neg     a0, a0
        li      s9, 1
db_height:
        bne     a0, s4, db_bad_size
        lbu     s8, 28(s0)                      # bits a pixel
        lbu     t0, 29(s0)
        slli    t0, t0, 8
        or      s8, s8, t0
        addi    a0, s0, 30
        jal     read_u32                        # compression
        li      t0, 24
        beq     s8, t0, db_24
        li      t0, 32
        bne     s8, t0, db_bad_depth
        beqz    a0, db_depth_ok                 # 32 bits, no alpha channel
        li      t0, 3                           # bit fields: an alpha channel if it has a mask
        bne     a0, t0, db_bad_depth
        li      t0, 56
        blt     s10, t0, db_depth_ok
        addi    a0, s0, 66
        jal     read_u32
        beqz    a0, db_depth_ok
        li      s8, 33                          # 32 bits with alpha
        j       db_depth_ok
db_24:
        bnez    a0, db_bad_depth
db_depth_ok:
        # bytes in one stored row: width * bits a pixel, rounded up to whole words
        li      t0, 24
        li      t1, 3
        beq     s8, t0, db_row_size
        li      t1, 4
db_row_size:
        mul     t2, s3, t1
        addi    t2, t2, 3
        andi    t2, t2, -4                      # t2 = stored row bytes
        mul     t3, t2, s4
        add     t3, t3, s7
        bgt     t3, s1, db_truncated

        li      t4, 0                           # y
db_row:
        mv      t5, t4                          # the stored row holding picture row y
        bnez    s9, db_row_found
        sub     t5, s4, t4
        addi    t5, t5, -1
db_row_found:
        mul     t5, t5, t2
        add     t5, t5, s7
        add     t5, t5, s0                      # t5 = source
        mul     t6, t4, s5
        add     t6, t6, s2                      # t6 = destination
        mv      a1, s3                          # pixels left in the row
        li      t0, 24
        beq     s8, t0, db_px24
        li      t0, 32
        beq     s8, t0, db_px32
db_px33:
        lbu     a2, 0(t5)                       # blue, green, red, alpha
        lbu     a3, 1(t5)
        slli    a3, a3, 8
        or      a2, a2, a3
        lbu     a3, 2(t5)
        slli    a3, a3, 16
        or      a2, a2, a3
        lbu     a3, 3(t5)
        li      a4, 128
        bge     a3, a4, db_px33_store
        li      a2, 0                           # see-through
db_px33_store:
        sw      a2, 0(t6)
        addi    t5, t5, 4
        addi    t6, t6, 4
        addi    a1, a1, -1
        bnez    a1, db_px33
        j       db_row_next
db_px32:
        lbu     a2, 0(t5)
        lbu     a3, 1(t5)
        slli    a3, a3, 8
        or      a2, a2, a3
        lbu     a3, 2(t5)
        slli    a3, a3, 16
        or      a2, a2, a3
        sw      a2, 0(t6)
        addi    t5, t5, 4
        addi    t6, t6, 4
        addi    a1, a1, -1
        bnez    a1, db_px32
        j       db_row_next
db_px24:
        lbu     a2, 0(t5)
        lbu     a3, 1(t5)
        slli    a3, a3, 8
        or      a2, a2, a3
        lbu     a3, 2(t5)
        slli    a3, a3, 16
        or      a2, a2, a3
        sw      a2, 0(t6)
        addi    t5, t5, 3
        addi    t6, t6, 4
        addi    a1, a1, -1
        bnez    a1, db_px24
db_row_next:
        addi    t4, t4, 1
        blt     t4, s4, db_row

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

db_not_bmp:
        mv      a0, s6
        la      a1, text_not_bmp
        j       fail
db_bad_header:
        mv      a0, s6
        la      a1, text_bad_header
        j       fail
db_bad_depth:
        mv      a0, s6
        la      a1, text_bad_depth
        j       fail
db_truncated:
        mv      a0, s6
        la      a1, text_truncated
        j       fail
db_bad_size:
        la      a0, text_error
        li      a7, SYS_PRINT_STRING
        ecall
        mv      a0, s6
        ecall
        la      a0, text_bad_size
        ecall
        mv      a0, s3
        li      a7, SYS_PRINT_INT
        ecall
        la      a0, text_by
        li      a7, SYS_PRINT_STRING
        ecall
        mv      a0, s4
        li      a7, SYS_PRINT_INT
        ecall
        la      a0, text_pixels
        li      a7, SYS_PRINT_STRING
        ecall
        li      a7, SYS_EXIT
        ecall

# collect_wall_pixels: the offset of every lit pixel of the maze picture, so the end-of-level
# flash can repaint just those instead of the whole maze.
collect_wall_pixels:
        la      t0, maze_image
        la      t1, wall_pixels
        li      t2, 0                           # pixels found
        li      a5, MAX_WALL_PIXELS
        li      t3, MAZE_TOP_BYTES              # offset of the row
        li      t4, MAZE_END_BYTES              # offset past the maze
cw_row:
        li      t5, 0                           # byte offset in the row
cw_px:
        add     t6, t3, t5
        add     a0, t0, t6
        lw      a1, 0(a0)
        beqz    a1, cw_next
        bge     t2, a5, cw_next                 # more than the list holds: the rest stay blue
        slli    a2, t2, 2
        add     a2, a2, t1
        sw      t6, 0(a2)
        addi    t2, t2, 1
cw_next:
        addi    t5, t5, 4
        li      a3, ROW_BYTES                   # a row is GAME_W words
        blt     t5, a3, cw_px
        addi    t3, t3, ROW_BYTES
        blt     t3, t4, cw_row
        la      a0, wall_pixel_count
        sw      t2, 0(a0)
        ret
