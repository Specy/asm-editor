/*
 * Paint: a canvas, eight tools and a palette. The left button paints with the first colour and
 * the right button with the second; a click on the palette chooses them the same way. Save
 * writes the picture into the Project as a .bmp File, which the editor's Pixels view opens too.
 */

enum { CANVAS_W = 400, CANVAS_H = 260, TOOLBOX_W = 58, SWATCH = 14 };
enum { CANVAS_X = TOOLBOX_W + 4, CANVAS_Y = 6 };
enum { PAINT_W = CANVAS_X + CANVAS_W + 8, PAINT_H = CANVAS_Y + CANVAS_H + 4 + 46 };
enum { PENCIL, BRUSH, ERASER, FILL, LINE, BOX, OVAL, SPRAY, TOOL_COUNT };

static const char *const TOOL_NAMES[TOOL_COUNT] = { "Pencil", "Brush", "Eraser", "Fill",
                                                     "Line", "Rectangle", "Ellipse", "Spray" };
static const uint32_t PALETTE[2][14] = {
    { 0x000000, 0x808080, 0x800000, 0x808000, 0x008000, 0x008080, 0x000080, 0x800080, 0x808040,
      0x004040, 0x0080ff, 0x004080, 0x8000ff, 0x804000 },
    { 0xffffff, 0xc0c0c0, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffff80,
      0x00ff80, 0x80ffff, 0x8080ff, 0xff0080, 0xff8040 },
};

typedef struct {
    uint32_t *canvas;
    int tool;
    uint32_t colours[2];      /* the left button's and the right button's */
    int drawing;              /* the button painting now, or 0 */
    int x0, y0, x1, y1;       /* a stroke's last point, or a shape's corners, on the canvas */
    char path[64];
    char message[64];
    ButtonTracker buttons;    /* Clear and Save */
} Paint;

static Rect paint_tool(int index) { return rect(6 + index % 2 * 24, 6 + index / 2 * 24, 23, 23); }
static Rect paint_buttons[2];
static Rect paint_swatch(int row, int column) {
    return rect(CANVAS_X + 34 + column * (SWATCH + 1), CANVAS_Y + CANVAS_H + 10 + row * (SWATCH + 1),
                SWATCH, SWATCH);
}

/* ------------------------------------------------------------------ drawing on the canvas */

static GfxState canvas_saved;

static void canvas_begin(Paint *paint) {
    canvas_saved = gfx_save();
    gfx_target(paint->canvas, CANVAS_W, CANVAS_H, CANVAS_W);
}
static void canvas_end(void) { gfx_restore(canvas_saved); }

static void draw_oval(int x0, int y0, int x1, int y1, uint32_t colour) {
    double cx = (x0 + x1) / 2.0, cy = (y0 + y1) / 2.0, rx = abs(x1 - x0) / 2.0,
           ry = abs(y1 - y0) / 2.0;
    int steps = 16 + (int)(rx + ry);
    int px = (int)(cx + rx), py = (int)cy;
    for (int i = 1; i <= steps; i++) {
        double angle = 2 * M_PI * i / steps;
        int x = (int)(cx + rx * cos(angle) + 0.5), y = (int)(cy + ry * sin(angle) + 0.5);
        draw_line(px, py, x, y, colour);
        px = x;
        py = y;
    }
}

static void draw_shape(int tool, int x0, int y0, int x1, int y1, uint32_t colour) {
    if (tool == LINE) draw_line(x0, y0, x1, y1, colour);
    if (tool == BOX)
        frame_rect(min_int(x0, x1), min_int(y0, y1), abs(x1 - x0) + 1, abs(y1 - y0) + 1, colour);
    if (tool == OVAL) draw_oval(x0, y0, x1, y1, colour);
}

