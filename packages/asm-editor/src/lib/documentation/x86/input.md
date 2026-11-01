An x86 program reads **Terminal** characters from standard input. It reads **Screen** keys, pointer positions and buttons from Linux input devices under `/dev/input`. Input devices report presses and releases separately, with timestamps, so a program can track held keys and buttons.

Keys typed into the Terminal go to standard input only, and keys typed into a focused Screen go to the input devices only.

## Opening the keyboard {#keyboard}

Each input device has a file named `/dev/input/event0`, `/dev/input/event1` and so on. This machine uses the following numbers:

| Device file         | Device                                |
| ------------------- | ------------------------------------- |
| `/dev/input/event0` | Keyboard                              |
| `/dev/input/event1` | PS/2 mouse port; sends no events here |
| `/dev/input/event2` | Screen pointer                        |
| `/dev/input/event3` | PC speaker                            |
| `/dev/input/event4` | Power button                          |

On other Linux machines, device discovery order determines these numbers. A program that must work across machines should identify devices by their capabilities. Reading the wrong device may wait indefinitely.

Linux also makes names that say where a device is connected. The keyboard is:

```
/dev/input/by-path/platform-i8042-serio-0-event-kbd
```

This path identifies this machine's PS/2 keyboard connection. A USB keyboard uses a different path. The next section shows how to discover devices without depending on their connection or event number.

A program usually opens the keyboard with `O_NONBLOCK`, so that a read with nothing to give returns at once instead of waiting: in C, `read` returns -1 and sets `errno` to `EAGAIN`; in NASM, the system call returns `-EAGAIN`, -11, in `rax`.

```c
int keyboard = open("/dev/input/by-path/platform-i8042-serio-0-event-kbd", O_RDONLY | O_NONBLOCK);
```

## Finding a device {#finding-devices}

Open the `event` files and query their capabilities with `EVIOCGBIT`. `EVIOCGBIT(0, size)` returns supported event types as a bit set. `EVIOCGBIT(EV_KEY, size)` returns supported key and button codes. Bit n is bit `n % 8` of byte `n / 8`. `EVIOCGNAME` returns the device name.

On this machine, `KEY_A` identifies the keyboard, `EV_ABS` identifies the Screen pointer, and `EV_SND` identifies the speaker. The pointer test is specific to these devices: other Linux machines can have additional absolute-position devices. Do not identify this machine's pointer by `EV_REL` or `BTN_LEFT` alone. The silent PS/2 mouse port, `event1`, advertises both and appears before the Screen pointer.

```c
#include <fcntl.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <linux/input.h>

static int has(const unsigned char *bits, int code) {
    return bits[code / 8] >> (code % 8) & 1;
}

int main(void) {
    for (int number = 0; number < 32; number++) {
        char path[32];
        snprintf(path, sizeof path, "/dev/input/event%d", number);
        int device = open(path, O_RDONLY);
        if (device < 0) continue;
        char name[64] = "";
        unsigned char types[EV_MAX / 8 + 1] = {0};
        unsigned char keys[KEY_MAX / 8 + 1] = {0};
        ioctl(device, EVIOCGNAME(sizeof name), name);
        ioctl(device, EVIOCGBIT(0, sizeof types), types);
        ioctl(device, EVIOCGBIT(EV_KEY, sizeof keys), keys);
        const char *kind = has(keys, KEY_A)       ? "a keyboard"
                           : has(types, EV_ABS)   ? "a pointer"
                           : has(types, EV_SND)   ? "a speaker"
                                                  : "something else";
        printf("%s: %s, %s\n", path, name, kind);
        close(device);
    }
    return 0;
}
```

Many tutorials read the list Linux keeps in `/proc/bus/input/devices` instead. It names each device with its `event` number on its `H: Handlers=` line, and a program can read it like any file.

## Events {#events}

A read gives whole events, 24 bytes each, as a `struct input_event`. A read into a buffer smaller than one event fails with `EINVAL`; a larger buffer gets as many whole events as are waiting.

{eventFields}

A key produces an `EV_KEY` event: `code` identifies the key, and `value` is 1 for a press, 0 for a release or 2 for a repeat while held. An `EV_MSC` event with code `MSC_SCAN` precedes it and supplies the scan code. An `EV_SYN` event with code `SYN_REPORT` ends the **report**, the group of events delivered together. Skip event types the program does not use. Common types and codes are:

{eventCodes}

The codes name keys by where they are, not by what they print: `KEY_Q` is the key to the right of Tab, which a French keyboard labels A. Left and right Shift, Ctrl and Alt are different keys. The Caps Lock, Num Lock and Scroll Lock keys also light the keyboard's lights, which arrive as `EV_LED` events at the start of the report of the key's release.

