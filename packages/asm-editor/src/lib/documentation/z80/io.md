## Ports

A Z80 has no system calls. Programs reach the outside world with `in` and `out`, which address one of 256 ports: `out (n), a` sends A to port `n`, `in a, (n)` reads a byte back. The `(c)` forms (`out (c), r` and `in r, (c)`) take the port number from C, which lets a program compute it, and put B on the high byte of the address bus, which is how a read carries a parameter: the key code, the mouse view, the byte of the clock, the length of a wait.

The emulator connects the ports below to the Terminal, Screen, keyboard, mouse, and program clock. Every other port behaves like an empty bus: writes are dropped and reads answer `0xFF`. Reads from console ports `0x10`–`0x14` wait for input; `0x50` waits for its requested delay and `0x51` waits for the next frame. Keyboard-state, mouse, clock-now, and other status reads return immediately, so they can be polled in a loop. Invalid console number input stops the program with an error.

The character port `0x10` reads a Terminal line one byte at a time, ending it with newline `0x0A` when you press Enter. Once the program uses a Screen, Keyboard or Mouse port, character input comes from the focused Screen one keystroke at a time; Enter still gives the character port `0x0A`. The last-key ports report the EASy68K Enter **key code** `0x0D`. Click the Screen to focus it before typing.

For example, `ld c,0x30` / `ld b,0` / `in a,(c)` polls whether a key is waiting; the returned `A` is 1 or 0. To wait for a character, `in a,(0x10)` pauses until input is available, then returns the character in `A`. With the `(c)` form, `C` selects the low-byte port and `B` supplies the high address byte; for parameterized reads, set `B` to the documented parameter before `in`.

## Screen commands

Written to the command port, `0x27`. One write runs one operation on the coordinates and colors already set.

## The TRS-80 display

Command `14` switches the Screen to the TRS-80 memory-mapped text display. A program can select this mode before it starts with a `; @screen trs80` comment. Drawing commands are unavailable in this mode, and console output goes only to the Terminal: display text by storing bytes in the mapped memory below.

{memory}

Port `0x00` is the joystick input; with no joystick attached, reading it returns `0xFF`.

Characters `0x20` to `0x7F` are text. Characters `128` to `191` are 2 by 3 blocks of chunky pixels — the low six bits are the blocks, bit 0 top-left then across and down — so the screen is also a 128 by 48 pixel grid. `191` is solid and `128` is blank.

{keys}

## Colors

A color is one byte: three bits of red in bits 7-5, three of green in bits 4-2 and two of blue in bits 1-0. Each field is stretched over the screen's eight bits by repeating it, so `0xFF` is white and `0xE0` pure red.

## Mouse views

Put one of these in B before reading a mouse port.

{views}

The editor-defined `TIME_NOW` port retains elapsed hundredths since the run started, as specified by its port map. It is not a calendar clock.
