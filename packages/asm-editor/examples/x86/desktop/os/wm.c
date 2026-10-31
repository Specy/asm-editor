/*
 * The window manager: the desktop and its icons, the windows stacked on it, the taskbar and the
 * Start menu, and the pointer drawn over them all.
 *
 * Nothing is drawn straight onto the screen. Whatever changes marks a rectangle dirty, and
 * wm_render repaints only the dirty rectangles into the back buffer, from the desktop up through
 * the windows to the taskbar, then copies them onto the framebuffer. The pointer is drawn on the
 * framebuffer alone, so moving it costs two small copies and no repaint.
 */

enum { MAX_WINDOWS = 16, MAX_DIRTY = 32 };

static Window window_slots[MAX_WINDOWS];
static Window *stack[MAX_WINDOWS];      /* bottom to top */
static int window_count;

static uint32_t *framebuffer, *back_buffer;
static int framebuffer_stride;          /* in pixels */

static Rect dirty[MAX_DIRTY];
static int dirty_count;

static int cursor_x, cursor_y, cursor_shown;

/* What the pointer is doing with a press that has not been released yet. */
enum { HELD_NOTHING, HELD_DRAG, HELD_CLIENT, HELD_CLOSE, HELD_MINIMIZE, HELD_START };
static int held;
static Window *held_window;
static int drag_dx, drag_dy;
static int held_inside;                 /* whether a held button is still under the pointer */

static int start_open, start_hover = -1;
static int selected_icon = -1;
static int cascade;
static int shutting_down;
static long boot_time;
static char clock_text[8];
static long clock_next;

static Rect screen_rect(void) { return rect(0, 0, screen_w, screen_h - TASKBAR_H); }
static Rect taskbar_rect(void) { return rect(0, screen_h - TASKBAR_H, screen_w, TASKBAR_H); }

/* ------------------------------------------------------------------ dirty rectangles */

static long area(Rect r) { return rect_empty(r) ? 0 : (long)r.w * r.h; }

void invalidate(Rect r) {
    r = rect_intersect(r, rect(0, 0, screen_w, screen_h));
    if (rect_empty(r)) return;
    /* A rectangle joins another when their union is barely bigger than the two, which can make
     * it join a third. Strips around a moved window stay apart, since their union would be the
     * whole window; two dirty rectangles may overlap, and the overlap is painted twice. */
    for (int i = 0; i < dirty_count; i++) {
        Rect joined = rect_union(r, dirty[i]);
        if (area(joined) * 4 <= (area(r) + area(dirty[i])) * 5) {
            r = joined;
            dirty[i] = dirty[--dirty_count];
            i = -1;
        }
    }
    if (dirty_count == MAX_DIRTY) {
        for (int i = 1; i < dirty_count; i++) dirty[0] = rect_union(dirty[0], dirty[i]);
        dirty_count = 1;
        dirty[0] = rect_union(dirty[0], r);
        return;
    }
    dirty[dirty_count++] = r;
}

/* ------------------------------------------------------------------ the pointer */

static const char *const ARROW[19] = {
    "X           ", "XX          ", "X.X         ", "X..X        ", "X...X       ",
    "X....X      ", "X.....X     ", "X......X    ", "X.......X   ", "X........X  ",
    "X.........X ", "X......XXXXX", "X...X..X    ", "X..XX..X    ", "X.X  X..X   ",
    "XX   X..X   ", "X     X..X  ", "      X..X  ", "       XX   ",
};
enum { ARROW_W = 12, ARROW_H = 19 };

static Rect cursor_rect(void) { return rect(cursor_x, cursor_y, ARROW_W, ARROW_H); }

static void present(Rect r) {
    r = rect_intersect(r, rect(0, 0, screen_w, screen_h));
    if (rect_empty(r)) return;
    copy_rect32(framebuffer + r.y * framebuffer_stride + r.x, framebuffer_stride * 4,
                back_buffer + r.y * screen_w + r.x, screen_w * 4, r.w, r.h);
}

static void cursor_draw(void) {
    for (int row = 0; row < ARROW_H; row++) {
        int y = cursor_y + row;
        if (y >= screen_h) break;
        uint32_t *line = framebuffer + y * framebuffer_stride;
        for (int column = 0; column < ARROW_W; column++) {
            int x = cursor_x + column;
            char c = ARROW[row][column];
            if (x >= screen_w || c == ' ') continue;
            line[x] = c == 'X' ? BLACK : WHITE;
        }
    }
    cursor_shown = 1;
}

