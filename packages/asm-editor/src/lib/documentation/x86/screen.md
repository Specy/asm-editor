An x86 program draws the way a Linux program draws on its framebuffer: it opens the device file `/dev/fb0`, asks it how big the screen is, and maps its memory into the program. After that, a pixel is a 32-bit word in memory, and storing a word changes the pixel on the **Screen**. Nothing else is needed: no system call per pixel, and no drawing commands.

Every x86 Debug session has a Screen. It stays black until a program opens `/dev/fb0`, and keeps what the program drew after it ends, until the next run starts.

## Opening and mapping `/dev/fb0` {#opening}

A program takes four steps before it draws, each a system call.

1. `open("/dev/fb0", O_RDWR)` gives a descriptor for the framebuffer.
2. The `FBIOGET_VSCREENINFO` ioctl fills a `struct fb_var_screeninfo`: the visible size in pixels (`xres` by `yres`) and how a pixel is laid out.
3. The `FBIOGET_FSCREENINFO` ioctl fills a `struct fb_fix_screeninfo`: how many bytes the memory has (`smem_len`) and how many bytes one line of pixels takes (`line_length`).
4. `mmap` of `smem_len` bytes with `PROT_READ | PROT_WRITE` and `MAP_SHARED` returns the address of the top-left pixel.

The framebuffer's requests, with the number each one is:

{requests}

The fields a program reads most often, with their offsets for NASM:

{fields}

This NASM program draws a 32 by 32 orange square. It uses the names of the constants and structures from the include files `sys/syscall.inc`, `fcntl.inc`, `sys/mman.inc` and `linux/fb.inc`, which hold the same values as Linux's own headers.

