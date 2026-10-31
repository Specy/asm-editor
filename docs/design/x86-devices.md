# x86 devices

Decision record for the **Screen**, **Keyboard**, **Mouse** and **Audio** on x86, which [screen-peripherals.md](./screen-peripherals.md) and [audio.md](./audio.md) left out. Programs reach them as a Linux program reaches its hardware: through the kernel's device files, `/dev/fb0` for the framebuffer, `/dev/input/event*` for keys and the pointer, `/dev/dsp` for sampled sound, a raw MIDI port for General MIDI and the PC speaker for tones. Settled one question at a time in a grill session on 2026-10-31, then corrected the same day after an independent review checked the facts against the Linux 6.12 and QEMU 10.0 sources Debian 13 ships; where the review changed a decision, the section says so. Later the same day M0 booted the pinned guest, QEMU 10.2.1 with Debian 13 and Linux 7.2.11 from its backports, and recorded what its devices answer ([x86-reference-guest.md](../research/x86-reference-guest.md)); where that changed a decision's text, the section carries a dated correction. The implementation is planned in [x86-devices-plan.md](./x86-devices-plan.md).

## The machine behind the devices

Decided on 2026-10-31: [ADR 0067](../adr/0067-x86-devices-follow-a-qemu-guest.md).

The devices behave as they do in **an x86-64 QEMU guest running Linux, logged in as root on its serial console, with ALSA's virtual raw MIDI card played by FluidSynth**. The Linux interfaces (fbdev, evdev, OSS, raw MIDI) say what a program may ask; the machine says what it gets back: the framebuffer's pixel format and size, an absolute pointer rather than a relative mouse, the names the devices give, and whether a program can change the screen mode. Root is what Blink already reports to a program, and it keeps permissions out of the way: on Debian `/dev/input/event*` is `root:input 0660`.

Why: rule 1 of [ADR 0035](../adr/0035-environments-match-their-reference.md) needs one machine to compare against, as MARS's jar settles a MIPS question. A static binary built here boots in QEMU unchanged, so any disputed detail can be checked there. QEMU is x86, and its USB tablet reports absolute positions because a VM window is a canvas inside a host window, which is the editor's situation too.

The MIDI half changed after the review. It was first a USB General MIDI module, but QEMU emulates no USB-MIDI device, so that machine could not be booted. QEMU's own sound cards have no General MIDI synthesizer either (its AdLib and Gravis Ultrasound are not GM). `snd-virmidi` gives the same `/dev/snd/midiC1D0` a hardware interface gives, and FluidSynth inside the guest plays it, so the whole reference boots and can be checked.

FluidSynth plays on a sound card of its own, QEMU's `usb-audio` (corrected on 2026-10-31, from the booted guest: on the HDA card it held the card's one playback substream, so `/dev/dsp` answered `EBUSY` while it ran, and a program could not use `/dev/dsp` and MIDI together). `/dev/dsp` on the HDA card stays the program's, and both sound at once, as here.

Rejected: an unnamed "Linux PC console" (no arbiter, every detail decided by taste); a Raspberry Pi, the usual machine for framebuffer teaching, but ARM; a physical USB-MIDI interface passed through to the guest (real, but nobody can check it without the hardware).

DRM's fbdev emulation, which QEMU's display goes through, never changes the displayed mode: the machine sets the size and the program reads it.

## Scope

Decided on 2026-10-31.

