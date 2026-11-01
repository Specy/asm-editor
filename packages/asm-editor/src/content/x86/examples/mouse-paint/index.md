Hold the left button and move the pointer over the Screen to paint. Turn the wheel to change
colour, shown in the square at the top-left. Thirty seconds without a pointer event ends the program.

This combines the framebuffer drawing from the earlier examples with the input-event loop from
keyboard control. Three pieces are new:

- Find the Screen pointer by asking input devices whether they report absolute positions.
- Convert those positions into pixel coordinates, then keep the whole brush on the Screen.
- Wait for input with `poll`, read the queued events, and paint when a complete report arrives.

In the listing, `find_tablet` finds the device, `to_pixel` converts one coordinate, and `paint`
positions the brush. `wait_for_events` and `read_event` form the input loop. The framebuffer setup
and `fill_rect` serve the same roles as before.

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

The Screen pointer appears as a USB **tablet**: a device that reports where the pointer is,
rather than how far it moved. Its `/dev/input/eventN` number can change, so `find_tablet` tries
`event0` through `event9` and asks each open device which event types it supports.

In the string `/dev/input/event0`, the digit is byte 16, counting from zero. `r14d` holds a number
from 0 through 9. Adding `'0'` produces that digit's character code, and writing `al` to
`[event_path + 16]` changes just the digit. A failed open moves on to the next number.

`EVIOCGBIT(0, 4)` asks for four bytes of event-type bits in `types`. Event type number `n` has
bit `n`: `EV_ABS` is 3, so its mask is `1 << 3`, or binary `1000`. The instruction
`test dword [types], 1 << EV_ABS` checks that bit without changing the stored bits. `jnz` takes
the device when the bit is set. Otherwise the program closes it and continues searching. This
identifies the pointer among this Screen's devices, not every possible Linux input device.

`EVIOCGBIT(0, 4)` and `EVIOCGABS(ABS_X)` are NASM macros supplied by the include file.
Their arguments determine the request number at assembly time.

## From the tablet's units to pixels

This Screen's tablet has a range of 0 through 32767 on each axis, independent of the Screen's
size. Other tablets can have different ranges. `EVIOCGABS` fills `input_absinfo`: `minimum`
and `maximum` describe the range, and `value` is the current position. The listing reads both
structures but uses only their `maximum` and `value` fields: it assumes the zero minimum
reported by this Screen.

The Screen starts with a whole pixel coordinate and sends an integer in the tablet's range. For a
320-pixel-wide Screen, pixel 160 becomes `160 × 32767 ÷ 320`, rounded down: 16383. The program
reverses that scaling by rounding **up**:

```
column = (value × xres + maximum - 1) ÷ maximum
```

All divisions here discard the remainder. Adding `maximum - 1` makes that integer division
round up instead. For 16383, the result is `(16383 × 320 + 32766) ÷ 32767 = 160`.
Using `xres`, rather than `xres - 1`, reverses the Screen's own encoding, which also uses the
full width. Treating 16383 directly as a column would address column 16383 on a Screen whose
last column is 319.

For a complete bounded conversion with this zero-based range, the formula is:

```
value = min(maximum, max(minimum, value))
column = min(xres - 1, (value × xres + maximum - 1) ÷ maximum)
```

`min` selects the smaller number and `max` the larger. At `value = maximum`, the quotient is
`xres`, so the final `min` brings it back to the last valid pixel, `xres - 1`. This formula
still assumes `minimum = 0`; another device's nonzero minimum needs a different conversion.

The listing's `to_pixel` performs the division without those clamps. That is sufficient for
this Screen: its input values come from valid whole pixels, so they never reach 32767. A drag
outside the Screen stays at an edge pixel. The multiply also fits in 32 bits at the Screen sizes
used here.

`paint` then subtracts `BRUSH / 2` from each converted coordinate to centre the brush. It keeps
the left edge between 0 and `xres - BRUSH`, and the top edge between 0 and `yres - BRUSH`.
These bounds keep the entire rectangle inside the framebuffer, including near an edge.

## Waiting, reading, and painting

`waiter` is one `pollfd` structure. Its `fd` field is the tablet descriptor, and `events` is
`POLLIN`, requesting notification when input can be read. `poll` fills `revents` with what
happened. The syscall receives the structure's address, a count of one descriptor, and the
`QUIET` timeout in milliseconds.

A positive `poll` result means a descriptor has reported something. Zero means the timeout
expired, and a negative raw result means an error. This example ends on either zero or an error
with `jle done`. It assumes the found tablet remains available: it does not inspect `revents`
for device errors.

After a positive result, `read_event` reads one 24-byte `input_event` at a time. Opening with
`O_NONBLOCK` lets the program drain all queued events: once the queue is empty, the raw read
returns `-EAGAIN` instead of waiting. The branch back to `wait_for_events` handles that case.
It also takes that branch for any other result that is not a complete event, rather than
handling read errors separately. Waiting again avoids repeatedly reading an empty queue.

As in keyboard control, `type`, `code`, and `value` identify each event:

- `EV_ABS` with `ABS_X` or `ABS_Y` replaces the corresponding saved position.
- `EV_KEY` with `BTN_LEFT` saves 1 for down or 0 for up in `pressed`.
- `EV_REL` with `REL_WHEEL` changes the colour by one for each notch. The matching
  `REL_WHEEL_HI_RES` event describes the same turn in finer units and is ignored.

A movement's events form a **report**, ending with `EV_SYN` and `SYN_REPORT`. A diagonal move
can update both axes before that marker. Painting only at `SYN_REPORT` uses both new coordinates,
instead of drawing once with the old y and again with the new y. The button flag must be nonzero
to paint. A repeat value of 2 would also count as held, though this Screen sends button presses
and releases without repeats.

`paint` ends with `jmp fill_rect`. Unlike `call`, that jump adds no return address: `fill_rect`'s
`ret` uses the address saved by the caller of `paint`. `show_colour` uses the same arrangement
for its final rectangle. The indicator shares the canvas, so painting over it is allowed.
Turning the wheel draws it again.

## Supplementary C version

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

The C version uses the same drawing and report-based painting steps. Its `open_tablet` builds
paths with `snprintf` and searches through `event31`. Its byte array of type bits uses byte
`n / 8`, bit `n % 8`, for event type `n`, instead of NASM's single four-byte bitmask.

## Try it

1. Increase `BRUSH` from 6 to 12. Keep it positive and no larger than either Screen dimension,
   so the rectangle bounds in `paint` remain valid.
2. Make the right button erase, with erasing taking priority when both buttons are held.
   Add a byte such as `erasing` beside `pressed`. In the `EV_KEY` branch, save `BTN_RIGHT`'s
   value there as the code saves `BTN_LEFT` in `pressed`. Treat any nonzero value as held,
   including a repeat value of 2. At `SYN_REPORT`, call `paint` when either flag is nonzero.
   Inside `paint`, where it currently loads `r8d` from `colours`, choose `PAPER` instead when
   `erasing` is nonzero. Leave the wheel's chosen colour intact for the next left-button stroke.
3. Add white, `0x00ffffff`, to `colours`. `COLOURS` follows, since NASM counts the table's bytes.
4. Change `@screen` to `width=640 height=480` and paint again. The conversion now uses twice
   as many pixels on each axis, and the brush still lands under the pointer.
