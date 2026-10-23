# Everything the game remembers, and the arcade's tables.

        .data
# ---------------------------------------------------------------- picture buffers
# Both share the Screen's layout: a row is ROW_BYTES, so one offset, y * ROW_BYTES + x * 4,
# names the same pixel in each of them and on the Screen.
background:     .space  SCREEN_BYTES            # maze, dots and text, without sprites
maze_image:     .space  SCREEN_BYTES            # maze.bmp, unpacked to words, from row 24
sprite_sheet:   .space  147456                  # sprites.bmp, unpacked: 256 by 144 words
tile_sheet:     .space  20480                   # tiles.bmp, unpacked: 128 by 40 words
file_buffer:    .space  262144                  # the raw bytes of the file being loaded
wall_pixels:    .space  131072                  # offsets of the maze picture's lit pixels

        .align  2
file_length:    .word   0
wall_pixel_count:.word  0

# ---------------------------------------------------------------- the maze
maze_layout:    .space  868                     # maze.txt as read, one byte a tile
tiles:          .space  868                     # this level's copy, which loses its dots
        .align  2
dots_total:     .word   0
energizers:     .space  64                      # (column, row) word pairs, at most 8
energizer_count:.word   0

# ---------------------------------------------------------------- the game
game_state:     .word   ST_TITLE
state_timer:    .word   0                       # frames spent in the current state
frame_count:    .word   0
level:          .word   1
level_ptr:      .word   0                       # this level's entry in level_table
score:          .word   0
high_score:     .word   0
lives:          .word   0                       # spare lives, drawn at the bottom left
extra_life_given:.word  0
dots_left:      .word   0
dots_eaten:     .word   0
mode_index:     .word   0                       # even: scatter, odd: chase
mode_timer:     .word   0                       # frames left in this mode, 0 for ever
fright_timer:   .word   0
ghosts_eaten:   .word   0                       # since the last energizer
eaten_ghost:    .word   0                       # the ghost record shown as its score
global_mode:    .word   0                       # 1 after a death: one dot counter for all
global_dots:    .word   0
dot_timer:      .word   0                       # frames since Pac-Man last ate a dot
elroy_enabled:  .word   1
fruit_timer:    .word   0
fruit_score_timer:.word 0
paused:         .word   0
key_pressed:    .word   0
pause_requested:.word   0
show_actors:    .word   0                       # Pac-Man and the ghosts are on the maze
ready_intro:    .word   0                       # frames of PLAYER ONE before READY!
energizers_lit: .word   1
oneup_lit:      .word   1
rng_state:      .word   0x2545f491
next_deadline:  .word   0
deadline_thirds:.word   0

pac_x:          .word   0
pac_y:          .word   0
pac_dir:        .word   LEFT
pac_want:       .word   LEFT                    # the direction the player asked for
pac_acc:        .word   0
pac_stall:      .word   0                       # frames to stand still after eating
pac_anim:       .word   0                       # pixels moved, for the mouth

ghosts:         .space  256                     # GHOST_COUNT records of G_SIZE bytes
slots:          .space  192                     # SLOT_COUNT records of SP_SIZE bytes

# ---------------------------------------------------------------- tables
dir_dx:         .word   1, -1, 0, 0             # indexed by direction
dir_dy:         .word   0, 0, -1, 1
choice_order:   .word   UP, LEFT, DOWN, RIGHT   # the arcade's tie-break order

# Blinky, Pinky, Inky, Clyde: x, y, direction, state, home x, scatter corner x and y (in tiles),
# and the row of sprites.bmp they are drawn from.
ghost_start:    .word   111, 115, LEFT, GS_ACTIVE, 111, 25, 0, 2
                .word   111, 139, DOWN, GS_HOUSE, 111, 2, 0, 3
                .word   95, 139, UP, GS_HOUSE, 95, 27, 35, 4
                .word   127, 139, UP, GS_HOUSE, 127, 0, 35, 5

# Scatter and chase durations in frames (60 a second), scatter first. The eighth mode, chase, lasts
# for ever.
modes_level1:   .word   420, 1200, 420, 1200, 300, 1200, 300
modes_level2:   .word   420, 1200, 420, 1200, 300, 61980, 1
modes_level5:   .word   300, 1200, 300, 1200, 300, 62220, 1

