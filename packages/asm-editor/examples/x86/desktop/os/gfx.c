/*
 * Drawing into a picture in memory: the desktop draws everything into its back buffer, and the
 * window manager copies what changed onto the framebuffer. Every call clips to the clip rectangle
 * and takes its coordinates from the origin, so a window's paint function draws from 0, 0 and can
 * never spill outside the part of the screen being redrawn.
 */

int screen_w, screen_h;

static uint32_t *target;
static int target_w, target_h, target_stride;   /* the stride in pixels */
static Rect clip;
static int origin_x, origin_y;

void gfx_target(uint32_t *pixels, int width, int height, int stride) {
    target = pixels;
    target_w = width;
    target_h = height;
    target_stride = stride;
    clip = rect(0, 0, width, height);
    origin_x = origin_y = 0;
}

void gfx_clip(Rect r) { clip = rect_intersect(r, rect(0, 0, target_w, target_h)); }
void gfx_origin(int x, int y) {
    origin_x = x;
    origin_y = y;
}
Rect gfx_get_clip(void) { return clip; }

/* Everything the calls below draw with, to put back after drawing into another picture. */
typedef struct {
    uint32_t *pixels;
    int w, h, stride;
    Rect clip;
    int origin_x, origin_y;
} GfxState;

static GfxState gfx_save(void) {
    GfxState state = { target, target_w, target_h, target_stride, clip, origin_x, origin_y };
    return state;
}
static void gfx_restore(GfxState state) {
    target = state.pixels;
    target_w = state.w;
    target_h = state.h;
    target_stride = state.stride;
    clip = state.clip;
    origin_x = state.origin_x;
    origin_y = state.origin_y;
}
void gfx_get_origin(int *x, int *y) {
    *x = origin_x;
    *y = origin_y;
}

void fill_rect(int x, int y, int w, int h, uint32_t colour) {
    Rect r = rect_intersect(rect(x + origin_x, y + origin_y, w, h), clip);
    if (rect_empty(r)) return;
    fill_rect32(target + r.y * target_stride + r.x, target_stride * 4, r.w, r.h, colour);
}

void put_pixel(int x, int y, uint32_t colour) {
    x += origin_x;
    y += origin_y;
    if (rect_contains(clip, x, y)) target[y * target_stride + x] = colour;
}

void hline(int x, int y, int w, uint32_t colour) { fill_rect(x, y, w, 1, colour); }
void vline(int x, int y, int h, uint32_t colour) { fill_rect(x, y, 1, h, colour); }

void frame_rect(int x, int y, int w, int h, uint32_t colour) {
    hline(x, y, w, colour);
    hline(x, y + h - 1, w, colour);
    vline(x, y, h, colour);
    vline(x + w - 1, y, h, colour);
}

void draw_line(int x0, int y0, int x1, int y1, uint32_t colour) {
    int dx = x1 > x0 ? x1 - x0 : x0 - x1, sx = x0 < x1 ? 1 : -1;
    int dy = y1 > y0 ? y0 - y1 : y1 - y0, sy = y0 < y1 ? 1 : -1;
    int error = dx + dy;
    for (;;) {
        put_pixel(x0, y0, colour);
        if (x0 == x1 && y0 == y1) break;
        int twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x0 += sx;
        }
        if (twice <= dx) {
            error += dx;
            y0 += sy;
        }
    }
}

/* A line drawn with a square pen of width pixels. */
void thick_line(int x0, int y0, int x1, int y1, int width, uint32_t colour) {
    int dx = x1 > x0 ? x1 - x0 : x0 - x1, sx = x0 < x1 ? 1 : -1;
    int dy = y1 > y0 ? y0 - y1 : y1 - y0, sy = y0 < y1 ? 1 : -1;
    int error = dx + dy, half = width / 2;
    for (;;) {
        fill_rect(x0 - half, y0 - half, width, width, colour);
        if (x0 == x1 && y0 == y1) break;
        int twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x0 += sx;
        }
        if (twice <= dx) {
            error += dx;
            y0 += sy;
        }
    }
}

