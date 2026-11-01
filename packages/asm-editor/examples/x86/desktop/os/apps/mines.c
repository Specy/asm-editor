/*
 * Minesweeper: nine by nine squares hide ten mines. A left click opens a square, which shows how
 * many mines touch it; a right click flags one. The first square opened is never a mine. The face
 * starts a new game, and so does F2.
 */

enum { GRID = 9, MINE_COUNT = 10, CELL = 16, MARGIN = 8, HEADER = 36 };
enum { MINES_W = 2 * MARGIN + GRID * CELL + 6, MINES_H = 3 * MARGIN + HEADER + GRID * CELL + 6 };
enum { READY, PLAYING, LOST, WON };

typedef struct {
    unsigned char mine[GRID][GRID], open[GRID][GRID], flag[GRID][GRID], near[GRID][GRID];
    int state, flags, opened, seconds;
    int boom_row, boom_column;
    int pressing;            /* the left button is held on the grid */
    ButtonTracker face;
} Mines;

static const uint32_t NUMBER_COLOURS[9] = { 0, 0x0000ff, 0x008000, 0xff0000, 0x000080,
                                            0x800000, 0x008080, 0x000000, 0x808080 };

static Rect mines_face(void) { return rect((MINES_W - 26) / 2, MARGIN + 5, 26, 26); }
static int grid_x(void) { return MARGIN + 3; }
static int grid_y(void) { return 2 * MARGIN + HEADER + 3; }

static void mines_new(Mines *game) {
    ButtonTracker face = game->face;
    memset(game, 0, sizeof *game);
    game->face = face;
    game->state = READY;
}

/* Mines go in once the first square is chosen, never on it or around it. */
static void mines_lay(Mines *game, int safe_row, int safe_column) {
    srand((unsigned)now_ms());
    int laid = 0;
    while (laid < MINE_COUNT) {
        int row = rand() % GRID, column = rand() % GRID;
        if (game->mine[row][column]) continue;
        if (abs(row - safe_row) <= 1 && abs(column - safe_column) <= 1) continue;
        game->mine[row][column] = 1;
        laid++;
    }
    for (int row = 0; row < GRID; row++)
        for (int column = 0; column < GRID; column++)
            for (int dr = -1; dr <= 1; dr++)
                for (int dc = -1; dc <= 1; dc++) {
                    int r = row + dr, c = column + dc;
                    if (r >= 0 && r < GRID && c >= 0 && c < GRID && game->mine[r][c])
                        game->near[row][column]++;
                }
}

/* Opens a square, and every square around an empty one, without recursion: a square is opened
 * as it goes on the stack, so it goes on at most once. */
static void mines_open_square(Mines *game, int row, int column) {
    int stack[GRID * GRID][2], depth = 0;
    if (game->open[row][column] || game->flag[row][column]) return;
    game->open[row][column] = 1;
    game->opened++;
    stack[depth][0] = row;
    stack[depth++][1] = column;
    while (depth) {
        depth--;
        int r = stack[depth][0], c = stack[depth][1];
        if (game->near[r][c]) continue;
        for (int dr = -1; dr <= 1; dr++)
            for (int dc = -1; dc <= 1; dc++) {
                int nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
                if (game->open[nr][nc] || game->flag[nr][nc]) continue;
                game->open[nr][nc] = 1;
                game->opened++;
                stack[depth][0] = nr;
                stack[depth++][1] = nc;
            }
    }
}

static void mines_reveal(Window *win, Mines *game, int row, int column) {
    if (game->open[row][column] || game->flag[row][column]) return;
    if (game->state == READY) {
        mines_lay(game, row, column);
        game->state = PLAYING;
        window_set_tick(win, 1000);
    }
    if (game->mine[row][column]) {
        game->state = LOST;
        game->boom_row = row;
        game->boom_column = column;
        win->tick_ms = 0;
        sound_boom();
        return;
    }
    mines_open_square(game, row, column);
    if (game->opened == GRID * GRID - MINE_COUNT) {
        game->state = WON;
        win->tick_ms = 0;
        sound_fanfare();
    }
}

/* ------------------------------------------------------------------ drawing */