| Covered                   | What a program uses                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/dev/fb0`                | fbdev: the screen-information ioctls, `mmap`, `read`, `write`, `lseek`, `fsync`, panning and the vsync wait                         |
| `/dev/input/event*`       | evdev for the keyboard, the USB tablet and the PC speaker: events, the key and absolute-axis state ioctls, and the discovery ioctls |
| `/proc/bus/input/devices` | The kernel's list of input devices, generated from the same devices; most tutorials find an event number there                      |
| The Terminal's raw mode   | `tcsetattr` honoured through the **Line discipline** (its own section below), Linux's typed-character view of the keyboard          |
| `/dev/dsp`                | OSS sampled sound, and the mixer ioctls OSS also accepts on it                                                                      |
| A raw MIDI port           | MIDI bytes to the GM synthesizer, played on the synthesizer that plays **Notes**                                                    |
| `/dev/mixer`              | OSS mixer levels, 0 to 100 for each side: a gain the program owns, which `VOLUME` applies to `/dev/dsp`                             |
| `/dev/tty0`               | `KIOCSOUND` and `KDMKTONE`, root's other way to sound the PC speaker in the guest                                                   |
| `poll` and `select`       | Waiting on any of these, the Terminal and a timeout at once: the event loop every interactive program needs                         |

| Not covered                               | Why                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| DRM/KMS, `/dev/dri/card0`                 | Made for libdrm: setting a mode by hand takes dozens of ioctls of connector and CRTC plumbing and teaches nothing fbdev does not       |
| ALSA's PCM, control and sequencer devices | Made for libasound, whose hardware-parameter negotiation cannot sensibly be written by hand; OSS on the same card covers sampled sound |
| mousedev, `/dev/input/mice` and `mouse0`  | Relative PS/2 packets, which drive a canvas badly; the tablet covers the pointer                                                       |
| `/dev/audio`                              | μ-law sampled sound, a second door to what `/dev/dsp` already does                                                                     |
| `epoll`                                   | Blink answers `ENOSYS` for every descriptor today; `poll` and `select` cover the same programs. Documented                             |
| `O_ASYNC` and `SIGIO`                     | Signal-driven input is a second way to do what `poll` does. Documented                                                                 |

The guest has drivers for the uncovered devices, so their nodes exist here too and opening one fails with `ENODEV`: a documented deviation, and the Log names the device and what to use instead. `/dev/sequencer` and `/dev/music` do not exist at all, as in the guest, whose Debian kernel builds no OSS sequencer. The booted guest added nodes to that list (Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md))): joydev's `/dev/input/js0` for the tablet, ALSA's `timer`, `hwC0D0` and every card's control and PCM nodes, card 1's empty OSS mixer `/dev/mixer1`, the OSS nodes of FluidSynth's USB card (`/dev/dsp2`, `/dev/audio2`, `/dev/mixer2`), `/dev/uinput`, and the virtual consoles `/dev/tty2` to `/dev/tty63`. `/dev/ttyS0` and `/dev/console` are the program's own terminal, and `/dev/tty1` is the same console as `/dev/tty0`.

`/dev/mixer` was first left out on the grounds that a program changing the volume would break the rule that muting never changes what a program observes ([audio.md](./audio.md)). That rule is about the user's mute and volume, so it does not apply, and the mixer came in. It applies to `/dev/dsp` only: the GM synthesizer's sound never passes the card's mixer, so a program sets MIDI volume with controller 7 or GM Master Volume. The program sets and reads back its own levels, which start at the guest's defaults and which Undo restores; the user's mute and volume Preferences act after them and the program never sees those. Its other channels (line, microphone, CD and the rest) keep the values written to them and change nothing. On QEMU's HDA codec the mixer has only Master and Capture, `VOLUME` and `IGAIN`: `PCM` and the rest keep what is written to them and change nothing, so the program's gain is `VOLUME` (corrected while implementing; its default, 73 as `alsactl init` leaves it, is the booted guest's too, and `SOUND_MIXER_INFO` names the mixer `QEMU Generic` with 14 changes counted since boot).

The console ioctls on the program's own tty (`KDSETMODE`, `KDSKBMODE`, `KIOCSOUND` and the rest) answer `ENOTTY`, because that tty is a serial line (next section). An ioctl a descriptor does not know answers as its driver does: `ENOTTY` where no driver claims the request, `EINVAL` from evdev and `/dev/dsp`, `ENXIO` from the mixer (corrected while implementing, from the drivers' code).

## The program's tty is a serial line

Decided on 2026-10-31: [ADR 0068](../adr/0068-x86-programs-run-on-a-serial-console.md).

The guest boots with `console=ttyS0` and no framebuffer console. The **Terminal** is the serial line and `/dev/fb0` is the program's alone. Keys typed into the focused **Screen** reach the evdev keyboard only; keys typed into the Terminal reach standard input only, so [ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md) does not hold on x86. The Screen's focus hint and the x86 Documentation say where the Screen's keys go, for the learner who clicks the Screen and then types at a `scanf`.

Kept for later, as a **Program** setting: the program on the VT, `tty1`, with the Screen as its console. The ADR lists what that needs; everything built for the serial line carries over.

Rejected: the VT now (its cost is mostly text the Terminal already shows, and a program that draws without `KD_GRAPHICS` has its pixels overwritten by text and the cursor); the serial line with the Screen's keys also fed to standard input (QEMU never does it, and a game's movement keys would wait in standard input for the next `scanf`).

## The Terminal's modes

Decided on 2026-10-31, the last four points after the review.

Blink stores the program's termios and the **Line discipline** follows it.

- **Canonical mode** reads a line, as today.
- **Raw mode** (`ICANON` off) sends each key to Blink as it is typed, whether or not a read is waiting, as a tty buffers keys; arrows and the other special keys arrive as their escape sequences. Echo only under `ECHO`; `VMIN` and `VTIME` are Blink's, on **Program time**. Raw mode ends with the program.
- **Output follows `OPOST` and `ONLCR`**: `cfmakeraw` turns them off, and a newline then moves down without returning, the staircase a real serial terminal shows.
- **`ISIG`**: Ctrl+C, typed into the focused Terminal during a run, sends `SIGINT`, and Ctrl+\ sends `SIGQUIT`; copying is Ctrl+Shift+C and the context menu.
- **Ctrl+Z is ignored**, a documented deviation: with no shell to resume it, a program stopped by `SIGTSTP` could never continue.
- **`IXON` is ignored**, a documented deviation: Ctrl+S never freezes the program's output.

Settled while building the editor's half, on 2026-10-31:

- **The keys are an xterm's in its default modes** (`terminalKeys.ts`): Enter `\r`, Backspace DEL, the arrows `ESC [ A`, Home and End `ESC [ H` and `ESC [ F`, the editing keys and F5 to F12 `ESC [ n ~`, F1 to F4 `ESC O P` to `S`, xterm's modifier parameter for Shift, Alt and Ctrl, Ctrl and a letter its control character. The cursor keys never switch to application mode, a documented deviation. Ctrl+V pastes, Alt with a character sends no `ESC` prefix, and Ctrl+S and Ctrl+Q reach a raw program as their characters, as with `IXON` off.
- **Echo follows `ECHOCTL`**: under it a control character shows as `^C`, `^[` or `^?`, and Enter shows as a new line under `ICRNL` and as `^M` without it; without it a control character echoes as itself, which shows nothing but what a terminal does with it. Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md)): the serial line starts with `ECHOCTL` off, as agetty leaves it for root's shell, and not on as first written; the whole starting termios is the guest's, `ICRNL IXON IXOFF IMAXBEL IUTF8`, `OPOST ONLCR`, `B9600 CS8 CREAD HUPCL CLOCAL` and `ISIG ICANON ECHO ECHOE ECHOK ECHOKE` (no `IEXTEN`). The 9600 baud is reported and never paces output, a documented deviation: [ADR 0010](../adr/0010-program-time-without-clock-pacing.md) has no clock pacing. A canonical read with `ECHO` off echoes nothing, its new line included. `VINTR`, `VQUIT` and `VSUSP` are Linux's defaults whatever the program sets, a documented deviation: the Core reports the flags, not the characters.
- **Escape is the program's in raw mode**, so Shift+Tab gives the keyboard back to the page, as it already did beside Escape. Ctrl+Shift+C copies in every mode, and Ctrl+C keeps copying where it is no signal.
- **The Terminal draws the serial line's cursor on its last line only**: `\r` overwrites from the start of the line, `\b` steps back a column, and an escape sequence takes none. Every character is one column, a tab and a wide character included, and the caret stays after the end of the transcript, documented deviations. Undo keeps an overwritten line's old text with the instruction that first changed it. A Testcase's output goes through as written, as a pipe's does, `\r` and `\b` included (corrected on 2026-10-31 after the implementation's review: the serial line had rewritten it, so `50%\r100%` compared as `100%`).
- **Raw mode takes over what was typed for the line reads** (settled on 2026-10-31 after the implementation's review): when `ICANON` goes off, the line a read was editing, already echoed, then what was typed ahead go to the Core's queue, as Linux makes a partly typed line readable, and a line Enter ended that the Core had not had yet goes first. The hand-over waits until the system call or the Undo that changed the termios has returned, so the keys and their echo arrive between instructions together.
- **A known limitation** (noted on 2026-10-31, after the implementation's review): a key typed ahead while the program polls is echoed under no instruction and queued in the Core. Undo of an earlier instruction that wrote to the Terminal cuts the transcript back to its length before that write, the echo with it, while the Core keeps the key, which a later read then takes without its echo showing. Keeping such an echo would need the Terminal to journal the transcript by its content rather than by its length.

## Screen size and format

Decided on 2026-10-31; the widths and `FBIOPUT_VSCREENINFO` changed after the review.

- **The size is the Program's Display configuration**, the machine's `video=` on the kernel command line: set before Run, as MIPS's and RISC-V's are. It is a width and a height only. fbdev has no unit size (scaling up is the Screen's zoom, which the program cannot see), and `mmap` decides where the pixels live, so there is no base address.
- **The width is a multiple of 8.** The guest builds `video=` as a CVT mode, which rounds the width down to a multiple of 8, so the x86 Display menus and their "Custom…" field offer multiples of 8 up to 1024, and heights up to 1024; the pinned guest boots at sizes down to 8×8. Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md)): first written as a GTF mode from a bare `video=320x240`, which Linux 7.2 refuses at that size (GTF's sync lands inside the picture at small heights), so the guest boots `video=320x240M`, CVT.
- **The Entry file can name it** with `@screen width=320 height=240`, the grammar MIPS and RISC-V use, in a `;` comment of a NASM Entry file or a `//` or `/* */` comment of a C or C++ Entry file.
- **The default is 320×240.** The editor calibrates x86 at about 2,000 instructions a millisecond with Undo history (`X86_INSTRUCTIONS_PER_MS`), so a four-instruction loop over every pixel takes about 0.15 s at 320×240 and 0.6 s at 640×480.
- **The format is 32 bpp XRGB8888**, what QEMU's display gives through DRM's fbdev emulation: one little-endian word `0x00RRGGBB` a pixel, the word RARS's display takes. The program reads size and format with `FBIOGET_VSCREENINFO` and `FBIOGET_FSCREENINFO`, whose `id` is `bochs-drmdrmfb`.
- **`FBIOPUT_VSCREENINFO` answers as the kernel's check does**: a smaller size (8 or more) is accepted and read back while the Screen keeps showing the full mode; a larger size, a larger depth or another explicit pixel layout answers `EINVAL`.

Rejected: 640×480 by default, the classic VGA size and EASy68K's window, because a learner's first animation would run at under two frames a second.

## Double buffering and the vsync wait

Decided on 2026-10-31; the vsync and timing points corrected after the review.

1. **Two pages, always.** The guest boots with `drm_kms_helper.drm_fbdev_overalloc=200`, so `yres_virtual` is twice `yres` (320×480 at the default size, 600 KB). A program that never pans draws on the visible page and can show half-drawn frames, as on the device. A program that pans with `FBIOPAN_DISPLAY`, or with `FBIOPUT_VSCREENINFO` and a new `yoffset`, draws on the hidden page and presents it: the **Screen**'s double buffering ([ADR 0006](../adr/0006-screen-double-buffering.md)).
2. **`FBIO_WAITFORVSYNC` waits for the next 1/60 s boundary of Program time.** On Linux 6.12 it returns at once, because QEMU's bochs display had no vertical blank until Linux 6.19 gave it a timer; the pinned guest runs 7.2, so the wait is the reference's. In a Testcase it moves the virtual clock to that boundary.
3. **A pan waits for the vertical blank** (decided on 2026-10-31 by the owner, from the booted guest). On Linux 7.2 the fbdev emulation's pan is an atomic commit that waits for bochs-drm's vertical blank: `FBIOPAN_DISPLAY` returns at the next 1/60 s boundary, a pan to the page already shown too, and `FBIOPUT_VSCREENINFO` that changes anything at the second, its mode's commit taking one blank and its pan the next (about 16.7 and 33 ms measured). Each is a wait on Program time with that deadline, the pan shown at its end, and in a Testcase the virtual clock moves to it. The frame loop the Documentation and the Examples teach is **draw, then pan**, the pan doing the waiting, at 60 frames a second; `FBIO_WAITFORVSYNC` stays for programs that do not pan. Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md)): this decision first taught "wait for vsync, then pan", which on the reference costs two blanks a frame, 30 frames a second.
4. **The Screen is current at the end of every slice, at every wait, at every pan and at `fsync` on `/dev/fb0`**, a documented deviation. The guest's fbdev draws through a shadow buffer that reaches the display about 48 ms after a write, and a pan can show a page that old; `fsync` and `write` reach it at once, as here. Corrected on 2026-10-31 after the implementation's review: "current" means current whenever anyone can see it. A pan, an `fsync` or a blank only marks the page presented, from inside the system call, and the Screen reads the page once at the next slice end, wait, Step, Undo or Poke, and only when an instruction has run or a page was presented since it last did; the Core runs on the page's thread, so nothing paints the Screen in between. A program that calls `fsync` after every pixel read the whole page at every call before (3,000 pixels at 320×240: 621 ms, 3,002 reads), and once a slice now (15 ms, 2 reads).
5. **`yoffset` is Screen state that Undo restores** ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)).

Rejected: one page, the kernel's default overalloc of 100, where panning answers `EINVAL` and the idiom worth teaching is gone; a vsync wait on the browser's animation frames, which follows the monitor's rate (60, 120, 144 Hz) and means nothing in a Testcase.

## The keyboard device

Decided on 2026-10-31; the queue's cap, repeats and the events the guest also sends changed after the review.

evdev is a third way of observing the **Keyboard**: **key events**, the downs, ups and repeats of keys in order with their times, beside the typed characters (the Terminal's raw mode on x86) and the key state. It is not a separate Peripheral.

1. **Codes are Linux's `KEY_*`**, mapped from the browser's `KeyboardEvent.code`. Both name physical keys, so the mapping is exact and independent of the layout, as on a real evdev device: an AZERTY "A" is `KEY_Q`. Left and right Shift, Ctrl and Alt are separate keys, and the keypad keys keep their codes whatever Num Lock does, which Linux leaves to the keymap. The rule that every environment uses EASy68K's key codes is removed ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)'s update of 2026-10-31).
2. **Each reader's queue holds 4,096 events**, where Linux holds 64 for a keyboard; past that, as on Linux, the backlog is dropped for a `SYN_DROPPED` and the newest event. A slow emulator needs the room (64 events are under a second of auto-repeat), and a reader opened and never read cannot grow without end.
3. **Repeats are the browser's**, as the guest's are the host's: QEMU passes its host's repeats through and ignores the keyboard's rate command. `EVIOCGREP` answers the AT keyboard driver's 250 ms and 33 ms, and `EVIOCSREP` reads back the driver's rounded values and changes nothing. (First decided as repeats the device made itself; the guest does not.) The booted guest's `EVIOCGREP` right after `EVIOCSREP` read the values asked for in one run and the rounded ones in another, atkbd rounding in a work that races the call; the rounded values at once stay, a documented deviation that no program should notice.
4. **Each key event is preceded by its `MSC_SCAN`**, and the lock keys toggle the keyboard's LEDs with `EV_LED` events, as the guest's console keyboard handler does; `EVIOCGLED` answers them. Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md)): the LED change comes through the LED trigger input-leds follows, with no `SYN_REPORT` of its own, so it arrives inside the key's release packet, before its `MSC_SCAN`, not in a packet of its own after the key's. The keymap is Linux 7.2's, which reads F13 to F24 at scan codes 0x64 to 0x6e and 0x76.
5. **Losing focus lifts every held key**, with up events ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)). QEMU's window does the same.
6. **`EVIOCGKEY` answers the keys held now** and, as on Linux, throws away the key events still queued for that reader. The state changes at the event, like the key state of [ADR 0066](../adr/0066-key-state-changes-at-the-event.md).
7. **Event times are `CLOCK_REALTIME`**, as on Linux, until `EVIOCSCLOCKID` asks for `CLOCK_MONOTONIC` or `CLOCK_BOOTTIME`, which empties the queue for a `SYN_DROPPED`. All come from **Program time**.