void fill_circle(int cx, int cy, int radius, uint32_t colour) {
    /* row by row from the middle out: each row is a little narrower than the one before */
    int half = radius;
    for (int y = 0; y <= radius; y++) {
        while (half > 0 && half * half + y * y > radius * radius) half--;
        hline(cx - half, cy + y, 2 * half + 1, colour);
        if (y) hline(cx - half, cy - y, 2 * half + 1, colour);
    }
}

void draw_circle(int cx, int cy, int radius, uint32_t colour) {
    int x = radius, y = 0, error = 1 - radius;
    while (x >= y) {
        put_pixel(cx + x, cy + y, colour);
        put_pixel(cx + y, cy + x, colour);
        put_pixel(cx - y, cy + x, colour);
        put_pixel(cx - x, cy + y, colour);
        put_pixel(cx - x, cy - y, colour);
        put_pixel(cx - y, cy - x, colour);
        put_pixel(cx + y, cy - x, colour);
        put_pixel(cx + x, cy - y, colour);
        y++;
        if (error < 0) {
            error += 2 * y + 1;
        } else {
            x--;
            error += 2 * (y - x) + 1;
        }
    }
}

/* Copies a w by h picture whose rows are stride pixels apart. */
void blit(const uint32_t *pixels, int stride, int x, int y, int w, int h) {
    Rect whole = rect(x + origin_x, y + origin_y, w, h);
    Rect r = rect_intersect(whole, clip);
    if (rect_empty(r)) return;
    const uint32_t *from = pixels + (r.y - whole.y) * stride + (r.x - whole.x);
    copy_rect32(target + r.y * target_stride + r.x, target_stride * 4, from, stride * 4, r.w, r.h);
}

/* A rectangle that fades from one colour on the left to another on the right: one row is worked
 * out, then copied into every row. */
void gradient_rect(int x, int y, int w, int h, uint32_t left, uint32_t right) {
    /* the last rows worked out, since title bars ask for the same few again and again */
    enum { ROWS = 4 };
    static uint32_t rows[ROWS][1024];
    static struct { int w; uint32_t left, right; } made[ROWS];
    static int next;
    if (w <= 0 || w > 1024) return;
    int slot = 0;
    while (slot < ROWS && !(made[slot].w == w && made[slot].left == left &&
                            made[slot].right == right))
        slot++;
    if (slot == ROWS) {
        slot = next;
        next = (next + 1) % ROWS;
        made[slot].w = w;
        made[slot].left = left;
        made[slot].right = right;
        int r0 = left >> 16 & 0xff, g0 = left >> 8 & 0xff, b0 = left & 0xff;
        int r1 = right >> 16 & 0xff, g1 = right >> 8 & 0xff, b1 = right & 0xff;
        for (int i = 0; i < w; i++) {
            int r = r0 + (r1 - r0) * i / w, g = g0 + (g1 - g0) * i / w, b = b0 + (b1 - b0) * i / w;
            rows[slot][i] = (uint32_t)(r << 16 | g << 8 | b);
        }
    }
    const uint32_t *row = rows[slot];
    Rect whole = rect(x + origin_x, y + origin_y, w, h);
    Rect r = rect_intersect(whole, clip);
    if (rect_empty(r)) return;
    copy_rect32(target + r.y * target_stride + r.x, target_stride * 4, row + (r.x - whole.x), 0,
                r.w, r.h);
}

/* ------------------------------------------------------------------ bevels */

static void bevel(int x, int y, int w, int h, uint32_t outer_top, uint32_t outer_bottom,
                  uint32_t inner_top, uint32_t inner_bottom) {
    hline(x, y, w - 1, outer_top);
    vline(x, y, h - 1, outer_top);
    hline(x, y + h - 1, w, outer_bottom);
    vline(x + w - 1, y, h, outer_bottom);
    hline(x + 1, y + 1, w - 3, inner_top);
    vline(x + 1, y + 1, h - 3, inner_top);
    hline(x + 1, y + h - 2, w - 2, inner_bottom);
    vline(x + w - 2, y + 1, h - 2, inner_bottom);
}

