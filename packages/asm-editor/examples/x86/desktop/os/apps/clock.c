/*
 * Clock: an analog face with a sweeping second hand, and the date and time under it. The machine
 * keeps Coordinated Universal Time, so that is what it shows.
 */

enum { CLOCK_W = 220, CLOCK_H = 262, CLOCK_R = 92 };

static const char *const WEEKDAYS[] = { "Sunday", "Monday", "Tuesday", "Wednesday",
                                        "Thursday", "Friday", "Saturday" };
static const char *const MONTHS[] = { "January", "February", "March", "April", "May", "June",
                                      "July", "August", "September", "October", "November",
                                      "December" };

typedef struct {
    uint32_t *face;           /* the face without its hands, drawn once */
    int hands[3][4];          /* where the hour, minute and second hands start and end */
    char time_text[24], date_text[48];
} ClockState;

static const int HAND_LENGTH[3] = { CLOCK_R - 44, CLOCK_R - 22, CLOCK_R - 14 };
static const int HAND_TAIL[3] = { 8, 10, 16 };

/* Works the hands and the words out once a second, so a repaint only draws them. */
static void clock_update(ClockState *clock) {
    time_t now = time(NULL);
    struct tm *t = gmtime(&now);
    double seconds = t->tm_sec, minutes = t->tm_min + seconds / 60;
    double turns[3] = { (t->tm_hour % 12 + minutes / 60) / 12, minutes / 60, seconds / 60 };
    int cx = CLOCK_W / 2, cy = CLOCK_R + 14;
    for (int hand = 0; hand < 3; hand++) {
        double angle = turns[hand] * 2 * M_PI, dx = sin(angle), dy = -cos(angle);
        clock->hands[hand][0] = cx - (int)(dx * HAND_TAIL[hand]);
        clock->hands[hand][1] = cy - (int)(dy * HAND_TAIL[hand]);
        clock->hands[hand][2] = cx + (int)(dx * HAND_LENGTH[hand]);
        clock->hands[hand][3] = cy + (int)(dy * HAND_LENGTH[hand]);
    }
    snprintf(clock->time_text, sizeof clock->time_text, "%02d:%02d:%02d UTC", t->tm_hour,
             t->tm_min, t->tm_sec);
    snprintf(clock->date_text, sizeof clock->date_text, "%s %d %s %d", WEEKDAYS[t->tm_wday],
             t->tm_mday, MONTHS[t->tm_mon], t->tm_year + 1900);
}

/* The face without its hands: drawn once into a picture of its own, then copied every second. */
static void clock_draw_face(void) {
    int cx = CLOCK_W / 2, cy = CLOCK_R + 14;
    fill_rect(0, 0, CLOCK_W, CLOCK_H, FACE);
    fill_circle(cx, cy, CLOCK_R + 4, SHADOW);
    fill_circle(cx, cy, CLOCK_R + 2, NAVY);
    fill_circle(cx, cy, CLOCK_R - 2, WHITE);
    for (int mark = 0; mark < 60; mark++) {
        double angle = mark * M_PI / 30;
        double dx = sin(angle), dy = -cos(angle);
        int outer = CLOCK_R - 6, inner = mark % 5 ? CLOCK_R - 10 : CLOCK_R - 18;
        int x0 = cx + (int)(dx * inner), y0 = cy + (int)(dy * inner);
        int x1 = cx + (int)(dx * outer), y1 = cy + (int)(dy * outer);
        if (mark % 5) draw_line(x0, y0, x1, y1, SHADOW);
        else thick_line(x0, y0, x1, y1, 3, BLACK);
    }
    for (int hour = 1; hour <= 12; hour++) {
        double angle = hour * M_PI / 6;
        char label[3];
        snprintf(label, sizeof label, "%d", hour);
        int x = cx + (int)(sin(angle) * (CLOCK_R - 30)) - text_width(label) / 2;
        int y = cy - (int)(cos(angle) * (CLOCK_R - 30)) - FONT_HEIGHT / 2;
        draw_text(x, y, label, NAVY);
    }
    draw_field(30, cy + CLOCK_R + 14, CLOCK_W - 60, 22, BLACK);
}

static void clock_paint(Window *win) {
    ClockState *clock = win->data;
    if (!clock->face) {
        clock->face = malloc(CLOCK_W * CLOCK_H * 4);
        GfxState saved = gfx_save();
        gfx_target(clock->face, CLOCK_W, CLOCK_H, CLOCK_W);
        clock_draw_face();
        gfx_restore(saved);
    }
    blit(clock->face, CLOCK_W, 0, 0, CLOCK_W, CLOCK_H);
    static const int widths[3] = { 5, 3, 1 };
    static const uint32_t colours[3] = { BLACK, BLACK, RED };
    for (int hand = 0; hand < 3; hand++) {
        const int *at = clock->hands[hand];
        thick_line(at[0], at[1], at[2], at[3], widths[hand], colours[hand]);
    }
    int cx = CLOCK_W / 2, cy = CLOCK_R + 14;
    fill_circle(cx, cy, 4, RED);
    draw_text_bold((CLOCK_W - text_width(clock->time_text)) / 2, cy + CLOCK_R + 19,
                   clock->time_text, 0x40ff40);
    draw_text((CLOCK_W - text_width(clock->date_text)) / 2, cy + CLOCK_R + 42, clock->date_text,
              BLACK);
}

static void clock_tick(Window *win) {
    clock_update(win->data);
    window_invalidate(win);
}

static void clock_close(Window *win) {
    ClockState *clock = win->data;
    free(clock->face);
    free(clock);
}

void clock_open(const char *argument) {
    (void)argument;
    Window *win = window_open(APP_CLOCK, "Clock", CLOCK_W, CLOCK_H);
    if (!win) return;
    ClockState *clock = calloc(1, sizeof *clock);
    clock_update(clock);
    win->data = clock;
    win->paint = clock_paint;
    win->tick = clock_tick;
    win->close = clock_close;
    window_set_tick(win, 1000);
}
