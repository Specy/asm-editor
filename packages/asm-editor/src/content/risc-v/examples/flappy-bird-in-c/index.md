Recreate the [assembly Flappy Bird](/learn/courses/risc-v/examples/flappy-bird) in C with `<sim.h>`.
It uses the same 192 × 256 grid, shaded pipes, animated bird and score digits. The scenery is drawn
once and reused, and the game updates only the pixels that change. It targets one frame every
20 milliseconds.

Choose **-O2** in the **Compiler optimization** menu next to **Compile**, then press **Compile**,
**Build** and **Run**. Compile translates `flappy-bird.c` for **RISC-V** and opens its Generated
assembly in another file tab. The first compilation needs an internet connection.

The default is **-O0**, which disables most compiler optimizations. Use **-O2** here to reduce the
work needed to draw each frame. To compare the output, compile once at each setting and inspect
the Generated assembly.

Click the **Screen** panel to give it keyboard focus. Tap Space, lowercase `w`, or Enter to start
and flap. After a collision, tap once to reset the game, then again to start. The console prints
the score and the best score of the session at each game over. Press **Stop** to end the program.

`SIM_SCREEN(display, 384, 512, 2)` creates the display array and configures the Screen when you
Build. Each array element colors a 2 × 2 pixel square, so the array has 192 columns and 256 rows.
The program draws by storing colors in `display[y * WIDTH + x]`.

The remaining simulator services have C names:

| C API                                                 | What the game uses it for                                 |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `sim_keyboard_ready()`                                | Check whether a typed character is waiting.               |
| `sim_keyboard_read()`                                 | Read and remove that character.                           |
| `sim_time()`                                          | Seed the pipe-gap sequence and check when a frame is due. |
| `sim_sleep(wait)`                                     | Wait for the remaining time before the next frame.        |
| `sim_print_string`, `sim_print_int`, `sim_print_char` | Print the score in the console at game over.              |

These functions come from the editor's `<sim.h>` header. Including it provides access to the
simulator API. In Generated assembly, keyboard polling becomes memory-mapped loads, and timing
and printing become `ecall` instructions.

