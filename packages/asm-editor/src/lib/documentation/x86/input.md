An x86 program sees the keyboard in two ways, as a Linux program does. Its **standard input** gives the characters typed into the **Terminal**. The **input devices** under `/dev/input` give what happens on the **Screen**: each key going down and up, the pointer's position and its buttons, with the time of each. A text program reads standard input; a game reads the input devices.

Keys typed into the Terminal go to standard input only, and keys typed into a focused Screen go to the input devices only.

## Opening the keyboard {#keyboard}

Each input device is a file, `/dev/input/event0`, `event1` and so on. The numbers are given in the order the devices were found, and change from one machine to the next, so a program should not guess them. Here `event0` is the keyboard, `event1` the mouse's port, which stays silent, `event2` the pointer, `event3` the PC speaker and `event4` the power button, but a machine with a USB keyboard has it elsewhere, and a program that reads a device that never sends anything waits forever.

Linux also makes names that say where a device is connected. The keyboard is:

```
/dev/input/by-path/platform-i8042-serio-0-event-kbd
```

This name is right on laptops and on PCs whose keyboard is plugged into a PS/2 port, as here. A USB keyboard has another name, so a program meant for any machine looks for its devices instead, as the next section shows.

A program usually opens the keyboard with `O_NONBLOCK`, so that a read with nothing to give returns at once with `EAGAIN` instead of waiting:

```c
int keyboard = open("/dev/input/by-path/platform-i8042-serio-0-event-kbd", O_RDONLY | O_NONBLOCK);
```

## Finding a device {#finding-devices}

To find a device on any machine, open `event0`, `event1` and the rest in turn and ask each what it has. The `EVIOCGBIT` ioctl fills a set of bits, one per code: `EVIOCGBIT(0, size)` gives the event types the device sends, and `EVIOCGBIT(EV_KEY, size)` the keys it has. A device with `KEY_A` is a keyboard, one with `EV_ABS` reports a position, the pointer here, and one with `EV_SND` makes sounds. `EVIOCGNAME` gives the device's name. Bit n of a set is bit `n % 8` of byte `n / 8`.

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

A key gives an `EV_KEY` event whose code names the key and whose value is 1 when it goes down, 0 when it goes up, and 2 for each repeat while it is held. Before it comes an `EV_MSC` `MSC_SCAN` event with the key's scan code, and after it an `EV_SYN` `SYN_REPORT`, which closes the **report**: the events that happened together. Skip the types a program does not use. The types and codes a program meets most:

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

Each `open` of a device gets its own queue of events, and every reader sees every event. Read often: a queue holds 4,096 events, and once a reader falls that far behind, what it did not read is thrown away and an `EV_SYN` `SYN_DROPPED` event says so.

## The pointer {#pointer}

The pointer is a USB **tablet**: a device that reports where the pointer is, not how far it moved. It sends `EV_ABS` events with the codes `ABS_X` and `ABS_Y`, `EV_KEY` events for its five buttons, `BTN_LEFT`, `BTN_RIGHT`, `BTN_MIDDLE`, and `BTN_SIDE` and `BTN_EXTRA` for a mouse's back and forward buttons, which a focused Screen keeps from moving the page back and forward, and `EV_REL` `REL_WHEEL` events for the wheel, 1 a notch away from you and -1 toward you. Each report ends with `SYN_REPORT`, so a move along both axes is two `EV_ABS` events and one `SYN_REPORT`.

The positions are not pixels. They run from 0 at the left or top edge of the Screen to 32767 at the right or bottom, whatever the Screen's size. The `EVIOCGABS(ABS_X)` ioctl fills a `struct input_absinfo` with the range, and the pixel is:

```
x = (value × xres + 32766) ÷ 32767
```

with `xres` from `FBIOGET_VSCREENINFO`, the same for `y` with `ABS_Y` and `yres`, and a division that drops the remainder. 32766 is the range's `maximum` less 1. The tablet reports the pixel the pointer is on, and the formula gives that pixel back, from 0 to `xres - 1`; a drag that leaves the Screen gives the pixel at its edge. A program that uses the value as a pixel draws a hundred times too far, off the Screen. The fields of `struct input_absinfo` a program reads:

{absinfoFields}

The tablet has no name a program can count on, so find it as [Finding a device](#finding-devices) shows: it is the device with `EV_ABS`. This C program prints where each left click lands, for ten seconds:

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

A game often wants to know which keys are held at this moment rather than every key that went down. `EVIOCGKEY(size)` fills a set of bits, one per key code, with the keys and buttons held now; size `KEY_MAX / 8 + 1`, 96 bytes, holds them all. It also throws away the key events still waiting for that reader, so use one or the other. `EVIOCGABS` gives the pointer's position now in the `value` of its `input_absinfo`.

```c
unsigned char held[KEY_MAX / 8 + 1];
ioctl(keyboard, EVIOCGKEY(sizeof held), held);
if (held[KEY_LEFT / 8] >> (KEY_LEFT % 8) & 1)
    x--; /* the left arrow is held */
```

The requests of this chapter, with the number each one is at the sizes used here:

{stateRequests}

## Waiting for input {#waiting}

A read of a device opened without `O_NONBLOCK` waits until an event comes. With `O_NONBLOCK` it returns `-EAGAIN` at once when nothing is waiting, which lets a game draw its next frame instead.

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

- Without `ICANON`, a read returns as soon as one key is there. Keys typed before the read wait for it.
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
- **Ctrl+C and Ctrl+\\ always send the signals**, even when a program names other keys for them in `c_cc`.
- **The Terminal has no grid of rows and columns.** Every character takes one column, a tab and a wide character included. `\r` goes back to the start of the last line and `\b` back one column, but an escape sequence that moves the cursor elsewhere is not followed.
- **A drag that leaves the Screen stays at its edge**, and losing the focus lifts every key and button, as a QEMU window does.

## Not covered {#not-covered}

- **The mouse's own devices**, `/dev/input/mice`, `mouse0` and `mouse1`: they give how far a mouse moved, which fits a pointer in a window badly. Opening one fails with `ENODEV`, and the **Log** says to read the tablet's events instead.
- **`epoll`** answers `ENOSYS`. Use `poll` or `select`, which wait on the same descriptors.
- **Signal-driven input**, `O_ASYNC` and `SIGIO`, which only does what `poll` does. Use `poll`.
- **Scripted keys and pointer moves in a Testcase**: a Testcase scripts standard input only.
