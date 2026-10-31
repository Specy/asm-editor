// @screen width=640 height=480
/*
 * asmOS, a small desktop for the emulated x86 machine: a window manager, a taskbar with a Start
 * menu, desktop icons and eight applications, in C and a little hand-written assembly.
 *
 * It runs as one ordinary Linux program. It draws on the framebuffer, /dev/fb0, reads the keyboard
 * and the pointer from /dev/input, plays sound on the MIDI port and keeps its files in the Project,
 * which is the program's working directory. Each part of it is its own File, included below as
 * text, so the whole desktop compiles as one C file. blit.asm holds the pixel loops.
 */
#include <dirent.h>
#include <fcntl.h>
#include <math.h>
#include <poll.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <linux/fb.h>
#include <linux/input.h>

#include "os.h"
#include "font.c"
#include "gfx.c"
#include "icons.c"
#include "input.c"
#include "sound.c"
#include "wm.c"
#include "apps/widgets.c"
#include "apps/notepad.c"
#include "apps/calculator.c"
#include "apps/paint.c"
#include "apps/mines.c"
#include "apps/clock.c"
#include "apps/terminal.c"
#include "apps/files.c"
#include "apps/about.c"

const App APPS[APP_COUNT] = {
    [APP_NOTEPAD] = { "Notepad", &ICON_NOTEPAD, notepad_open, 1 },
    [APP_CALCULATOR] = { "Calculator", &ICON_CALCULATOR, calculator_open, 1 },
    [APP_PAINT] = { "Paint", &ICON_PAINT, paint_open, 1 },
    [APP_MINES] = { "Minesweeper", &ICON_MINES, mines_open, 1 },
    [APP_CLOCK] = { "Clock", &ICON_CLOCK, clock_open, 1 },
    [APP_TERMINAL] = { "Terminal", &ICON_TERMINAL, terminal_open, 1 },
    [APP_FILES] = { "Files", &ICON_FOLDER, files_open, 1 },
    [APP_ABOUT] = { "About asmOS", &ICON_COMPUTER, about_open, 1 },
};

void app_launch(int app, const char *argument) {
    if (app >= 0 && app < APP_COUNT) APPS[app].open(argument);
}

static uint32_t *fb_pixels;
static int fb_stride;

/* Shows the whole back buffer at once. */
static void show_all(void) {
    copy_rect32(fb_pixels, fb_stride * 4, back_buffer, screen_w * 4, screen_w, screen_h);
}

static void sleep_ms(int ms) {
    struct timespec pause = { ms / 1000, ms % 1000 * 1000000L };
    nanosleep(&pause, NULL);
}

/* The chip and the name in the middle of a black screen, and a bar of blocks running under them
 * while the start-up chime plays. */
static void boot_splash(void) {
    gfx_clip(rect(0, 0, screen_w, screen_h));
    fill_rect(0, 0, screen_w, screen_h, BLACK);
    int cx = screen_w / 2, cy = screen_h / 2 - 40;
    draw_icon(&ICON_CHIP, cx - 64, cy - 72, 8);
    const char *name = "asmOS";
    for (int i = 0; name[i]; i++) {
        const unsigned char *glyph =
            (const unsigned char *)font_bits + (name[i] - FONT_FIRST) * FONT_H;
        for (int line = 0; line < FONT_H; line++)
            for (int column = 0; column < FONT_W; column++)
                if (glyph[line] & (0x80 >> column))
                    fill_rect(cx - 60 + (i * FONT_W + column) * 3, cy + 64 + line * 3, 3, 3,
                              i < 3 ? 0x8080ff : WHITE);
    }
    const char *line = "A desktop in C and x86 assembly";
    draw_text(cx - text_width(line) / 2, cy + 112, line, SHADOW);
    show_all();
    sound_chime(0);
    Rect bar = rect(cx - 80, cy + 150, 160, 14);
    frame_rect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4, SHADOW);
    for (int frame = 0; frame < 48; frame++) {
        gfx_clip(bar);
        fill_rect(bar.x, bar.y, bar.w, bar.h, BLACK);
        for (int block = 0; block < 3; block++) {
            int x = (frame * 6 + block * 14) % (bar.w + 40) - 30;
            fill_rect(bar.x + x, bar.y + 2, 10, bar.h - 4, block == 1 ? 0x4040ff : 0x2020a0);
        }
        gfx_clip(rect(0, 0, screen_w, screen_h));
        Rect shown = rect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4);
        copy_rect32(fb_pixels + shown.y * fb_stride + shown.x, fb_stride * 4,
                    back_buffer + shown.y * screen_w + shown.x, screen_w * 4, shown.w, shown.h);
        sound_run();
        sleep_ms(30);
    }
}

/* The last screen: orange words on black, once the closing chime has played. */
static void shutdown_screen(void) {
    sound_chime(1);
    gfx_target(back_buffer, screen_w, screen_h, screen_w);
    fill_rect(0, 0, screen_w, screen_h, NAVY);
    const char *saving = "asmOS is shutting down...";
    draw_text_bold((screen_w - text_width(saving)) / 2, screen_h / 2 - 6, saving, WHITE);
    show_all();
    for (int i = 0; i < 50; i++) {
        sound_run();
        sleep_ms(30);
    }
    fill_rect(0, 0, screen_w, screen_h, BLACK);
    const char *lines[] = { "It is now safe to turn off", "your computer." };
    for (int l = 0; l < 2; l++) {
        const char *text = lines[l];
        int width = text_width(text) * 2;
        for (int i = 0; text[i]; i++) {
            if (text[i] == ' ') continue;
            const unsigned char *glyph =
                (const unsigned char *)font_bits + (text[i] - FONT_FIRST) * FONT_H;
            for (int line = 0; line < FONT_H; line++)
                for (int column = 0; column < FONT_W; column++)
                    if (glyph[line] & (0x80 >> column))
                        fill_rect((screen_w - width) / 2 + (i * FONT_W + column) * 2,
                                  screen_h / 2 - 30 + l * 32 + line * 2, 2, 2, 0xf0a020);
        }
    }
    show_all();
    while (sound_run() >= 0) sleep_ms(30);
}

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    if (fb < 0) {
        printf("asmOS needs the framebuffer, /dev/fb0\n");
        return 1;
    }
    struct fb_var_screeninfo var;
    struct fb_fix_screeninfo fix;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    ioctl(fb, FBIOGET_FSCREENINFO, &fix);
    fb_pixels = mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    if (fb_pixels == MAP_FAILED) return 1;
    screen_w = var.xres;
    screen_h = var.yres;
    fb_stride = fix.line_length / 4;
    uint32_t *back = malloc((size_t)screen_w * screen_h * 4);
    if (!back) return 1;
    back_buffer = back;
    gfx_target(back, screen_w, screen_h, screen_w);
    sound_init();
    if (!input_open()) printf("No keyboard or pointer found under /dev/input\n");
    printf("asmOS: %d x %d. Click the Screen to use the keyboard and the mouse.\n", screen_w,
           screen_h);
    boot_splash();
    wm_start(fb_pixels, fb_stride, back);
    for (;;) {
        wm_render();
        if (shutting_down) break;
        input_wait(wm_timeout());
        wm_run_timers();
    }
    shutdown_screen();
    return 0;
}