/* Fills the area of one colour around x, y, a row at a time. */
static void flood_fill(uint32_t *pixels, int x, int y, uint32_t colour) {
    uint32_t old = pixels[y * CANVAS_W + x];
    if (old == colour) return;
    int capacity = CANVAS_W * CANVAS_H / 4 + 64, depth = 0;
    int *stack = malloc(capacity * 2 * sizeof *stack);
    if (!stack) return;
    stack[depth * 2] = x;
    stack[depth++ * 2 + 1] = y;
    while (depth) {
        depth--;
        int sx = stack[depth * 2], sy = stack[depth * 2 + 1];
        uint32_t *row = pixels + sy * CANVAS_W;
        if (row[sx] != old) continue;
        int left = sx, right = sx;
        while (left > 0 && row[left - 1] == old) left--;
        while (right < CANVAS_W - 1 && row[right + 1] == old) right++;
        for (int i = left; i <= right; i++) row[i] = colour;
        for (int dy = -1; dy <= 1; dy += 2) {
            int ny = sy + dy;
            if (ny < 0 || ny >= CANVAS_H) continue;
            uint32_t *next = pixels + ny * CANVAS_W;
            for (int i = left; i <= right; i++) {
                if (next[i] != old || (i > left && next[i - 1] == old)) continue;
                if (depth < capacity) {
                    stack[depth * 2] = i;
                    stack[depth++ * 2 + 1] = ny;
                }
            }
        }
    }
    free(stack);
}

static void spray(Paint *paint, int x, int y, uint32_t colour) {
    for (int i = 0; i < 14; i++) {
        int dx = rand() % 17 - 8, dy = rand() % 17 - 8;
        if (dx * dx + dy * dy <= 64) put_pixel(x + dx, y + dy, colour);
    }
    (void)paint;
}

/* A stroke from the last point to x, y with the current tool. */
static void paint_stroke(Paint *paint, int x, int y) {
    uint32_t colour = paint->colours[paint->drawing == BUTTON_RIGHT];
    canvas_begin(paint);
    if (paint->tool == PENCIL) draw_line(paint->x0, paint->y0, x, y, colour);
    if (paint->tool == BRUSH) thick_line(paint->x0, paint->y0, x, y, 4, colour);
    if (paint->tool == ERASER) thick_line(paint->x0, paint->y0, x, y, 12, paint->colours[1]);
    if (paint->tool == SPRAY) spray(paint, x, y, colour);
    canvas_end();
    paint->x0 = x;
    paint->y0 = y;
}

/* ------------------------------------------------------------------ files */

static int put16(unsigned char *at, int value) {
    at[0] = value & 0xff;
    at[1] = value >> 8 & 0xff;
    return 2;
}
static int put32(unsigned char *at, long value) {
    put16(at, (int)(value & 0xffff));
    put16(at + 2, (int)(value >> 16 & 0xffff));
    return 4;
}

/* Writes the canvas as an uncompressed 24-bit BMP: a header, then the rows bottom-up. */
static int paint_save_bmp(Paint *paint, const char *path) {
    FILE *file = fopen(path, "wb");
    if (!file) return 0;
    int row_bytes = (CANVAS_W * 3 + 3) & ~3;
    long data = (long)row_bytes * CANVAS_H;
    unsigned char header[54] = { 'B', 'M' };
    put32(header + 2, 54 + data);
    put32(header + 10, 54);
    put32(header + 14, 40);
    put32(header + 18, CANVAS_W);
    put32(header + 22, CANVAS_H);
    put16(header + 26, 1);
    put16(header + 28, 24);
    put32(header + 34, data);
    put32(header + 38, 2835);
    put32(header + 42, 2835);
    fwrite(header, 1, sizeof header, file);
    unsigned char *row = calloc(row_bytes, 1);
    for (int y = CANVAS_H - 1; y >= 0; y--) {
        const uint32_t *pixels = paint->canvas + y * CANVAS_W;
        for (int x = 0; x < CANVAS_W; x++) {
            row[x * 3] = pixels[x] & 0xff;
            row[x * 3 + 1] = pixels[x] >> 8 & 0xff;
            row[x * 3 + 2] = pixels[x] >> 16 & 0xff;
        }
        fwrite(row, 1, row_bytes, file);
    }
    free(row);
    return fclose(file) == 0;
}

static long get32(const unsigned char *at) {
    return (long)(at[0] | at[1] << 8 | at[2] << 16 | (unsigned long)at[3] << 24);
}