## The input devices

Decided on 2026-10-31.

The guest's own `/dev/input`, at its real numbers: "AT Translated Set 2 keyboard" (`event0`), the PS/2 mouse that stays silent while the tablet is active (`event1`), "QEMU QEMU USB Tablet" (`event2`), "PC Speaker" (`event3`) and the ACPI Power Button (`event4`), the order the booted guest probes them in (Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md)); first written with the Power Button first). Each answers `EVIOCGNAME`, `EVIOCGID`, `EVIOCGPHYS`, `EVIOCGBIT` and `EVIOCGVERSION` as it does there, `/proc/bus/input/devices` lists them, and udev's links exist under `/dev/input/by-path/` and `/dev/input/by-id/`, which a listing of `/dev/input` shows.

Each `open` gets its own queue and every reader sees every event, as evdev's clients do. A read takes whole 24-byte events and answers `EINVAL` for a buffer smaller than one. `EVIOCGRAB` is exclusive: while one reader holds it, the others get nothing and a second grab answers `EBUSY`.

The Documentation opens devices through the udev links, `/dev/input/by-path/platform-i8042-serio-0-event-kbd` for the keyboard, and teaches scanning `event*` with `EVIOCGBIT`, or reading `/proc/bus/input/devices`, as the robust way. The keyboard link is right on laptops and on PCs with a PS/2 keyboard, not on a desktop with a USB keyboard, whose links name its USB path; only scanning works on every machine.

