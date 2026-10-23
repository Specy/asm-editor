/*
 * PAC-MAN in C: what every part of the program shares. pacman.c includes this header and then each
 * of the other .c Files of this folder, so the game is compiled as one unit, as the assembly
 * version in ../assembly is assembled as one; the prototypes at the end let a part call a function
 * that a later part defines.
 */
#ifndef PACMAN_H
#define PACMAN_H

#include <stdint.h>

/* The Screen: the arcade's own 224 by 288 pixels, a word each. */
#define GAME_W 224
#define GAME_H 288

/* The maze: 28 by 31 tiles of 8 by 8 pixels, starting 3 tile rows down, under the score. */
#define MAZE_COLS 28
#define MAZE_ROWS 31
#define MAZE_FIRST_ROW 3
#define MAZE_LAST_ROW 33
#define TUNNEL_ROW 17
#define MAZE_IMAGE_W 224
#define MAZE_IMAGE_H 248
#define MAZE_TOP 24

/* The pictures: sprites.bmp has 16 by 9 cells of 16 by 16, tiles.bmp 16 by 5 cells of 8 by 8. */
#define SHEET_W 256
#define SHEET_H 144
#define TILES_W 128
#define TILES_H 40
#define TILE_DOT 64
#define TILE_ENERGIZER 65
#define FILE_BUFFER_BYTES 262144
#define MAX_WALL_PIXELS 32768

#define COLOR_WHITE 0xffffffu
#define COLOR_YELLOW 0xffff00u
#define COLOR_RED 0xff0000u
#define COLOR_CYAN 0x00ffffu
#define COLOR_ORANGE 0xffb852u
#define COLOR_FLASH 0xdedeffu

/* Opposite directions differ in bit 0 only, so d ^ 1 turns one around. */
enum Direction { RIGHT, LEFT, UP, DOWN };

enum GameState {
    TITLE,      /* the maze and PUSH SPACE: any key starts a game */
    READY,      /* READY! for two seconds, after PLAYER ONE at the start of a game */
    PLAY,       /* the game itself */
    EAT_GHOST,  /* a second's pause showing a ghost's points */
    DYING,      /* a second's pause, then Pac-Man shrivels away and pops */
    LEVEL_DONE, /* a second's pause, then the maze flashes */
    GAME_OVER   /* GAME OVER for five seconds, or until a key */
};

enum GhostState {
    IN_HOUSE, /* waiting in the ghost house, bobbing */
    LEAVING,  /* on its way out through the door */
    ACTIVE,   /* in the maze: chasing, scattering or frightened */
    EYES,     /* eaten: only the eyes, heading home */
    ENTERING  /* the eyes going down into the house */
};

/* The ghost house and the starting places, in pixels: a tile's centre is 8 * tile + 3. */
#define HOUSE_DOOR_X 111
#define HOUSE_DOOR_Y 115
#define HOUSE_MID_Y 139
#define HOUSE_TOP_Y 135
#define HOUSE_BOTTOM_Y 143
#define PAC_START_X 111
#define PAC_START_Y 211
#define FRUIT_X 111
#define FRUIT_Y 163

/* Speeds are in 1/256 pixel a frame: 320, 1.25 pixels, is the arcade's 100%. */
#define EYES_SPEED 384
#define HOUSE_SPEED 128
#define LEAVING_SPEED 160

struct Ghost {
    int x, y;             /* centre pixel */
    int dir;              /* enum Direction */
    int state;            /* enum GhostState */
    int fright;           /* 1 while blue */
    int acc;              /* speed accumulator, 1/256 pixel */
    int home_x;           /* where it waits in the house */
    int scatter_x;        /* its corner, in tiles */
    int scatter_y;
    int dots;             /* its own dot counter */
    int sheet_row;        /* its row in sprites.bmp */
};

/* One sprite on the Screen: what to draw this frame, and what was drawn last frame. */
struct Slot {
    int visible, x, y;
    const uint32_t *cell;
    int was_visible, was_x, was_y;
    const uint32_t *was_cell;
};
#define SLOT_COUNT 6
#define SLOT_FRUIT 0
#define SLOT_PACMAN 1

/* One level of The Pac-Man Dossier's table A.1. */
struct Level {
    int fruit, fruit_points;
    int pac_speed, ghost_speed, tunnel_speed;
    int elroy1_dots, elroy1_speed, elroy2_dots, elroy2_speed;
    int fright_pac_speed, fright_ghost_speed, fright_frames, flashes;
    const int *modes; /* scatter and chase durations in frames, scatter first */
    int inky_dots, clyde_dots;
};
#define LEVEL_TABLE_LAST 21

/* The sound: three channels play at once, as the arcade's three voices did (sound.c). */
enum SoundChannel {
    CHANNEL_1, /* the start music's bass, the extra life */
    CHANNEL_2, /* the start music's tune, the siren, the frightened ghosts, the eyes going home */
    CHANNEL_3, /* the dots, the fruit, a ghost eaten, the death */
    CHANNEL_COUNT
};
/*
 * The General MIDI instruments the tables play. In the editor's sound bank, timpani is a nearly
 * pure tone that dies away quickly, which keeps a Note a frame sounding like one sweep.
 */
#define INSTRUMENT_PIANO 0
#define INSTRUMENT_BASS 32
#define INSTRUMENT_TIMPANI 47
#define SOUND_END 0      /* in place of a pitch: the table is over */
#define SOUND_REPEAT 255 /* in place of a pitch: back to the table's first event */

/* assets.c */
static void load_assets(void);

/* video.c */
static void draw_glyph(int column, int row, int cell, uint32_t tint);
static void redraw_tile(int column, int row);
static void draw_text(const char *text, int column, int row, uint32_t color);
static void clear_text(int column, int row, int length);
static void draw_number(int value, int last_column, int row, int width, int fewest_digits);
static const uint32_t *sheet_cell(int column, int row);
static void stamp_sprite(int x, int y, const uint32_t *cell);
static void restore_rect(int x, int y, int width, int height);
static void draw_maze(void);
static void flash_walls(int white);
static void set_slot(int slot, const uint32_t *cell, int centre_x, int centre_y);
static void hide_slots(void);
static void render_sprites(void);

/* maze.c */
static int tile_at(int column, int row);
static int is_open(int column, int row);
static void reset_maze(void);
static void draw_energizers(int lit);
static void eat_tile(int column, int row);

/* player.c */
static void reset_pacman(void);
static void update_pacman(void);
static const uint32_t *pacman_frame(void);

/* ghosts.c */
static void reset_ghosts(void);
static void clear_ghost_counters(void);
static struct Ghost *waiting_ghost(int *number);
static void release_ghosts(void);
static void update_ghosts(void);
static void energize(void);
static void update_timers(void);
static void check_collisions(void);
static const uint32_t *ghost_frame(const struct Ghost *ghost);
static uint32_t random_number(void);

/* game.c */
static void enter_state(int state);
static void enter_title(void);
static void update_game(void);
static void add_score(int points);
static void read_input(void);
static void wait_frame(void);

/* sound.c */
static void play_sound(int channel, const uint8_t *script);
static void stop_sounds(void);
static void play_chomp(void);
static void update_sounds(void);

#endif