static void cursor_move(int x, int y) {
    if (x == cursor_x && y == cursor_y && cursor_shown) return;
    if (cursor_shown) present(cursor_rect());
    cursor_x = x;
    cursor_y = y;
    cursor_draw();
}

/* ------------------------------------------------------------------ windows */

Rect window_client(const Window *win) {
    return rect(win->x + BORDER, win->y + BORDER + TITLE_H + 1, win->w - 2 * BORDER,
                win->h - 2 * BORDER - TITLE_H - 1);
}
int window_client_w(const Window *win) { return window_client(win).w; }
int window_client_h(const Window *win) { return window_client(win).h; }
static Rect window_frame(const Window *win) { return rect(win->x, win->y, win->w, win->h); }
static Rect title_rect(const Window *win) {
    return rect(win->x + BORDER, win->y + BORDER, win->w - 2 * BORDER, TITLE_H);
}
static Rect close_button(const Window *win) {
    return rect(win->x + win->w - BORDER - 18, win->y + BORDER + 2, 16, 14);
}
static Rect minimize_button(const Window *win) {
    return rect(win->x + win->w - BORDER - 36, win->y + BORDER + 2, 16, 14);
}

static Window *top_window(void) {
    for (int i = window_count - 1; i >= 0; i--)
        if (!stack[i]->minimized) return stack[i];
    return NULL;
}

int window_is_focused(const Window *win) { return win == top_window(); }

void window_invalidate(Window *win) {
    if (!win->minimized) invalidate(window_client(win));
}

void window_invalidate_rect(Window *win, int x, int y, int w, int h) {
    if (win->minimized) return;
    Rect client = window_client(win);
    invalidate(rect_intersect(rect(client.x + x, client.y + y, w, h), client));
}

static void invalidate_taskbar(void) { invalidate(taskbar_rect()); }

static void invalidate_title(Window *win) {
    if (win && !win->minimized) invalidate(title_rect(win));
}

void window_set_title(Window *win, const char *title) {
    snprintf(win->title, sizeof win->title, "%s", title);
    invalidate_title(win);
    invalidate_taskbar();
}

void window_set_tick(Window *win, int ms) {
    win->tick_ms = ms;
    win->next_tick = now_ms() + ms;
}

static int stack_index(const Window *win) {
    for (int i = 0; i < window_count; i++)
        if (stack[i] == win) return i;
    return -1;
}

void window_focus(Window *win) {
    Window *before = top_window();
    int index = stack_index(win);
    if (index < 0) return;
    if (win->minimized) win->minimized = 0;
    for (int i = index; i < window_count - 1; i++) stack[i] = stack[i + 1];
    stack[window_count - 1] = win;
    if (before != win) {
        invalidate(window_frame(win));
        invalidate_title(before);
        invalidate_taskbar();
    }
}

Window *window_open(int app, const char *title, int client_w, int client_h) {
    if (window_count == MAX_WINDOWS) {
        desktop_beep();
        return NULL;
    }
    Window *win = NULL;
    for (int i = 0; i < MAX_WINDOWS; i++)
        if (window_slots[i].w == 0) {
            win = &window_slots[i];
            break;
        }
    if (!win) return NULL;
    memset(win, 0, sizeof *win);
    win->w = client_w + 2 * BORDER;
    win->h = client_h + 2 * BORDER + TITLE_H + 1;
    int room_x = max_int(1, screen_w - win->w), room_y = max_int(1, screen_h - TASKBAR_H - win->h);
    win->x = (60 + cascade * 26) % room_x;
    win->y = (24 + cascade * 26) % room_y;
    cascade = (cascade + 1) % 8;
    win->app = app;
    win->icon = APPS[app].icon;
    snprintf(win->title, sizeof win->title, "%s", title);
    stack[window_count++] = win;
    invalidate(window_frame(win));
    invalidate_title(window_count > 1 ? stack[window_count - 2] : NULL);
    invalidate_taskbar();
    return win;
}