This NASM program waits for keys and counts in `r13` the ones that go down. It ends when Escape goes down, or after five seconds without a key.

```x86
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "poll.inc"
%include "linux/input.inc"

section .rodata
keyboard_path: db "/dev/input/by-path/platform-i8042-serio-0-event-kbd", 0

section .bss
event:  resb input_event_size
waiter: resb pollfd_size

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [keyboard_path]
    mov esi, O_RDONLY | O_NONBLOCK
    syscall
    test rax, rax
    js fail
    mov r12, rax                        ; r12: the keyboard's descriptor
    mov [waiter + pollfd.fd], eax
    mov word [waiter + pollfd.events], POLLIN
    xor r13d, r13d                      ; r13: keys pressed

wait_for_keys:
    mov eax, SYS_poll
    lea rdi, [waiter]
    mov esi, 1                          ; one descriptor
    mov edx, 5000                       ; for at most 5000 ms
    syscall
    test rax, rax
    jle done                            ; 0: five seconds without a key
read_event:
    mov eax, SYS_read
    mov rdi, r12
    lea rsi, [event]
    mov edx, input_event_size
    syscall
    cmp rax, input_event_size
    jne wait_for_keys                   ; -EAGAIN: nothing left to read
    cmp word [event + input_event.type], EV_KEY
    jne read_event                      ; skip MSC_SCAN, SYN_REPORT and the rest
    cmp dword [event + input_event.value], 1
    jne read_event                      ; only keys going down
    inc r13
    cmp word [event + input_event.code], KEY_ESC
    jne read_event
done:
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

The same loop in C:

```c
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <unistd.h>
#include <linux/input.h>

int main(void) {
    int keyboard = open("/dev/input/by-path/platform-i8042-serio-0-event-kbd", O_RDONLY | O_NONBLOCK);
    if (keyboard < 0) return 1;
    struct pollfd waiter = { .fd = keyboard, .events = POLLIN };
    while (poll(&waiter, 1, 5000) > 0) {
        struct input_event event;
        while (read(keyboard, &event, sizeof event) == sizeof event) {
            if (event.type != EV_KEY) continue;
            printf("key %d %s\n", event.code, event.value == 0 ? "up" : event.value == 1 ? "down" : "repeat");
            if (event.code == KEY_ESC && event.value == 1) return 0;
        }
    }
    return 0;
}
```

Each `open` of a device gets its own event queue. Unless a reader has grabbed the device with `EVIOCGRAB`, every reader receives its events. A queue holds 4,096 events. If it overflows, unread events are discarded and an `EV_SYN` event with code `SYN_DROPPED` reports the loss. A program that maintains held-key or button state must then [rebuild that state](#state).

## The pointer {#pointer}

The Screen pointer reports absolute positions: where it is within the Screen, rather than how far it moved. Linux identifies this device as a USB **tablet**. It sends:

- `EV_ABS` with `ABS_X` or `ABS_Y` for horizontal or vertical position.
- `EV_KEY` with `BTN_LEFT`, `BTN_RIGHT`, `BTN_MIDDLE`, `BTN_SIDE` or `BTN_EXTRA` for its five buttons. `BTN_SIDE` and `BTN_EXTRA` are the back and forward buttons. A focused Screen prevents their usual browser navigation.
- `EV_REL` with `REL_WHEEL` for wheel movement: 1 for a notch away from you, -1 toward you. The same report also contains `REL_WHEEL_HI_RES`, measured in 120ths of a notch: 120 or -120 for that turn. Process one wheel code, rather than adding both values.

Each report ends with `SYN_REPORT`. A move along both axes produces two `EV_ABS` events followed by one `SYN_REPORT`.

The position range is independent of the Screen size. Here `minimum` is 0, at the left or top edge, and `maximum` is 32767, at the right or bottom edge. `EVIOCGABS(ABS_X)` fills a `struct input_absinfo` with the current value and range. For this zero-based range, convert a horizontal position to a pixel with:

```
value = min(32767, max(0, value))
x = min(xres - 1, (value × xres + 32766) ÷ 32767)
```

`min` selects the smaller value, `max` the larger, and division discards the remainder. `xres` is the initial width from `FBIOGET_VSCREENINFO`; use `yres` and `ABS_Y` for the vertical coordinate. Use a sufficiently wide intermediate for `value × xres`. The final clamp is required: at 32767 the quotient is `xres`, so it must become `xres - 1`. The result is always a valid pixel from 0 through `xres - 1`. A drag outside the Screen stays at its edge.

This conversion assumes `minimum == 0` and `maximum == 32767`, as reported here. Another device may report a different range. The relevant `input_absinfo` fields are:

{absinfoFields}

Use the capability query in [Finding a device](#finding-devices) to locate this machine's tablet. This C program prints each left click's pixel coordinates and stops after ten seconds without another report:

```c
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <linux/fb.h>
#include <linux/input.h>

