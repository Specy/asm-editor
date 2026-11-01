A small paint program. Hold the left button down and move the pointer over the Screen to paint;
turn the mouse wheel to change the colour, shown in the square at the top-left corner. Thirty
seconds without touching the mouse ends the program.

```x86|playground|open-screen|no-registers|no-flags|allow-open
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "poll.inc"
%include "linux/fb.inc"
%include "linux/input.inc"

BRUSH   equ 6                       ; the brush's width and height
QUIET   equ 30000                   ; ms without an event before the end
PAPER   equ 0x00f4f0e6

section .rodata
fb_path: db "/dev/fb0", 0
colours: dd 0x00202020, 0x00e04040, 0x00f0a020, 0x0040b040, 0x002080e0, 0x008040c0
COLOURS  equ ($ - colours) / 4      ; how many there are: 6

section .data
event_path: db "/dev/input/event0", 0
colour:  dd 1                       ; the colour the wheel chose, 0 to COLOURS - 1
x:       dd 0                       ; the pointer, in the tablet's units
y:       dd 0
pressed: db 0                       ; 1 while the left button is down

section .bss
var:     resb fb_var_screeninfo_size
fix:     resb fb_fix_screeninfo_size
types:   resb 4                     ; one bit for each type of event a device sends
xinfo:   resb input_absinfo_size    ; the range of each axis
yinfo:   resb input_absinfo_size
event:   resb input_event_size
waiter:  resb pollfd_size

section .text
global _start

; fill_rect: a rectangle of colour r8d, edx pixels wide and ecx lines high, whose
; top-left corner is at column edi of line esi.
; Reads rbx (the top-left pixel) and r13 (bytes a line); changes rax, rcx, rsi,
; rdi, r9 and r10.
fill_rect:
    test edx, edx
    jle .done
    test ecx, ecx
    jle .done
    mov r9d, ecx
    imul rsi, r13
    lea r10, [rbx + rsi]
    lea r10, [r10 + rdi*4]
    mov eax, r8d
.line:
    mov rdi, r10
    mov ecx, edx
    rep stosd
    add r10, r13
    dec r9d
    jnz .line
.done:
    ret

; to_pixel: the pixel of the position eax on an axis of edx pixels whose range
; ends at ecx: (eax × edx + ecx - 1) ÷ ecx, into eax. Changes edx.
to_pixel:
    imul eax, edx
    lea eax, [rax + rcx - 1]
    xor edx, edx
    div ecx
    ret

; paint: a BRUSH by BRUSH square of the chosen colour around the pointer, kept on
; the Screen. Changes the registers fill_rect changes, and rdx and r8.
paint:
    mov eax, [x]
    mov edx, [var + fb_var_screeninfo.xres]
    mov ecx, [xinfo + input_absinfo.maximum]
    call to_pixel
    sub eax, BRUSH / 2              ; the brush's left edge
    jns .left_inside
    xor eax, eax
.left_inside:
    mov ecx, [var + fb_var_screeninfo.xres]
    sub ecx, BRUSH
    cmp eax, ecx
    jle .right_inside
    mov eax, ecx
.right_inside:
    mov edi, eax

    mov eax, [y]                    ; the same down the Screen
    mov edx, [var + fb_var_screeninfo.yres]
    mov ecx, [yinfo + input_absinfo.maximum]
    call to_pixel
    sub eax, BRUSH / 2
    jns .top_inside
    xor eax, eax
.top_inside:
    mov ecx, [var + fb_var_screeninfo.yres]
    sub ecx, BRUSH
    cmp eax, ecx
    jle .bottom_inside
    mov eax, ecx
.bottom_inside:
    mov esi, eax

    mov eax, [colour]
    lea r8, [colours]
    mov r8d, [r8 + rax*4]
    mov edx, BRUSH
    mov ecx, BRUSH
    jmp fill_rect                   ; its ret returns from paint

; show_colour: the chosen colour in a framed square at the top-left corner.
show_colour:
    mov edi, 2
    mov esi, 2
    mov edx, 20
    mov ecx, 20
    xor r8d, r8d                    ; the frame, black
    call fill_rect
    mov eax, [colour]
    lea r8, [colours]
    mov r8d, [r8 + rax*4]
    mov edi, 4
    mov esi, 4
    mov edx, 16
    mov ecx, 16
    jmp fill_rect

_start:
    mov eax, SYS_open
    lea rdi, [fb_path]
    mov esi, O_RDWR
    syscall
    test rax, rax
    js fail
    mov r12, rax
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_VSCREENINFO
    lea rdx, [var]
    syscall
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_FSCREENINFO
    lea rdx, [fix]
    syscall
    mov eax, SYS_mmap
    xor edi, edi
    mov esi, [fix + fb_fix_screeninfo.smem_len]
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_SHARED
    mov r8, r12
    xor r9d, r9d
    syscall
    cmp rax, -4095
    jae fail
    mov rbx, rax                    ; rbx: the top-left pixel
    mov r13d, [fix + fb_fix_screeninfo.line_length]

    xor edi, edi                    ; a clean sheet of paper
    xor esi, esi
    mov edx, [var + fb_var_screeninfo.xres]
    mov ecx, [var + fb_var_screeninfo.yres]
    mov r8d, PAPER
    call fill_rect
    call show_colour

; find the tablet: the first of event0 to event9 that reports a position
    xor r14d, r14d                  ; r14: the number to try
find_tablet:
    lea eax, [r14 + '0']
    mov [event_path + 16], al       ; the digit of /dev/input/event0
    mov eax, SYS_open
    lea rdi, [event_path]
    mov esi, O_RDONLY | O_NONBLOCK
    syscall
    test rax, rax
    js next_device                  ; no such device
    mov r12, rax
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, EVIOCGBIT(0, 4)        ; which types of event it sends
    lea rdx, [types]
    syscall
    test dword [types], 1 << EV_ABS
    jnz found_tablet                ; positions: this is the tablet
    mov eax, SYS_close
    mov rdi, r12
    syscall
next_device:
    inc r14d
    cmp r14d, 10
    jb find_tablet
    jmp fail
found_tablet:                       ; r12: the tablet
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, EVIOCGABS(ABS_X)       ; x's range, and where the pointer is now
    lea rdx, [xinfo]
    syscall
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, EVIOCGABS(ABS_Y)
    lea rdx, [yinfo]
    syscall
    mov eax, [xinfo + input_absinfo.value]
    mov [x], eax
    mov eax, [yinfo + input_absinfo.value]
    mov [y], eax

wait_for_events:
    mov [waiter + pollfd.fd], r12d
    mov word [waiter + pollfd.events], POLLIN
    mov eax, SYS_poll
    lea rdi, [waiter]
    mov esi, 1                      ; one descriptor
    mov edx, QUIET                  ; for at most QUIET ms
    syscall
    test rax, rax
    jle done                        ; 0: nothing for QUIET ms
read_event:
    mov eax, SYS_read
    mov rdi, r12
    lea rsi, [event]
    mov edx, input_event_size
    syscall
    cmp rax, input_event_size
    jne wait_for_events             ; -EAGAIN: all read
    movzx eax, word [event + input_event.type]
    movzx ecx, word [event + input_event.code]
    mov edx, [event + input_event.value]

    cmp eax, EV_ABS                 ; a move: where the pointer is now
    jne not_move
    cmp ecx, ABS_X
    jne not_x
    mov [x], edx
not_x:
    cmp ecx, ABS_Y
    jne read_event
    mov [y], edx
    jmp read_event
not_move:
    cmp eax, EV_KEY                 ; a button: 1 down, 0 up
    jne not_button
    cmp ecx, BTN_LEFT
    jne read_event
    mov [pressed], dl
    jmp read_event
not_button:
    cmp eax, EV_REL                 ; the wheel: 1 a notch away from you, -1 toward
    jne not_wheel
    cmp ecx, REL_WHEEL
    jne read_event                  ; skip REL_WHEEL_HI_RES, the same turn finer
    add edx, [colour]
    jns not_below
    add edx, COLOURS                ; before the first colour: the last
not_below:
    cmp edx, COLOURS
    jb not_above
    sub edx, COLOURS                ; after the last: the first
not_above:
    mov [colour], edx
    call show_colour
    jmp read_event
not_wheel:
    cmp eax, EV_SYN                 ; the end of a report: paint if the button is down
    jne read_event
    cmp ecx, SYN_REPORT
    jne read_event
    cmp byte [pressed], 0
    je read_event
    call paint
    jmp read_event

done:
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

## Finding the tablet

The pointer is a USB **tablet**: an input device that reports where the pointer is, rather than how
far it moved. Its number among `/dev/input/event0`, `event1` and the rest changes from one machine
to the next, so the program asks each device in turn what it is. It writes the digit into the path,
opens the device, and asks with `EVIOCGBIT(0, 4)` which types of event it sends: one bit for each
type, bit `EV_ABS` for absolute positions. The first device with that bit is the tablet; the others
are closed again. A number with no device fails to open, and the program tries the next one.

`EVIOCGBIT(0, 4)` and `EVIOCGABS(ABS_X)` are written like C's macros: the include file defines
them with arguments, and NASM works out the request number when it assembles.

## From the tablet's units to pixels

The tablet does not report pixels. Its positions run from 0 at the Screen's left or top edge to
32767 at the right or bottom, whatever the Screen's size. `EVIOCGABS` fills a `struct
input_absinfo` with an axis's range in `minimum` and `maximum`, and its position now in `value`.
`to_pixel` turns a position into a column with

```
column = (value × xres + maximum - 1) ÷ maximum
```

the division dropping the remainder, which `div` does. The tablet reports the pixel the pointer is
on, and the formula gives that pixel back: with `maximum` 32767 and `xres` 320, the left column's 0
is column 0 and the middle column's 16383 is column 160. A drag that leaves the Screen gives the
pixel at its edge. `paint` puts the brush's left edge 3 pixels left of the pointer and keeps the
whole brush on the Screen, so near an edge the brush moves in.

A program that took `value` for a pixel would paint a hundred times too far, off the Screen.

## Events and reports

Moving the pointer sends an `EV_ABS` event for each axis that changed, `ABS_X` and `ABS_Y`, with the
new position as its value. The left button sends `EV_KEY` with the code `BTN_LEFT`, 1 down and 0
up. A notch of the wheel sends `EV_REL` with the code `REL_WHEEL`, 1 away from you and -1 toward
you, and beside it `REL_WHEEL_HI_RES`, the same turn in 120ths of a notch, which the program skips.

The events of one movement form a **report**, which ends with an `EV_SYN` `SYN_REPORT` event. A
move along both axes is two `EV_ABS` events and then the `SYN_REPORT`, so the program paints only at
the end of a report, once it knows both coordinates.

`poll` waits until the tablet has an event to read, for at most thirty seconds. It returns 0 when
the time ran out, which ends the program; otherwise the program reads events until a read returns
`-EAGAIN`, and waits again.

## The same program in C

```c|playground|target=x86|file=paint.c|open-screen|no-registers|no-flags|allow-open
// @screen width=320 height=240
#include <fcntl.h>
#include <poll.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <linux/fb.h>
#include <linux/input.h>