void window_close(Window *win) {
    int index = stack_index(win);
    if (index < 0) return;
    if (win->close) win->close(win);
    if (held_window == win) {
        held = HELD_NOTHING;
        held_window = NULL;
    }
    if (!win->minimized) invalidate(window_frame(win));
    for (int i = index; i < window_count - 1; i++) stack[i] = stack[i + 1];
    window_count--;
    win->w = 0;
    invalidate_title(top_window());
    invalidate_taskbar();
}

static void window_minimize(Window *win) {
    win->minimized = 1;
    invalidate(window_frame(win));
    invalidate_title(top_window());
    invalidate_taskbar();
}

Window *window_find(int app) {
    for (int i = window_count - 1; i >= 0; i--)
        if (stack[i]->app == app) return stack[i];
    return NULL;
}

static void wm_render(void);

/* Makes dirty the parts of `whole` outside `hole`: up to four rectangles around it. */
static void invalidate_outside(Rect whole, Rect hole) {
    hole = rect_intersect(hole, whole);
    if (rect_empty(hole)) {
        invalidate(whole);
        return;
    }
    invalidate(rect(whole.x, whole.y, whole.w, hole.y - whole.y));
    invalidate(rect(whole.x, hole.y + hole.h, whole.w, whole.y + whole.h - hole.y - hole.h));
    invalidate(rect(whole.x, hole.y, hole.x - whole.x, hole.h));
    invalidate(rect(hole.x + hole.w, hole.y, whole.x + whole.w - hole.x - hole.w, hole.h));
}

static void window_move(Window *win, int x, int y) {
    x = clamp_int(x, 40 - win->w, screen_w - 40);
    y = clamp_int(y, 0, screen_h - TASKBAR_H - BORDER - 10);
    if (x == win->x && y == win->y) return;
    Rect before = window_frame(win);
    int dx = x - win->x, dy = y - win->y;
    if (win != top_window() || start_open) {
        win->x = x;
        win->y = y;
        invalidate(before);
        invalidate(window_frame(win));
        return;
    }
    /* On top, the window's pixels in the back buffer are all its own, so they move as they are
     * and only what the move uncovers is repainted. Whatever is waiting to be repainted goes
     * first, while the window is still where those rectangles were measured. */
    wm_render();
    Rect to = rect_intersect(rect(before.x + dx, before.y + dy, before.w, before.h), screen_rect());
    Rect from = rect(to.x - dx, to.y - dy, to.w, to.h);
    to = rect_intersect(to, rect(from.x + dx, from.y + dy, from.w, from.h));
    from = rect_intersect(from, screen_rect());
    to = rect(from.x + dx, from.y + dy, from.w, from.h);
    win->x = x;
    win->y = y;
    Rect after = window_frame(win);
    if (!rect_empty(to)) {
        move_rect32(back_buffer + to.y * screen_w + to.x, back_buffer + from.y * screen_w + from.x,
                    screen_w * 4, to.w, to.h);
        present(to);
        if (rect_overlaps(to, cursor_rect())) cursor_draw();
    }
    invalidate_outside(after, to);
    invalidate_outside(before, after);
}

/* ------------------------------------------------------------------ painting */

static void paint_window(Window *win, Rect region) {
    int active = win == top_window();
    gfx_clip(region);
    gfx_origin(0, 0);
    int x = win->x, y = win->y, w = win->w, h = win->h;
    bevel_frame(x, y, w, h);
    frame_rect(x + 2, y + 2, w - 4, h - 4, FACE);
    frame_rect(x + 3, y + 3, w - 6, h - 6, FACE);
    hline(x + BORDER, y + BORDER + TITLE_H, w - 2 * BORDER, FACE);
    Rect title = title_rect(win);
    if (rect_overlaps(title, region)) {
        gradient_rect(title.x, title.y, title.w, title.h, active ? NAVY : INACTIVE,
                      active ? TITLE_END : INACTIVE_END);
        if (win->icon) draw_icon(win->icon, title.x + 2, title.y + 1, 1);
        gfx_clip(rect_intersect(region, rect(title.x, title.y, title.w - 40, title.h)));
        draw_text_bold(title.x + 21, title.y + 3, win->title, active ? WHITE : LIGHT);
        gfx_clip(region);
        Rect close = close_button(win), minimize = minimize_button(win);
        int close_down = held == HELD_CLOSE && held_window == win && held_inside;
        int minimize_down = held == HELD_MINIMIZE && held_window == win && held_inside;
        draw_button(close.x, close.y, close.w, close.h, "", close_down);
        draw_button(minimize.x, minimize.y, minimize.w, minimize.h, "", minimize_down);
        /* the close button's cross and the minimize button's bar */
        int cx = close.x + 4 + close_down, cy = close.y + 3 + close_down;
        for (int i = 0; i < 7; i++) {
            fill_rect(cx + i, cy + i, 2, 1, BLACK);
            fill_rect(cx + 6 - i, cy + i, 2, 1, BLACK);
        }
        fill_rect(minimize.x + 4 + minimize_down, minimize.y + 9 + minimize_down, 6, 2, BLACK);
    }
    Rect client = window_client(win);
    Rect visible = rect_intersect(client, region);
    if (rect_empty(visible)) return;
    gfx_clip(visible);
    gfx_origin(client.x, client.y);
    if (win->paint) win->paint(win);
    else fill_rect(0, 0, client.w, client.h, FACE);
    gfx_origin(0, 0);
}

