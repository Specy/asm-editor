A Linux program draws by opening the framebuffer, `/dev/fb0`, and mapping its memory into the
program with `mmap`. After that, each 32-bit word of that memory is one pixel of the Screen, its
colour written `0x00RRGGBB`, and a store changes the pixel. This program draws a house, a sun and
the sky with one subroutine, `fill_rect`, which fills a rectangle.

Press **Build**, then **Run**. The picture stays on the Screen after the program ends.

```x86|playground|open-screen|no-registers|no-flags|allow-open
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "linux/fb.inc"

HORIZON equ 180                     ; the first line of grass
SUN_X   equ 260                     ; the sun's centre
SUN_Y   equ 50
SUN_R   equ 24                      ; and its radius

SKY     equ 0x0070b0e0              ; colours are 0x00RRGGBB
GRASS   equ 0x003c9648
SUN     equ 0x00ffd200
WALL    equ 0x00c07040
ROOF    equ 0x00a02020
DOOR    equ 0x00704020
WINDOW  equ 0x00fff0a0

section .rodata
fb_path: db "/dev/fb0", 0

section .bss
var:    resb fb_var_screeninfo_size
fix:    resb fb_fix_screeninfo_size

section .text
global _start

; fill_rect: a rectangle of colour r8d, edx pixels wide and ecx lines high, whose
; top-left corner is at column edi of line esi. Nothing is drawn for a width or a
; height of 0. The rectangle must fit on the Screen.
; Reads rbx (the top-left pixel) and r13 (bytes a line); changes rax, rcx, rsi,
; rdi, r9 and r10.
fill_rect:
    test edx, edx
    jle .done
    test ecx, ecx
    jle .done
    mov r9d, ecx                    ; r9: lines left to fill
    imul rsi, r13                   ; y × line_length
    lea r10, [rbx + rsi]
    lea r10, [r10 + rdi*4]          ; r10: the rectangle's top-left pixel
    mov eax, r8d                    ; the colour rep stosd stores
.line:
    mov rdi, r10
    mov ecx, edx
    rep stosd                       ; ecx pixels of eax, from rdi onward
    add r10, r13                    ; the same column, one line down
    dec r9d
    jnz .line
.done:
    ret

_start:
    mov eax, SYS_open
    lea rdi, [fb_path]
    mov esi, O_RDWR
    syscall
    test rax, rax
    js fail                         ; a negative result is an error
    mov r12, rax                    ; r12: the framebuffer's descriptor

    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_VSCREENINFO
    lea rdx, [var]
    syscall                         ; xres and yres: the size in pixels
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_FSCREENINFO
    lea rdx, [fix]
    syscall                         ; smem_len and line_length

    mov eax, SYS_mmap
    xor edi, edi                    ; at any address
    mov esi, [fix + fb_fix_screeninfo.smem_len]
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_SHARED            ; stores reach the Screen
    mov r8, r12
    xor r9d, r9d
    syscall
    cmp rax, -4095
    jae fail
    mov rbx, rax                    ; rbx: the top-left pixel
    mov r13d, [fix + fb_fix_screeninfo.line_length]

    xor edi, edi                    ; the sky, across the whole width
    xor esi, esi
    mov edx, [var + fb_var_screeninfo.xres]
    mov ecx, HORIZON
    mov r8d, SKY
    call fill_rect

    xor edi, edi                    ; the grass, from the horizon down
    mov esi, HORIZON
    mov edx, [var + fb_var_screeninfo.xres]
    mov ecx, [var + fb_var_screeninfo.yres]
    sub ecx, HORIZON
    mov r8d, GRASS
    call fill_rect

; the sun: a disc is a stack of lines, the widest across its middle
    mov r14d, -(SUN_R - 1)          ; r14: the line, counted from the centre
sun_line:
    mov r15d, SUN_R                 ; r15: half the line's width
sun_fit:
    dec r15d                        ; one pixel narrower
    mov eax, r15d
    imul eax, eax                   ; half width²
    mov ecx, r14d
    imul ecx, ecx                   ; + line²
    add eax, ecx
    cmp eax, SUN_R * SUN_R
    jge sun_fit                     ; outside the circle: narrower still
    mov edi, SUN_X
    sub edi, r15d                   ; from the centre less the half width
    lea esi, [r14 + SUN_Y]
    lea edx, [r15*2 + 1]            ; to the centre plus the half width
    mov ecx, 1
    mov r8d, SUN
    call fill_rect
    inc r14d
    cmp r14d, SUN_R
    jl sun_line

    mov edi, 90                     ; the wall
    mov esi, 110
    mov edx, 120
    mov ecx, 80
    mov r8d, WALL
    call fill_rect

; the roof: 30 lines, each 2 pixels shorter at both ends than the one below
    xor r14d, r14d                  ; r14: the roof's line, 0 at the bottom
roof_line:
    lea edi, [r14*2 + 80]           ; starts 2 pixels further right a line
    mov esi, 109
    sub esi, r14d                   ; one line higher
    mov edx, 140
    lea eax, [r14*4]
    sub edx, eax                    ; 4 pixels shorter
    mov ecx, 1
    mov r8d, ROOF
    call fill_rect
    inc r14d
    cmp r14d, 30
    jb roof_line

    mov edi, 135                    ; the door
    mov esi, 145
    mov edx, 30
    mov ecx, 45
    mov r8d, DOOR
    call fill_rect
    mov edi, 105                    ; two windows
    mov esi, 125
    mov edx, 20
    mov ecx, 20
    mov r8d, WINDOW
    call fill_rect
    mov edi, 175
    mov esi, 125
    mov edx, 20
    mov ecx, 20
    mov r8d, WINDOW
    call fill_rect

    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

## Opening and mapping the framebuffer

The program takes four system calls before it draws:

1. `open` of `/dev/fb0` gives a descriptor, kept in `r12`.
2. The `FBIOGET_VSCREENINFO` ioctl fills `var`, a `struct fb_var_screeninfo`, whose `xres` and
   `yres` are the Screen's size in pixels: 320 by 240, as the `@screen` comment on the first line
   asks.
3. The `FBIOGET_FSCREENINFO` ioctl fills `fix`, a `struct fb_fix_screeninfo`: `smem_len` is how
   many bytes the framebuffer has, and `line_length` how many bytes one line of pixels takes.
4. `mmap` maps `smem_len` bytes of it and returns their address, which `rbx` keeps. `MAP_SHARED`
   makes the stores reach the Screen, rather than a private copy.

The names come from the `%include` files at the top, which hold the numbers Linux's own C headers
give them. A structure's fields are offsets, so `[fix + fb_fix_screeninfo.line_length]` reads the
`line_length` field of the structure at `fix`. `mmap` reports an error as a result from -4095 to -1,
which is why the program compares with -4095 rather than testing the sign.

## Filling a rectangle with `rep stosd`

The pixel at column x of line y is `y × line_length + x × 4` bytes after the top-left pixel. The
pixels of one line follow each other, four bytes apart, so a whole line of one colour is a job for
`rep stosd`: it stores `eax` at `rdi`, moves `rdi` on four bytes, and does it `rcx` times.

`fill_rect` works out the address of the rectangle's top-left corner once, in `r10`. For each line it
copies that address into `rdi`, fills `edx` pixels, then adds `line_length` to `r10` to step one line
down. Use `line_length` rather than `xres × 4` to step down: here they are equal, but on other
hardware a line can end with unused bytes.

Its arguments come in the registers a C function takes its first five in, `edi`, `esi`, `edx`, `ecx`
and `r8d`. It changes only registers a C function may change, so `rbx`, `r12` to `r15` survive a
call, and the two loops in `_start` keep their counters there.

## Building the picture from calls

The sky and the grass are two rectangles as wide as the Screen. The wall, the door and the windows
are one call each.

The roof is 30 rectangles one line high. Each line, `r14` goes up by one: the line starts 2 pixels
further right, is 4 pixels shorter, and is one line higher, which makes a triangle. `lea` does the
small sums, `r14 × 2 + 80` and `r14 × 4`, without changing the flags.

The sun is a disc, and a disc is a stack of lines too. For each line `dy` from the centre, the
program starts from the radius and makes the half width `w` smaller until `w² + dy² < r²`, the
inside of the circle, then fills from `SUN_X - w` to `SUN_X + w`.

## The same picture in C

C reaches the framebuffer with the same calls, under the names of Linux's headers. Press
**Compile** to translate `drawing.c` for x86, then **Build** and **Run**. The first compilation needs
an internet connection.

```c|playground|target=x86|file=drawing.c|open-screen|no-registers|no-flags|allow-open
// @screen width=320 height=240
#include <fcntl.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/fb.h>

