#include <sim.h>

/* 256 x 256 pixels, with one array cell for each 4 x 4 square. */
SIM_SCREEN(display, 256, 256, 4);

enum {
    SIDE = 64, GROUND_Y = 56, GRASS_BOTTOM = 58,
    BIRD_X = 12, BIRD_WIDTH = 6, BIRD_HEIGHT = 5,
    PIPE_WIDTH = 8, HALF_GAP = 9, SPACING = 24,
    PIPE_COUNT = 3, FIRST_X = 62, GAP_MIN = 13, GAP_SPAN = 26,
    GRAVITY = 3, FLAP_VELOCITY = -26, MAX_FALL = 26,
    START_Y = 20 * 16, REST_Y = (GROUND_Y - BIRD_HEIGHT) * 16,
    FRAME_MS = 80,
    SKY = 0x4ec0e8, PIPE_GREEN = 0x58bb39, GRASS = 0x74c458,
    SAND = 0xded895, DEAD_GROUND = 0xb03028,
    BODY = 0xface3e, BEAK = 0xf08228, INK = 0x201810
};

enum GameState { READY, PLAYING, DEAD };

struct Pipe {
    int x;
    int gap;
    int counted;
};

static struct Pipe pipes[PIPE_COUNT];
static enum GameState state;
static int bird_y, velocity, score, best;
static unsigned seed = 0x1f123bb5u;

/* Keep the assembly game's xorshift sequence: all shifts are unsigned. */
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

/* Paint [from, to), clipped to the row window [start, end). */
static void fill_span(int x, int from, int to, unsigned color,
                      int start, int end) {
    if (from < start) from = start;
    if (to > end) to = end;
    for (int y = from; y < to; ++y) {
        display[y * SIDE + x] = color;
    }
}

/* Reconstruct the world in one column, within the supplied row window. */
static void world_column(int x, int start, int end) {
    if (x < 0 || x >= SIDE) return;
    int gap = -1;
    for (int i = 0; i < PIPE_COUNT; ++i) {
        if (x >= pipes[i].x && x < pipes[i].x + PIPE_WIDTH) {
            gap = pipes[i].gap;
        }
    }
    if (gap < 0) {
        fill_span(x, 0, GROUND_Y, SKY, start, end);
    } else {
        fill_span(x, 0, gap - HALF_GAP, PIPE_GREEN, start, end);
        fill_span(x, gap - HALF_GAP, gap + HALF_GAP, SKY, start, end);
        fill_span(x, gap + HALF_GAP, GROUND_Y, PIPE_GREEN, start, end);
    }
    fill_span(x, GROUND_Y, GRASS_BOTTOM,
              state == DEAD ? DEAD_GROUND : GRASS, start, end);
    fill_span(x, GRASS_BOTTOM, SIDE,
              state == DEAD ? DEAD_GROUND : SAND, start, end);
}

static void paint_grid(void) {
    for (int x = 0; x < SIDE; ++x) world_column(x, 0, SIDE);
}

static void paint_dead_ground(void) {
    for (int x = 0; x < SIDE; ++x) {
        fill_span(x, GROUND_Y, SIDE, DEAD_GROUND, 0, SIDE);
    }
}

/* Paint each bird column as world / body / world, then add eye and beak. */
static void draw_bird(void) {
    int top = bird_y >> 4;
    for (int x = BIRD_X; x < BIRD_X + BIRD_WIDTH; ++x) {
        world_column(x, 0, top);
        fill_span(x, top, top + BIRD_HEIGHT, BODY, 0, SIDE);
        world_column(x, top + BIRD_HEIGHT, SIDE);
    }
    fill_span(BIRD_X + BIRD_WIDTH - 2, top + 1, top + 2, INK, 0, SIDE);
    fill_span(BIRD_X + BIRD_WIDTH - 1, top + 2, top + 4, BEAK, 0, SIDE);
}

static void print_score(void) {
    sim_print_string("Score: ");
    sim_print_int(score);
    sim_print_char('\n');
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
            print_score();
        }
        /* Only the newly covered and newly uncovered columns changed. */
        world_column(pipe->x, 0, SIDE);
        world_column(pipe->x + PIPE_WIDTH, 0, SIDE);
    }
}

static int hit_test(void) {
    int top = bird_y >> 4;
    int bottom = top + BIRD_HEIGHT;
    if (bottom > GROUND_Y) return 1;
    for (int i = 0; i < PIPE_COUNT; ++i) {
        const struct Pipe *pipe = &pipes[i];
        if (pipe->x >= BIRD_X + BIRD_WIDTH ||
            pipe->x + PIPE_WIDTH <= BIRD_X) continue;
        if (top < pipe->gap - HALF_GAP ||
            bottom > pipe->gap + HALF_GAP) return 1;
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
    paint_grid();
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
            paint_grid();
            state = PLAYING;
            velocity = FLAP_VELOCITY;
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
            paint_dead_ground();
            if (score > best) best = score;
            sim_print_string("Game over. Score: ");
            sim_print_int(score);
            sim_print_string(", best: ");
            sim_print_int(best);
            sim_print_char('\n');
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

int main(void) {
    new_game();
    for (;;) {
        update(read_flap());
        draw_bird();
        sim_sleep(FRAME_MS);
    }
}
