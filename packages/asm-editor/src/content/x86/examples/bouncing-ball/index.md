Animate a ball that turns around at the screen's edges. The program draws 600 frames, at up to
60 frames a second, so it runs for at least ten seconds. With two framebuffer pages, it finishes
each picture out of view before showing it. If only one page is available, it draws directly on
the visible page instead.

## How a frame reaches the screen

A **page** is enough framebuffer memory for one whole picture. The Screen in this editor provides
two pages, one after the other in memory. Only one is visible at a time. The program starts by
painting both pages with the background colour, then repeats these steps:

1. Choose the page to draw on and erase the rectangle around its previous ball.
2. Move the ball, reverse its step if it passes an edge, and draw it at the new position.
3. Ask the Screen to show the completed page, then choose the other page for the next frame.

Several values keep these jobs separate:

- `yres` is the height of one visible picture. `yres_virtual` is the height of all the framebuffer
  memory, including lines outside that picture. Two pages need at least `2 × yres` lines.
- `page` selects the page to draw on: 0 or 1. `drawn_x` and `drawn_y` remember the last ball
  position separately for each page, so the program can erase the correct rectangle.
- `yoffset` selects the first framebuffer line to display. The `FBIOPAN_DISPLAY` ioctl asks the
  Screen to display the picture starting at that line.
- On this editor's Screen, that ioctl also waits for the next **vertical blank**, the interval
  between display refreshes. This supplies the frame loop's timing, including in one-page mode.

For example, the first frame draws on page 1 while page 0 is visible, then shows page 1. The
second frame draws on page 0 and shows it. The third returns to page 1, which still contains the
ball from the first frame. Its saved position tells the program what to erase. On the first visit
to each page there is no ball yet, so erasing its initial rectangle just paints background again.

Press **Build**, then **Run**.