```c|playground|target=riscv|file=flappy-bird.c|open-screen|console|no-registers|allow-open
#include <sim.h>

/* 384 x 512 pixels on the Screen, one array cell for each 2 x 2 square: a grid of 192 x 256. */
SIM_SCREEN(display, 384, 512, 2);

enum {
    WIDTH = 192, HEIGHT = 256, GROUND_Y = 216,
    BIRD_X = 48, BIRD_WIDTH = 17, BIRD_HEIGHT = 12,
    PIPE_WIDTH = 30, CAP_HEIGHT = 12, HALF_GAP = 34,
    PIPE_COUNT = 3, SPACING = 104, FIRST_X = WIDTH + 24,
    GAP_MIN = 86, GAP_SPAN = 61,
    GRAVITY = 6, FLAP_VELOCITY = -88, MAX_FALL = 120,
    START_Y = 100 * 16, REST_Y = (GROUND_Y - BIRD_HEIGHT) * 16,
    FRAME_MS = 20,
    DIGIT_WIDTH = 12, DIGIT_HEIGHT = 16, SCORE_Y = 20,
    CLOUD_Y = 150, CITY_Y = 204, BUSH_Y = 204
};

/* Colours, as 0x00RRGGBB */
enum {
    NONE = 0,
    SKY = 0x4ec0ca, CLOUD = 0xe9fcd9, CITY = 0xa8dfb5, WINDOW = 0xd2f3dc,
    BUSH = 0x5ee270, BUSH_EDGE = 0x47bf5a,
    EDGE = 0x543847, PIPE_HI = 0xe4fd8b, PIPE_LIGHT = 0x9ce659,
    PIPE_MID = 0x73bf2e, PIPE_DARK = 0x558022,
    STRIPE_LIGHT = 0x9ce659, STRIPE_DARK = 0x73bf2e, SAND = 0xded895
};

enum GameState { READY, PLAYING, DEAD };

struct Pipe {
    int x;          /* the left edge of its cap */
    int gap;        /* the middle of its gap */
    int counted;
};

/* The pipe's colours, column by column across the cap: the body is two columns narrower on each
   side, so its table starts and ends with NONE. */
static const unsigned body_shade[PIPE_WIDTH] = {
    NONE, NONE, EDGE, PIPE_LIGHT, PIPE_HI, PIPE_HI, PIPE_LIGHT, PIPE_LIGHT,
    PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID,
    PIPE_MID, PIPE_MID, PIPE_DARK, PIPE_MID, PIPE_DARK, PIPE_DARK, PIPE_DARK, PIPE_DARK,
    PIPE_DARK, PIPE_DARK, PIPE_DARK, EDGE, NONE, NONE
};
static const unsigned cap_shade[PIPE_WIDTH] = {
    EDGE, PIPE_LIGHT, PIPE_LIGHT, PIPE_HI, PIPE_HI, PIPE_HI, PIPE_LIGHT, PIPE_LIGHT,
    PIPE_LIGHT, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID,
    PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_DARK, PIPE_MID, PIPE_DARK, PIPE_DARK,
    PIPE_DARK, PIPE_DARK, PIPE_DARK, PIPE_DARK, PIPE_DARK, EDGE
};

/* How far the clouds and the bushes rise above their base, column by column. */
static const unsigned char cloud_rise[64] = {
     5,  5,  6,  6,  7,  7,  7,  7,  7,  7,  7,  8,  8,  9,  9, 10,
    10, 10, 10, 10, 10, 10, 10, 10, 10, 10,  9,  9,  8,  8,  7,  6,
     6,  6,  6,  6,  6,  6,  7,  7,  8,  8,  8,  9,  9,  9,  9,  9,
     8,  8,  8,  7,  7,  6,  5,  5,  6,  6,  6,  5,  5,  5,  4,  3,
};
static const unsigned char bush_rise[32] = {
     3,  4,  4,  5,  5,  5,  5,  5,  4,  4,  5,  6,  6,  6,  6,  6,
     6,  6,  6,  6,  5,  4,  4,  5,  5,  5,  5,  5,  4,  4,  3,  0,
};
/* The heights of the buildings, eight columns each. */
static const unsigned char towers[12] = { 26, 40, 32, 48, 22, 36, 44, 30, 52, 28, 38, 24 };

/* Pictures, one character a pixel: '.' shows what is behind, any other character is a colour. */
static const char palette_keys[] = "Xywrol";
static const unsigned palette[] = {
    0x543847, 0xf8c82a, 0xffffff, 0xf25c3c, 0xf09a2c, 0xfaee9c
};
static const char bird_art[3][BIRD_HEIGHT * BIRD_WIDTH + 1] = {
    { /* wing up */
      "......XXXXXX....."
      "....XXyyyXwwX...."
      "...XyyyyXwwwwX..."
      ".XXXyyyyXwwwXwX.."
      "XlllXyyyXwwwXwX.."
      "XllllXyyyXwwwwX.."
      "XllllXyyyyXXXXXX."
      ".XXXXyyyyXrrrrrX."
      "..XooooooXrXXXXX."
      "..XoooooooXrrrrX."
      "...XXoooooXXXXX.."
      ".....XXXXX......." },
    { /* wing level */
      "......XXXXXX....."
      "....XXyyyXwwX...."
      "...XyyyyXwwwwX..."
      ".XXXXyyyXwwwXwX.."
      "XllllXyyXwwwXwX.."
      "XlllllXyyXwwwwX.."
      "XylllyXyyyXXXXXX."
      ".XyyyXyyyyXrrrrrX"
      "..XXXooooXrXXXXX."
      "..XoooooooXrrrrX."
      "...XXoooooXXXXX.."
      ".....XXXXX......." },
    { /* wing down */
      "......XXXXXX....."
      "....XXyyyXwwX...."
      "...XyyyyXwwwwX..."
      "..XyyyyyXwwwXwX.."
      ".XyyyyyyXwwwXwX.."
      ".XXXXXyyyXwwwwX.."
      "XlllllXyyyXXXXXX."
      "XlllllXyyXrrrrrX."
      ".XllllXooXrXXXXX."
      "..XXXXooooXrrrrX."
      "...XXoooooXXXXX.."
      ".....XXXXX......." },
};
static const char digit_art[10][DIGIT_HEIGHT * DIGIT_WIDTH + 1] = {
    {
      "..XXXXXXXX.."
      "..XwwwwwwX.."
      "XXXwwwwwwXXX"
      "XwwXXXXXXwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwXXX"
      "..XwwwwwwX.."
      "..XXXXXXXX.." },
    {
      "....XXXX...."
      "....XwwX...."
      "..XXXwwX...."
      "..XwwwwX...."
      "..XwwwwX...."
      "..XXXwwX...."
      "....XwwX...."
      "....XwwX...."
      "....XwwX...."
      "....XwwX...."
      "....XwwX...."
      "....XwwX...."
      "..XXXwwXXX.."
      "..XwwwwwwX.."
      "..XwwwwwwX.."
      "..XXXXXXXX.." },
    {
      "..XXXXXXXX.."
      "..XwwwwwwX.."
      "XXXwwwwwwXXX"
      "XwwXXXXXXwwX"
      "XwwX....XwwX"
      "XXXX....XwwX"
      "......XXXwwX"
      "......XwwXXX"
      "....XXXwwX.."
      "....XwwXXX.."
      "..XXXwwX...."
      "..XwwXXX...."
      "XXXwwXXXXXXX"
      "XwwwwwwwwwwX"
      "XwwwwwwwwwwX"
      "XXXXXXXXXXXX" },
    {
      "XXXXXXXXXXXX"
      "XwwwwwwwwwwX"
      "XwwwwwwwwwwX"
      "XXXXXXXwwXXX"
      "....XXXwwX.."
      "....XwwXXX.."
      "....XwwXXX.."
      "....XXXwwX.."
      "......XwwXXX"
      "......XXXwwX"
      "XXXX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwXXX"
      "..XwwwwwwX.."
      "..XXXXXXXX.." },
    {
      "......XXXX.."
      "......XwwX.."
      "....XXXwwX.."
      "....XwwwwX.."
      "..XXXwwwwX.."
      "..XwwXXwwX.."
      "XXXwwXXwwX.."
      "XwwXXXXwwX.."
      "XwwXXXXwwXXX"
      "XwwwwwwwwwwX"
      "XwwwwwwwwwwX"
      "XXXXXXXwwXXX"
      "......XwwX.."
      "......XwwX.."
      "......XwwX.."
      "......XXXX.." },
    {
      "XXXXXXXXXXXX"
      "XwwwwwwwwwwX"
      "XwwwwwwwwwwX"
      "XwwXXXXXXXXX"
      "XwwXXXXXXX.."
      "XwwwwwwwwX.."
      "XwwwwwwwwXXX"
      "XXXXXXXXXwwX"
      "........XwwX"
      "........XwwX"
      "XXXX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwXXX"
      "..XwwwwwwX.."
      "..XXXXXXXX.." },
    {
      "....XXXXXX.."
      "....XwwwwX.."
      "..XXXwwwwX.."
      "..XwwXXXXX.."
      "XXXwwX......"
      "XwwXXX......"
      "XwwXXXXXXX.."
      "XwwwwwwwwX.."
      "XwwwwwwwwXXX"
      "XwwXXXXXXwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwXXX"
      "..XwwwwwwX.."
      "..XXXXXXXX.." },
    {
      "XXXXXXXXXXXX"
      "XwwwwwwwwwwX"
      "XwwwwwwwwwwX"
      "XXXXXXXXXwwX"
      "......XXXwwX"
      "......XwwXXX"
      "....XXXwwX.."
      "....XwwXXX.."
      "..XXXwwX...."
      "..XwwXXX...."
      "..XwwX......"
      "..XwwX......"
      "..XwwX......"
      "..XwwX......"
      "..XwwX......"
      "..XXXX......" },
    {
      "..XXXXXXXX.."
      "..XwwwwwwX.."
      "XXXwwwwwwXXX"
      "XwwXXXXXXwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwXXX"
      "XXXwwwwwwXXX"
      "XwwXXXXXXwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwXXX"
      "..XwwwwwwX.."
      "..XXXXXXXX.." },
    {
      "..XXXXXXXX.."
      "..XwwwwwwX.."
      "XXXwwwwwwXXX"
      "XwwXXXXXXwwX"
      "XwwX....XwwX"
      "XwwX....XwwX"
      "XwwXXXXXXwwX"
      "XXXwwwwwwwwX"
      "..XwwwwwwwwX"
      "..XXXXXXXwwX"
      "......XXXwwX"
      "......XwwXXX"
      "..XXXXXwwX.."
      "..XwwwwXXX.."
      "..XwwwwX...."
      "..XXXXXX...." },
};

static unsigned backdrop[GROUND_Y * WIDTH];
static struct Pipe pipes[PIPE_COUNT];
static enum GameState state;
static int bird_y, velocity, score, best;
static int shown_y, shown_score;    /* where the bird and the score are on the Screen */
static int tick;                    /* frames since the program started */
static int next_frame;              /* sim_time() at which the next frame starts */
static unsigned seed = 0x1f123bb5u;

static int random_gap(void) {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return GAP_MIN + (int)((seed >> 8) % GAP_SPAN);
}

static void new_pipes(void) {
    for (int i = 0; i < PIPE_COUNT; ++i) {
        pipes[i].x = FIRST_X + i * SPACING;
        pipes[i].gap = random_gap();
        pipes[i].counted = 0;
    }
}

/* The scenery behind the pipes, worked out once: sky, clouds, buildings and bushes. */
static void make_backdrop(void) {
    for (int x = 0; x < WIDTH; ++x) {
        int cloud_top = CLOUD_Y - cloud_rise[x % 64];
        int city_top = CITY_Y - towers[x / 8 % 12];
        int bush_top = BUSH_Y - bush_rise[x % 32];
        for (int y = 0; y < GROUND_Y; ++y) {
            unsigned colour = SKY;
            if (y >= bush_top) colour = y == bush_top ? BUSH_EDGE : BUSH;
            else if (y >= city_top)
                colour = (x % 8 == 2 || x % 8 == 5) && y % 4 == 2 && y > city_top + 2
                             ? WINDOW : CITY;
            else if (y >= cloud_top) colour = CLOUD;
            backdrop[y * WIDTH + x] = colour;
        }
    }
}

/* Every drawing routine stores a pixel only when its colour changes: the Screen's work, and so
   most of a frame's, is in the stores. */
static void put(int x, int y, unsigned colour) {
    unsigned *pixel = &display[y * WIDTH + x];
    if (*pixel != colour) *pixel = colour;
}

/* Paint rows [from, to) of column x, clipped to the row window [start, end). */
static void fill_span(int x, int from, int to, unsigned colour, int start, int end) {
    if (from < start) from = start;
    if (to > end) to = end;
    for (int y = from; y < to; ++y) put(x, y, colour);
}

/* The same, with the backdrop's own colours. */
static void backdrop_span(int x, int from, int to, int start, int end) {
    if (from < start) from = start;
    if (to > end) to = end;
    for (int y = from; y < to; ++y) put(x, y, backdrop[y * WIDTH + x]);
}

/* Body rows of a pipe column, or the backdrop where only the cap reaches. */
static void body_span(int x, int from, int to, unsigned colour, int start, int end) {
    if (colour == NONE) backdrop_span(x, from, to, start, end);
    else fill_span(x, from, to, colour, start, end);
}

/* A cap: an edge row, its shaded rows and another edge row. */
static void cap_span(int x, int top, unsigned colour, int start, int end) {
    fill_span(x, top, top + 1, EDGE, start, end);
    fill_span(x, top + 1, top + CAP_HEIGHT - 1, colour, start, end);
    fill_span(x, top + CAP_HEIGHT - 1, top + CAP_HEIGHT, EDGE, start, end);
}

/* Reconstruct the world above the ground in one column, within the row window [start, end). */
static void world_column(int x, int start, int end) {
    if (x < 0 || x >= WIDTH) return;
    for (int i = 0; i < PIPE_COUNT; ++i) {
        int k = x - pipes[i].x;
        if (k < 0 || k >= PIPE_WIDTH) continue;
        int top = pipes[i].gap - HALF_GAP;
        int bottom = pipes[i].gap + HALF_GAP;
        body_span(x, 0, top - CAP_HEIGHT, body_shade[k], start, end);
        cap_span(x, top - CAP_HEIGHT, cap_shade[k], start, end);
        backdrop_span(x, top, bottom, start, end);
        cap_span(x, bottom, cap_shade[k], start, end);
        body_span(x, bottom + CAP_HEIGHT, GROUND_Y, body_shade[k], start, end);
        return;
    }
    backdrop_span(x, 0, GROUND_Y, start, end);
}

/* The ground's grass is diagonal stripes that slide left with the pipes. */
static void paint_stripes(void) {
    for (int y = GROUND_Y + 2; y < GROUND_Y + 10; ++y) {
        for (int x = 0; x < WIDTH; ++x) {
            put(x, y, (x + y + tick) & 4 ? STRIPE_DARK : STRIPE_LIGHT);
        }
    }
}

static void paint_ground(void) {
    for (int x = 0; x < WIDTH; ++x) {
        put(x, GROUND_Y, EDGE);
        put(x, GROUND_Y + 1, PIPE_HI);
        put(x, GROUND_Y + 10, PIPE_DARK);
        fill_span(x, GROUND_Y + 11, HEIGHT, SAND, 0, HEIGHT);
    }
    paint_stripes();
}

static void paint_world(void) {
    for (int x = 0; x < WIDTH; ++x) world_column(x, 0, GROUND_Y);
    paint_ground();
}

/* A picture of w x h characters at (x, y). */
static void draw_art(int x, int y, int w, int h, const char *art) {
    for (int row = 0; row < h; ++row) {
        for (int col = 0; col < w; ++col) {
            char key = art[row * w + col];
            if (key == '.') continue;
            int i = 0;
            while (palette_keys[i] != key) ++i;
            put(x + col, y + row, palette[i]);
        }
    }
}

static void erase_bird(void) {
    for (int x = BIRD_X; x < BIRD_X + BIRD_WIDTH; ++x) {
        world_column(x, shown_y, shown_y + BIRD_HEIGHT);
    }
}

static void draw_bird(void) {
    int frame = 1;  /* the wing level, once the bird is dead */
    if (state != DEAD) {
        frame = tick / 4 % 4;   /* up, level, down, level */
        if (frame == 3) frame = 1;
    }
    shown_y = bird_y >> 4;
    draw_art(BIRD_X, shown_y, BIRD_WIDTH, BIRD_HEIGHT, bird_art[frame]);
}

/* The score, centred at the top: drawn every frame, since a pipe column repainted under it
   paints over it, and the old digits wiped first when the number changes. */
static void draw_score(void) {
    char digits[8];
    int count = 0, n = score;
    do {
        digits[count++] = (char)(n % 10);
        n /= 10;
    } while (n > 0);
    int left = (WIDTH - count * DIGIT_WIDTH) / 2;
    if (score != shown_score) {
        for (int x = left - DIGIT_WIDTH; x < left + (count + 1) * DIGIT_WIDTH; ++x) {
            world_column(x, SCORE_Y, SCORE_Y + DIGIT_HEIGHT);
        }
        shown_score = score;
    }
    for (int i = 0; i < count; ++i) {
        draw_art(left + i * DIGIT_WIDTH, SCORE_Y, DIGIT_WIDTH, DIGIT_HEIGHT,
                 digit_art[(int)digits[count - 1 - i]]);
    }
}

static void print_result(void) {
    sim_print_string("Game over. Score: ");
    sim_print_int(score);
    sim_print_string(", best: ");
    sim_print_int(best);
    sim_print_char('\n');
}

/* One column of a pipe changes colour as it moves one pixel left only where its shading changes
   from one column to the next, and the column just past its right edge goes back to backdrop.
   The gap rows are backdrop before and after, so only the rows above and below it are painted. */
static int column_changes(int k) {
    unsigned body = k < PIPE_WIDTH ? body_shade[k] : NONE;
    unsigned cap = k < PIPE_WIDTH ? cap_shade[k] : NONE;
    unsigned left_body = k > 0 ? body_shade[k - 1] : NONE;
    unsigned left_cap = k > 0 ? cap_shade[k - 1] : NONE;
    return body != left_body || cap != left_cap;
}

static void move_pipes(void) {
    for (int i = 0; i < PIPE_COUNT; ++i) {
        struct Pipe *pipe = &pipes[i];
        --pipe->x;
        if (pipe->x < -PIPE_WIDTH) {
            pipe->x += SPACING * PIPE_COUNT;
            pipe->gap = random_gap();
            pipe->counted = 0;
        }
        if (!pipe->counted && pipe->x + PIPE_WIDTH < BIRD_X) {
            pipe->counted = 1;
            ++score;
        }
        for (int k = 0; k <= PIPE_WIDTH; ++k) {
            if (!column_changes(k)) continue;
            world_column(pipe->x + k, 0, pipe->gap - HALF_GAP);
            world_column(pipe->x + k, pipe->gap + HALF_GAP, GROUND_Y);
        }
    }
}

static int hit_test(void) {
    int top = bird_y >> 4;
    int bottom = top + BIRD_HEIGHT;
    if (bottom > GROUND_Y) return 1;
    for (int i = 0; i < PIPE_COUNT; ++i) {
        const struct Pipe *pipe = &pipes[i];
        if (pipe->x >= BIRD_X + BIRD_WIDTH || pipe->x + PIPE_WIDTH <= BIRD_X) continue;
        if (top < pipe->gap - HALF_GAP || bottom > pipe->gap + HALF_GAP) return 1;
    }
    return 0;
}

/* Drain every queued character; several accepted keys still mean one flap. */
static int read_flap(void) {
    int flap = 0;
    while (sim_keyboard_ready()) {
        int key = sim_keyboard_read() & 0xff;
        if (key == ' ' || key == 'w' || key == '\n') flap = 1;
    }
    return flap;
}

static void new_game(void) {
    bird_y = START_Y;
    velocity = 0;
    state = READY;
    score = 0;
    new_pipes();
    paint_world();
}

static void fall(void) {
    velocity += GRAVITY;
    if (velocity > MAX_FALL) velocity = MAX_FALL;
    bird_y += velocity;
}

static void update(int flap) {
    switch (state) {
    case READY:
        if (flap) {
            /* A zero xorshift seed never changes, so give it a fallback. */
            seed = (unsigned)sim_time();
            if (seed == 0) seed = 0x1f123bb5u;
            new_pipes();
            state = PLAYING;
            velocity = FLAP_VELOCITY;
        } else {
            /* Bob up and down by up to 4 pixels while waiting. */
            int phase = tick % 32;
            if (phase >= 16) phase = 31 - phase;
            bird_y = START_Y + phase * 4;
        }
        break;
    case PLAYING:
        if (flap) velocity = FLAP_VELOCITY;
        fall();
        if (bird_y < 0) {
            bird_y = 0;
            velocity = 0;
        }
        move_pipes();
        if (hit_test()) {
            state = DEAD;
            if (score > best) best = score;
            print_result();
        }
        break;
    case DEAD:
        if (flap) {
            new_game();
        } else {
            fall();
            if (bird_y > REST_Y) {
                bird_y = REST_Y;
                velocity = 0;
            }
        }
        break;
    }
}

/* Frames start every FRAME_MS milliseconds however long drawing took, as long as it took less.
   It always sleeps, for at least a millisecond, since a sleep is when the Screen shows the frame. */
static void wait_frame(void) {
    int now = (int)sim_time();
    int wait = next_frame - now;
    if (wait < 1) {
        wait = 1;
        next_frame = now;
    }
    next_frame += FRAME_MS;
    sim_sleep(wait);
}

int main(void) {
    make_backdrop();
    new_game();
    shown_y = bird_y >> 4;
    shown_score = -1;
    next_frame = (int)sim_time();
    for (;;) {
        update(read_flap());
        if (state != DEAD) ++tick;
        erase_bird();
        if (state != DEAD) paint_stripes();
        draw_bird();
        draw_score();
        wait_frame();
    }
}
```