enum { BRUSH = 6, QUIET = 30000, PAPER = 0x00f4f0e6 };
static const uint32_t colours[] = { 0x00202020, 0x00e04040, 0x00f0a020,
                                    0x0040b040, 0x002080e0, 0x008040c0 };
enum { COLOURS = sizeof colours / sizeof colours[0] };

static uint8_t *pixels;
static unsigned line_length;

static void fill_rect(int x, int y, int width, int height, uint32_t colour) {
    for (int line = y; line < y + height; line++) {
        uint32_t *row = (uint32_t *)(pixels + line * line_length);
        for (int column = x; column < x + width; column++)
            row[column] = colour;
    }
}

/* The first input device that reports a position. */
static int open_tablet(void) {
    for (int number = 0; number < 32; number++) {
        char path[32];
        snprintf(path, sizeof path, "/dev/input/event%d", number);
        int device = open(path, O_RDONLY | O_NONBLOCK);
        if (device < 0) continue;
        unsigned char types[EV_MAX / 8 + 1] = { 0 };
        ioctl(device, EVIOCGBIT(0, sizeof types), types);
        if (types[EV_ABS / 8] >> (EV_ABS % 8) & 1) return device;
        close(device);
    }
    return -1;
}

/* The pixel of a position on an axis of size pixels. */
static int to_pixel(int value, int size, const struct input_absinfo *axis) {
    return ((long)value * size + axis->maximum - 1) / axis->maximum;
}

