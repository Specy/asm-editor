Recreate the [assembly Flappy ASM](/learn/courses/risc-v/examples/flappy-asm) in C with `<sim.h>`.
It uses the same 192 × 256 grid, shaded pipes, and bird and digit sprites. The scenery is drawn
once and reused, and each frame paints only the pixels that change, each one once. It targets one
frame every 20 milliseconds.

Choose **-O2** in the **Compiler optimization** menu next to **Compile**, then press **Compile**,
**Build** and **Run**. Compile translates `flappy-asm.c` for **RISC-V** and opens its Generated
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

```c|playground|target=riscv|file=flappy-asm.c|open-screen|console|no-registers|allow-open
#include <sim.h>

/* 384 x 512 pixels on the Screen, one array cell for each 2 x 2 square: a grid of 192 x 256. */
SIM_SCREEN(display, 384, 512, 2);

enum {
    WIDTH = 192, HEIGHT = 256, GROUND_Y = 216,
    BIRD_X = 48, BIRD_WIDTH = 17, BIRD_HEIGHT = 12,
    PIPE_WIDTH = 30, CAP_HEIGHT = 12, HALF_GAP = 40,
    PIPE_COUNT = 3, SPACING = 104, FIRST_X = WIDTH + 24,
    GAP_MIN = 92, GAP_SPAN = 49,
    GRAVITY = 5, FLAP_VELOCITY = -80, MAX_FALL = 112,
    HIT_INSET = 2,
    START_Y = 100 * 16, REST_Y = (GROUND_Y - BIRD_HEIGHT) * 16,
    FRAME_MS = 20,
    DIGIT_WIDTH = 12, DIGIT_HEIGHT = 16, SCORE_Y = 20,
    CLOUD_Y = 150, CITY_Y = 204, BUSH_Y = 204
};

/* Colours, as 0x00RRGGBB */
enum {
    NONE = 0,   /* in a pipe's shading, no body in this column; in a sprite, see-through */
    SKY = 0x4ec0ca, CLOUD = 0xe9fcd9, CITY = 0xa8dfb5, WINDOW = 0xd2f3dc,
    BUSH = 0x5ee270, BUSH_EDGE = 0x47bf5a,
    EDGE = 0x543847, PIPE_HI = 0xe4fd8b, PIPE_LIGHT = 0x9ce659,
    PIPE_MID = 0x73bf2e, PIPE_DARK = 0x558022, SAND = 0xded895
};

enum GameState { READY, PLAYING, DEAD };

struct Pipe {
    int x;          /* the left edge of its cap */
    int gap;        /* the middle of its gap */
    int counted;
};

/* The pipe's colours, column by column across the cap. The body is two columns narrower on each
   side, so its table starts and ends with NONE. */
static const unsigned body_shade[PIPE_WIDTH] = {
    NONE, NONE, EDGE, PIPE_LIGHT, PIPE_LIGHT, PIPE_LIGHT, PIPE_LIGHT, PIPE_MID,
    PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID,
    PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_DARK, PIPE_DARK, PIPE_DARK, PIPE_DARK,
    PIPE_DARK, PIPE_DARK, PIPE_DARK, EDGE, NONE, NONE
};
static const unsigned cap_shade[PIPE_WIDTH] = {
    EDGE, PIPE_LIGHT, PIPE_LIGHT, PIPE_HI, PIPE_HI, PIPE_HI, PIPE_LIGHT, PIPE_LIGHT,
    PIPE_LIGHT, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID,
    PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_MID, PIPE_DARK, PIPE_DARK, PIPE_DARK,
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

/* The sprites: three pictures of the bird, its wing up, level and down, and the ten digits, one
   0x00RRGGBB word a pixel, row by row. Black (0) is see-through. */
static const unsigned bird_sprites[3][BIRD_HEIGHT * BIRD_WIDTH] = {
    {
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847,
        0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0, 0,
        0, 0x543847, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0x543847, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0x543847, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0xf8c82a, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0,
        0, 0x543847, 0x543847, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0x543847, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0x543847, 0,
        0, 0, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0x543847, 0xf25c3c, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0,
        0, 0, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0xf09a2c, 0x543847, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0x543847, 0,
        0, 0, 0, 0x543847, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0xf09a2c, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0, 0, 0, 0, 0, 0, 0,
    },
    {
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847,
        0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0, 0,
        0, 0x543847, 0x543847, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0x543847, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0x543847, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xf8c82a, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xf8c82a, 0x543847, 0xf8c82a, 0xf8c82a,
        0xf8c82a, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0,
        0, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0xf8c82a, 0x543847, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0x543847,
        0, 0, 0x543847, 0x543847, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0x543847, 0xf25c3c, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0,
        0, 0, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0xf09a2c, 0x543847, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0x543847, 0,
        0, 0, 0, 0x543847, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0xf09a2c, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0, 0, 0, 0, 0, 0, 0,
    },
    {
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847,
        0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0, 0,
        0, 0, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0x543847, 0xffffff, 0x543847, 0, 0,
        0, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0xf8c82a, 0x543847,
        0xffffff, 0xffffff, 0xffffff, 0x543847, 0xffffff, 0x543847, 0, 0,
        0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xf8c82a, 0xf8c82a, 0xf8c82a,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a,
        0xf8c82a, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0,
        0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf8c82a, 0xf8c82a,
        0x543847, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0x543847, 0,
        0, 0x543847, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0xfaee9c, 0x543847, 0xf09a2c, 0xf09a2c,
        0x543847, 0xf25c3c, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0xf09a2c, 0x543847, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0xf25c3c, 0x543847, 0,
        0, 0, 0, 0x543847, 0x543847, 0xf09a2c, 0xf09a2c, 0xf09a2c, 0xf09a2c,
        0xf09a2c, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0, 0, 0, 0, 0, 0, 0,
    },
};
static const unsigned digit_sprites[10][DIGIT_HEIGHT * DIGIT_WIDTH] = {
    {
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847,
    },
    {
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0, 0, 0,
    },
    {
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
    },
    {
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847,
        0, 0, 0, 0, 0, 0, 0x543847, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0xffffff, 0xffffff, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0x543847, 0x543847, 0, 0,
        0, 0, 0x543847, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x543847, 0, 0, 0, 0,
        0, 0, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0x543847, 0, 0, 0, 0,
    },
};

static unsigned backdrop[GROUND_Y * WIDTH];
static struct Pipe pipes[PIPE_COUNT];
static enum GameState state;
static int bird_y, velocity, score, best;
static int tick;                    /* frames since the program started */
static int next_frame;              /* sim_time() at which the next frame starts */
static int pipes_moved;             /* this frame, so their changed columns need painting */
static int shown_y;                 /* the bird's top row on the Screen */
static int shown_score = -1;        /* the score on the Screen */
static int score_left, score_right; /* the columns the score takes this frame */
static int score_covered;           /* a repaint went around the score this frame */
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

/* Every drawing routine stores a pixel only when its colour changes. */
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

/* A cap: an edge row, its shaded rows and another edge row, or the backdrop for a NONE colour,
   just past the pipe's right edge. */
static void cap_span(int x, int top, unsigned colour, int start, int end) {
    if (colour == NONE) {
        backdrop_span(x, top, top + CAP_HEIGHT, start, end);
        return;
    }
    fill_span(x, top, top + 1, EDGE, start, end);
    fill_span(x, top + 1, top + CAP_HEIGHT - 1, colour, start, end);
    fill_span(x, top + CAP_HEIGHT - 1, top + CAP_HEIGHT, EDGE, start, end);
}

/* Reconstruct the world above the ground in one column, within the row window [start, end). */
static void world_column(int x, int start, int end) {
    if (x < 0 || x >= WIDTH || start >= end) return;
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

/* Rows [from, to) of column x: the sprite's pixel where the sprite is drawn and not see-through,
   the world everywhere else. The sprite is width pixels wide with its top-left corner at
   (left, top). Each pixel is painted once, with the colour it ends the frame in. */
static void sprite_column(int x, int from, int to, const unsigned *sprite, int width, int height,
                          int left, int top) {
    int world_from = from;  /* the first row the world still has to be painted from */
    for (int y = from; y < to; ++y) {
        if (y < top || y >= top + height) continue;
        unsigned colour = sprite[(y - top) * width + x - left];
        if (colour == NONE) continue;
        if (world_from < y) world_column(x, world_from, y);
        put(x, y, colour);
        world_from = y + 1;
    }
    world_column(x, world_from, to);
}

/* The ground's grass is diagonal stripes, four columns wide, that slide left with the pipes. */
static unsigned stripe(int x, int y) {
    return (x + y + tick) & 4 ? PIPE_MID : PIPE_LIGHT;
}

static void paint_ground(void) {
    for (int x = 0; x < WIDTH; ++x) {
        put(x, GROUND_Y, EDGE);
        put(x, GROUND_Y + 1, PIPE_HI);
        for (int y = GROUND_Y + 2; y < GROUND_Y + 10; ++y) put(x, y, stripe(x, y));
        put(x, GROUND_Y + 10, PIPE_DARK);
        fill_span(x, GROUND_Y + 11, HEIGHT, SAND, 0, HEIGHT);
    }
}

/* One frame later, a stripe's colour has changed only in every fourth column: where
   x + y + tick is a multiple of 4. Those are the only pixels painted. */
static void slide_stripes(void) {
    for (int y = GROUND_Y + 2; y < GROUND_Y + 10; ++y) {
        for (int x = -(y + tick) & 3; x < WIDTH; x += 4) put(x, y, stripe(x, y));
    }
}

static void paint_world(void) {
    for (int x = 0; x < WIDTH; ++x) world_column(x, 0, GROUND_Y);
    paint_ground();
    shown_score = -1;       /* and the score has to be drawn again */
}

/* A pipe that has moved one column left changes column k of itself only where its shading differs
   from column k - 1, and the column just past its right edge goes back to the backdrop. Only the
   body rows change where the body's shading does, and only the cap rows where the cap's does. */
static unsigned shade(const unsigned *table, int k) {
    return k >= 0 && k < PIPE_WIDTH ? table[k] : NONE;
}

/* The changed rows of column k of a pipe, within the row window [start, end). */
static void pipe_rows(int x, int k, const struct Pipe *pipe, int start, int end) {
    int top = pipe->gap - HALF_GAP;
    int bottom = pipe->gap + HALF_GAP;
    unsigned body = shade(body_shade, k);
    unsigned cap = shade(cap_shade, k);
    if (body != shade(body_shade, k - 1)) {
        body_span(x, 0, top - CAP_HEIGHT, body, start, end);
        body_span(x, bottom + CAP_HEIGHT, GROUND_Y, body, start, end);
    }
    if (cap != shade(cap_shade, k - 1)) {
        cap_span(x, top - CAP_HEIGHT, cap, start, end);
        cap_span(x, bottom, cap, start, end);
    }
}

/* The changed columns of every pipe, except for the rows the bird or the score takes this frame:
   draw_bird and draw_score paint those, so that no pixel is painted twice in a frame. */
static void repaint_pipes(void) {
    int top = bird_y >> 4;
    for (int i = 0; i < PIPE_COUNT; ++i) {
        for (int k = 0; k <= PIPE_WIDTH; ++k) {
            int x = pipes[i].x + k;
            if (x < 0 || x >= WIDTH) continue;
            if (shade(body_shade, k) == shade(body_shade, k - 1) &&
                shade(cap_shade, k) == shade(cap_shade, k - 1)) continue;
            int from = GROUND_Y, to = GROUND_Y;     /* the rows left alone */
            if (x >= BIRD_X && x < BIRD_X + BIRD_WIDTH) {
                from = top;
                to = top + BIRD_HEIGHT;
            } else if (x >= score_left && x < score_right) {
                from = SCORE_Y;
                to = SCORE_Y + DIGIT_HEIGHT;
                score_covered = 1;
            }
            pipe_rows(x, k, &pipes[i], 0, from);
            if (to < GROUND_Y) pipe_rows(x, k, &pipes[i], to, GROUND_Y);
        }
    }
}

/* The bird's columns, from the higher of its old and new top rows to the lower of their
   bottoms: the bird where it is now, the world where it was. */
static void draw_bird(void) {
    int frame = 1;  /* the wing level, once the bird is dead */
    if (state != DEAD) {
        frame = tick / 4 % 4;   /* up, level, down, level */
        if (frame == 3) frame = 1;
    }
    int top = bird_y >> 4;
    int from = top < shown_y ? top : shown_y;
    int to = (top > shown_y ? top : shown_y) + BIRD_HEIGHT;
    for (int x = BIRD_X; x < BIRD_X + BIRD_WIDTH; ++x) {
        sprite_column(x, from, to, bird_sprites[frame], BIRD_WIDTH, BIRD_HEIGHT, BIRD_X, top);
    }
    shown_y = top;
}

/* The digits of the score, highest first, and how many there are. */
static int score_digits(char digits[8]) {
    int count = 0, n = score;
    do {
        digits[count++] = (char)(n % 10);
        n /= 10;
    } while (n > 0);
    for (int i = 0; i < count / 2; ++i) {
        char swap = digits[i];
        digits[i] = digits[count - 1 - i];
        digits[count - 1 - i] = swap;
    }
    return count;
}

/* Where this frame's score goes, centred at the top. A score only grows during a game, so it
   always covers the columns of the one before it. */
static void place_score(void) {
    char digits[8];
    int count = score_digits(digits);
    score_left = (WIDTH - count * DIGIT_WIDTH) / 2;
    score_right = score_left + count * DIGIT_WIDTH;
    score_covered = 0;
}

/* The score, when it has changed or a repaint went around it. */
static void draw_score(void) {
    if (score == shown_score && !score_covered) return;
    char digits[8];
    int count = score_digits(digits);
    for (int i = 0; i < count; ++i) {
        int left = score_left + i * DIGIT_WIDTH;
        for (int x = left; x < left + DIGIT_WIDTH; ++x) {
            sprite_column(x, SCORE_Y, SCORE_Y + DIGIT_HEIGHT, digit_sprites[(int)digits[i]],
                          DIGIT_WIDTH, DIGIT_HEIGHT, left, SCORE_Y);
        }
    }
    shown_score = score;
}

static void print_result(void) {
    sim_print_string("Game over. Score: ");
    sim_print_int(score);
    sim_print_string(", best: ");
    sim_print_int(best);
    sim_print_char('\n');
}

/* Everything scrolls one column to the left. A pipe that has left the grid jumps a whole cycle
   to the right with a new gap, which is why three pipes are an endless course. */
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
    }
    pipes_moved = 1;
}

/* The ground stops the bird's picture. The pipes stop a box HIT_INSET pixels inside it, which
   leaves out the picture's see-through corners and forgives a near miss. */
static int hit_test(void) {
    int top = bird_y >> 4;
    int bottom = top + BIRD_HEIGHT;
    if (bottom > GROUND_Y) return 1;
    top += HIT_INSET;
    bottom -= HIT_INSET;
    for (int i = 0; i < PIPE_COUNT; ++i) {
        const struct Pipe *pipe = &pipes[i];
        if (pipe->x >= BIRD_X + BIRD_WIDTH - HIT_INSET ||
            pipe->x + PIPE_WIDTH <= BIRD_X + HIT_INSET) continue;
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

/* One frame: the game moves on, then everything that changed is painted, once. */
int main(void) {
    make_backdrop();
    new_game();
    shown_y = bird_y >> 4;
    next_frame = (int)sim_time();
    for (;;) {
        pipes_moved = 0;
        update(read_flap());
        if (state != DEAD) ++tick;
        place_score();
        if (pipes_moved) repaint_pipes();
        if (state != DEAD) slide_stripes();
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
`move_pipes` only changes the pipe records. Later in the frame, `repaint_pipes` compares each
column of a pipe's shading with the column to its left: only where they differ has the Screen
changed, and `pipe_rows` repaints the body rows or the cap rows that did. `slide_stripes` stores
only the grass words whose colour changed, every fourth one.

`bird_sprites` and `digit_sprites` hold the sprites, one `0x00RRGGBB` word a pixel, with 0 for
see-through. Each frame paints every pixel at most once, with the colour it ends the frame in, so
a frame the Screen shows before it is finished never shows the bird missing. `repaint_pipes`
therefore leaves out the bird's and the score's rows, and `sprite_column` paints those columns: the
sprite where it is not see-through, and the world, from `world_column`, around it. In the Flappy
ASM example Project, the sprites come from `assets/bird.bmp` and `assets/digits.bmp` instead,
read with `fopen` when the program starts.

`hit_test` lets the ground stop the whole picture, but the pipes only a box `HIT_INSET` pixels
inside it, which leaves out the picture's see-through corners and forgives a near miss.

`wait_frame` stores the next frame's deadline in `next_frame` and sleeps for the remaining time.
This includes drawing time in the `FRAME_MS` interval. If there is no time left to wait, the routine
resets the schedule and sleeps for one millisecond. Actual timing also depends on browser
scheduling. The Screen can refresh between sleeps, but since each pixel is painted once a frame,
such a refresh only shows an earlier version of the picture.

Try changing `FRAME_MS`, `GRAVITY`, `HALF_GAP` or `HIT_INSET`, then Compile and Build again. Compare
`hit_test` with the assembly version: both use half-open ranges, so a box that fits exactly between
a gap's two edges survives. Change a colour in `bird_sprites`, or `towers`, then Compile, Build and
Run again to see the change.