static void draw_counter(int x, int y, int value) {
    char digits[8];
    snprintf(digits, sizeof digits, "%03d", clamp_int(value, -99, 999));
    fill_rect(x, y, 40, 24, BLACK);
    bevel_thin_sunken(x, y, 40, 24);
    draw_text_bold(x + 7, y + 6, digits, RED);
}

static void draw_mine(int x, int y) {
    fill_circle(x + 8, y + 8, 4, BLACK);
    hline(x + 2, y + 8, 13, BLACK);
    vline(x + 8, y + 2, 13, BLACK);
    put_pixel(x + 4, y + 4, BLACK);
    put_pixel(x + 12, y + 4, BLACK);
    put_pixel(x + 4, y + 12, BLACK);
    put_pixel(x + 12, y + 12, BLACK);
    fill_rect(x + 6, y + 6, 2, 2, WHITE);
}

static void draw_flag(int x, int y) {
    fill_rect(x + 4, y + 3, 5, 5, RED);
    fill_rect(x + 9, y + 4, 1, 3, RED);
    vline(x + 9, y + 3, 9, BLACK);
    fill_rect(x + 6, y + 11, 6, 1, BLACK);
    fill_rect(x + 4, y + 12, 10, 2, BLACK);
}

static void draw_smiley(int x, int y, Mines *game) {
    int cx = x + 13, cy = y + 13;
    fill_circle(cx, cy, 9, BLACK);
    fill_circle(cx, cy, 8, YELLOW);
    if (game->state == LOST) {
        for (int i = -1; i <= 1; i++) {
            put_pixel(cx - 4 + i, cy - 3 + i, BLACK);
            put_pixel(cx - 4 + i, cy - 3 - i, BLACK);
            put_pixel(cx + 3 + i, cy - 3 + i, BLACK);
            put_pixel(cx + 3 + i, cy - 3 - i, BLACK);
        }
        hline(cx - 3, cy + 3, 7, BLACK);
        put_pixel(cx - 4, cy + 4, BLACK);
        put_pixel(cx + 4, cy + 4, BLACK);
    } else if (game->state == WON) {
        hline(cx - 7, cy - 3, 15, BLACK);
        fill_rect(cx - 6, cy - 3, 5, 3, BLACK);
        fill_rect(cx + 2, cy - 3, 5, 3, BLACK);
        hline(cx - 3, cy + 4, 7, BLACK);
        put_pixel(cx - 4, cy + 3, BLACK);
        put_pixel(cx + 4, cy + 3, BLACK);
    } else {
        fill_rect(cx - 4, cy - 4, 2, 2, BLACK);
        fill_rect(cx + 3, cy - 4, 2, 2, BLACK);
        if (game->pressing) {
            draw_circle(cx, cy + 4, 2, BLACK);
        } else {
            hline(cx - 3, cy + 4, 7, BLACK);
            put_pixel(cx - 4, cy + 3, BLACK);
            put_pixel(cx + 4, cy + 3, BLACK);
        }
    }
}

static void draw_square(Mines *game, int row, int column) {
    int x = grid_x() + column * CELL, y = grid_y() + row * CELL;
    int shown = game->open[row][column] ||
                (game->state == LOST && game->mine[row][column] && !game->flag[row][column]);
    if (!shown) {
        fill_rect(x, y, CELL, CELL, FACE);
        hline(x, y, CELL - 1, WHITE);
        hline(x, y + 1, CELL - 2, WHITE);
        vline(x, y, CELL - 1, WHITE);
        vline(x + 1, y, CELL - 2, WHITE);
        hline(x + 1, y + CELL - 1, CELL - 1, SHADOW);
        hline(x + 2, y + CELL - 2, CELL - 2, SHADOW);
        vline(x + CELL - 1, y + 1, CELL - 1, SHADOW);
        vline(x + CELL - 2, y + 2, CELL - 2, SHADOW);
        if (game->flag[row][column]) {
            draw_flag(x, y);
            if (game->state == LOST && !game->mine[row][column]) {
                draw_line(x + 2, y + 2, x + 13, y + 13, RED);
                draw_line(x + 13, y + 2, x + 2, y + 13, RED);
            }
        }
        return;
    }
    int boom = game->state == LOST && row == game->boom_row && column == game->boom_column;
    fill_rect(x, y, CELL, CELL, boom ? RED : FACE);
    hline(x, y, CELL, SHADOW);
    vline(x, y, CELL, SHADOW);
    if (game->mine[row][column]) {
        draw_mine(x, y);
    } else if (game->near[row][column]) {
        char digit[2] = { (char)('0' + game->near[row][column]), 0 };
        draw_text_bold(x + 4, y + 2, digit, NUMBER_COLOURS[game->near[row][column]]);
    }
}

