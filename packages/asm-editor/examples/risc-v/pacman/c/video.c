/*
 * Drawing. The picture is kept twice: `background` holds the maze, dots and text, and the Screen,
 * `display`, shows the background with the sprites on top. Moving a sprite is then two copies:
 * the old place from the background, the new place from the sprite sheet.
 */

/*
 * One 8 by 8 tile into the background and onto the Screen, from cell `cell` of tiles.bmp: its lit
 * pixels in `tint`, or in their own colors when the tint is 0, and the maze picture under its black
 * ones.
 */
static void draw_glyph(int column, int row, int cell, uint32_t tint) {
    const uint32_t *source = tile_sheet + (cell / 16) * 8 * TILES_W + (cell % 16) * 8;
    int first = row * 8 * GAME_W + column * 8;
    for (int y = 0; y < 8; y++) {
        for (int x = 0; x < 8; x++) {
            int index = first + y * GAME_W + x;
            uint32_t color = source[y * TILES_W + x];
            if (!color) color = maze_image[index];
            else if (tint) color = tint;
            background[index] = color;
            display[index] = color;
        }
    }
}

/* The tile as the maze has it now: the maze picture, with the dot or energizer still on it. */
static void redraw_tile(int column, int row) {
    int cell = 0; /* the space: only the maze picture */
    if (row >= MAZE_FIRST_ROW && row <= MAZE_LAST_ROW && column >= 0 && column < MAZE_COLS) {
        char tile = tiles[row - MAZE_FIRST_ROW][column];
        if (tile == '.') cell = TILE_DOT;
        else if (tile == 'o') cell = TILE_ENERGIZER;
    }
    draw_glyph(column, row, cell, 0);
}

static void draw_text(const char *text, int column, int row, uint32_t color) {
    for (; *text; text++, column++) draw_glyph(column, row, *text - 32, color);
}

/* Puts the maze back under some text. */
static void clear_text(int column, int row, int length) {
    for (int i = 0; i < length; i++) redraw_tile(column + i, row);
}

/* The value right-aligned in white, its last digit at `last_column`, leading tiles blank. */
static void draw_number(int value, int last_column, int row, int width, int fewest_digits) {
    for (int drawn = 0; width > 0; width--, last_column--) {
        int cell = 0;
        if (value != 0 || drawn < fewest_digits) {
            cell = '0' - 32 + value % 10;
            value /= 10;
            drawn++;
        }
        draw_glyph(last_column, row, cell, COLOR_WHITE);
    }
}

/* The top-left word of a 16 by 16 cell of sprites.bmp. */
static const uint32_t *sheet_cell(int column, int row) {
    return sprite_sheet + row * 16 * SHEET_W + column * 16;
}

/* The columns of a 16 pixel wide sprite at x that are inside the game: it may be in the tunnel. */
static int first_visible_column(int x) {
    return x < 0 ? -x : 0;
}
static int end_visible_column(int x) {
    return GAME_W - x < 16 ? GAME_W - x : 16;
}

/*
 * The cell's non-black pixels onto the Screen, top-left corner at (x, y). A sprite wholly inside
 * the game, which is nearly every sprite, takes a loop of a constant 16 the compiler unrolls.
 */
static void draw_sprite(int x, int y, const uint32_t *cell) {
    if (x >= 0 && x <= GAME_W - 16) {
        uint32_t *target = display + y * GAME_W + x;
        for (int row = 0; row < 16; row++, cell += SHEET_W, target += GAME_W)
            for (int column = 0; column < 16; column++)
                if (cell[column]) target[column] = cell[column];
        return;
    }
    int first = first_visible_column(x), last = end_visible_column(x);
    for (int row = 0; row < 16; row++) {
        const uint32_t *source = cell + row * SHEET_W;
        int line = (y + row) * GAME_W + x;
        for (int column = first; column < last; column++)
            if (source[column]) display[line + column] = source[column];
    }
}

/*
 * The background back over the pixels the sprite drawn there covered, and only those: every store
 * to the Screen costs the simulator far more than an instruction does.
 */
static void erase_sprite(int x, int y, const uint32_t *cell) {
    if (x >= 0 && x <= GAME_W - 16) {
        int index = y * GAME_W + x;
        for (int row = 0; row < 16; row++, cell += SHEET_W, index += GAME_W)
            for (int column = 0; column < 16; column++)
                if (cell[column]) display[index + column] = background[index + column];
        return;
    }
    int first = first_visible_column(x), last = end_visible_column(x);
    for (int row = 0; row < 16; row++) {
        const uint32_t *source = cell + row * SHEET_W;
        int line = (y + row) * GAME_W + x;
        for (int column = first; column < last; column++)
            if (source[column]) display[line + column] = background[line + column];
    }
}

/* A sprite drawn into the background as well, for the icons at the bottom that never move. */
static void stamp_sprite(int x, int y, const uint32_t *cell) {
    for (int row = 0; row < 16; row++)
        for (int column = 0; column < 16; column++) {
            uint32_t color = cell[row * SHEET_W + column];
            if (!color) continue;
            int index = (y + row) * GAME_W + x + column;
            background[index] = color;
            display[index] = color;
        }
}

/* The maze picture back over a rectangle, in the background and on the Screen. */
static void restore_rect(int x, int y, int width, int height) {
    for (int row = y; row < y + height; row++)
        for (int column = x; column < x + width; column++) {
            int index = row * GAME_W + column;
            background[index] = display[index] = maze_image[index];
        }
}

/* The whole game area from the maze picture, then the dots and energizers left in `tiles`. */
static void draw_maze(void) {
    for (int index = 0; index < GAME_W * GAME_H; index++) {
        uint32_t color = maze_image[index];
        background[index] = color;
        if (display[index] != color) display[index] = color;
    }
    for (int row = 0; row < MAZE_ROWS; row++)
        for (int column = 0; column < MAZE_COLS; column++)
            if (tiles[row][column] == '.' || tiles[row][column] == 'o')
                redraw_tile(column, row + MAZE_FIRST_ROW);
}

/* The maze's lines in white, or back in the maze picture's own colors. */
static void flash_walls(int white) {
    for (int i = 0; i < wall_pixel_count; i++) {
        int index = wall_pixels[i];
        background[index] = display[index] = white ? COLOR_FLASH : maze_image[index];
    }
}

/* Shows a sprite this frame, centred on (centre_x, centre_y). */
static void set_slot(int slot, const uint32_t *cell, int centre_x, int centre_y) {
    slots[slot].visible = 1;
    slots[slot].x = centre_x - 7;
    slots[slot].y = centre_y - 7;
    slots[slot].cell = cell;
}

static void hide_slots(void) {
    for (int slot = 0; slot < SLOT_COUNT; slot++) slots[slot].visible = 0;
}

/* Last frame's sprites off the Screen, then this frame's on, a later slot over an earlier one. */
static void render_sprites(void) {
    for (int slot = 0; slot < SLOT_COUNT; slot++) {
        struct Slot *s = &slots[slot];
        if (s->was_visible) erase_sprite(s->was_x, s->was_y, s->was_cell);
    }
    for (int slot = 0; slot < SLOT_COUNT; slot++) {
        struct Slot *s = &slots[slot];
        s->was_visible = s->visible;
        if (!s->visible) continue;
        s->was_x = s->x;
        s->was_y = s->y;
        s->was_cell = s->cell;
        draw_sprite(s->x, s->y, s->cell);
    }
}