/* The first input device that reports a position. */
static int open_tablet(void) {
    for (int number = 0; number < 32; number++) {
        char path[32];
        snprintf(path, sizeof path, "/dev/input/event%d", number);
        int device = open(path, O_RDONLY | O_NONBLOCK);
        if (device < 0) continue;
        unsigned char types[EV_MAX / 8 + 1] = {0};
        ioctl(device, EVIOCGBIT(0, sizeof types), types);
        if (types[EV_ABS / 8] >> (EV_ABS % 8) & 1) return device;
        close(device);
    }
    return -1;
}

int main(void) {
    int fb = open("/dev/fb0", O_RDWR);
    int tablet = open_tablet();
    if (fb < 0 || tablet < 0) return 1;
    struct fb_var_screeninfo var;
    ioctl(fb, FBIOGET_VSCREENINFO, &var);
    struct input_absinfo xinfo, yinfo;
    ioctl(tablet, EVIOCGABS(ABS_X), &xinfo);
    ioctl(tablet, EVIOCGABS(ABS_Y), &yinfo);
    long x = xinfo.value, y = yinfo.value; /* where the pointer is now */

    struct pollfd waiter = { .fd = tablet, .events = POLLIN };
    while (poll(&waiter, 1, 10000) > 0) {
        struct input_event event;
        while (read(tablet, &event, sizeof event) == sizeof event) {
            if (event.type == EV_ABS && event.code == ABS_X) x = event.value;
            if (event.type == EV_ABS && event.code == ABS_Y) y = event.value;
            if (event.type == EV_KEY && event.code == BTN_LEFT && event.value == 1) {
                long column = (x * var.xres + xinfo.maximum - 1) / xinfo.maximum;
                long line = (y * var.yres + yinfo.maximum - 1) / yinfo.maximum;
                if (column >= var.xres) column = var.xres - 1;
                if (line >= var.yres) line = var.yres - 1;
                printf("click at %ld, %ld\n", column, line);
            }
        }
    }
    return 0;
}
```

There is no double-click event and no event for a modifier held during a click: time the clicks with the events' times, and read Shift or Ctrl from the keyboard. A focused Screen keeps the wheel from scrolling the page.

## What is held now {#state}

`EVIOCGKEY(size)` fills a bit set of the keys and buttons held now. A buffer of `KEY_MAX / 8 + 1`, 96 bytes, holds every code. The call also discards queued `EV_KEY` events for that reader. Use it deliberately: polling this state loses the individual press, release and repeat events that were waiting.

`EVIOCGABS` returns the current position in `input_absinfo.value`. It does not remove queued events. A position event already in the queue may therefore describe an earlier position than this query.

```c
unsigned char held[KEY_MAX / 8 + 1];
ioctl(keyboard, EVIOCGKEY(sizeof held), held);
if (held[KEY_LEFT / 8] >> (KEY_LEFT % 8) & 1)
    x--; /* the left arrow is held */
```

To recover maintained state after `SYN_DROPPED` on a nonblocking descriptor:

1. Discard the rest of the affected report, through its next `SYN_REPORT`. Discard any later events already returned in the same read buffer too.
2. Read and discard the remaining queued reports until `read` reports `EAGAIN`. This prevents old absolute-position events from overwriting the state you are about to query.
3. Replace the held-key or button state with `EVIOCGKEY`. For the pointer, also query `EVIOCGABS(ABS_X)` and `EVIOCGABS(ABS_Y)` and replace both coordinates.
4. Resume processing new reports normally. Lost clicks, repeats and wheel turns cannot be reconstructed from current state.

For a raw `ioctl` syscall, the request number goes in `rsi` and the third argument in `rdx`. These request numbers use the buffer sizes shown:

{stateRequests}

## Waiting for input {#waiting}

A read of a device opened without `O_NONBLOCK` waits until an event comes. With `O_NONBLOCK` it returns at once when nothing is waiting, which lets a game draw its next frame instead: the system call returns `-EAGAIN`, and C's `read` returns -1 with `errno` set to `EAGAIN`.

To wait for several things at once, use `poll` or `select`. `poll` takes an array of `struct pollfd`, each with a descriptor and `POLLIN` in its `events`, and a timeout in milliseconds: it returns as soon as one of them can be read, or 0 when the time is up. A game loop waits on the keyboard and the pointer with a timeout of one frame, then draws. `poll` also waits on standard input, so a program can take typed lines and keys at once.

In a **Testcase** no key is ever pressed and the pointer never moves: a non-blocking read answers `EAGAIN`, `poll` and `select` with a timeout wait on the Testcase's clock, which jumps ahead, and return 0, and the pointer stays at 0, 0. A wait that only a key or the pointer could end, a read without `O_NONBLOCK` or a `poll` without a timeout on input devices alone, stops the Testcase with an error that says so.

**Undo** puts the events a read took back in the reader's queue, so stepping back over a read and running on reads them again. What `EVIOCGKEY` and `EVIOCGABS` answer is the state now.

## The Terminal's keys {#terminal}

Standard input normally gives a whole line once Enter is pressed, with what was typed shown and Backspace erasing. That is the terminal's **canonical mode**. A program that wants each key as it is typed, a menu or a text game, turns canonical mode off with `tcsetattr`, the C library's name for the `TCSETS` ioctl on descriptor 0:

```c
#include <stdio.h>
#include <termios.h>
#include <unistd.h>

