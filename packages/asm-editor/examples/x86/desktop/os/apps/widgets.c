/*
 * Small pieces the applications share: rows of push buttons that track the pointer, white text
 * fields, and the state every application keeps behind its window.
 */

/* A row of buttons in a window: the one the pointer pressed shows pushed in while the pointer
 * stays on it, and counts as clicked if the button is released there. */
typedef struct {
    int pressed;        /* the button held down, or -1 */
    int inside;         /* whether the pointer is still on it */
} ButtonTracker;

static int button_at(const Rect *buttons, int count, int x, int y) {
    for (int i = 0; i < count; i++)
        if (rect_contains(buttons[i], x, y)) return i;
    return -1;
}

/* Feeds a mouse event to a set of buttons; returns the button clicked, or -1. */
static int track_buttons(Window *win, ButtonTracker *tracker, const Rect *buttons, int count,
                         const MouseEvent *event) {
    int at = button_at(buttons, count, event->x, event->y);
    if (event->kind == MOUSE_DOWN && event->button == BUTTON_LEFT) {
        tracker->pressed = at;
        tracker->inside = 1;
        if (at >= 0) window_invalidate_rect(win, buttons[at].x, buttons[at].y, buttons[at].w,
                                            buttons[at].h);
        return -1;
    }
    if (tracker->pressed < 0) return -1;
    Rect held = buttons[tracker->pressed];
    if (event->kind == MOUSE_MOVE) {
        int inside = at == tracker->pressed;
        if (inside != tracker->inside) {
            tracker->inside = inside;
            window_invalidate_rect(win, held.x, held.y, held.w, held.h);
        }
    } else if (event->kind == MOUSE_UP && event->button == BUTTON_LEFT) {
        int clicked = at == tracker->pressed ? at : -1;
        tracker->pressed = -1;
        window_invalidate_rect(win, held.x, held.y, held.w, held.h);
        return clicked;
    }
    return -1;
}

static int button_down(const ButtonTracker *tracker, int index) {
    return tracker->pressed == index && tracker->inside;
}

/* A white field sunk into the face, as text boxes and lists are. */
static void draw_field(int x, int y, int w, int h, uint32_t background) {
    bevel_sunken(x, y, w, h);
    fill_rect(x + 2, y + 2, w - 4, h - 4, background);
}

/* Copies text into a fixed buffer, always ending it. */
static void copy_text(char *to, size_t size, const char *from) {
    size_t i = 0;
    for (; i + 1 < size && from[i]; i++) to[i] = from[i];
    to[i] = 0;
}

static int ends_with(const char *text, const char *suffix) {
    size_t length = strlen(text), suffix_length = strlen(suffix);
    return length >= suffix_length && strcmp(text + length - suffix_length, suffix) == 0;
}

/* Whether Notepad should open a file of this name. */
static int is_text_file(const char *name) {
    static const char *const kinds[] = { ".txt", ".md", ".c", ".h", ".asm", ".s", ".json",
                                         ".csv", ".log", ".ini", ".cfg" };
    for (size_t i = 0; i < sizeof kinds / sizeof kinds[0]; i++)
        if (ends_with(name, kinds[i])) return 1;
    return 0;
}
