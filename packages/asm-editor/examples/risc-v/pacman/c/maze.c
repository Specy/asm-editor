/*
 * The maze as the game plays it: `tiles` is this level's copy of maze.txt, which loses its dots as
 * Pac-Man eats them. Positions are screen tiles: the maze's row 0 is tile row 3, under the score.
 */

/*
 * The maze's character at a tile. Above and below the maze is wall; left and right of it is wall
 * too, except on the tunnel row, which goes on for ever.
 */
static int tile_at(int column, int row) {
    if (row < MAZE_FIRST_ROW || row > MAZE_LAST_ROW) return '#';
    if (column < 0 || column >= MAZE_COLS) return row == TUNNEL_ROW ? ' ' : '#';
    return tiles[row - MAZE_FIRST_ROW][column];
}

/*
 * Whether Pac-Man or a ghost in the maze may walk onto a tile. The ghost house door is not open:
 * only eyes and ghosts leaving go through it, on their own paths.
 */
static int is_open(int column, int row) {
    int tile = tile_at(column, row);
    return tile == ' ' || tile == '.' || tile == 'o';
}

/* A full maze for a new level, and where its energizers are, for their blinking. */
static void reset_maze(void) {
    energizer_count = 0;
    for (int row = 0; row < MAZE_ROWS; row++)
        for (int column = 0; column < MAZE_COLS; column++) {
            char tile = tiles[row][column] = maze_layout[row][column];
            if (tile == 'o' && energizer_count < 8) {
                energizers[energizer_count][0] = column;
                energizers[energizer_count][1] = row + MAZE_FIRST_ROW;
                energizer_count++;
            }
        }
    dots_left = dots_total;
    dots_eaten = 0;
}

/* The energizers still in the maze, lit or dark, for their blinking. */
static void draw_energizers(int lit) {
    for (int i = 0; i < energizer_count; i++) {
        int column = energizers[i][0], row = energizers[i][1];
        if (tile_at(column, row) != 'o') continue; /* eaten already */
        if (lit) redraw_tile(column, row);
        else draw_glyph(column, row, 0, 0); /* the maze picture alone */
    }
}

/* The dot or energizer at a tile is gone. */
static void eat_tile(int column, int row) {
    tiles[row - MAZE_FIRST_ROW][column] = ' ';
    redraw_tile(column, row);
}