# The Pac-Man Dossier's table A.1, one row a level. Speeds are 1/256 pixel a frame, where 320,
# 1.25 pixels a frame, is the arcade's 100%. The columns are LV_FRUIT .. LV_CLYDE_DOTS.
#               fruit pts   pac  ghost tunnel e1 e1spd e2 e2spd fpac fghost frames flashes modes inky clyde
level_table:
        .word   0, 100,     256, 240, 128,    20, 256, 10, 272, 288, 160, 360, 5, modes_level1, 30, 60
        .word   1, 300,     288, 272, 144,    30, 288, 15, 304, 304, 176, 300, 5, modes_level2, 0, 50
        .word   2, 500,     288, 272, 144,    40, 288, 20, 304, 304, 176, 240, 5, modes_level2, 0, 0
        .word   2, 500,     288, 272, 144,    40, 288, 20, 304, 304, 176, 180, 5, modes_level2, 0, 0
        .word   3, 700,     320, 304, 160,    40, 320, 20, 336, 320, 192, 120, 5, modes_level5, 0, 0
        .word   3, 700,     320, 304, 160,    50, 320, 25, 336, 320, 192, 300, 5, modes_level5, 0, 0
        .word   4, 1000,    320, 304, 160,    50, 320, 25, 336, 320, 192, 120, 5, modes_level5, 0, 0
        .word   4, 1000,    320, 304, 160,    50, 320, 25, 336, 320, 192, 120, 5, modes_level5, 0, 0
        .word   5, 2000,    320, 304, 160,    60, 320, 30, 336, 320, 192, 60, 3, modes_level5, 0, 0
        .word   5, 2000,    320, 304, 160,    60, 320, 30, 336, 320, 192, 300, 5, modes_level5, 0, 0
        .word   6, 3000,    320, 304, 160,    60, 320, 30, 336, 320, 192, 120, 5, modes_level5, 0, 0
        .word   6, 3000,    320, 304, 160,    80, 320, 40, 336, 320, 192, 60, 3, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    80, 320, 40, 336, 320, 192, 60, 3, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    80, 320, 40, 336, 320, 192, 180, 5, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    100, 320, 50, 336, 320, 192, 60, 3, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    100, 320, 50, 336, 320, 192, 60, 3, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    100, 320, 50, 336, 320, 192, 0, 0, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    100, 320, 50, 336, 320, 192, 60, 3, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    120, 320, 60, 336, 320, 192, 0, 0, modes_level5, 0, 0
        .word   7, 5000,    320, 304, 160,    120, 320, 60, 336, 320, 192, 0, 0, modes_level5, 0, 0
        .word   7, 5000,    288, 304, 160,    120, 320, 60, 336, 320, 192, 0, 0, modes_level5, 0, 0

# ---------------------------------------------------------------- text
name_maze_txt:  .asciz  "assets/maze.txt"            # Project paths, from the Project's root
name_maze_bmp:  .asciz  "assets/maze.bmp"
name_sprites:   .asciz  "assets/sprites.bmp"
name_tiles:     .asciz  "assets/tiles.bmp"

text_1up:       .asciz  "1UP"
text_high:      .asciz  "HIGH SCORE"
text_ready:     .asciz  "READY!"
text_player:    .asciz  "PLAYER ONE"
text_game_over: .asciz  "GAME  OVER"
text_push:      .asciz  "PUSH SPACE"
text_paused:    .asciz  "PAUSED"

text_banner:    .ascii  "PAC-MAN for RISC-V\n"
                .ascii  "Click the Screen so it gets the keyboard, then press space.\n"
                .ascii  "Move with W A S D (Z Q S D and 8 4 5 6 work too), P pauses.\n"
                .asciz  "The arrow keys do not type characters, so the game cannot see them.\n"
text_error:     .asciz  "pacman: "
text_cannot_open:.asciz ": cannot open it. It has to be a File of this Project.\n"
text_too_big:   .asciz  ": it is larger than the 256 KB the program reads.\n"
text_not_bmp:   .asciz  ": not a BMP picture.\n"
text_bad_header:.asciz  ": the BMP header is not one this program reads (save it as a plain 24 bit BMP).\n"
text_bad_size:  .asciz  ": the picture has the wrong size. It must be "
text_by:        .asciz  " by "
text_pixels:    .asciz  " pixels.\n"
text_bad_depth: .asciz  ": save it as a 24 or 32 bit BMP, without compression.\n"
text_truncated: .asciz  ": the file ends before its last row of pixels.\n"
text_bad_line:  .asciz  ": every line must be 28 characters long; this one is not: line "
text_bad_rows:  .asciz  ": the maze must be 31 lines of 28 characters.\n"
text_newline:   .asciz  "\n"
