Draw a house, a sun, sky and grass by filling rectangles in pixel memory. Rows of rectangles
that are one pixel high form the sloping roof and the round sun.

## Pixels and rows

The **framebuffer** is memory that holds the Screen's pixels. In this editor, each pixel occupies
four bytes and has the colour value `0x00RRGGBB`: red, green and blue each use one byte. For
example, `0x00ff0000` is red. Little-endian memory stores its bytes as `00 00 ff 00`.
This example uses the Screen's 32-bit pixel layout; other Linux framebuffers can use other layouts.

Columns increase to the right and rows increase downward, starting at `(0, 0)` in the top-left
corner. At a width of 320 pixels, a row occupies 1,280 bytes:

```text
row 0:  [pixel 0][pixel 1] ... [pixel 319]
row 1:  [pixel 0][pixel 1] ... [pixel 319]
         4 bytes per pixel
```

Once `rbx` holds the address of the top-left pixel, a pixel's address is:

```text
rbx + y × line_length + x × 4
```

For column 10, row 3, the byte offset is `3 × 1280 + 10 × 4 = 3880`. The program reads
`line_length`, the number of bytes between row starts, from the device. Using that value also
allows for a framebuffer that has unused bytes at the end of each row.

The program's `fill_rect` subroutine takes a column, a row, a width, a height and a colour.
For example, this call draws the wall, covering columns 90 through 209 and rows 110 through 189:

```x86
    mov edi, 90                     ; left column
    mov esi, 110                    ; top row
    mov edx, 120                    ; width in pixels
    mov ecx, 80                     ; height in rows
    mov r8d, WALL                   ; colour
    call fill_rect
```

These are the first five integer argument registers of the System V convention you used for
subroutines. `fill_rect` also reads `rbx` and `r13`, which the setup code supplies. It preserves
`rbx` and `r12` through `r15`, so the drawing loops can keep their counters there.

## Getting access to pixel memory

Before drawing, the program opens `/dev/fb0`, the framebuffer's device file, with `O_RDWR`
for reading and writing. It keeps the returned descriptor in `r12`. Two `ioctl` system calls
then ask the device for information. An **ioctl request** selects a device-specific operation:
`rdi` holds the descriptor, `rsi` the request number, and `rdx` the address where these requests
will write their results.

The program reserves two blocks of bytes in `.bss` for those results:

- `var` receives the visible width (`xres`) and height (`yres`), along with other display settings,
  when the request is `FBIOGET_VSCREENINFO`.
- `fix` receives the framebuffer's byte count (`smem_len`) and bytes per row (`line_length`),
  along with other device information, when the request is `FBIOGET_FSCREENINFO`.

Each block is a _structure_: every named value occupies bytes at a fixed offset. You do not
need C to read it: `[fix + fb_fix_screeninfo.line_length]`
reads the value at the `line_length` offset within `fix`. The include file `linux/fb.inc` supplies
these offsets and the total block sizes used by `resb`, so each request has enough space for its
whole result. The other include files supply syscall numbers and flag constants.

Finally, `mmap` makes the framebuffer's bytes accessible at an address in the program. Its six
arguments use the syscall convention:

| Register | Value                     | Meaning                             |
| -------- | ------------------------- | ----------------------------------- |
| `rdi`    | 0                         | Let the kernel choose the address.  |
| `rsi`    | `smem_len`                | Map this many bytes.                |
| `rdx`    | `PROT_READ \| PROT_WRITE` | Allow reads and stores.             |
| `r10`    | `MAP_SHARED`              | Make stores update the framebuffer. |
| `r8`     | descriptor in `r12`       | Select the opened framebuffer.      |
| `r9`     | 0                         | Start at byte zero of the device.   |

On success, `mmap` returns the address in `rax`; the program keeps it in `rbx`. Results from
-4095 through -1 are errors, which the unsigned comparison with -4095 detects.

The example checks `open` and `mmap`. It assumes the two supported information requests succeed
on the editor's Screen and leaves their error checks out. Code that must handle other devices
should check each `ioctl` result before reading values from the corresponding structure.

## Draw the picture

Press **Build**, then **Run**. The `@screen` comment requests a 320 by 240 Screen, and the picture
stays visible after the program ends.

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

; fill_rect: fill edx columns and ecx rows with the colour in r8d.
; edi and esi give the top-left column and row. Non-positive width or height
; draws nothing. The rectangle must fit on the Screen.
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
    sub edi, r15d                   ; left edge: centre minus half width
    lea esi, [r14 + SUN_Y]
    lea edx, [r15*2 + 1]            ; width: both halves and the centre pixel
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

; the roof: 30 rows; each end moves inward 2 pixels on the next row
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

## How the rectangles become shapes

`fill_rect` calculates its top-left pixel address in `r10`. It copies that address into `rdi`,
puts the colour in `eax`, and uses `rep stosd` to store one row of `edx` pixels. After each row,
it adds `line_length` to `r10`. That reaches the same column on the next row, regardless of how
far `rep stosd` advanced `rdi`. The subroutine returns without drawing if width or height is
non-positive. It does not clip: every rectangle you pass must fit on the Screen.

The sky and grass span the Screen's width. The wall, door and windows each need one rectangle.
Later drawing covers earlier drawing, so the door and windows appear over the wall.

The roof loop draws from bottom to top. Its first row starts at `(80, 109)` and is 140 pixels
wide. The next starts at `(82, 108)` and is 136 pixels wide: each end moves inward by two pixels,
reducing the total width by four. Repeating this for 30 rows makes the sloping sides.

The sun loop draws horizontal rows inside a circle. `r14d` holds `dy`, the row's offset from
the centre, from -23 through 23 for radius 24. For each row, `r15d` starts at 24 and is decremented
_before_ the first test, so the first candidate half width `w` is 23. The loop keeps narrowing
until `w² + dy² < 24²`. The strict comparison leaves points exactly on the circle's boundary out.

On the first row, `dy = -23`. A half width of 7 gives `49 + 529 = 578`, which is too large;
6 gives `36 + 529 = 565`, which fits. The row therefore covers columns 254 through 266 at
row 27. Its width is `2 × 6 + 1 = 13`: six pixels left of the centre, the centre pixel, and six
right of it. At the middle row, `dy = 0`, the first candidate 23 already fits, giving 47 pixels.

## Optional: the same picture in C

This C version uses the same device requests and pixel layout. Compare its drawing loops with
the calls to `fill_rect` above. Press **Compile** to translate `drawing.c` for x86, then **Build** and **Run**.
The first compilation needs an internet connection.

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

## Try it

1. Move the sun by changing `SUN_X` and `SUN_Y`, or set `SUN_R` to another positive radius. For radius 24
   on a 320 by 240 Screen, centres from 24 through 295 horizontally and 24 through 215 vertically
   leave room for the whole disc. Try `(50, 50)` first. Recheck the bounds if you change the radius.
2. Add a chimney: fill a 12 by 30 rectangle at column 170, row 70, using `WALL`. Insert the call
   before the roof loop so that the roof covers the chimney's foot.
3. Change `@screen width=320 height=240` to `@screen width=640 height=480`, then build and run again.
   The sky and grass use the reported width and height, so they cover the larger Screen. The
   horizon stays at row 180 and the house keeps its coordinates and size, within the top-left
   quarter. Resizing the Screen does not scale the drawing or add clipping.
