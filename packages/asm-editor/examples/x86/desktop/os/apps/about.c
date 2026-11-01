/*
 * About asmOS: what the system is and what it runs on, with its uptime counting.
 */

typedef struct {
    ButtonTracker buttons;
} About;

enum { ABOUT_W = 340, ABOUT_H = 214 };

static Rect about_ok(void) { return rect(ABOUT_W - 92, ABOUT_H - 34, 80, 24); }

static void about_paint(Window *win) {
    About *about = win->data;
    fill_rect(0, 0, ABOUT_W, ABOUT_H, FACE);
    draw_icon(&ICON_CHIP, 14, 14, 3);
    draw_text_bold(78, 16, "asmOS", NAVY);
    draw_text(126, 16, "version 1.0", BLACK);
    draw_text(78, 34, "A desktop written in C, with its", BLACK);
    draw_text(78, 48, "pixel loops in x86 assembly.", BLACK);
    hline(12, 70, ABOUT_W - 24, SHADOW);
    hline(12, 71, ABOUT_W - 24, WHITE);
    char line[64];
    long seconds = (now_ms() - boot_time) / 1000;
    snprintf(line, sizeof line, "Screen:   %d x %d, 32-bit colour", screen_w, screen_h);
    draw_text(16, 82, line, BLACK);
    draw_text(16, 98, "Machine:  x86-64, Linux devices", BLACK);
    snprintf(line, sizeof line, "Windows:  %d open", window_count);
    draw_text(16, 114, line, BLACK);
    snprintf(line, sizeof line, "Uptime:   %ld:%02ld:%02ld", seconds / 3600, seconds / 60 % 60,
             seconds % 60);
    draw_text(16, 130, line, BLACK);
    draw_text(16, 150, "Files are kept in the Project.", SHADOW);
    Rect ok = about_ok();
    draw_button(ok.x, ok.y, ok.w, ok.h, "OK", button_down(&about->buttons, 0));
    if (window_is_focused(win)) frame_rect(ok.x - 1, ok.y - 1, ok.w + 2, ok.h + 2, BLACK);
}

static void about_mouse(Window *win, const MouseEvent *event) {
    About *about = win->data;
    Rect ok = about_ok();
    if (track_buttons(win, &about->buttons, &ok, 1, event) == 0) window_close(win);
}

static void about_key(Window *win, const KeyEvent *event) {
    if (event->code == KEY_ENTER || event->code == KEY_ESC || event->code == KEY_SPACE)
        window_close(win);
}

static void about_tick(Window *win) { window_invalidate_rect(win, 16, 112, 240, 32); }

static void about_close(Window *win) { free(win->data); }

void about_open(const char *argument) {
    (void)argument;
    Window *open = window_find(APP_ABOUT);
    if (open) {
        window_focus(open);
        return;
    }
    Window *win = window_open(APP_ABOUT, "About asmOS", ABOUT_W, ABOUT_H);
    if (!win) return;
    About *about = calloc(1, sizeof *about);
    about->buttons.pressed = -1;
    win->data = about;
    win->paint = about_paint;
    win->mouse = about_mouse;
    win->key = about_key;
    win->tick = about_tick;
    win->close = about_close;
    window_set_tick(win, 1000);
}