/* Reads an uncompressed 24- or 32-bit BMP into the top-left of the canvas. */
static int paint_load_bmp(Paint *paint, const char *path) {
    FILE *file = fopen(path, "rb");
    if (!file) return 0;
    unsigned char header[54];
    int ok = fread(header, 1, 54, file) == 54 && header[0] == 'B' && header[1] == 'M';
    long offset = get32(header + 10), width = get32(header + 18), height = get32(header + 22);
    int bits = header[28] | header[29] << 8, compression = (int)get32(header + 30);
    ok = ok && (bits == 24 || bits == 32) && (compression == 0 || compression == 3) &&
         width > 0 && width <= 4096 && height != 0;
    if (!ok) {
        fclose(file);
        return 0;
    }
    int top_down = height < 0;
    if (top_down) height = -height;
    int bytes = bits / 8, row_bytes = (int)((width * bytes + 3) & ~3);
    unsigned char *row = malloc(row_bytes);
    for (long y = 0; y < height; y++) {
        fseek(file, offset + y * row_bytes, SEEK_SET);
        if (fread(row, 1, row_bytes, file) != (size_t)row_bytes) break;
        long canvas_y = top_down ? y : height - 1 - y;
        if (canvas_y >= CANVAS_H) continue;
        for (long x = 0; x < width && x < CANVAS_W; x++)
            paint->canvas[canvas_y * CANVAS_W + x] =
                (uint32_t)(row[x * bytes + 2] << 16 | row[x * bytes + 1] << 8 | row[x * bytes]);
    }
    free(row);
    fclose(file);
    return 1;
}

/* The name of a file without its folders, which is what fits beside the palette. */
static const char *base_name(const char *path) {
    const char *slash = strrchr(path, '/');
    return slash ? slash + 1 : path;
}

static void paint_title(Window *win, Paint *paint) {
    char title[96];
    snprintf(title, sizeof title, "%s - Paint", paint->path[0] ? paint->path : "Untitled");
    window_set_title(win, title);
}

static void paint_save(Window *win, Paint *paint) {
    if (!paint->path[0]) {
        for (int number = 1; number < 1000; number++) {
            struct stat info;
            snprintf(paint->path, sizeof paint->path, "painting%d.bmp", number);
            if (stat(paint->path, &info) != 0) break;
        }
    }
    if (paint_save_bmp(paint, paint->path)) {
        snprintf(paint->message, sizeof paint->message, "Saved %.48s", base_name(paint->path));
    } else {
        snprintf(paint->message, sizeof paint->message, "Could not save %.40s", base_name(paint->path));
        desktop_beep();
    }
    paint_title(win, paint);
    window_invalidate(win);
}

/* ------------------------------------------------------------------ the window */

static void draw_tool_picture(int tool, int x, int y) {
    switch (tool) {
    case PENCIL:
        thick_line(x + 5, y + 12, x + 12, y + 5, 3, 0xe0b000);
        draw_line(x + 3, y + 14, x + 4, y + 13, BLACK);
        fill_rect(x + 12, y + 3, 3, 3, 0xff8080);
        break;
    case BRUSH:
        thick_line(x + 8, y + 9, x + 13, y + 3, 2, 0xa05a2c);
        fill_circle(x + 6, y + 11, 3, BLACK);
        break;
    case ERASER:
        fill_rect(x + 3, y + 6, 11, 7, 0xff9fbf);
        frame_rect(x + 3, y + 6, 11, 7, BLACK);
        vline(x + 7, y + 6, 7, BLACK);
        break;
    case FILL:
        frame_rect(x + 3, y + 5, 9, 9, BLACK);
        fill_rect(x + 4, y + 9, 7, 4, 0x0000ff);
        fill_rect(x + 12, y + 7, 2, 6, 0x0000ff);
        break;
    case LINE: draw_line(x + 3, y + 13, x + 13, y + 3, BLACK); break;
    case BOX: frame_rect(x + 3, y + 4, 11, 9, BLACK); break;
    case OVAL: draw_circle(x + 8, y + 8, 5, BLACK); break;
    case SPRAY: {
        static const signed char dots[][2] = { { 8, 3 }, { 5, 6 }, { 11, 6 }, { 8, 8 }, { 4, 10 },
                                               { 12, 10 }, { 7, 12 }, { 10, 13 }, { 6, 4 } };
        for (int i = 0; i < 9; i++) put_pixel(x + dots[i][0], y + dots[i][1], BLACK);
        break;
    }
    }
}

