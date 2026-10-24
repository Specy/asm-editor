/* Everything the game remembers, and the arcade's tables. */

/* The pictures. All three share the Screen's layout, so y * GAME_W + x is the same pixel in each. */
static uint32_t background[GAME_W * GAME_H];   /* maze, dots and text, without sprites */
static uint32_t maze_image[GAME_W * GAME_H];   /* maze.bmp, from row MAZE_TOP */
static uint32_t sprite_sheet[SHEET_W * SHEET_H];
static uint32_t tile_sheet[TILES_W * TILES_H];
static int32_t wall_pixels[MAX_WALL_PIXELS];   /* where the maze picture is lit */
static int wall_pixel_count;

/* The maze: maze.txt as read, and this level's copy, which loses its dots. */
static char maze_layout[MAZE_ROWS][MAZE_COLS];
static char tiles[MAZE_ROWS][MAZE_COLS];
static int dots_total;
static int energizers[8][2]; /* column and screen row */
static int energizer_count;

/* The game. */
static int game_state = TITLE;
static int state_timer;       /* frames spent in the current state */
static uint32_t frame_count;
static int level = 1;
static const struct Level *level_info;
static int score, high_score;
static int lives;             /* spare lives, drawn at the bottom left */
static int extra_life_given;
static int dots_left, dots_eaten;
static int mode_index;        /* even: scatter, odd: chase */
static int mode_timer;        /* frames left in this mode */
static int fright_timer;
static int ghosts_eaten;      /* since the last energizer */
static struct Ghost *eaten_ghost;
static int global_mode;       /* 1 after a death: one dot counter for all */
static int global_dots;
static int dot_timer;         /* frames since Pac-Man last ate a dot */
static int elroy_enabled = 1;
static int fruit_timer, fruit_score_timer;
static int paused, key_pressed, pause_requested;
static int show_actors;       /* Pac-Man and the ghosts are on the maze */
static int ready_intro;       /* frames of PLAYER ONE before READY! */
static int energizers_lit = 1, oneup_lit = 1;
static uint32_t rng_state = 0x2545f491u;
static uint32_t next_deadline;
static int deadline_thirds;

static int pac_x, pac_y, pac_dir = LEFT;
static int pac_want = LEFT;   /* the direction the player asked for */
static int pac_acc;
static int pac_stall;         /* frames to stand still after eating */
static int pac_anim;          /* pixels moved, for the mouth */

/* Blinky, Pinky, Inky, Clyde. */
static struct Ghost ghosts[4];
static struct Slot slots[SLOT_COUNT];

static const int dir_dx[4] = { 1, -1, 0, 0 };
static const int dir_dy[4] = { 0, 0, -1, 1 };
static const int choice_order[4] = { UP, LEFT, DOWN, RIGHT }; /* the arcade's tie-break order */

/* Where each ghost starts: x, y, direction, state, home x, scatter corner, sprites.bmp row. */
static const struct Ghost ghost_start[4] = {
    { .x = 111, .y = 115, .dir = LEFT, .state = ACTIVE, .home_x = 111,
      .scatter_x = 25, .scatter_y = 0, .sheet_row = 2 },
    { .x = 111, .y = 139, .dir = DOWN, .state = IN_HOUSE, .home_x = 111,
      .scatter_x = 2, .scatter_y = 0, .sheet_row = 3 },
    { .x = 95, .y = 139, .dir = UP, .state = IN_HOUSE, .home_x = 95,
      .scatter_x = 27, .scatter_y = 35, .sheet_row = 4 },
    { .x = 127, .y = 139, .dir = UP, .state = IN_HOUSE, .home_x = 127,
      .scatter_x = 0, .scatter_y = 35, .sheet_row = 5 },
};

/* Scatter and chase durations in frames (60 a second), scatter first; the eighth lasts for ever. */
static const int modes_level1[7] = { 420, 1200, 420, 1200, 300, 1200, 300 };
static const int modes_level2[7] = { 420, 1200, 420, 1200, 300, 61980, 1 };
static const int modes_level5[7] = { 300, 1200, 300, 1200, 300, 62220, 1 };

/*
 * The Pac-Man Dossier's table A.1, one row a level. Speeds are 1/256 pixel a frame, where 320 is
 * the arcade's 100%.
 *   fruit points  pac ghost tunnel  e1 e1spd e2 e2spd  fpac fghost frames flashes modes inky clyde
 */
static const struct Level level_table[LEVEL_TABLE_LAST] = {
    { 0, 100,  256, 240, 128,  20, 256, 10, 272,  288, 160, 360, 5, modes_level1, 30, 60 },
    { 1, 300,  288, 272, 144,  30, 288, 15, 304,  304, 176, 300, 5, modes_level2, 0, 50 },
    { 2, 500,  288, 272, 144,  40, 288, 20, 304,  304, 176, 240, 5, modes_level2, 0, 0 },
    { 2, 500,  288, 272, 144,  40, 288, 20, 304,  304, 176, 180, 5, modes_level2, 0, 0 },
    { 3, 700,  320, 304, 160,  40, 320, 20, 336,  320, 192, 120, 5, modes_level5, 0, 0 },
    { 3, 700,  320, 304, 160,  50, 320, 25, 336,  320, 192, 300, 5, modes_level5, 0, 0 },
    { 4, 1000, 320, 304, 160,  50, 320, 25, 336,  320, 192, 120, 5, modes_level5, 0, 0 },
    { 4, 1000, 320, 304, 160,  50, 320, 25, 336,  320, 192, 120, 5, modes_level5, 0, 0 },
    { 5, 2000, 320, 304, 160,  60, 320, 30, 336,  320, 192, 60,  3, modes_level5, 0, 0 },
    { 5, 2000, 320, 304, 160,  60, 320, 30, 336,  320, 192, 300, 5, modes_level5, 0, 0 },
    { 6, 3000, 320, 304, 160,  60, 320, 30, 336,  320, 192, 120, 5, modes_level5, 0, 0 },
    { 6, 3000, 320, 304, 160,  80, 320, 40, 336,  320, 192, 60,  3, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160,  80, 320, 40, 336,  320, 192, 60,  3, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160,  80, 320, 40, 336,  320, 192, 180, 5, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160, 100, 320, 50, 336,  320, 192, 60,  3, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160, 100, 320, 50, 336,  320, 192, 60,  3, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160, 100, 320, 50, 336,  320, 192, 0,   0, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160, 100, 320, 50, 336,  320, 192, 60,  3, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160, 120, 320, 60, 336,  320, 192, 0,   0, modes_level5, 0, 0 },
    { 7, 5000, 320, 304, 160, 120, 320, 60, 336,  320, 192, 0,   0, modes_level5, 0, 0 },
    { 7, 5000, 288, 304, 160, 120, 320, 60, 336,  320, 192, 0,   0, modes_level5, 0, 0 },
};