static void mines_paint(Window *win) {
    Mines *game = win->data;
    fill_rect(0, 0, MINES_W, MINES_H, FACE);
    bevel_sunken(MARGIN, MARGIN, MINES_W - 2 * MARGIN, HEADER);
    draw_counter(MARGIN + 6, MARGIN + 6, MINE_COUNT - game->flags);
    draw_counter(MINES_W - MARGIN - 46, MARGIN + 6, game->seconds);
    Rect face = mines_face();
    int down = button_down(&game->face, 0);
    if (down) {
        fill_rect(face.x, face.y, face.w, face.h, FACE);
        frame_rect(face.x, face.y, face.w, face.h, SHADOW);
    } else {
        draw_button(face.x, face.y, face.w, face.h, "", 0);
    }
    draw_smiley(face.x + down, face.y + down, game);
    bevel_sunken(grid_x() - 3, grid_y() - 3, GRID * CELL + 6, GRID * CELL + 6);
    for (int row = 0; row < GRID; row++)
        for (int column = 0; column < GRID; column++) draw_square(game, row, column);
}

static int square_at(int x, int y, int *row, int *column) {
    x -= grid_x();
    y -= grid_y();
    if (x < 0 || y < 0 || x >= GRID * CELL || y >= GRID * CELL) return 0;
    *row = y / CELL;
    *column = x / CELL;
    return 1;
}

static void mines_mouse(Window *win, const MouseEvent *event) {
    Mines *game = win->data;
    Rect face = mines_face();
    if (track_buttons(win, &game->face, &face, 1, event) == 0) {
        mines_new(game);
        win->tick_ms = 0;
        window_invalidate(win);
        return;
    }
    if (game->face.pressed >= 0) return;
    int row = 0, column = 0, on_grid = square_at(event->x, event->y, &row, &column);
    int over = game->state == LOST || game->state == WON;
    if (event->kind == MOUSE_DOWN && event->button == BUTTON_RIGHT && on_grid && !over &&
        !game->open[row][column]) {
        game->flag[row][column] = !game->flag[row][column];
        game->flags += game->flag[row][column] ? 1 : -1;
        window_invalidate(win);
    } else if (event->kind == MOUSE_DOWN && event->button == BUTTON_LEFT && on_grid && !over) {
        game->pressing = 1;
        window_invalidate_rect(win, face.x, face.y, face.w, face.h);
    } else if (event->kind == MOUSE_UP && event->button == BUTTON_LEFT && game->pressing) {
        game->pressing = 0;
        if (on_grid) mines_reveal(win, game, row, column);
        window_invalidate(win);
    }
}

static void mines_key(Window *win, const KeyEvent *event) {
    if (event->code == KEY_F2) {
        mines_new(win->data);
        win->tick_ms = 0;
        window_invalidate(win);
    }
}

static void mines_tick(Window *win) {
    Mines *game = win->data;
    if (game->state != PLAYING) return;
    game->seconds++;
    window_invalidate_rect(win, MINES_W - MARGIN - 46, MARGIN + 6, 40, 24);
}

static void mines_close(Window *win) { free(win->data); }

void mines_open(const char *argument) {
    (void)argument;
    Window *win = window_open(APP_MINES, "Minesweeper", MINES_W, MINES_H);
    if (!win) return;
    Mines *game = calloc(1, sizeof *game);
    game->face.pressed = -1;
    mines_new(game);
    win->data = game;
    win->paint = mines_paint;
    win->mouse = mines_mouse;
    win->key = mines_key;
    win->tick = mines_tick;
    win->close = mines_close;
}