```testcase
{ "runFor": 3000000 }
```

`bird_y` and `velocity` keep the fractional movement from the assembly version. Dividing the
position by 16 with `bird_y >> 4` chooses a screen row without losing the fraction stored for the
next frame. Each `struct Pipe` holds the left column of its cap, the gap middle, and whether it has
already contributed to the score.

`read_flap` drains the keyboard queue once per frame. `update` makes the bird bob in `READY`,
applies physics and collisions in `PLAYING`, and lets the bird settle on the ground in `DEAD`. The
first flap sets the velocity. Movement begins on the following frame. Restarting resets the score
and pipes while keeping `best`.

Drawing follows the assembly version. `make_backdrop` draws the sky, clouds, buildings and bushes
once into `backdrop`. When a pipe or the bird moves away, `backdrop_span` copies the uncovered
scenery back into `display`. `world_column` rebuilds one column from the pipe records and shading
tables.

Stores to display memory trigger Screen updates, so `put` skips pixels whose colour is unchanged.
When a pipe moves left, `column_changes` finds columns whose colour differs from the column to
their left. Only those columns are repainted, above and below the gap. `draw_art` draws the bird
and digits from pictures stored as text, looking up each character in `palette_keys`.

`wait_frame` stores the next frame's deadline in `next_frame` and sleeps for the remaining time.
This includes drawing time in the `FRAME_MS` interval. If there is no time left to wait, the routine
resets the schedule and sleeps for one millisecond. Actual timing also depends on browser
scheduling. The Screen can refresh between sleeps, so partial updates may be visible.

Try changing `FRAME_MS`, `GRAVITY`, or `HALF_GAP`, then Compile and Build again. Compare `hit_test`
with the assembly version: both use half-open ranges, so a bird that fits exactly between a gap's
two edges survives. Change a bird picture's characters, or `towers`, then Compile, Build and Run
again to see the change.
