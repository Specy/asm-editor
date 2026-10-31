/*
 * What every part of the desktop shares: the drawing calls, the window manager's calls, the input
 * events and the applications' entry points. main.c includes this, then each part as text, so the
 * whole desktop compiles as one C file.
 */
#include <stdint.h>
#include <stddef.h>

/* ------------------------------------------------------------------ geometry */

typedef struct {
    int x, y, w, h;
} Rect;

static inline int min_int(int a, int b) { return a < b ? a : b; }
static inline int max_int(int a, int b) { return a > b ? a : b; }
static inline int clamp_int(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

static inline Rect rect(int x, int y, int w, int h) {
    Rect r = { x, y, w, h };
    return r;
}
static inline int rect_empty(Rect r) { return r.w <= 0 || r.h <= 0; }
static inline int rect_contains(Rect r, int x, int y) {
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}
static inline Rect rect_intersect(Rect a, Rect b) {
    int x0 = max_int(a.x, b.x), y0 = max_int(a.y, b.y);
    int x1 = min_int(a.x + a.w, b.x + b.w), y1 = min_int(a.y + a.h, b.y + b.h);
    return rect(x0, y0, x1 - x0, y1 - y0);
}
static inline Rect rect_union(Rect a, Rect b) {
    if (rect_empty(a)) return b;
    if (rect_empty(b)) return a;
    int x0 = min_int(a.x, b.x), y0 = min_int(a.y, b.y);
    int x1 = max_int(a.x + a.w, b.x + b.w), y1 = max_int(a.y + a.h, b.y + b.h);
    return rect(x0, y0, x1 - x0, y1 - y0);
}
static inline int rect_overlaps(Rect a, Rect b) { return !rect_empty(rect_intersect(a, b)); }

/* ------------------------------------------------------------------ blit.asm */

void fill_rect32(uint32_t *to, size_t stride, size_t width, size_t height, uint32_t colour);
void copy_rect32(uint32_t *to, size_t to_stride, const uint32_t *from, size_t from_stride,
                 size_t width, size_t height);
void move_rect32(uint32_t *to, const uint32_t *from, size_t stride, size_t width, size_t height);

/* ------------------------------------------------------------------ colours */

enum {
    BLACK = 0x000000,
    WHITE = 0xffffff,
    FACE = 0xc0c0c0,      /* buttons, window frames, the taskbar */
    LIGHT = 0xdfdfdf,
    SHADOW = 0x808080,
    DESKTOP = 0x008080,
    NAVY = 0x000080,      /* the active title bar and selections */
    TITLE_END = 0x1084d0,
    INACTIVE = 0x808080,
    INACTIVE_END = 0xb4b4b4,
    TOOLTIP = 0xffffe1,
    RED = 0xff0000,
    GREEN = 0x008000,
    BLUE = 0x0000ff,
    YELLOW = 0xffff00
};

/* ------------------------------------------------------------------ gfx.c */

enum { FONT_WIDTH = 8, FONT_HEIGHT = 13 };
/* The symbols the font has past ASCII. */
enum {
    CH_LEFT = 127, CH_UP, CH_RIGHT, CH_DOWN, CH_DEGREE, CH_MIDDOT, CH_TIMES, CH_DIVIDE, CH_BULLET
};

/* A 16 by 16 picture, one character per pixel; icons.c says which colour each character is. */
typedef struct {
    const char *rows[16];
} Icon;

extern int screen_w, screen_h;

void gfx_target(uint32_t *pixels, int width, int height, int stride);
void gfx_clip(Rect clip);          /* in screen pixels */
void gfx_origin(int x, int y);     /* what x 0, y 0 means for the calls below */
Rect gfx_get_clip(void);
void gfx_get_origin(int *x, int *y);

void fill_rect(int x, int y, int w, int h, uint32_t colour);
void put_pixel(int x, int y, uint32_t colour);
void hline(int x, int y, int w, uint32_t colour);
void vline(int x, int y, int h, uint32_t colour);
void frame_rect(int x, int y, int w, int h, uint32_t colour);
void draw_line(int x0, int y0, int x1, int y1, uint32_t colour);
void thick_line(int x0, int y0, int x1, int y1, int width, uint32_t colour);
void fill_circle(int cx, int cy, int radius, uint32_t colour);
void draw_circle(int cx, int cy, int radius, uint32_t colour);
void blit(const uint32_t *pixels, int stride, int x, int y, int w, int h);
void gradient_rect(int x, int y, int w, int h, uint32_t left, uint32_t right);

void bevel_raised(int x, int y, int w, int h);   /* a button */
void bevel_sunken(int x, int y, int w, int h);   /* a text field */
void bevel_frame(int x, int y, int w, int h);    /* a window */
void bevel_thin_sunken(int x, int y, int w, int h);

void draw_char(int x, int y, int ch, uint32_t colour);
void draw_text(int x, int y, const char *text, uint32_t colour);
void draw_text_bold(int x, int y, const char *text, uint32_t colour);
void draw_text_n(int x, int y, const char *text, int count, uint32_t colour);
void draw_text_up(int x, int y, const char *text, uint32_t colour);  /* rotated, bottom to top */
int text_width(const char *text);
void draw_icon(const Icon *icon, int x, int y, int scale);

/* A button: raised, or pushed in while pressed, with its label centred. */
void draw_button(int x, int y, int w, int h, const char *label, int pressed);

/* ------------------------------------------------------------------ input.c */

enum { MOUSE_DOWN, MOUSE_UP, MOUSE_MOVE, MOUSE_WHEEL };
enum { BUTTON_LEFT = 1, BUTTON_RIGHT = 2, BUTTON_MIDDLE = 4 };
enum { MOD_SHIFT = 1, MOD_CTRL = 2, MOD_ALT = 4 };

typedef struct {
    int kind;       /* MOUSE_DOWN, MOUSE_UP, MOUSE_MOVE or MOUSE_WHEEL */
    int x, y;       /* in the window's client area when a window receives it */
    int button;     /* the button that went down or up */
    int buttons;    /* the buttons held */
    int clicks;     /* 2 for the second press of a double click */
    int wheel;      /* +1 a notch away from the user, -1 towards */
} MouseEvent;

typedef struct {
    int code;       /* Linux's KEY_ code, from <linux/input.h> */
    int ch;         /* the character it types, or 0 */
    int mods;       /* MOD_SHIFT, MOD_CTRL and MOD_ALT held */
} KeyEvent;

long now_ms(void);

/* ------------------------------------------------------------------ wm.c */

enum { BORDER = 4, TITLE_H = 18, TASKBAR_H = 28 };

typedef struct Window Window;
struct Window {
    int x, y, w, h;          /* the whole frame, in screen pixels */
    char title[48];
    const Icon *icon;
    int minimized;
    int app;                 /* which entry of APPS opened it */
    void *data;              /* the application's own state */

    void (*paint)(Window *win);                         /* draw the client area from 0, 0 */
    void (*mouse)(Window *win, const MouseEvent *event);
    void (*key)(Window *win, const KeyEvent *event);
    void (*tick)(Window *win);                          /* every tick_ms while tick_ms > 0 */
    void (*close)(Window *win);                         /* free data before the window goes */
    int tick_ms;
    long next_tick;
};

Window *window_open(int app, const char *title, int client_w, int client_h);
void window_close(Window *win);
void window_focus(Window *win);
void window_set_title(Window *win, const char *title);
void window_invalidate(Window *win);
void window_invalidate_rect(Window *win, int x, int y, int w, int h);
void window_set_tick(Window *win, int ms);
Rect window_client(const Window *win);
int window_client_w(const Window *win);
int window_client_h(const Window *win);
Window *window_find(int app);
int window_is_focused(const Window *win);
void invalidate(Rect r);
void desktop_beep(void);
void desktop_shutdown(void);

/* ------------------------------------------------------------------ the applications */

typedef struct {
    const char *name;
    const Icon *icon;
    void (*open)(const char *argument);
    int on_desktop;
} App;

enum { APP_NOTEPAD, APP_CALCULATOR, APP_PAINT, APP_MINES, APP_CLOCK, APP_TERMINAL, APP_FILES,
       APP_ABOUT, APP_COUNT };
extern const App APPS[APP_COUNT];

void app_launch(int app, const char *argument);

/* ------------------------------------------------------------------ sound.c */

void sound_init(void);
void sound_note(int channel, int note, int velocity);
void sound_off(int channel, int note);
void sound_program(int channel, int program);
void sound_chime(int shutdown);
void sound_click(void);
void sound_boom(void);
