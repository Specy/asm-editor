Move a square with the arrow keys: hold an arrow to move and release it to stop. **Escape**
ends the program. It also ends after 600 frames without a key event, about ten seconds at 60 frames
per second.

**Click the Screen first** so its keys reach the program. **Shift+Tab** gives the keyboard back to
the page.

## Reading the keyboard without waiting

Each read from the keyboard device returns records describing key changes. The program uses
these records to track which arrows are held: one byte for each arrow, 1 for held and 0 for released.

The program opens `/dev/input/by-path/platform-i8042-serio-0-event-kbd` with
`O_RDONLY | O_NONBLOCK`. The path names the emulated PC keyboard. `O_NONBLOCK` lets a read return
immediately when no event is waiting, with `-EAGAIN` (-11) in `rax`. Without it, the program could
stop at `read` and leave the square motionless until another event arrived.

Each input event occupies 24 bytes. The include file supplies `input_event_size` and the field
offsets used to read it:

| Field   | Size     | Meaning                              |
| ------- | -------- | ------------------------------------ |
| Time    | 16 bytes | When the event occurred; unused here |
| `type`  | 2 bytes  | The kind of event                    |
| `code`  | 2 bytes  | Which key or other item changed      |
| `value` | 4 bytes  | What changed                         |

For an `EV_KEY` event, `code` names the key and `value` is 1 for a press, 0 for a release, or 2
for a repeat while the key stays held. The arrows use `KEY_LEFT`, `KEY_RIGHT`, `KEY_UP` and
`KEY_DOWN`. These codes identify keys rather than typed characters.

Other events accompany the key: `EV_MSC` with code `MSC_SCAN` carries its scan code, and `EV_SYN`
with code `SYN_REPORT` ends a group of events. This program skips all types except `EV_KEY`.

## The program

The framebuffer setup and `fill_rect` come from the previous examples. After setup, each trip
through `frame` reads the waiting events, moves the square, redraws the selected page if needed,
and displays that page. Look for `read_event`, `events_done`, `redraw` and `present` as you follow
the loop.

