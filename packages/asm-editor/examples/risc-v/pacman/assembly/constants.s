# Names for the numbers the rest of the program uses. RARS replaces each .eqv name with its value
# as plain text, so every value here is a literal: RARS does not evaluate expressions.

# ---------------------------------------------------------------- the screen
# The Screen is the arcade's own 224 by 288 pixels, one word each.
        .eqv    ROW_BYTES, 896                  # one row of the Screen, and of every buffer below
        .eqv    GAME_W, 224
        .eqv    GAME_H, 288
        .eqv    SCREEN_BYTES, 258048            # GAME_H * ROW_BYTES
        .eqv    MAZE_TOP_BYTES, 21504           # the maze starts 3 tile rows down: 24 * ROW_BYTES
        .eqv    MAZE_END_BYTES, 243712          # and ends 248 rows later: 272 * ROW_BYTES

# ---------------------------------------------------------------- the maze
        .eqv    MAZE_COLS, 28
        .eqv    MAZE_ROWS, 31
        .eqv    MAZE_CELLS, 868                 # 28 * 31
        .eqv    MAZE_FIRST_ROW, 3               # screen tile row of maze row 0
        .eqv    MAZE_LAST_ROW, 33
        .eqv    TUNNEL_ROW, 17                  # screen tile row of the side tunnel
        .eqv    MAZE_IMAGE_W, 224
        .eqv    MAZE_IMAGE_H, 248

# ---------------------------------------------------------------- the asset files
        .eqv    FILE_BUFFER_BYTES, 262144
        .eqv    SHEET_W, 256                    # sprites.bmp: 16 by 9 cells of 16 by 16
        .eqv    SHEET_H, 144
        .eqv    SHEET_ROW_BYTES, 1024
        .eqv    SPRITE_ROW_BYTES, 16384         # one row of 16 by 16 cells: 16 * SHEET_ROW_BYTES
        .eqv    TILES_W, 128                    # tiles.bmp: 16 by 5 cells of 8 by 8
        .eqv    TILES_H, 40
        .eqv    TILES_ROW_BYTES, 512
        .eqv    TILE_DOT, 64                    # tiles.bmp cell numbers below the font
        .eqv    TILE_ENERGIZER, 65
        .eqv    MAX_WALL_PIXELS, 32768

# ---------------------------------------------------------------- environment calls
        .eqv    SYS_PRINT_INT, 1
        .eqv    SYS_PRINT_STRING, 4
        .eqv    SYS_EXIT, 10
        .eqv    SYS_TIME, 30
        .eqv    SYS_MIDI_OUT, 31                # plays a Note and goes on at once
        .eqv    SYS_SLEEP, 32
        .eqv    SYS_CLOSE, 57
        .eqv    SYS_READ, 63
        .eqv    SYS_WRITE, 64
        .eqv    SYS_OPEN, 1024
        .eqv    MMIO_BASE, 0xffff0000           # keyboard: +0 control (bit 0 ready), +4 data

# ---------------------------------------------------------------- colors, 0x00RRGGBB
        .eqv    COLOR_WHITE, 0x00ffffff
        .eqv    COLOR_YELLOW, 0x00ffff00
        .eqv    COLOR_RED, 0x00ff0000
        .eqv    COLOR_CYAN, 0x0000ffff
        .eqv    COLOR_ORANGE, 0x00ffb852
        .eqv    COLOR_FLASH, 0x00dedeff

# ---------------------------------------------------------------- directions
# Opposite directions differ in bit 0 only, so `xori d, d, 1` reverses one.
        .eqv    RIGHT, 0
        .eqv    LEFT, 1
        .eqv    UP, 2
        .eqv    DOWN, 3

# ---------------------------------------------------------------- game states
        .eqv    ST_TITLE, 0
        .eqv    ST_READY, 1
        .eqv    ST_PLAY, 2
        .eqv    ST_EAT_GHOST, 3
        .eqv    ST_DYING, 4
        .eqv    ST_LEVEL_DONE, 5
        .eqv    ST_GAME_OVER, 6

# ---------------------------------------------------------------- ghost states
        .eqv    GS_HOUSE, 0                     # waiting in the ghost house, bobbing
        .eqv    GS_LEAVING, 1                   # on its way out through the door
        .eqv    GS_ACTIVE, 2                    # in the maze, chasing, scattering or frightened
        .eqv    GS_EYES, 3                      # eaten: only the eyes, heading home
        .eqv    GS_ENTERING, 4                  # the eyes going down into the house