Why: a binary built here behaves as it does in QEMU, with no deviation to explain, and the habit it teaches is the one real programs use. A hardcoded event number changes between machines and boots: here `event0` is the keyboard, but a machine with a USB keyboard numbers it elsewhere, and a read of the Power Button or the silent PS/2 mouse waits forever, so the first Example shows the link. (First written with `event0` the Power Button, which the booted guest corrected on 2026-10-31.)

Rejected: only the keyboard and the tablet, as `event0` and `event1`. First programs could hardcode the numbers, but such a program opens the PS/2 mouse for the tablet on the reference and teaches a habit that fails on every real machine.

## The pointer

Decided on 2026-10-31; details corrected after the review.

QEMU's USB tablet as the pinned QEMU version has it: `EV_ABS` `ABS_X` and `ABS_Y`, the buttons, and a vertical wheel, `REL_WHEEL` with its `REL_WHEEL_HI_RES` twin at ±120 a notch; no horizontal wheel. Each button event is preceded by its `MSC_SCAN`, and each report closes with `SYN_REPORT`. The pinned QEMU, 10.2, has five buttons: `BTN_LEFT`, `BTN_RIGHT`, `BTN_MIDDLE`, and `BTN_SIDE` and `BTN_EXTRA` (usages 0x90004 and 0x90005), which the editor sends for the browser's back and forward buttons, as QEMU's own windows do; a focused Screen keeps those buttons from navigating the page. `EVIOCGKEYCODE` reaches hid-input's keymap of the five usages. (Corrected on 2026-10-31 from the pinned guest as booted ([x86-reference-guest.md](../research/x86-reference-guest.md)); first written for QEMU 10.0's three.)

1. **Coordinates run from 0 to 32767** across the whole display, whatever its size: QEMU reports ⌊x × 32767 ÷ width⌋. A program reads the range with `EVIOCGABS` and converts back with `(value × xres + 32766) ÷ 32767`. It learns to read `absinfo` rather than assume a range, which also works on touchscreens and graphics tablets. A program that skips the conversion draws a hundred times too far, off the Screen. QEMU's front-ends report whole pixels of the display, and the conversion gives back exactly that pixel; the positions are whole pixels on a zoomed Screen too (corrected while writing the Examples: positions finer than a pixel, first kept on a zoomed Screen, came back through the conversion as the next pixel, so a paint program's brush landed one pixel right of and below the pointer).
2. **x86 observes the Mouse as its current state and as pointer events.** The state is `EVIOCGABS`'s current values and the button bits of `EVIOCGKEY`; the events are moves, buttons and wheel notches in order with their times. There are no snapshots of the last button down and up, no double-click flag and no modifiers: a program times its own clicks and reads modifiers from the keyboard. [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)'s three views, the same in every environment, no longer bind x86.
3. **The event queue holds 4,096 events**, as the keyboard's does.
4. **The editor's edge behaviour stays** ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)): a drag that leaves the Screen pins each axis at the edge, a pointer that leaves with no button held keeps its last position, and losing focus releases the buttons. That is the host window's behaviour, not the guest's interface, and QEMU's own front-ends differ on it; a guest sees values in range either way.