/* ---- the desktop */

enum { ICON_CELL_W = 92, ICON_CELL_H = 70 };

static int desktop_icon_count(void) {
    int count = 0;
    for (int i = 0; i < APP_COUNT; i++) count += APPS[i].on_desktop;
    return count;
}

static int desktop_icon_app(int index) {
    for (int i = 0; i < APP_COUNT; i++)
        if (APPS[i].on_desktop && index-- == 0) return i;
    return -1;
}

static Rect desktop_icon_rect(int index) {
    int per_column = max_int(1, (screen_h - TASKBAR_H - 8) / ICON_CELL_H);
    return rect(4 + index / per_column * ICON_CELL_W, 8 + index % per_column * ICON_CELL_H,
                ICON_CELL_W, ICON_CELL_H - 4);
}

enum { LOGO_W = 160, LOGO_H = 128 + 4 + FONT_HEIGHT * 4 };

/* A large chip and the system's name, a shade lighter than the desktop, drawn once into a picture
 * of their own on the desktop's colour and then copied wherever the desktop is repainted. */
static uint32_t *wallpaper_logo(void) {
    static uint32_t *logo;
    if (logo) return logo;
    logo = malloc(LOGO_W * LOGO_H * 4);
    GfxState saved = gfx_save();
    gfx_target(logo, LOGO_W, LOGO_H, LOGO_W);
    fill_rect(0, 0, LOGO_W, LOGO_H, DESKTOP);
    for (int row = 0; row < 16; row++)
        for (int column = 0; column < 16; column++) {
            char c = ICON_CHIP.rows[row][column];
            if (c == ' ') continue;
            uint32_t shade = c == 'y' ? 0x2aa3a3 : c == 'd' ? 0x0f8c8c : 0x0a7a7a;
            fill_rect((LOGO_W - 128) / 2 + column * 8, row * 8, 8, 8, shade);
        }
    const char *name = "asmOS";
    int scale = 4, left = (LOGO_W - text_width(name) * scale) / 2, top = 128 + 4;
    for (int i = 0; name[i]; i++) {
        const unsigned char *glyph =
            (const unsigned char *)font_bits + (name[i] - FONT_FIRST) * FONT_H;
        for (int line = 0; line < FONT_H; line++)
            for (int column = 0; column < FONT_W; column++)
                if (glyph[line] & (0x80 >> column))
                    fill_rect(left + (i * FONT_W + column) * scale, top + line * scale, scale,
                              scale, 0x1a9a9a);
    }
    gfx_restore(saved);
    return logo;
}

static void paint_wallpaper(void) {
    fill_rect(0, 0, screen_w, screen_h - TASKBAR_H, DESKTOP);
    int x = screen_w / 2 + 60 - LOGO_W / 2, y = (screen_h - TASKBAR_H) / 2 - 20 - 64;
    blit(wallpaper_logo(), LOGO_W, x, y, LOGO_W, LOGO_H);
}