# One ghost record: a word per field.
        .eqv    G_X, 0                          # centre pixel, game coordinates
        .eqv    G_Y, 4
        .eqv    G_DIR, 8
        .eqv    G_STATE, 12
        .eqv    G_FRIGHT, 16                    # 1 while blue
        .eqv    G_ACC, 20                       # speed accumulator, 1/256 pixel
        .eqv    G_HOME_X, 24                    # where it waits in the house
        .eqv    G_SCATTER_X, 28                 # its corner, in tiles
        .eqv    G_SCATTER_Y, 32
        .eqv    G_DOTS, 36                      # its personal dot counter
        .eqv    G_SHEET_ROW, 40                 # its row in sprites.bmp
        .eqv    G_SIZE, 64
        .eqv    GHOST_COUNT, 4

# The ghost house and the starting places, in game pixels (a tile's centre is 8 * tile + 3).
        .eqv    HOUSE_DOOR_X, 111               # between tiles 13 and 14
        .eqv    HOUSE_DOOR_Y, 115               # tile row 14, just above the door
        .eqv    HOUSE_MID_Y, 139                # tile row 17, the middle of the house
        .eqv    HOUSE_TOP_Y, 135
        .eqv    HOUSE_BOTTOM_Y, 143
        .eqv    PAC_START_X, 111
        .eqv    PAC_START_Y, 211                # tile row 26
        .eqv    FRUIT_X, 104                    # top-left of the fruit sprite, tile row 20
        .eqv    FRUIT_Y, 156

# One sprite slot, drawn in slot order: what to draw this frame, and what was drawn last frame.
        .eqv    SP_VISIBLE, 0
        .eqv    SP_X, 4                         # top-left, game pixels
        .eqv    SP_Y, 8
        .eqv    SP_SOURCE, 12                   # address of the cell's top-left word in the sheet
        .eqv    SP_WAS_VISIBLE, 16
        .eqv    SP_WAS_X, 20
        .eqv    SP_WAS_Y, 24
        .eqv    SP_WAS_SOURCE, 28
        .eqv    SP_SIZE, 32
        .eqv    SLOT_COUNT, 6
        .eqv    SLOT_FRUIT, 0
        .eqv    SLOT_PACMAN, 1

# One level of the level table: a word per field.
        .eqv    LV_FRUIT, 0                     # 0 cherry .. 7 key
        .eqv    LV_FRUIT_POINTS, 4
        .eqv    LV_PAC_SPEED, 8                 # speeds in 1/256 pixel a frame: 320 is 100%
        .eqv    LV_GHOST_SPEED, 12
        .eqv    LV_TUNNEL_SPEED, 16
        .eqv    LV_ELROY1_DOTS, 20
        .eqv    LV_ELROY1_SPEED, 24
        .eqv    LV_ELROY2_DOTS, 28
        .eqv    LV_ELROY2_SPEED, 32
        .eqv    LV_FRIGHT_PAC_SPEED, 36
        .eqv    LV_FRIGHT_GHOST_SPEED, 40
        .eqv    LV_FRIGHT_FRAMES, 44
        .eqv    LV_FLASHES, 48
        .eqv    LV_MODES, 52                    # address of the scatter/chase timetable
        .eqv    LV_INKY_DOTS, 56
        .eqv    LV_CLYDE_DOTS, 60
        .eqv    LV_SIZE, 64
        .eqv    LEVEL_TABLE_LAST, 21            # levels past 21 play like 21

# ---------------------------------------------------------------- sound
# Three channels play at once, as the arcade's three voices did (sound.s).
        .eqv    CHANNEL_1, 0                    # the start music's bass, the extra life
        .eqv    CHANNEL_2, 1                    # the tune, the siren, frightened, eyes going home
        .eqv    CHANNEL_3, 2                    # the dots, the fruit, a ghost eaten, the death
        .eqv    CHANNEL_COUNT, 3

# One channel record: a word per field.
        .eqv    CH_NEXT, 0                      # the next event, 0 when the channel is silent
        .eqv    CH_START, 4                     # the first event, where SOUND_REPEAT goes back to
        .eqv    CH_WAIT, 8                      # frames before the next event
        .eqv    CH_INSTRUMENT, 12
        .eqv    CH_SIZE, 16

# The General MIDI instruments the tables play. In the editor's sound bank, timpani is a nearly pure
# tone that dies away quickly, which keeps a Note a frame sounding like one sweep.
        .eqv    INSTRUMENT_PIANO, 0
        .eqv    INSTRUMENT_BASS, 32
        .eqv    INSTRUMENT_TIMPANI, 47

        .eqv    SOUND_END, 0                    # in place of a pitch: the table is over
        .eqv    SOUND_REPEAT, 255               # in place of a pitch: back to the first event

        .eqv    EYES_SPEED, 384
        .eqv    HOUSE_SPEED, 128
        .eqv    LEAVING_SPEED, 160