A focused Screen keeps the wheel from scrolling the page.

Rejected: coordinates in the Screen's pixels, simpler to start with but a deviation, and a program that took the Screen's width as the range would draw wrong in QEMU.

## Input devices in a Testcase

Decided on 2026-10-31.

A **Testcase** scripts standard input only; scripting key and pointer events stays deferred, as for every Target, and drawing still runs.

1. **No event ever arrives.** `EVIOCGKEY` shows nothing held, and the tablet's current position is 0, 0, its value before any movement.
2. **A non-blocking read answers `EAGAIN`**, as on Linux.
3. **`poll` and `select` with a timeout wait on the virtual clock** and return 0, so a game loop that polls and redraws runs at full speed.
4. **A wait only a device could end stops the Testcase with a clear error**: a blocking read of an input device, or a `poll` or `select` without a timeout whose descriptors are all input devices. The message says the program waited for a key or the pointer and that a Testcase has none. Standard input needs no such rule, because **End of input** ends its reads.

Rejected: letting the wait run into the instruction limit (a blocked read executes no instructions, so it would need a wall-clock timeout, and the failure would point nowhere); blocking reads answering `EAGAIN` in a Testcase (a deviation that changes behaviour only under test).

## Input and Undo

Decided on 2026-10-31: [ADR 0069](../adr/0069-x86-journals-the-input-its-reads-take.md). Point 2 corrected after the review, which found the first version contradicting [ADR 0057](../adr/0057-restore-the-terminal-on-undo.md).

1. **Blink journals what each read of standard input or an input device takes**, so a read is no longer an Undo barrier. The queues live in the Core, which owns the semantics; the editor only delivers keys, lines and events into them.
2. **Undo follows ADR 0057.** A read that waited for typed input asks again: what it took is not put back, so a person can try another answer from the same point, and the Terminal's journal takes back its echo. What a read took without waiting for it, type-ahead and every evdev event, which no read asked for, goes back at the front of its queue, as a keystroke a polled device took does on the other Targets.
3. **`EVIOCGKEY`'s flush is journaled** too: Undo puts back the events it threw away. The state it answers is live: after Undo, `EVIOCGKEY` and `EVIOCGABS` answer the state as it is now.
4. **Opening a device and mapping the framebuffer stay barriers**, with every other descriptor and mapping change. A program does them once while starting.