void bevel_raised(int x, int y, int w, int h) { bevel(x, y, w, h, WHITE, BLACK, LIGHT, SHADOW); }
void bevel_sunken(int x, int y, int w, int h) { bevel(x, y, w, h, SHADOW, WHITE, BLACK, LIGHT); }
void bevel_frame(int x, int y, int w, int h) { bevel(x, y, w, h, LIGHT, BLACK, WHITE, SHADOW); }
void bevel_thin_sunken(int x, int y, int w, int h) {
    hline(x, y, w - 1, SHADOW);
    vline(x, y, h - 1, SHADOW);
    hline(x, y + h - 1, w, WHITE);
    vline(x + w - 1, y, h, WHITE);
}

/* ------------------------------------------------------------------ text */

void draw_char(int x, int y, int ch, uint32_t colour) {
    if (ch < FONT_FIRST || ch >= FONT_FIRST + FONT_COUNT) ch = '?';
    const unsigned char *glyph = (const unsigned char *)font_bits + (ch - FONT_FIRST) * FONT_H;
    x += origin_x;
    y += origin_y;
    Rect cell = rect(x, y, FONT_W, FONT_H);
    Rect r = rect_intersect(cell, clip);
    if (rect_empty(r)) return;
    if (r.w == FONT_W && r.h == FONT_H) {
        /* the whole character shows: no clipping per pixel */
        uint32_t *row = target + y * target_stride + x;
        for (int line = 0; line < FONT_H; line++, row += target_stride) {
            /* one store per pixel that is set, found by counting the zeros below the lowest */
            for (unsigned bits = glyph[line]; bits; bits &= bits - 1)
                row[7 - __builtin_ctz(bits)] = colour;
        }
        return;
    }
    for (int line = r.y - y; line < r.y - y + r.h; line++) {
        unsigned bits = glyph[line];
        uint32_t *row = target + (y + line) * target_stride + x;
        for (int column = r.x - x; column < r.x - x + r.w; column++)
            if (bits & (0x80 >> column)) row[column] = colour;
    }
}

void draw_text_n(int x, int y, const char *text, int count, uint32_t colour) {
    /* skip the characters left of the clip, and stop at its right edge */
    int left = clip.x - origin_x, right = clip.x + clip.w - origin_x;
    if (y + origin_y >= clip.y + clip.h || y + origin_y + FONT_H <= clip.y) return;
    for (int i = 0; i < count && text[i]; i++, x += FONT_W) {
        if (x + FONT_W <= left) continue;
        if (x >= right) break;
        if (text[i] != ' ') draw_char(x, y, (unsigned char)text[i], colour);
    }
}

void draw_text(int x, int y, const char *text, uint32_t colour) {
    draw_text_n(x, y, text, 1 << 30, colour);
}

void draw_text_bold(int x, int y, const char *text, uint32_t colour) {
    draw_text(x, y, text, colour);
    draw_text(x + 1, y, text, colour);
}

/* Text turned a quarter left, read from the bottom up, with its first character at the bottom. */
void draw_text_up(int x, int y, const char *text, uint32_t colour) {
    for (; *text; text++, y -= FONT_W) {
        int ch = (unsigned char)*text;
        if (ch < FONT_FIRST || ch >= FONT_FIRST + FONT_COUNT) continue;
        const unsigned char *glyph = (const unsigned char *)font_bits + (ch - FONT_FIRST) * FONT_H;
        for (int line = 0; line < FONT_H; line++)
            for (int column = 0; column < FONT_W; column++)
                if (glyph[line] & (0x80 >> column)) put_pixel(x + line, y - column, colour);
    }
}

int text_width(const char *text) {
    int count = 0;
    while (text[count]) count++;
    return count * FONT_W;
}

void draw_button(int x, int y, int w, int h, const char *label, int pressed) {
    fill_rect(x, y, w, h, FACE);
    if (pressed) {
        frame_rect(x, y, w, h, BLACK);
        frame_rect(x + 1, y + 1, w - 2, h - 2, SHADOW);
    } else {
        bevel_raised(x, y, w, h);
    }
    int shift = pressed ? 1 : 0;
    draw_text(x + (w - text_width(label)) / 2 + shift, y + (h - FONT_H) / 2 + shift, label, BLACK);
}