static void paint_desktop(Rect region) {
    gfx_clip(rect_intersect(region, screen_rect()));
    gfx_origin(0, 0);
    paint_wallpaper();
    int count = desktop_icon_count();
    for (int i = 0; i < count; i++) {
        Rect cell = desktop_icon_rect(i);
        if (!rect_overlaps(cell, region)) continue;
        const App *app = &APPS[desktop_icon_app(i)];
        draw_icon(app->icon, cell.x + (cell.w - 32) / 2, cell.y + 2, 2);
        int width = text_width(app->name);
        int lx = cell.x + (cell.w - width) / 2, ly = cell.y + 40;
        if (i == selected_icon) {
            fill_rect(lx - 2, ly - 1, width + 4, FONT_HEIGHT + 2, NAVY);
            draw_text(lx, ly, app->name, WHITE);
        } else {
            draw_text(lx + 1, ly + 1, app->name, BLACK);
            draw_text(lx, ly, app->name, WHITE);
        }
    }
}

static int desktop_icon_at(int x, int y) {
    int count = desktop_icon_count();
    for (int i = 0; i < count; i++) {
        Rect cell = desktop_icon_rect(i);
        Rect hit = rect(cell.x + 10, cell.y, cell.w - 20, cell.h);
        if (rect_contains(hit, x, y)) return i;
    }
    return -1;
}

/* ---- the taskbar */

enum { START_W = 62 };

static Rect start_button(void) { return rect(2, screen_h - TASKBAR_H + 4, START_W, 22); }
static Rect tray_rect(void) { return rect(screen_w - 66, screen_h - TASKBAR_H + 4, 64, 22); }

static Rect task_button(int index, int count) {
    int left = START_W + 8, right = screen_w - 72;
    int width = count ? min_int(150, (right - left) / count) : 150;
    return rect(left + index * width, screen_h - TASKBAR_H + 4, width - 3, 22);
}

static void update_clock_text(void) {
    time_t now = time(NULL);
    struct tm *parts = gmtime(&now);
    snprintf(clock_text, sizeof clock_text, "%02d:%02d", parts->tm_hour, parts->tm_min);
}

static void paint_taskbar(Rect region) {
    Rect bar = taskbar_rect();
    gfx_clip(rect_intersect(region, bar));
    gfx_origin(0, 0);
    fill_rect(bar.x, bar.y, bar.w, bar.h, FACE);
    hline(bar.x, bar.y, bar.w, LIGHT);
    hline(bar.x, bar.y + 1, bar.w, WHITE);
    Rect start = start_button();
    int pressed = start_open;
    draw_button(start.x, start.y, start.w, start.h, "", pressed);
    draw_icon(&ICON_CHIP, start.x + 4 + pressed, start.y + 3 + pressed, 1);
    draw_text_bold(start.x + 23 + pressed, start.y + 5 + pressed, "Start", BLACK);
    /* the windows in the order they were opened, which is their slot order */
    int count = window_count, index = 0;
    for (int slot = 0; slot < MAX_WINDOWS; slot++) {
        Window *win = &window_slots[slot];
        if (!win->w) continue;
        Rect button = task_button(index++, count);
        if (!rect_overlaps(button, region)) continue;
        int active = win == top_window();
        fill_rect(button.x, button.y, button.w, button.h, active ? 0xe8e8e8 : FACE);
        if (active) {
            frame_rect(button.x, button.y, button.w, button.h, BLACK);
            hline(button.x + 1, button.y + 1, button.w - 2, SHADOW);
            vline(button.x + 1, button.y + 1, button.h - 2, SHADOW);
        } else {
            bevel_raised(button.x, button.y, button.w, button.h);
        }
        int shift = active;
        if (win->icon) draw_icon(win->icon, button.x + 4 + shift, button.y + 3 + shift, 1);
        Rect previous = gfx_get_clip();
        gfx_clip(rect_intersect(previous, rect(button.x, button.y, button.w - 4, button.h)));
        if (active) draw_text_bold(button.x + 23 + shift, button.y + 5 + shift, win->title, BLACK);
        else draw_text(button.x + 23, button.y + 5, win->title, BLACK);
        gfx_clip(previous);
    }
    Rect tray = tray_rect();
    bevel_thin_sunken(tray.x, tray.y, tray.w, tray.h);
    draw_text(tray.x + (tray.w - text_width(clock_text)) / 2, tray.y + 5, clock_text, BLACK);
}

static int task_at(int x, int y) {
    int count = window_count, index = 0;
    for (int slot = 0; slot < MAX_WINDOWS; slot++) {
        if (!window_slots[slot].w) continue;
        if (rect_contains(task_button(index, count), x, y)) return slot;
        index++;
    }
    return -1;
}

/* ---- the Start menu */