enum { HORIZON = 180, SUN_X = 260, SUN_Y = 50, SUN_R = 24 };
enum {
    SKY = 0x0070b0e0, GRASS = 0x003c9648, SUN = 0x00ffd200, WALL = 0x00c07040,
    ROOF = 0x00a02020, DOOR = 0x00704020, WINDOW = 0x00fff0a0
};

static uint8_t *pixels;      /* the top-left pixel */
static unsigned line_length; /* bytes from one line to the next */

/* A rectangle of one colour, its top-left corner at column x of line y. */
static void fill_rect(int x, int y, int width, int height, uint32_t colour) {
    for (int line = y; line < y + height; line++) {
        uint32_t *row = (uint32_t *)(pixels + line * line_length);
        for (int column = x; column < x + width; column++)
            row[column] = colour;
    }
}

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    if (fb < 0) return 1;
    struct fb_var_screeninfo var;
    struct fb_fix_screeninfo fix;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    ioctl(fb, FBIOGET_FSCREENINFO, &fix);
    pixels = mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    if (pixels == MAP_FAILED) return 1;
    line_length = fix.line_length;

    fill_rect(0, 0, var.xres, HORIZON, SKY);
    fill_rect(0, HORIZON, var.xres, var.yres - HORIZON, GRASS);
    for (int dy = -(SUN_R - 1); dy < SUN_R; dy++) {
        int w = SUN_R - 1;
        while (w * w + dy * dy >= SUN_R * SUN_R) w--; /* outside the circle */
        fill_rect(SUN_X - w, SUN_Y + dy, 2 * w + 1, 1, SUN);
    }
    fill_rect(90, 110, 120, 80, WALL);
    for (int i = 0; i < 30; i++)
        fill_rect(80 + 2 * i, 109 - i, 140 - 4 * i, 1, ROOF);
    fill_rect(135, 145, 30, 45, DOOR);
    fill_rect(105, 125, 20, 20, WINDOW);
    fill_rect(175, 125, 20, 20, WINDOW);
    return 0;
}
```

At **-O0** the compiler turns the inner loop of `fill_rect` into several instructions a pixel,
where `rep stosd` fills a whole line in one: the C version runs about 1.2 million instructions to
draw this picture, and the NASM one under 7,000. Choose **-O2** and compile again: about 250,000.

## Try it

1. Move the sun: change `SUN_X` and `SUN_Y`, or make it bigger with `SUN_R`. Keep the whole disc on
   the Screen, since `fill_rect` does not clip.
2. Put a chimney on the roof: a `fill_rect` of 12 by 30 pixels at column 170, line 70, in `WALL`'s
   colour, before the roof is drawn so that the roof covers its foot.
3. Change `@screen width=320 height=240` to `@screen width=640 height=480` and run again. The sky
   and the grass follow `xres` and `yres`; the house keeps its size, now in the top-left quarter.