int main(void) {
    struct termios saved, keys;
    tcgetattr(0, &saved);
    keys = saved;
    keys.c_lflag &= ~(ICANON | ECHO); /* each key at once, not shown */
    tcsetattr(0, TCSANOW, &keys);
    printf("Press keys, q to stop\n");
    char key;
    while (read(0, &key, 1) == 1 && key != 'q')
        printf("%d\n", key);
    tcsetattr(0, TCSANOW, &saved);
    return 0;
}
```

In NASM, `TCGETS` and `TCSETS` from `sys/ioctl.inc` read and change the same `struct termios` of `termios.inc`.

- Without `ICANON`, a read can return available bytes without waiting for Enter. Bytes typed before the read remain queued.
- Without `ECHO`, typed keys are not shown. With it, a control key such as Ctrl+A is echoed as its byte, which shows nothing: the Terminal starts without `ECHOCTL`, as the reference machine's serial line does, and a program that turns `ECHOCTL` on sees `^A`.
- The arrows and the other special keys arrive as **escape sequences**, the bytes an `xterm` sends: the up arrow is `ESC [ A` (27, 91, 65), down `ESC [ B`, right `ESC [ C`, left `ESC [ D`, Home `ESC [ H` and End `ESC [ F`. Enter is 13, which a program reads as 10 unless it turned `ICRNL` off, and Backspace is 127.
- In this mode Escape goes to the program. Press **Shift+Tab** to give the keyboard back to the page.
- `cfmakeraw` turns off everything at once, output processing too: a `\n` then moves down without returning to the start of the line, so write `\r\n`.

Under `ISIG`, which is on unless the program turns it off, **Ctrl+C** typed into the Terminal during a run sends the program `SIGINT`, and **Ctrl+\\** sends `SIGQUIT`. A program that does not handle `SIGINT` ends. `cfmakeraw` turns `ISIG` off, and Ctrl+C then arrives as the byte 3. To copy text from the Terminal, use **Ctrl+Shift+C** or its context menu.

The program's settings last until it ends: the next run starts in canonical mode again. Undo puts the settings back as they were before an undone `tcsetattr`.

## What is different from a real Linux machine {#differences}

The devices behave as they do on a QEMU virtual machine running Linux, the reference this emulator follows. These are the places where they do not:

- **A reader's queue holds 4,096 events.** Linux holds 64 for a keyboard, under a second of a held key's repeats.
- **Ctrl+Z does nothing.** With no shell to continue it, a program stopped by `SIGTSTP` could never go on.
- **Ctrl+S never freezes the output**, whatever `IXON` says; in a raw program Ctrl+S and Ctrl+Q arrive as their characters.
- **The arrow keys always send `ESC [ A` to `ESC [ D`**, even when a program asks a terminal for its other cursor-key mode.
- **With `ISIG` enabled, Ctrl+C and Ctrl+\\ use fixed signal assignments**, even when a program names other keys for them in `c_cc`.
- **The Terminal has no grid of rows and columns.** Every character takes one column, a tab and a wide character included. `\r` goes back to the start of the last line and `\b` back one column, but an escape sequence that moves the cursor elsewhere is not followed.
- **A drag that leaves the Screen stays at its edge**, and losing the focus lifts every key and button, as a QEMU window does.
- **Some keys never reach the program.** The browser and the operating system keep their shortcuts for themselves: Ctrl+N, Ctrl+T and Ctrl+W, Alt+Tab and Alt+F4, and on Windows the Windows key and Ctrl+Esc. Give anything such a key would do another key or a button too.

## Not covered {#not-covered}

- **The mouse devices** `/dev/input/mice`, `/dev/input/mouse0` and `/dev/input/mouse1` are unavailable. Opening one fails with `ENODEV`, and the **Log** directs the program to the tablet's events.
- **`epoll`** answers `ENOSYS`. Use `poll` or `select`, which wait on the same descriptors.
- **Signal-driven input** with `O_ASYNC` and `SIGIO` is unavailable. Use `poll`.
- **Scripted keys and pointer moves in a Testcase**: a Testcase scripts standard input only.