```x86
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "linux/fb.inc"

section .rodata
fb_path: db "/dev/fb0", 0

section .bss
var:    resb fb_var_screeninfo_size
fix:    resb fb_fix_screeninfo_size

section .text
global _start
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
    syscall                         ; xres, yres and the pixel layout
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_FSCREENINFO
    lea rdx, [fix]
    syscall                         ; smem_len and line_length

    mov eax, SYS_mmap
    xor edi, edi                    ; let the kernel choose the address
    mov esi, [fix + fb_fix_screeninfo.smem_len]
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_SHARED            ; stores reach the Screen
    mov r8, r12
    xor r9d, r9d                    ; from the first byte
    syscall
    cmp rax, -4095
    jae fail
    mov rbx, rax                    ; rbx: the top-left pixel

    mov r13d, [fix + fb_fix_screeninfo.line_length]
    imul rdi, r13, 30               ; 30 lines down
    lea rdi, [rbx + rdi + 40 * 4]   ; 40 pixels across
    mov eax, 0x00ff8000             ; orange: red 0xff, green 0x80, blue 0x00
    mov r14d, 32                    ; lines left to draw
next_line:
    mov r15, rdi                    ; where this line starts
    mov ecx, 32
    rep stosd                       ; 32 pixels of eax
    lea rdi, [r15 + r13]            ; the same column, one line down
    dec r14d
    jnz next_line

    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

The same program in C uses the POSIX calls and Linux's headers, which the editor provides for x86:

```c
// @screen width=320 height=240
#include <fcntl.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/fb.h>

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    if (fb < 0) return 1;
    struct fb_var_screeninfo var;
    struct fb_fix_screeninfo fix;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    ioctl(fb, FBIOGET_FSCREENINFO, &fix);
    uint8_t *pixels = mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    if (pixels == MAP_FAILED) return 1;

    for (int y = 30; y < 62; y++) {
        uint32_t *line = (uint32_t *)(pixels + y * fix.line_length);
        for (int x = 40; x < 72; x++)
            line[x] = 0x00ff8000; /* orange */
    }
    return 0;
}
```

A program can also `write` pixels to `/dev/fb0` at an offset it chose with `lseek`, and `read` them back, but a mapping is simpler and faster.

## Pixels {#pixels}

One pixel is one little-endian 32-bit word, `0x00RRGGBB`: blue in the low byte, then green, then red, and the top byte unused. In memory the bytes are blue, green, red, 0. `0x00ffffff` is white, `0x00000000` black and `0x00ff0000` pure red. `fb_var_screeninfo` says the same thing in its `red`, `green` and `blue` fields: each is an `offset` in bits from the right (16, 8 and 0) and a `length` of 8.

The pixel at column x and line y is at `address + y × line_length + x × 4`. Use `line_length` rather than `xres × 4` to step from one line to the next: here the two are equal, but on other hardware a line can have unused bytes at its end, and a program that uses `line_length` draws right on both.

Drawing every pixel of the Screen one at a time takes a noticeable fraction of a second at this emulator's speed, more for a large Screen. Draw only what changes, and fill whole lines with `rep stosd`, which stores `eax` `rcx` times.

**Undo** walks the picture back with the code: a pixel is memory, and Undo restores memory. A `rep stosd` that fills a whole page is one step that Undo takes back at once.

## Double buffering {#double-buffering}

A program that draws on the page the Screen shows can be seen half way through a frame: the old picture partly erased, the new one partly drawn. The cure is **double buffering**: draw the next frame where it cannot be seen, then show it all at once.

Here the framebuffer has room for two pages: `yres_virtual` is twice `yres`. The first page is lines 0 to `yres - 1` and the second is lines `yres` to `2 × yres - 1`, right below it in memory. `yoffset` says which line the Screen shows at its top. To show the second page, set `yoffset` to `yres` in the `fb_var_screeninfo` the program read and pass it to `FBIOPAN_DISPLAY`; to show the first again, set it to 0. A program draws on the page it does not show, pans to it, and then draws the next frame on the other page.

Two pages are a setting of this machine, not of every Linux machine. A stock Linux kernel gives the framebuffer one page, `yres_virtual` equal to `yres`, and there a store into the second page falls outside the mapping and a pan to it fails. So check `yres_virtual >= 2 × yres` before using the second page, and otherwise draw every frame on the page that is shown, as the program below does.

The frame loop is **draw, then pan**. The pan waits for the next **vertical blank**, the moment between two pictures on the monitor, sixty times a second, and shows the new page then, so the loop runs at 60 frames a second at most with no other wait. Setting a new `yoffset` with `FBIOPUT_VSCREENINFO` waits too, for two blanks. `FBIO_WAITFORVSYNC` waits for the next blank without panning, for a program that draws on the page it shows and wants to change it between two pictures; its argument points to a 32-bit 0, the first display. Waiting for it and then panning costs two blanks a frame, 30 frames a second.

This C program moves a white square across the Screen, one pixel a frame. Each frame it redraws only the band of lines the square moves along. With one page, `pages` is 1 and it draws on the page it shows.

```c
// @screen width=320 height=240
#include <fcntl.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/fb.h>

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    if (fb < 0) return 1;
    struct fb_var_screeninfo var;
    struct fb_fix_screeninfo fix;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    ioctl(fb, FBIOGET_FSCREENINFO, &fix);
    uint8_t *pixels = mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    if (pixels == MAP_FAILED) return 1;

    unsigned pages = var.yres_virtual >= 2 * var.yres ? 2 : 1;
    unsigned page = pages - 1; /* the page that is not shown, when there are two */
    for (unsigned left = 0; left + 20 <= var.xres; left++) {
        uint8_t *top = pixels + page * var.yres * fix.line_length;
        for (unsigned y = 100; y < 120; y++) {
            uint32_t *line = (uint32_t *)(top + y * fix.line_length);
            for (unsigned x = 0; x < var.xres; x++)
                line[x] = x >= left && x < left + 20 ? 0x00ffffff : 0x00000000;
        }
        var.yoffset = page * var.yres;
        ioctl(fb, FBIOPAN_DISPLAY, &var); /* show the page just drawn, at the next blank */
        page = (page + 1) % pages;
    }
    return 0;
}
```

In NASM the check and the pan are a few instructions and an ioctl, with `var` and `r12` as in the first program:

```x86
    mov eax, [var + fb_var_screeninfo.yres]
    add eax, eax
    cmp [var + fb_var_screeninfo.yres_virtual], eax
    jb one_page                                 ; no room for a second page
    mov eax, [var + fb_var_screeninfo.yres]
    mov [var + fb_var_screeninfo.yoffset], eax  ; the second page's first line
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOPAN_DISPLAY
    lea rdx, [var]
    syscall