static void paint_paint(Window *win) {
    Paint *paint = win->data;
    fill_rect(0, 0, PAINT_W, PAINT_H, FACE);
    for (int i = 0; i < TOOL_COUNT; i++) {
        Rect tool = paint_tool(i);
        int chosen = i == paint->tool;
        if (chosen) {
            fill_rect(tool.x, tool.y, tool.w, tool.h, WHITE);
            bevel_sunken(tool.x, tool.y, tool.w, tool.h);
        } else {
            draw_button(tool.x, tool.y, tool.w, tool.h, "", 0);
        }
        draw_tool_picture(i, tool.x + 3 + chosen, tool.y + 3 + chosen);
    }
    draw_text(6, 106, TOOL_NAMES[paint->tool], NAVY);
    draw_button(paint_buttons[0].x, paint_buttons[0].y, paint_buttons[0].w, paint_buttons[0].h,
                "Clear", button_down(&paint->buttons, 0));
    draw_button(paint_buttons[1].x, paint_buttons[1].y, paint_buttons[1].w, paint_buttons[1].h,
                "Save", button_down(&paint->buttons, 1));
    bevel_sunken(CANVAS_X - 2, CANVAS_Y - 2, CANVAS_W + 4, CANVAS_H + 4);
    blit(paint->canvas, CANVAS_W, CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H);
    if (paint->drawing && (paint->tool == LINE || paint->tool == BOX || paint->tool == OVAL)) {
        /* the shape being dragged, drawn over the canvas until the button comes up */
        Rect clip = gfx_get_clip();
        int ox, oy;
        gfx_get_origin(&ox, &oy);
        gfx_clip(rect_intersect(clip, rect(ox + CANVAS_X, oy + CANVAS_Y, CANVAS_W, CANVAS_H)));
        gfx_origin(ox + CANVAS_X, oy + CANVAS_Y);
        draw_shape(paint->tool, paint->x0, paint->y0, paint->x1, paint->y1,
                   paint->colours[paint->drawing == BUTTON_RIGHT]);
        gfx_origin(ox, oy);
        gfx_clip(clip);
    }
    /* the two colours, the first over the second, then the palette */
    int px = CANVAS_X, py = CANVAS_Y + CANVAS_H + 10;
    bevel_sunken(px, py, 30, 31);
    fill_rect(px + 12, py + 13, 14, 14, paint->colours[1]);
    frame_rect(px + 12, py + 13, 14, 14, BLACK);
    fill_rect(px + 4, py + 4, 14, 14, paint->colours[0]);
    frame_rect(px + 4, py + 4, 14, 14, BLACK);
    for (int row = 0; row < 2; row++)
        for (int column = 0; column < 14; column++) {
            Rect swatch = paint_swatch(row, column);
            fill_rect(swatch.x, swatch.y, swatch.w, swatch.h, PALETTE[row][column]);
            bevel_thin_sunken(swatch.x, swatch.y, swatch.w, swatch.h);
        }
    draw_text(paint_swatch(0, 13).x + SWATCH + 10, py + 9, paint->message, BLACK);
}

static void invalidate_canvas_area(Window *win, int x0, int y0, int x1, int y1, int pad) {
    int left = min_int(x0, x1) - pad, top = min_int(y0, y1) - pad;
    window_invalidate_rect(win, CANVAS_X + left, CANVAS_Y + top, abs(x1 - x0) + 2 * pad + 1,
                           abs(y1 - y0) + 2 * pad + 1);
}