enum { MENU_ITEM_H = 26, MENU_BANNER_W = 24, MENU_W = 190 };
#define MENU_ITEMS (APP_COUNT + 1)              /* the applications, then Shut Down */

static Rect start_menu_rect(void) {
    int height = MENU_ITEMS * MENU_ITEM_H + 10 + 6;
    return rect(0, screen_h - TASKBAR_H - height + 2, MENU_W, height);
}

static Rect menu_item_rect(int index) {
    Rect menu = start_menu_rect();
    int y = menu.y + 3 + index * MENU_ITEM_H + (index == APP_COUNT ? 10 : 0);
    return rect(menu.x + 3 + MENU_BANNER_W, y, menu.w - 6 - MENU_BANNER_W, MENU_ITEM_H);
}

static void paint_start_menu(Rect region) {
    Rect menu = start_menu_rect();
    if (!rect_overlaps(menu, region)) return;
    gfx_clip(rect_intersect(region, menu));
    gfx_origin(0, 0);
    fill_rect(menu.x, menu.y, menu.w, menu.h, FACE);
    bevel_raised(menu.x, menu.y, menu.w, menu.h);
    /* the banner: a dark gradient, bottom to top, with the name written upwards */
    int banner_h = menu.h - 6;
    for (int i = 0; i < banner_h; i += 4) {
        int shade = 0x80 * i / banner_h;
        fill_rect(menu.x + 3, menu.y + 3 + banner_h - i - 4, MENU_BANNER_W, 4,
                  (uint32_t)(shade << 8 | (0x40 + shade)));
    }
    draw_text_up(menu.x + 8, menu.y + menu.h - 8, "asm", 0xc0c0ff);
    draw_text_up(menu.x + 9, menu.y + menu.h - 8 - 3 * FONT_W, "OS", WHITE);
    draw_text_up(menu.x + 8, menu.y + menu.h - 8 - 3 * FONT_W, "OS", WHITE);
    for (int i = 0; i < MENU_ITEMS; i++) {
        Rect item = menu_item_rect(i);
        if (!rect_overlaps(item, region)) continue;
        int hover = i == start_hover;
        if (hover) fill_rect(item.x, item.y, item.w, item.h, NAVY);
        const Icon *icon = i < APP_COUNT ? APPS[i].icon : &ICON_SHUTDOWN;
        const char *label = i < APP_COUNT ? APPS[i].name : "Shut Down...";
        draw_icon(icon, item.x + 6, item.y + 5, 1);
        draw_text(item.x + 30, item.y + 7, label, hover ? WHITE : BLACK);
    }
    Rect separator = menu_item_rect(APP_COUNT);
    hline(separator.x + 2, separator.y - 6, separator.w - 4, SHADOW);
    hline(separator.x + 2, separator.y - 5, separator.w - 4, WHITE);
}

static int menu_item_at(int x, int y) {
    for (int i = 0; i < MENU_ITEMS; i++)
        if (rect_contains(menu_item_rect(i), x, y)) return i;
    return -1;
}

static void start_menu_toggle(int open) {
    if (open == start_open) return;
    start_open = open;
    start_hover = -1;
    invalidate(start_menu_rect());
    invalidate(start_button());
}

static void start_menu_choose(int index) {
    start_menu_toggle(0);
    if (index < 0) return;
    if (index == APP_COUNT) desktop_shutdown();
    else app_launch(index, NULL);
}

/* ---- one dirty rectangle, from the bottom up */

static void paint_region(Rect region) {
    /* begin with the highest window that covers the region whole: nothing below it shows */
    int first = -1;
    for (int i = window_count - 1; i >= 0 && first < 0; i--) {
        if (stack[i]->minimized) continue;
        Rect covered = rect_intersect(region, window_frame(stack[i]));
        if (covered.w == region.w && covered.h == region.h) first = i;
    }
    if (first < 0) {
        if (rect_overlaps(region, screen_rect())) paint_desktop(region);
        first = 0;
    }
    for (int i = first; i < window_count; i++) {
        Window *win = stack[i];
        if (!win->minimized && rect_overlaps(region, window_frame(win))) paint_window(win, region);
    }
    if (rect_overlaps(region, taskbar_rect())) paint_taskbar(region);
    if (start_open) paint_start_menu(region);
}

