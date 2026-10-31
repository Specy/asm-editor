A ball crosses the Screen and turns round at its edges, sixty frames a second, for ten seconds. Each
frame is drawn where it cannot be seen and then shown all at once, so the ball never flickers.

Press **Build**, then **Run**.

```x86|playground|open-screen|no-registers|no-flags|allow-open
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "linux/fb.inc"

BALL        equ 16                  ; the ball's width and height
FRAMES      equ 600                 ; ten seconds at 60 frames a second
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
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_FSCREENINFO
    lea rdx, [fix]
    syscall
    mov eax, SYS_mmap
    xor edi, edi
    mov esi, [fix + fb_fix_screeninfo.smem_len]   ; both pages
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_SHARED
    mov r8, r12
    xor r9d, r9d
    syscall
    cmp rax, -4095
    jae fail
    mov [pixels], rax
    mov r13d, [fix + fb_fix_screeninfo.line_length]

    mov rbx, rax                    ; paint both pages, yres_virtual lines
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

    mov eax, [page]                 ; erase the ball this page had, two frames ago
    lea rcx, [drawn_x]
    mov edi, [rcx + rax*4]
    lea rcx, [drawn_y]
    mov esi, [rcx + rax*4]
    mov edx, BALL
    mov ecx, BALL
    mov r8d, BACKGROUND
    call fill_rect

    mov eax, [x]                    ; move across, and turn round at an edge
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

    mov eax, [y]                    ; the same down the Screen
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

    xor dword [page], 1             ; the next frame goes on the other page
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

## Two pages

The framebuffer has room for two pictures: `yres_virtual` is twice `yres`, and the second page's
lines follow the first's in memory. `yoffset` in `var` says which line the Screen shows at its top,
0 for the first page and `yres` for the second. The `FBIOPAN_DISPLAY` ioctl shows the line `yoffset`
names: it **pans** the Screen to the other page.

Each frame draws on the page that is not shown, the one `page` names, and only then pans to it.
Nobody sees the ball erased and drawn again, only finished frames. This is **double buffering**.
At the end of the frame `xor dword [page], 1` turns 1 into 0 and 0 into 1, so the next frame is drawn
on the page that was shown until then.

`rbx` is where `fill_rect` draws, so pointing it at the page's first pixel, `page × yres` lines
after the first page's, is all it takes to draw on one page or the other.

## Erasing only what changed

Painting a whole page every frame would take 76,800 stores. Instead, the program erases the ball
and draws it again. The page it is about to draw on still shows the frame from **two** frames ago,
since the frame in between went on the other page, so the ball to erase is where that page last
had it. `drawn_x` and `drawn_y` keep one position for each page, and `[rcx + rax*4]` picks the
page's: `rax` is 0 or 1, and each position is four bytes.

Nothing else on the page changes, so erasing the old ball and drawing the new one leaves the page
exactly as a full repaint would.

The ball is 16 rows from a table of widths, `ball_rows`, each row centred: a disc drawn in 16
calls of `fill_rect`, not 256 pixel tests.

## One frame per vertical blank

The pan waits for the **vertical blank**, the moment between two pictures on the monitor, which
comes sixty times a second, and shows the new page then: never in the middle of a picture. So the
frame loop is only **draw, then pan**, and the animation runs at sixty frames a second however fast
the program draws. `FBIO_WAITFORVSYNC` waits for the vertical blank without panning; called before
the pan it would cost a second blank each frame, and the ball would move at thirty frames a
second.

After `FRAMES` frames the program ends, and the Screen keeps the last frame. Change `FRAMES` to
6000 to watch it for 100 seconds.

## Turning at an edge

`x` is the ball's left edge, so it fits while `x` is from 0 to `xres - BALL`. The program adds the
step; a result below 0 sets the sign flag for `js`, and one above `xres - BALL` fails `jle`. Either
way `neg` turns the step round, and adding it twice goes back to where the ball was and on one step
the other way.

## Try it

1. Make the ball faster: set `step_x` to 5 and `step_y` to 4.
2. Leave a trail: delete the `call fill_rect` that erases the ball. Each page then keeps every ball
   drawn on it, every other frame's.
3. Give the ball a new colour at each bounce. Add `colour: dd BALL_COLOUR` to `.data`, change
   `mov r8d, BALL_COLOUR` in the ball's loop to `mov r8d, [colour]`, and after each
   `neg dword [step_x]` and `neg dword [step_y]` add `xor dword [colour], 0x00ffffff`, which turns
   a colour into its opposite.