static int clamp(int value, int low, int high) {
    return value < low ? low : value > high ? high : value;
}

static void show_colour(unsigned colour) {
    fill_rect(2, 2, 20, 20, 0);
    fill_rect(4, 4, 16, 16, colours[colour]);
}

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    int tablet = open_tablet();
    if (fb < 0 || tablet < 0) return 1;
    struct fb_var_screeninfo var;
    struct fb_fix_screeninfo fix;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    ioctl(fb, FBIOGET_FSCREENINFO, &fix);
    pixels = mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    if (pixels == MAP_FAILED) return 1;
    line_length = fix.line_length;
    fill_rect(0, 0, var.xres, var.yres, PAPER);

    struct input_absinfo xinfo, yinfo;
    ioctl(tablet, EVIOCGABS(ABS_X), &xinfo);
    ioctl(tablet, EVIOCGABS(ABS_Y), &yinfo);
    int x = xinfo.value, y = yinfo.value, pressed = 0;
    unsigned colour = 1;
    show_colour(colour);

    struct pollfd waiter = { .fd = tablet, .events = POLLIN };
    while (poll(&waiter, 1, QUIET) > 0) {
        struct input_event event;
        while (read(tablet, &event, sizeof event) == sizeof event) {
            if (event.type == EV_ABS && event.code == ABS_X) x = event.value;
            if (event.type == EV_ABS && event.code == ABS_Y) y = event.value;
            if (event.type == EV_KEY && event.code == BTN_LEFT) pressed = event.value;
            if (event.type == EV_REL && event.code == REL_WHEEL) {
                colour = (colour + COLOURS + event.value) % COLOURS;
                show_colour(colour);
            }
            if (event.type == EV_SYN && event.code == SYN_REPORT && pressed) {
                int left = to_pixel(x, var.xres, &xinfo) - BRUSH / 2;
                int top = to_pixel(y, var.yres, &yinfo) - BRUSH / 2;
                fill_rect(clamp(left, 0, var.xres - BRUSH), clamp(top, 0, var.yres - BRUSH),
                          BRUSH, BRUSH, colours[colour]);
            }
        }
    }
    return 0;
}
```

`open_tablet` builds each path with `snprintf`, so it looks at `event0` to `event31` where the NASM
program stops at `event9`. `types` has a bit for every type up to `EV_MAX`, and bit n of it is bit
`n % 8` of byte `n / 8`.

## Try it

1. Make the brush bigger with `BRUSH`.
2. Let the right button erase: keep whether `BTN_RIGHT` is down as `pressed` keeps `BTN_LEFT`, and
   paint in `PAPER`'s colour while it is.
3. Add white, `0x00ffffff`, to `colours`. `COLOURS` follows, since NASM counts the table's bytes.
4. Change `@screen` to `width=640 height=480` and paint again: the same tablet positions now give
   twice as many pixels, and the brush still lands under the pointer.
