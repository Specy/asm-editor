A square you steer with the arrow keys. It moves while an arrow is held and stops when it is let go;
**Escape** ends the program, and so do ten seconds without a key. **Click the Screen first**: its keys
go to the program's keyboard device only while it has the focus. **Shift+Tab** gives the keyboard
back to the page.

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
IDLE       equ 600                  ; frames without a key before the end: 10 seconds
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
    mov r15d, IDLE                  ; r15: frames left without a key

frame:
read_event:                         ; take every event waiting, one at a time
    mov eax, SYS_read
    mov rdi, r14
    lea rsi, [event]
    mov edx, input_event_size
    syscall
    cmp rax, input_event_size
    jne events_done                 ; -EAGAIN: none left
    cmp word [event + input_event.type], EV_KEY
    jne read_event                  ; skip MSC_SCAN, SYN_REPORT and the rest
    mov r15d, IDLE                  ; a key: count ten seconds again
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

## Opening the keyboard

The keyboard is the file `/dev/input/by-path/platform-i8042-serio-0-event-kbd`, a name Linux makes
for the keyboard plugged into the PC's keyboard port. It is a link to one of `/dev/input/event0`,
`event1` and the rest, whose numbers change from one machine to the next. A USB keyboard has another
name; the [mouse paint Example](/learn/courses/x86/examples/mouse-paint) shows how to find a device
on any machine.

`O_NONBLOCK` makes a read that has no event to give return `-EAGAIN` (-11) at once instead of
waiting. The program draws a frame whether or not a key was pressed, so it must never wait for one.

## Events and the keys held now

Each read gives one **event** of 24 bytes, a `struct input_event`: its time, then its `type`,
`code` and `value`. A key gives an `EV_KEY` event whose `code` names the key and whose `value` is 1
when it goes down, 0 when it comes up and 2 for each repeat while it is held. Around it come events
the program skips: an `EV_MSC` with the key's scan code before it and an `EV_SYN` after it.

Every frame starts by reading events until none is left, so a key pressed between two frames is
seen in the next one. The program keeps one byte for each arrow. Since the value is 1 for down and 0
for up, `mov [left], al` stores whether the left arrow is held now, and a repeat changes nothing.
This is how a game knows that two arrows are held at once and moves the square diagonally.

The codes name keys by where they are on the keyboard, not by what they type, so the arrows are
`KEY_LEFT`, `KEY_RIGHT`, `KEY_UP` and `KEY_DOWN` whatever the keyboard's layout.

## Moving and drawing

`right - left` is 1 while only the right arrow is held, -1 for only the left one and 0 for neither
or both; times `SPEED`, it is how far the square moves this frame. Past an edge the square stops at
the edge.

The drawing is the [bouncing ball's](/learn/courses/x86/examples/bouncing-ball): each frame erases
the square on the page that is not shown, where that page last had it, draws it at its new place
and pans to that page, the pan waiting for the vertical blank. As there, the program checks that the
framebuffer has room for two pages, and draws on the page shown when it has one. A page that already has the square
where it is now needs nothing drawn, so while no arrow is held a frame is only the pan.

`r15` counts the frames left before the program gives up. Every key event sets it back to 600, ten
seconds at sixty frames a second, so the program ends only after ten seconds without a key.

## The same program in C

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

`read` returns the number of bytes it read, or -1 with `errno` set to `EAGAIN` when there is no
event, which ends the inner loop. The headers are the ones a C program includes on Linux, so this
program builds unchanged there too. It runs as it does here on a machine set up like this one, a
Linux virtual machine whose console is a serial line, for a user allowed to read the keyboard. On a
PC's own screen the text console or the desktop draws on the framebuffer too, and a desktop also
takes the keyboard.

## Try it

1. Make the square wrap round instead of stopping: when `x` goes past the right edge, set it to 0,
   and when it goes below 0, to `xres - BOX`. Do the same for `y`.
2. Make Space change the square's colour. Add a `colour` variable, test for `KEY_SPACE` with a
   value of 1, and draw the square with it.
3. Hold two arrows at once to move diagonally, then hold left and right together: they cancel.