```

Undo puts the page that was shown back, with the pixels.

## The Screen's size {#display}

The size of the framebuffer is the machine's, not the program's: the program reads it with `FBIOGET_VSCREENINFO` and cannot change it. It starts at {defaultSize}. To choose another, use the **Display** button of the Screen panel: it offers {sizes}, and **Custom…** takes any width that is a multiple of {widthStep} and any height, from {sizeMin} to {sizeMax} pixels. The size is saved with the Program, applies from the next run, and Testcases run with it too. A width that is not a multiple of {widthStep} is rounded down to one.

A program can name the size it wants in a comment, so that opening it and pressing **Build** is all it takes:

```x86
; @screen width=320 height=240
```

In NASM the comment starts with `;`. In a C or C++ program it is a `//` or `/* */` comment of the source file, read at every Build of the assembly compiled from it:

```c
// @screen width=640 height=480
```

- `width` and `height` are in pixels. What the comment leaves out keeps the value it had.
- A program with no `@screen` comment changes nothing: the size stays the one chosen in the Display menu.
- A setting that is not `width` or `height`, or a value that is not a number, is a _warning_ on the comment's line, never an error. A size outside {sizeMin} to {sizeMax} is replaced by the nearest one inside.
- A change in the Display menu afterwards rewrites the comment to match, so the next Build reads it back.

`FBIOPUT_VSCREENINFO` answers as Linux does: a size that fits in the virtual size, `xres_virtual` by `yres_virtual`, is accepted and read back, while the Screen keeps showing the whole mode; a size larger than the virtual size or another pixel format fails with `EINVAL`. Write programs that read `xres` and `yres` and draw at that size.

## The Screen's keys {#screen-keys}

Clicking the Screen gives it the keyboard and the pointer. Its keys and the pointer then go to the program's input devices under `/dev/input`, never to its standard input: a program that waits in `read(0, …)` or `scanf` gets nothing from keys typed into the Screen. Keys typed into the **Terminal** go to standard input only. [Keys and the pointer](/documentation/x86/input) explains how a program reads both.

A focused Screen hands **Escape** to the program, as `KEY_ESC`, since games often quit on it. Press **Shift+Tab**, or click outside the Screen, to give the keyboard back to the page.

## What is different from a real Linux machine {#differences}

The devices behave as they do on a QEMU virtual machine running Linux, the reference this emulator follows. These are the places where they do not:

- **The Screen shows changes sooner.** It shows the framebuffer many times a second while the program runs, and whenever the program waits or pauses, whether or not it called `fsync`. On the reference machine, a store can take a few hundredths of a second to reach the monitor, unless the program calls `fsync`.
- **A mapping past the framebuffer's last page fails** with `EINVAL`. Linux maps it and stops the program with `SIGBUS` at the first store past the end.
- **A `MAP_PRIVATE` mapping is a copy made at the `mmap`.** On Linux, a page the program has not written yet still shows later changes to the framebuffer.
- The color-map requests (`FBIOGETCMAP`, `FBIOPUTCMAP`) answer `ENOTTY`. A true-color framebuffer does not need them.

## Not covered {#not-covered}

- **DRM**, `/dev/dri/card0`: Linux's newer graphics interface, made for a graphics library. Setting a mode by hand takes dozens of ioctls and teaches nothing the framebuffer does not. Opening it fails with `ENODEV`, and the **Log** says to draw on `/dev/fb0` instead.
- **The text console on the Screen.** The program's terminal is the Terminal, a serial line, so the Screen is the program's alone: nothing else ever draws on it, and `KDSETMODE` on the program's own terminal answers `ENOTTY`.