static void paint_mouse(Window *win, const MouseEvent *event) {
    Paint *paint = win->data;
    int clicked = track_buttons(win, &paint->buttons, paint_buttons, 2, event);
    if (clicked == 0) {
        canvas_begin(paint);
        fill_rect(0, 0, CANVAS_W, CANVAS_H, paint->colours[1]);
        canvas_end();
        window_invalidate(win);
    }
    if (clicked == 1) paint_save(win, paint);
    if (paint->buttons.pressed >= 0 || clicked >= 0) return;
    int x = event->x - CANVAS_X, y = event->y - CANVAS_Y;
    if (event->kind == MOUSE_DOWN && !paint->drawing) {
        for (int i = 0; i < TOOL_COUNT; i++)
            if (rect_contains(paint_tool(i), event->x, event->y)) {
                paint->tool = i;
                window_invalidate_rect(win, 0, 0, TOOLBOX_W, 124);
                return;
            }
        for (int row = 0; row < 2; row++)
            for (int column = 0; column < 14; column++)
                if (rect_contains(paint_swatch(row, column), event->x, event->y)) {
                    paint->colours[event->button == BUTTON_RIGHT] = PALETTE[row][column];
                    window_invalidate_rect(win, CANVAS_X, CANVAS_Y + CANVAS_H + 8, 34, 36);
                    return;
                }
        if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) return;
        if (event->button != BUTTON_LEFT && event->button != BUTTON_RIGHT) return;
        paint->drawing = event->button;
        paint->x0 = paint->x1 = x;
        paint->y0 = paint->y1 = y;
        if (paint->tool == FILL) {
            flood_fill(paint->canvas, x, y, paint->colours[event->button == BUTTON_RIGHT]);
            paint->drawing = 0;
            window_invalidate_rect(win, CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H);
        } else if (paint->tool < LINE || paint->tool == SPRAY) {
            paint_stroke(paint, x, y);
            invalidate_canvas_area(win, x, y, x, y, 8);
            if (paint->tool == SPRAY) window_set_tick(win, 40);
        }
        return;
    }
    if (!paint->drawing) return;
    x = clamp_int(x, -20, CANVAS_W + 20);
    y = clamp_int(y, -20, CANVAS_H + 20);
    if (event->kind == MOUSE_MOVE) {
        if (paint->tool >= LINE && paint->tool != SPRAY) {
            invalidate_canvas_area(win, paint->x0, paint->y0, paint->x1, paint->y1, 2);
            paint->x1 = x;
            paint->y1 = y;
            invalidate_canvas_area(win, paint->x0, paint->y0, x, y, 2);
        } else {
            int x0 = paint->x0, y0 = paint->y0;
            paint_stroke(paint, x, y);
            invalidate_canvas_area(win, x0, y0, x, y, 8);
        }
    } else if (event->kind == MOUSE_UP && event->button == paint->drawing) {
        if (paint->tool >= LINE && paint->tool != SPRAY) {
            canvas_begin(paint);
            draw_shape(paint->tool, paint->x0, paint->y0, x, y,
                       paint->colours[paint->drawing == BUTTON_RIGHT]);
            canvas_end();
            invalidate_canvas_area(win, paint->x0, paint->y0, x, y, 2);
        }
        paint->drawing = 0;
        win->tick_ms = 0;
    }
}

static void paint_tick(Window *win) {
    Paint *paint = win->data;
    if (paint->drawing && paint->tool == SPRAY) {
        paint_stroke(paint, paint->x0, paint->y0);
        invalidate_canvas_area(win, paint->x0, paint->y0, paint->x0, paint->y0, 8);
    }
}

static void paint_key(Window *win, const KeyEvent *event) {
    Paint *paint = win->data;
    if (event->mods & MOD_CTRL && event->code == KEY_S) paint_save(win, paint);
}

static void paint_close(Window *win) {
    Paint *paint = win->data;
    free(paint->canvas);
    free(paint);
}

void paint_open(const char *argument) {
    Window *win = window_open(APP_PAINT, "Paint", PAINT_W, PAINT_H);
    if (!win) return;
    Paint *paint = calloc(1, sizeof *paint);
    paint->canvas = malloc(CANVAS_W * CANVAS_H * 4);
    paint->colours[0] = BLACK;
    paint->colours[1] = WHITE;
    paint->tool = BRUSH;
    paint->buttons.pressed = -1;
    paint_buttons[0] = rect(6, 124, 47, 22);
    paint_buttons[1] = rect(6, 150, 47, 22);
    fill_rect32(paint->canvas, CANVAS_W * 4, CANVAS_W, CANVAS_H, WHITE);
    if (argument && argument[0]) {
        copy_text(paint->path, sizeof paint->path, argument);
        if (paint_load_bmp(paint, argument))
            snprintf(paint->message, sizeof paint->message, "Opened %.48s", base_name(argument));
        else
            snprintf(paint->message, sizeof paint->message, "Cannot read %.40s", base_name(argument));
    }
    win->data = paint;
    win->paint = paint_paint;
    win->mouse = paint_mouse;
    win->tick = paint_tick;
    win->key = paint_key;
    win->close = paint_close;
    paint_title(win, paint);
}