```x86|playground|open-screen|no-registers|no-flags|allow-open
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "linux/fb.inc"
%include "linux/input.inc"

BOX        equ 20                   ; the square's width and height
SPEED      equ 3                    ; pixels a frame while an arrow is held
IDLE       equ 600                  ; frames without an EV_KEY event before exit
BACKGROUND equ 0x00101820
BOX_COLOUR equ 0x0000c060

section .rodata
fb_path:  db "/dev/fb0", 0
kbd_path: db "/dev/input/by-path/platform-i8042-serio-0-event-kbd", 0

section .data
x:        dd 150                    ; the square's top-left corner
y:        dd 110
page:     dd 1                      ; the page being drawn, the one not shown
flip:     dd 1                      ; 1 to change pages each frame, 0 with only one
drawn_x:  dd 0, 0                   ; where each page last had the square:
drawn_y:  dd 0, 0                   ; nowhere yet, and erasing there changes nothing
left:     db 0                      ; 1 while that arrow is held
right:    db 0
up:       db 0
down:     db 0

section .bss
var:      resb fb_var_screeninfo_size
fix:      resb fb_fix_screeninfo_size
pixels:   resq 1
event:    resb input_event_size

section .text
global _start

; fill_rect: a rectangle of colour r8d, edx pixels wide and ecx lines high, whose
; top-left corner is at column edi of line esi of the page rbx points to.
; Reads rbx and r13 (bytes a line); changes rax, rcx, rsi, rdi, r9 and r10.
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

_start:
    mov eax, SYS_open
    lea rdi, [fb_path]
    mov esi, O_RDWR
    syscall
    test rax, rax
    js fail
    mov r12, rax                    ; r12: the framebuffer
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_VSCREENINFO
    lea rdx, [var]
    syscall
    mov eax, [var + fb_var_screeninfo.yres]   ; is there room for a second page?
    add eax, eax
    cmp [var + fb_var_screeninfo.yres_virtual], eax
    jae two_pages
    mov dword [page], 0             ; no: draw every frame on the page shown
    mov dword [flip], 0
two_pages:
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
    mov [pixels], rax
    mov r13d, [fix + fb_fix_screeninfo.line_length]
    mov rbx, rax                    ; paint every page
    xor edi, edi
    xor esi, esi
    mov edx, [var + fb_var_screeninfo.xres]
    mov ecx, [var + fb_var_screeninfo.yres_virtual]
    mov r8d, BACKGROUND
    call fill_rect

    mov eax, SYS_open
    lea rdi, [kbd_path]
    mov esi, O_RDONLY | O_NONBLOCK  ; a read with no event returns at once
    syscall
    test rax, rax
    js fail
    mov r14, rax                    ; r14: the keyboard
    mov r15d, IDLE                  ; r15: frames left without an EV_KEY event

frame:
read_event:                         ; take every event waiting, one at a time
    mov eax, SYS_read
    mov rdi, r14
    lea rsi, [event]
    mov edx, input_event_size
    syscall
    cmp rax, input_event_size
    jne events_done                 ; stop reading on any result other than a full event
    cmp word [event + input_event.type], EV_KEY
    jne read_event                  ; skip MSC_SCAN, SYN_REPORT and the rest
    mov r15d, IDLE                  ; any key event restarts the frame countdown
    mov eax, [event + input_event.value]
    cmp eax, 2
    je read_event                   ; a repeat: the key is still held
    movzx ecx, word [event + input_event.code]
    cmp ecx, KEY_ESC
    je done
    cmp ecx, KEY_LEFT
    jne not_left
    mov [left], al                  ; 1 when it goes down, 0 when it comes up
not_left:
    cmp ecx, KEY_RIGHT
    jne not_right
    mov [right], al
not_right:
    cmp ecx, KEY_UP
    jne not_up
    mov [up], al
not_up:
    cmp ecx, KEY_DOWN
    jne read_event
    mov [down], al
    jmp read_event
events_done:

    movzx eax, byte [right]         ; across: right - left is 1, -1 or 0
    movzx ecx, byte [left]
    sub eax, ecx
    imul eax, SPEED
    add eax, [x]
    jns x_low                       ; past the left edge: stop there
    xor eax, eax
x_low:
    mov ecx, [var + fb_var_screeninfo.xres]
    sub ecx, BOX
    cmp eax, ecx
    jle x_high                      ; past the right edge: stop there
    mov eax, ecx
x_high:
    mov [x], eax

    movzx eax, byte [down]          ; down the Screen: down - up
    movzx ecx, byte [up]
    sub eax, ecx
    imul eax, SPEED
    add eax, [y]
    jns y_low
    xor eax, eax
y_low:
    mov ecx, [var + fb_var_screeninfo.yres]
    sub ecx, BOX
    cmp eax, ecx
    jle y_high
    mov eax, ecx
y_high:
    mov [y], eax

    mov eax, [page]                 ; where this page has the square
    lea rcx, [drawn_x]
    mov edi, [rcx + rax*4]
    lea rcx, [drawn_y]
    mov esi, [rcx + rax*4]
    cmp edi, [x]
    jne redraw
    cmp esi, [y]
    je present                      ; already where it is now: nothing to draw
redraw:
    mov eax, [page]                 ; rbx: the page to draw
    imul eax, [var + fb_var_screeninfo.yres]
    imul rax, r13
    add rax, [pixels]
    mov rbx, rax
    mov edx, BOX                    ; erase the square this page had
    mov ecx, BOX
    mov r8d, BACKGROUND
    call fill_rect
    mov eax, [page]                 ; and draw it where it is now
    lea rcx, [drawn_x]
    mov edi, [x]
    mov [rcx + rax*4], edi
    lea rcx, [drawn_y]
    mov esi, [y]
    mov [rcx + rax*4], esi
    mov edx, BOX
    mov ecx, BOX
    mov r8d, BOX_COLOUR
    call fill_rect

present:
    mov eax, [page]                 ; show the page just drawn, at the vertical blank
    imul eax, [var + fb_var_screeninfo.yres]
    mov [var + fb_var_screeninfo.yoffset], eax
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOPAN_DISPLAY
    lea rdx, [var]
    syscall
    mov eax, [flip]                 ; the next frame goes on the other page
    xor [page], eax

    dec r15d
    jnz frame
done:
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

## Following one event

Suppose you press Left. `read` writes its event into `event` and returns 24 in `rax`. The type
check accepts `EV_KEY`, and `mov r15d, IDLE` restarts the idle countdown. The program then loads
the value, 1, into `eax`. It is not a repeat, so execution reaches the key-code checks.

`movzx ecx, word [event + input_event.code]` loads `KEY_LEFT` into `ecx`. This leaves `eax`
unchanged: the code and value are in different registers. After the comparison matches,
`mov [left], al` stores the low byte of `eax`, which is still 1. Releasing Left follows the same
path with value 0 and clears that byte. Repeats restart the countdown too, but branch back to
`read_event` before changing the held-state bytes.

The read loop asks for one event at a time and continues until a read returns something other
than 24. Normally that is `-EAGAIN`, meaning the queue is empty. This example also takes that
branch for an error, an end-of-file result, or a short read. It proceeds to movement without
reporting or recovering from them; it does not establish that the device is still working.

## Moving and drawing

`right - left` is 1 while only Right is held, -1 for only Left and 0 for neither or both.
Multiplying by `SPEED` gives the horizontal movement for this frame. `down - up` does the same
vertically. Two held arrows can therefore move the square diagonally. Each coordinate is clamped
between 0 and the screen dimension minus `BOX`, keeping the whole square visible.

Drawing follows the [bouncing ball](/learn/courses/x86/examples/bouncing-ball). Each page remembers
where it last held the square in `drawn_x` and `drawn_y`. When that differs from the new position,
`redraw` erases the old square on that page and draws the new one. `present` pans to the selected
page, waits for the vertical blank here, then selects the other page for the next frame. With only
one page, the program draws on the displayed page instead.

Once both pages show the square at its current position, the comparisons before `redraw` skip the
pixel writes. The loop still reads input, computes the position, presents the page and decrements
the idle counter.

`r15d` starts at 600 and decreases once per frame. Every `EV_KEY` event resets it, including
repeats and keys other than the arrows. The accompanying `EV_MSC` and `EV_SYN` events do not.
Holding a key keeps the program running while repeat events continue to arrive. A held key that
produces no repeats does not by itself reset the counter. The timeout is about ten seconds at
60 frames per second; slower frames make it longer. Movement is also measured in pixels per frame,
so it slows down when the frame rate drops.

## Supplementary C version

This C version uses Linux's C interfaces for the same input-state and drawing loop.

```c|playground|target=x86|file=keyboard.c|open-screen|no-registers|no-flags|allow-open
// @screen width=320 height=240
#include <fcntl.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <linux/fb.h>
#include <linux/input.h>