static void wm_render(void) {
    if (!dirty_count) return;
    for (int i = 0; i < dirty_count; i++) paint_region(dirty[i]);
    int cursor_hit = 0;
    for (int i = 0; i < dirty_count; i++) {
        present(dirty[i]);
        if (rect_overlaps(dirty[i], cursor_rect())) cursor_hit = 1;
    }
    dirty_count = 0;
    if (cursor_hit || !cursor_shown) cursor_draw();
}

/* ------------------------------------------------------------------ the pointer's events */

static Window *window_at(int x, int y) {
    for (int i = window_count - 1; i >= 0; i--)
        if (!stack[i]->minimized && rect_contains(window_frame(stack[i]), x, y)) return stack[i];
    return NULL;
}

static void send_to_client(Window *win, const MouseEvent *event) {
    if (!win->mouse) return;
    Rect client = window_client(win);
    MouseEvent local = *event;
    local.x -= client.x;
    local.y -= client.y;
    win->mouse(win, &local);
}

static void select_icon(int index) {
    if (index == selected_icon) return;
    if (selected_icon >= 0) invalidate(desktop_icon_rect(selected_icon));
    selected_icon = index;
    if (index >= 0) invalidate(desktop_icon_rect(index));
}

static void press(const MouseEvent *event) {
    int x = event->x, y = event->y;
    if (start_open) {
        int item = menu_item_at(x, y);
        if (item >= 0) {
            held = HELD_START;
            return;
        }
        if (rect_contains(start_menu_rect(), x, y)) return;
        start_menu_toggle(0);
        if (rect_contains(start_button(), x, y)) return;
    }
    if (rect_contains(taskbar_rect(), x, y)) {
        if (event->button != BUTTON_LEFT) return;
        if (rect_contains(start_button(), x, y)) {
            start_menu_toggle(1);
            return;
        }
        int slot = task_at(x, y);
        if (slot >= 0) {
            Window *win = &window_slots[slot];
            if (win == top_window()) window_minimize(win);
            else window_focus(win);
        }
        return;
    }
    Window *win = window_at(x, y);
    if (!win) {
        int icon = desktop_icon_at(x, y);
        select_icon(icon);
        if (icon >= 0 && event->clicks == 2 && event->button == BUTTON_LEFT) {
            select_icon(-1);
            app_launch(desktop_icon_app(icon), NULL);
        }
        return;
    }
    select_icon(-1);
    window_focus(win);
    held_window = win;
    held_inside = 1;
    if (rect_contains(window_client(win), x, y)) {
        held = HELD_CLIENT;
        send_to_client(win, event);
    } else if (event->button != BUTTON_LEFT) {
        held = HELD_NOTHING;
    } else if (rect_contains(close_button(win), x, y)) {
        held = HELD_CLOSE;
        invalidate(close_button(win));
    } else if (rect_contains(minimize_button(win), x, y)) {
        held = HELD_MINIMIZE;
        invalidate(minimize_button(win));
    } else if (rect_contains(title_rect(win), x, y)) {
        held = HELD_DRAG;
        drag_dx = x - win->x;
        drag_dy = y - win->y;
    }
}

static void release(const MouseEvent *event) {
    Window *win = held_window;
    int what = held;
    held = HELD_NOTHING;
    held_window = NULL;
    if (what == HELD_START) {
        start_menu_choose(menu_item_at(event->x, event->y));
    } else if (what == HELD_CLIENT && win) {
        send_to_client(win, event);
    } else if (what == HELD_CLOSE && win) {
        invalidate(close_button(win));
        if (rect_contains(close_button(win), event->x, event->y)) window_close(win);
    } else if (what == HELD_MINIMIZE && win) {
        invalidate(minimize_button(win));
        if (rect_contains(minimize_button(win), event->x, event->y)) window_minimize(win);
    }
}

static void motion(const MouseEvent *event) {
    int x = event->x, y = event->y;
    if (start_open) {
        int item = menu_item_at(x, y);
        if (item != start_hover) {
            if (start_hover >= 0) invalidate(menu_item_rect(start_hover));
            start_hover = item;
            if (item >= 0) invalidate(menu_item_rect(item));
        }
    }
    Window *win = held_window;
    if (held == HELD_DRAG && win) {
        window_move(win, x - drag_dx, y - drag_dy);
    } else if (held == HELD_CLIENT && win) {
        send_to_client(win, event);
    } else if ((held == HELD_CLOSE || held == HELD_MINIMIZE) && win) {
        Rect button = held == HELD_CLOSE ? close_button(win) : minimize_button(win);
        int inside = rect_contains(button, x, y);
        if (inside != held_inside) {
            held_inside = inside;
            invalidate(button);
        }
    } else if (!held) {
        /* a window that follows the pointer without a press, such as Paint's brush outline */
        Window *under = window_at(x, y);
        if (under && under == top_window() && rect_contains(window_client(under), x, y))
            send_to_client(under, event);
    }
}