```x86|playground|open-screen|no-registers|no-flags|allow-open
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "linux/fb.inc"

BALL        equ 16                  ; the ball's width and height
FRAMES      equ 600                 ; at least ten seconds, at up to 60 frames a second
BACKGROUND  equ 0x00101820
BALL_COLOUR equ 0x00ffcc33

section .rodata
fb_path:   db "/dev/fb0", 0
ball_rows: db 6, 10, 12, 14, 14, 16, 16, 16, 16, 16, 16, 14, 14, 12, 10, 6

section .data
x:         dd 40                    ; the ball's top-left corner
y:         dd 30
step_x:    dd 3                     ; pixels a frame, + right or down, - left or up
step_y:    dd 2
page:      dd 1                     ; the page being drawn, the one not shown
flip:      dd 1                     ; 1 to change pages each frame, 0 with only one
drawn_x:   dd 40, 40                ; where each page last had the ball
drawn_y:   dd 30, 30

section .bss
var:       resb fb_var_screeninfo_size
fix:       resb fb_fix_screeninfo_size
pixels:    resq 1                   ; the first page's top-left pixel

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
    mov r12, rax                    ; r12: the framebuffer's descriptor
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
    mov esi, [fix + fb_fix_screeninfo.smem_len]   ; every page
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_SHARED
    mov r8, r12
    xor r9d, r9d
    syscall
    cmp rax, -4095
    jae fail
    mov [pixels], rax
    mov r13d, [fix + fb_fix_screeninfo.line_length]

    mov rbx, rax                    ; paint every page, yres_virtual lines
    xor edi, edi
    xor esi, esi
    mov edx, [var + fb_var_screeninfo.xres]
    mov ecx, [var + fb_var_screeninfo.yres_virtual]
    mov r8d, BACKGROUND
    call fill_rect

    mov r15d, FRAMES                ; r15: frames left
frame:
    mov eax, [page]                 ; rbx: the top-left pixel of the page to draw
    imul eax, [var + fb_var_screeninfo.yres]
    imul rax, r13
    add rax, [pixels]
    mov rbx, rax

    mov eax, [page]                 ; erase the rectangle at this page's saved ball position
    lea rcx, [drawn_x]
    mov edi, [rcx + rax*4]
    lea rcx, [drawn_y]
    mov esi, [rcx + rax*4]
    mov edx, BALL
    mov ecx, BALL
    mov r8d, BACKGROUND
    call fill_rect

    mov eax, [x]                    ; move across, and turn around at an edge
    add eax, [step_x]
    js turn_x                       ; past the left edge
    mov ecx, [var + fb_var_screeninfo.xres]
    sub ecx, BALL
    cmp eax, ecx
    jle x_done                      ; not past the right edge
turn_x:
    neg dword [step_x]
    add eax, [step_x]               ; back where it was
    add eax, [step_x]               ; and one step the other way
x_done:
    mov [x], eax

    mov eax, [y]                    ; the same vertically
    add eax, [step_y]
    js turn_y
    mov ecx, [var + fb_var_screeninfo.yres]
    sub ecx, BALL
    cmp eax, ecx
    jle y_done
turn_y:
    neg dword [step_y]
    add eax, [step_y]
    add eax, [step_y]
y_done:
    mov [y], eax

    mov eax, [page]                 ; this page will have the ball here
    lea rcx, [drawn_x]
    mov edx, [x]
    mov [rcx + rax*4], edx
    lea rcx, [drawn_y]
    mov edx, [y]
    mov [rcx + rax*4], edx

    xor r14d, r14d                  ; draw the ball, one row at a time
ball_row:
    lea rax, [ball_rows]
    movzx edx, byte [rax + r14]     ; this row's width
    mov edi, BALL
    sub edi, edx
    shr edi, 1                      ; centred: (BALL - width) / 2 from the left
    add edi, [x]
    mov esi, [y]
    add esi, r14d
    mov ecx, 1
    mov r8d, BALL_COLOUR
    call fill_rect
    inc r14d
    cmp r14d, BALL
    jb ball_row

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

    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

## Selecting and showing a page

`rbx` tells `fill_rect` where its page begins. Page 0 starts at `pixels`; page 1 starts
`yres × line_length` bytes later. The frame loop computes this address as
`pixels + page × yres × line_length`, so the drawing routine can use the same coordinates on
either page.

To show page 0, the program sets `yoffset` to 0. To show page 1, it sets `yoffset` to `yres`,
skipping the first page's lines. It then passes `var` to `FBIOPAN_DISPLAY`.

With two pages, drawing happens on the hidden page and panning shows only the finished picture.
This is **double buffering**: the viewer does not see the erase and redraw steps. At the end of
the frame, `xor [page], eax` uses the 1 in `flip` to switch `page` between 1 and 0.

A framebuffer does not always provide two pages. The program checks `yres_virtual` before using
the second one. If there is room for only one, it sets both `page` and `flip` to 0. XOR with 0
leaves `page` at 0, and `yoffset` stays 0 too. Each frame erases and draws on the visible page,
so the intermediate drawing may be visible. In this mode the saved position belongs to the
previous frame, rather than two frames ago.

## Erasing and drawing the ball

Painting a whole 320-by-240 page every frame would take 76,800 pixel stores. Instead, the program
erases the whole 16-by-16 rectangle around that page's old ball, then draws the new ball. Nothing
else on the page changes, so this produces the same finished picture as a full repaint.

`drawn_x` and `drawn_y` each contain two four-byte coordinates. In `[rcx + rax*4]`, `rax` is the
page number: 0 selects the first coordinate and 1 selects the second. These arrays keep the two
pages' positions separate even though `x` and `y` hold just the ball's current position.

The table `ball_rows` gives the width of each of the ball's 16 rows. Each row is centred inside
the 16-pixel width with `(BALL - width) / 2`. For the first row, the width is 6, so drawing starts
`(16 - 6) / 2 = 5` pixels to the right of `x`. The middle rows have width 16 and start at `x`.
Sixteen calls to `fill_rect`, each one line high, produce the disc.

## Frame timing

On this editor's Screen, `FBIOPAN_DISPLAY` waits for the next vertical blank. The Screen
refreshes 60 times a second. If drawing finishes before the next blank, the pan waits for it
and then shows the requested page. If drawing takes longer, the program misses refreshes and
the animation runs more slowly. Its maximum rate is therefore 60 frames a second.

The loop needs only **draw, then pan**. Adding `FBIO_WAITFORVSYNC`, which waits without panning,
before the pan would add another wait. Even with fast drawing, that would limit the animation
to 30 frames a second on this Screen.

After `FRAMES` frames the program ends, and the Screen keeps the last frame. With `FRAMES` set
to 600, this takes at least ten seconds. Set it to 6000 for at least 100 seconds.

## Turning at an edge

`x` is the ball's left edge, so it fits while `x` is from 0 to `xres - BALL`. The program adds the
step; a result below 0 sets the sign flag for `js`, and one above `xres - BALL` fails `jle`. Either
way, `neg` reverses the step. Adding the reversed step once returns to the previous position;
adding it again moves one step in the other direction.

For example, the rightmost allowed `x` is `320 - 16 = 304`. From `x = 302`, a step of 3 would
reach 305. The program reverses the step to -3, adds it to return to 302, then adds it again to
reach 299. The vertical movement uses the same calculation with `y` and `yres`.

## Try it

1. Make the ball faster: set `step_x` to 5 and `step_y` to 4.
2. Leave a trail: delete the `call fill_rect` that erases the ball. With two pages, each page then
   keeps the balls drawn on alternate frames. With one page, it keeps every frame's ball.
3. Alternate between two colours when the ball reverses direction on an axis. Add
   `colour: dd BALL_COLOUR` to `.data`, change `mov r8d, BALL_COLOUR` in the ball's loop to
   `mov r8d, [colour]`, and after each `neg dword [step_x]` and `neg dword [step_y]` add
   `xor dword [colour], 0x00ffffff`. This toggles the red, green and blue bits between the
   original colour and its opposite. If both axes reverse in one frame, the two toggles cancel
   and the displayed colour stays the same.