enum { BOX = 20, SPEED = 3, IDLE = 600, BACKGROUND = 0x00101820, BOX_COLOUR = 0x0000c060 };

static unsigned line_length;

/* A rectangle of one colour on the page that starts at top. */
static void fill_rect(uint8_t *top, int x, int y, int width, int height, uint32_t colour) {
    for (int line = y; line < y + height; line++) {
        uint32_t *row = (uint32_t *)(top + line * line_length);
        for (int column = x; column < x + width; column++)
            row[column] = colour;
    }
}

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    int keyboard = open("/dev/input/by-path/platform-i8042-serio-0-event-kbd", O_RDONLY | O_NONBLOCK);
    if (fb < 0 || keyboard < 0) return 1;
    struct fb_var_screeninfo var;
    struct fb_fix_screeninfo fix;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    ioctl(fb, FBIOGET_FSCREENINFO, &fix);
    uint8_t *pixels = mmap(NULL, fix.smem_len, PROT_READ | PROT_WRITE, MAP_SHARED, fb, 0);
    if (pixels == MAP_FAILED) return 1;
    line_length = fix.line_length;
    fill_rect(pixels, 0, 0, var.xres, var.yres_virtual, BACKGROUND); /* every page */
    unsigned pages = var.yres_virtual >= 2 * var.yres ? 2 : 1;

    int x = 150, y = 110;
    int drawn_x[2] = { 0, 0 }, drawn_y[2] = { 0, 0 }; /* nowhere yet: erasing there changes nothing */
    int left = 0, right = 0, up = 0, down = 0; /* 1 while that arrow is held */
    unsigned page = pages - 1; /* the page that is not shown, when there are two */
    for (int idle = IDLE; idle > 0; idle--) {
        struct input_event event;
        while (read(keyboard, &event, sizeof event) == sizeof event) {
            if (event.type != EV_KEY) continue;
            idle = IDLE;
            if (event.value == 2) continue; /* a repeat: still held */
            if (event.code == KEY_ESC) return 0;
            if (event.code == KEY_LEFT) left = event.value;
            if (event.code == KEY_RIGHT) right = event.value;
            if (event.code == KEY_UP) up = event.value;
            if (event.code == KEY_DOWN) down = event.value;
        }

        x += (right - left) * SPEED;
        y += (down - up) * SPEED;
        if (x < 0) x = 0;
        if (x > (int)var.xres - BOX) x = var.xres - BOX;
        if (y < 0) y = 0;
        if (y > (int)var.yres - BOX) y = var.yres - BOX;

        if (drawn_x[page] != x || drawn_y[page] != y) { /* this page has it elsewhere */
            uint8_t *top = pixels + page * var.yres * fix.line_length;
            fill_rect(top, drawn_x[page], drawn_y[page], BOX, BOX, BACKGROUND);
            fill_rect(top, x, y, BOX, BOX, BOX_COLOUR);
            drawn_x[page] = x;
            drawn_y[page] = y;
        }
        var.yoffset = page * var.yres;
        ioctl(fb, FBIOPAN_DISPLAY, &var); /* waits for the vertical blank */
        page = (page + 1) % pages;
    }
    return 0;
}
```

C's `read` reports an error as -1 and records the error code in `errno`; an empty nonblocking
queue is reported with `EAGAIN`. As in the assembly version, this loop stops reading on any result
other than one full event, without distinguishing the reason.

Outside the editor, the keyboard path, framebuffer format and permissions must match the machine.
The program also assumes it can control the display and keyboard without a desktop or text console
using them at the same time. A normal desktop session does not provide that setup automatically.

## Try it

1. Replace the horizontal and vertical clamp blocks between `events_done` and the store to `y`.
   For `x`, when the candidate is below 0, use `xres - BOX`; when it exceeds `xres - BOX`, use 0.
   Apply the same rule to `y` with `yres`. Keep the final stores to `x` and `y`. This wraps the
   square to the opposite edge and discards any overshoot from that frame.
2. Make Space toggle between green (`0x0000c060`) and orange (`0x00e08020`). Add
   `colour: dd BOX_COLOUR` in `.data`. In the key-code checks, handle `KEY_SPACE` only when
   `eax` is 1, and toggle with `xor dword [colour], 0x00e04040` (the XOR of the two colours).
   Replace `mov r8d, BOX_COLOUR` with `mov r8d, [colour]`. To show the change even while the
   square is stationary, remove the four instructions from `cmp edi, [x]` through `je present`
   just before `redraw`. Every selected page will then be erased and drawn in the current colour.
3. Hold two arrows at once to move diagonally, then hold Left and Right together: they cancel.