Rejected: input reads as barriers (Undo would stop at the last frame of every interactive program); journaling evdev but not standard input (two kinds of read behaving differently under Undo); putting a waited-for line back (ADR 0057's rejected "replay the answer").

## What `/dev/dsp` accepts

Decided on 2026-10-31; the facts corrected after the review from `snd-pcm-oss`'s code.

1. **It opens at 8000 Hz, unsigned 8-bit, mono**, as `snd-pcm-oss` and the original OSS do.
2. **`SNDCTL_DSP_GETFMTS` answers `snd-pcm-oss`'s fixed mask**: μ-law, U8, S8, S16 and U16 in both byte orders, S24 in both orders and packed, S32 in both orders; no A-law. `SETFMT`, `SPEED` and `CHANNELS` write back what they set, and a program checks it: a format outside the mask becomes U8, a rate is clamped to 1000 to 192000 Hz, and 1 to 128 channels are accepted, of which the first two are played: `snd-pcm-oss`'s route plugin keeps channels 0 and 1 and drops the rest (corrected while implementing; first written as a mix-down).
3. **The editor resamples** the device's rate to the browser's output rate.
4. **The mixer ioctls work on the `/dev/dsp` descriptor** too, as OSS allows.
5. **Not covered:** recording, reading `/dev/dsp` (a microphone permission prompt in the middle of a run, and nothing to record in a Testcase; a feature of its own); `mmap` of `/dev/dsp`, `DSP_CAP_MMAP` and `GETOPTR` (the card would read the program's buffer behind its back at audio rate, and learners rarely need it; `SNDCTL_DSP_GETCAPS` leaves `DSP_CAP_MMAP` out, so a careful program falls back to `write`); `SETTRIGGER` and `SETSYNCRO`, useful only with `mmap`.

## `/dev/dsp`'s buffer and pacing

Decided on 2026-10-31; the default's size and the fragment behaviour added after the review.

A `write` copies samples into the device's buffer and blocks while it is full; the buffer drains at the sample rate, so a program that keeps writing is paced by its own sound. `O_NONBLOCK` gives partial writes and `EAGAIN`, `poll` reports `POLLOUT` once a fragment is free, `GETOSPACE`, `GETODELAY` and `GETBLKSIZE` report the buffer, `SYNC` waits until it has played, `RESET` drops it, and an underrun plays silence until the next write restarts it. Samples go to the card a whole fragment at a time, so a write shorter than a fragment stays silent until the fragment fills, `SYNC` or `close`.

1. **The device drains at its rate in Program time**, not on the browser's audio clock: blocking is deterministic, a Testcase drains it on the virtual clock, a muted run behaves the same, and a program cannot block forever on an AudioContext that is suspended or a sound engine that failed to load. The output, an AudioWorklet ring buffer, plays what the device has played a little behind and absorbs the drift between the two clocks.
2. **Pause and Breakpoints change nothing**: the device keeps draining and runs out into silence, as Notes and Sounds play on ([audio.md](./audio.md)).
3. **The buffer's size and every ioctl behave as `snd-pcm-oss` does on the guest's HDA card, its default included**: 32 fragments of 2 KiB at the default format, about 8 seconds of sound, because QEMU's codec runs only from 16 to 96 kHz and 8 kHz goes through the rate plugin, which halves the fragment; at 44.1 kHz 16-bit stereo 32 fragments of 16 or 32 KiB, about 3 or 6 seconds, depending on whether the rate was set before or after the format, since the kernel sizes a new setting through the previous plugin chain. `SETFRAGMENT` answers `EINVAL` once a fragment size or subdivision has been set, and changing a setting after sound is queued drops it, as the kernel does (corrected while implementing, from `pcm_oss.c`). The first sound Example calls `SETFRAGMENT`, as OSS games such as Quake and Doom's sound server did, and the Documentation explains buffer size against latency and why a short beep needs `SYNC`.

Rejected: a short default buffer as a deviation. Sound would answer at once even in a naive program, but a program that sounded right here would lag by seconds in QEMU and on real Linux.

## `/dev/dsp` in a Testcase, under Undo and at the end

Decided on 2026-10-31.

1. **In a Testcase the device is silent and keeps its timing.** It drains on the virtual clock: writes block, the clock advances and `GETODELAY` reports what is queued, so a program that times itself by its sound behaves under test as it does interactively. A blocked write is not a wait only a device could end, because the device drains by itself. This extends [audio.md](./audio.md)'s rule that a play-and-wait waits on the virtual clock.
2. **Undo restores the device's settings** (format, rate, channels, fragments) **and takes back the samples the undone instructions queued that have not played yet.** Nothing already heard is played again or taken back ([ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md)), and Program time does not rewind, so the buffer goes on draining. The queue and its drain live in Blink, journaled as input is ([ADR 0069](../adr/0069-x86-journals-the-input-its-reads-take.md)).
3. **An explicit `close` pads the last fragment and blocks until the buffer has played**, as `snd-pcm-oss`'s release does, so a program can wait for its sound that way.
4. **At `exit` the editor reports the end at once, and the rest of the buffer plays out.** On Linux the exit's own close waits for it, but nothing the program can observe depends on that.
5. **Stop drops the buffer at once**, as a fatal signal interrupts the drain on Linux.

Rejected: an always empty buffer in a Testcase, as [audio.md](./audio.md) has nothing ever playing; under test a program would race through its music with its clock near zero.

## The raw MIDI port

Decided on 2026-10-31; the card and the pacing changed after the review.

The port is `snd-virmidi`'s, pinned as ALSA card 1 after the HDA card, and FluidSynth in the guest plays what arrives.

1. **Both of Linux's paths exist**: ALSA's `/dev/snd/midiC1D0` and, through OSS emulation, `/dev/midi1`. The Documentation uses `/dev/snd/midiC1D0`, which works on real Linux without OSS modules. The booted guest also has OSS's `/dev/dmmidi1` (device 0) and `/dev/amidi1` and `/dev/admmidi1` (device 1), which behave as raw MIDI there, so they are the port here too; ALSA's minors are dynamic on Debian, so `midiC1D0` is 116:2, not the static scheme's 116:40 (corrected on 2026-10-31 from the pinned guest as booted, [x86-reference-guest.md](../research/x86-reference-guest.md)).
2. **It takes the whole MIDI byte stream**: notes, running status, program and controller changes, pitch bend, pressure, SysEx (GM System On, GS reset, Master Volume) and real-time bytes, which the synthesizer ignores. The engine already takes raw messages and SysEx (spessasynth's `sendMessage` and `systemExclusive`). The Gervill bank ([ADR 0058](../adr/0058-notes-play-on-the-bank-mars-plays-on-jdk-21.md)) stands in for FluidSynth's sound font, a documented difference of timbre only.
3. **Bytes reach the synthesizer at MIDI's 31,250 baud in Program time**, about 3,125 a second, behind a 4 KiB buffer and a `write` that blocks when it is full: a documented model, since the virtual card has no cable. It plays as hardware MIDI would, it is deterministic, and a runaway loop cannot post a hundred thousand note-ons at once, which the audio spike measured at about a second of the main thread ([audio-plan.md](./audio-plan.md)). `close` drains the buffer, as rawmidi's does.
4. **The rawmidi ioctls** (`PVERSION`, `INFO`, `DRAIN`, `DROP`, `STATUS`) answer as on the guest: `PVERSION` is 7.2's 2.0.5. Reading the port never yields a byte, because nothing plays into it; in a Testcase the input-device rules apply to it.
5. **The mixer does not touch MIDI.**

## The MIDI port under Undo, in a Testcase, at the end and between runs

Decided on 2026-10-31.

1. **Undo takes back what the undone writes did to the synthesizer**: the notes they started stop, the notes they ended do not start again ([ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md)), the channel settings they changed go back (program, controllers, pitch bend, master volume), and their bytes still waiting in the buffer are taken back.
2. **In a Testcase the synthesizer is silent and the port keeps its timing**: bytes pass at 31,250 baud on the virtual clock, as `/dev/dsp` drains on it.
3. **At the end of the program the buffer is sent and then every held note is released**, fading through its release. FluidSynth rings on until told otherwise; this is a documented deviation, the rule the Synth and the Z80's sound chip follow ([waveform-sound.md](./waveform-sound.md)).
4. **The synthesizer is reset at every Build and Run**, GM System On, so every run starts from General MIDI's defaults; FluidSynth keeps a previous program's settings. A documented deviation, matching the Synth, which is zero at Build, and giving a Testcase a known start. A program's own reset still works.
5. **Stop drops the buffer and silences everything at once** (All Sound Off). **Pause and Breakpoints change nothing**: held notes sound on and the buffer keeps going out.

Rejected: notes held past the end until Stop or the next Run (faithful, and it teaches sending note-offs, but an organ note droning after the program has ended sounds broken); settings carried over between runs (a program would sound different depending on what ran before it).

## The PC speaker

Decided on 2026-10-31; details corrected after the review.

Linux's `pcspkr` driver makes the speaker an input device a program writes to: an `EV_SND` `SND_TONE` event with a frequency in Hz starts a square wave and 0 stops it; `SND_BELL` with any value but 0 sounds 1000 Hz until a 0 stops it. A tone sounds only between 20 and 32767 Hz, at the frequency the timer can make, 1193182 ÷ ⌊1193182 ÷ f⌋. It needs no VT, so it sounds from the serial console.

1. **The pinned guest has the speaker** (QEMU's `pcspk-audiodev`, the `pcspkr` driver rather than ALSA's `snd-pcsp`): it is in `/dev/input` at its real number as "PC Speaker", with its identity and its link `/dev/input/by-path/platform-pcspkr-event-spkr`, which the Documentation opens.
2. **`/dev/tty0` drives the same speaker** with `KIOCSOUND` and `KDMKTONE`, as root can in the guest.
3. **The mixer does not touch it**: on real hardware it is a speaker of its own.
4. **It follows the Synth's rules** ([waveform-sound.md](./waveform-sound.md)), as a tone chip with one register: Undo puts the tone back as it was, sounding it again if need be, the exception the Synth's gates make to [ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md); Pause changes nothing; silent in a Testcase; silenced at the end of the program, by Stop and at every Build and Run.
5. **It plays through the Synth's worklet** as a pulse voice at half width, so it needs no engine of its own.

Why: one 24-byte `write` is the smallest real sound an x86 program can make, the first sound lesson before OSS's setup.

Rejected: leaving it out because OSS and MIDI cover sound (a small device saved, the one-write sound lost).

## Headers for C and constants for NASM

Decided on 2026-10-31: [ADR 0070](../adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md); where they live settled while planning.

x86 `<sim.h>` already has a function for every system call these devices need (`sim_open`, `sim_read`, `sim_ioctl`, `sim_mmap`, `sim_poll`, `sim_select`) but no constants or structures, and the Runtime library had no POSIX headers.

1. **Headers shaped like the kernel's**, under their real names: `<linux/fb.h>`, `<linux/input.h>` with the event codes, `<linux/soundcard.h>` and `<sys/soundcard.h>`, the raw MIDI part of `<sound/asound.h>`, and `<sys/time.h>` for the `struct timeval` in `struct input_event`. Our own, generated from one table, and tested against the kernel's UAPI headers for sizes, offsets and values.
2. **The POSIX calls device programs make**, the C library's way (-1 and `errno`): `read`, `write`, `close`, `usleep`, `open`, `ioctl`, `mmap`, `munmap`, `poll`, `tcgetattr`, `tcsetattr`, `cfmakeraw`, `nanosleep`, `clock_gettime`.
3. **NASM include files from the same table**, at a read-only Runtime path (`%include "linux/fb.inc"`): `%define` constants and `struc` layouts under the kernel's names.
4. **They are header-only and x86-only, as `<sim.h>` is**: uploaded with x86 compiles alone, in an x86 directory searched before the Runtime library's shared one, the POSIX calls `static inline` over the system call. The shared, ABI-versioned Runtime library would otherwise make every function a member on every Target with a corpus run on each. `errno.h` gains Linux's values for the codes the devices return; x86's `<time.h>` additions come through the x86 directory.

Rejected: constants and structures only, with `<sim.h>` for the calls (C from tutorials needs translating and C written here does not build on Linux); the kernel's UAPI headers copied (GPL-2.0 files in the Runtime library, and thousands of unused lines); the POSIX calls as Runtime library members (every Target would need them).

## The Screen is always there

Decided on 2026-10-31.

Every x86 Debug session has a Screen section, as every other Target's does: it folds and remembers whether it is folded, Playgrounds keep it hidden until Build, and the Display section configures it. Seeing it is how a learner finds out that an x86 program can draw. The Screen's focus hint says that its keys and pointer go to the program's input devices, not to standard input ([ADR 0068](../adr/0068-x86-programs-run-on-a-serial-console.md)).

**Escape is the program's on x86** (decided on 2026-10-31, while implementing): a focused x86 Screen hands Escape to the program as `KEY_ESC`, since games quit on it, and Shift+Tab or a click elsewhere releases the Screen, as in the Terminal's raw mode; the focus hint says so. On every other Target Escape still releases the Screen, since their programs never asked for it.

Rejected: the Screen appearing the first time a program opens `/dev/fb0` or an input device and staying for that Program (keeps it out of the many x86 sessions that never draw, but hides that drawing is possible); only when the program asks with an `@screen` comment or a Display choice (a program that opens `/dev/fb0` without it would draw where nobody sees, and the reference has no such switch).

## The pinned guest

Settled while planning and after the review; M0 booted it on 2026-10-31 and recorded what its devices answer ([x86-reference-guest.md](../research/x86-reference-guest.md), the fixture `packages/asm-editor/scripts/reference-guest/facts.txt`). As booted, which corrects what was written before (the dated parts):

- **Software**: QEMU 10.2.1 with the versioned machine type `pc-q35-10.2`, under TCG (first written as QEMU 10.0 and `pc-q35-10.0`; the host's QEMU, settled by the owner). Debian 13's `nocloud` image, build 20261026-2643, with the full `linux-image-amd64` and udev and no cloud-init (first written as the generic image); its first boot takes root's password and the timezone from SMBIOS credentials (`io.systemd.credential:passwd.plaintext-password.root` and `firstboot.timezone`), since systemd-firstboot locks root when its prompt is skipped. **Linux 7.2.11** from trixie-backports (`7.2.11+deb13-amd64`, `CONFIG_HZ=250`), the newest there on the day: a statement of this record that names Linux 6.12 for the guest means 7.2 (corrected on 2026-10-31).
- **QEMU's devices**: the default VGA (bochs), `vmport=off` so the PS/2 mouse is not taken for VMware's, `qemu-xhci` at 00:04.0 (its address is part of every USB link), `-device usb-tablet` on its port 1, `pcspk-audiodev`, `intel-hda` (ICH6) at 00:05.0 with `hda-duplex`, and `-device usb-audio` on port 2 of the same controller, FluidSynth's own card (added on 2026-10-31, see "The machine behind the devices"). All sound goes to one `wav` audiodev, which the probe analyses.
- **The kernel command line**: `console=ttyS0 fbcon=map:1 video=320x240M drm_kms_helper.drm_fbdev_overalloc=200 snd_hda_intel.index=0 snd_virmidi.index=1 snd_usb_audio.index=2`. `console=ttyS0` and not Debian's `console=tty0`; `fbcon=map:1` so the framebuffer console never draws on `/dev/fb0`; **`video=320x240M`**, a CVT mode, because Linux 7.2 refuses the GTF mode a bare `video=320x240` asks for (corrected on 2026-10-31); the ALSA cards 0 (HDA), 1 (virtual MIDI) and 2 (USB). `snd-pcm-oss`, `snd-mixer-oss`, `snd-virmidi` and `pcspkr` loaded, `snd-pcsp` blacklisted, and `snd-usb-audio` loaded only once card 0's control device exists, so ALSA's dynamic minors are the same at every boot.
- **In the guest**: root logged in on `ttyS0` by agetty (`--autologin root --keep-baud 115200,57600,38400,9600`), which leaves the line at 9600 baud; FluidSynth with Debian's GM sound font as a system service on card 2, at gain 1.0, connected to the four virtual MIDI ports; the mixer at `alsactl init`'s levels at every boot (no state kept); no timers or upgrades.
- **Recorded by booting it**, all now in the Core: `/dev/input` in order with every discovery ioctl's answer, the udev links and `/proc/bus/input/devices`; the tablet's events and its value before any movement; what `FBIO_WAITFORVSYNC` and `FBIOPAN_DISPLAY` do on 7.2; the smallest `video=` size (8×8); `/dev/dsp`'s defaults and `GETOSPACE`; the mixer's channels and defaults; every node's `st_rdev`. Where the Core still answers otherwise, the research record lists the rows and why.

## Deferred

- The program on the VT, `tty1`, with the Screen as its console, as a Program setting ([ADR 0068](../adr/0068-x86-programs-run-on-a-serial-console.md)).
- Recording from `/dev/dsp`, `mmap` of `/dev/dsp`, and their trigger ioctls.
- `epoll`, `O_ASYNC` and `SIGIO`.
- Scripting key and pointer events in a Testcase, as for every Target.
- Journaling descriptor and mapping changes, so that opening a device or mapping the framebuffer stops being an Undo barrier.

## Records this changes

- [screen-peripherals.md](./screen-peripherals.md) and [audio.md](./audio.md) left x86 out; they point here.
- [workbench.md](./workbench.md): the debug strip names "Screen" on x86 too.
- ADRs [0008](../adr/0008-poll-keyboard-and-mouse-input.md), [0009](../adr/0009-share-screen-keyboard-input-with-terminal.md), [0029](../adr/0029-hosted-programs-link-an-editor-owned-runtime-library.md), [0035](../adr/0035-environments-match-their-reference.md) and [0057](../adr/0057-restore-the-terminal-on-undo.md), and decision 7 of [environment-library-plan.md](./environment-library-plan.md), carry dated notes; ADRs 0067 to 0070 are new.
- `keyCodes.ts` still says every environment uses EASy68K's key codes.