void wm_mouse_event(const MouseEvent *event) {
    cursor_move(event->x, event->y);
    switch (event->kind) {
    case MOUSE_DOWN:
        if (!held) press(event);
        else if (held == HELD_CLIENT && held_window) send_to_client(held_window, event);
        break;
    case MOUSE_UP:
        if (event->buttons == 0) release(event);
        else if (held == HELD_CLIENT && held_window) send_to_client(held_window, event);
        break;
    case MOUSE_MOVE:
        motion(event);
        break;
    case MOUSE_WHEEL: {
        Window *win = window_at(event->x, event->y);
        if (win) send_to_client(win, event);
        break;
    }
    }
}

/* ------------------------------------------------------------------ keys */

static void cycle_windows(void) {
    if (window_count < 2) {
        if (window_count == 1) window_focus(stack[0]);
        return;
    }
    window_focus(stack[0]);
}

void wm_key_event(const KeyEvent *event) {
    if (event->code == KEY_LEFTMETA || event->code == KEY_RIGHTMETA ||
        (event->code == KEY_ESC && event->mods & MOD_CTRL)) {
        start_menu_toggle(!start_open);
        return;
    }
    if (start_open) {
        if (event->code == KEY_ESC) start_menu_toggle(0);
        else if (event->code == KEY_UP || event->code == KEY_DOWN) {
            int next = start_hover < 0 ? (event->code == KEY_UP ? MENU_ITEMS - 1 : 0)
                       : (start_hover + (event->code == KEY_UP ? MENU_ITEMS - 1 : 1)) % MENU_ITEMS;
            if (start_hover >= 0) invalidate(menu_item_rect(start_hover));
            start_hover = next;
            invalidate(menu_item_rect(next));
        } else if (event->code == KEY_ENTER && start_hover >= 0) {
            start_menu_choose(start_hover);
        }
        return;
    }
    Window *win = top_window();
    if (event->mods & MOD_ALT && event->code == KEY_F4) {
        if (win) window_close(win);
        return;
    }
    if (event->mods & MOD_ALT && event->code == KEY_TAB) {
        cycle_windows();
        return;
    }
    if (win && win->key) win->key(win, event);
}

/* ------------------------------------------------------------------ time */

/* How long the main loop may wait for input before something is due, or -1 for ever. */
static int wm_timeout(void) {
    long now = now_ms(), next = clock_next;
    for (int i = 0; i < window_count; i++)
        if (stack[i]->tick_ms > 0 && stack[i]->next_tick < next) next = stack[i]->next_tick;
    int wait = (int)max_int(0, (int)(next - now));
    int sound = sound_run();
    if (sound >= 0 && sound < wait) wait = sound;
    return wait;
}

static void wm_run_timers(void) {
    long now = now_ms();
    if (now >= clock_next) {
        char before[8];
        memcpy(before, clock_text, sizeof before);
        update_clock_text();
        if (strcmp(before, clock_text)) invalidate(tray_rect());
        clock_next = now + 1000;
    }
    for (int i = 0; i < window_count; i++) {
        Window *win = stack[i];
        if (win->tick_ms > 0 && now >= win->next_tick) {
            win->next_tick = now + win->tick_ms;
            if (win->tick) win->tick(win);
        }
    }
    sound_run();
}

static void wm_start(uint32_t *fb, int stride, uint32_t *back) {
    framebuffer = fb;
    framebuffer_stride = stride;
    back_buffer = back;
    gfx_target(back, screen_w, screen_h, screen_w);
    boot_time = now_ms();
    update_clock_text();
    clock_next = now_ms() + 1000;
    cursor_x = screen_w / 2;
    cursor_y = screen_h / 2;
    invalidate(rect(0, 0, screen_w, screen_h));
}

void desktop_shutdown(void) { shutting_down = 1; }
