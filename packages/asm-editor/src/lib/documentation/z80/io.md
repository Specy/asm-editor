## Ports

A Z80 has no system calls. Programs reach the outside world with `in` and `out`, which address one of 256 ports: `out (n), a` sends A to port `n`, `in a, (n)` reads a byte back. The `(c)` forms (`out (c), r` and `in r, (c)`) take the port number from C, which lets a program compute it, and put B on the high byte of the address bus. For a parameterized read, set B to the documented key code, mouse view, clock-byte index, wait duration or pitch before `in`.

The emulator connects the ports below to the Terminal, Screen, keyboard, mouse, program clock, and Audio. Every other port behaves like an empty bus: writes are dropped and reads answer `0xFF`. Reads from console ports `0x10`–`0x14` wait for input; `0x50` waits for its requested delay, `0x51` waits for the next frame, and `0x61` plays a note and waits for its requested duration. Keyboard-state, mouse, clock-now, and other status reads return immediately, so they can be polled in a loop. Invalid console number input stops the program with an error.

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

## Sound {#sound}

The audio ports play notes with a pitch, instrument, volume, and duration. General MIDI is a standard list of instrument sounds; instrument numbers here start at **0**, with 0 for acoustic grand piano, 40 for violin, 56 for trumpet, and 73 for flute. No MIDI file or external instrument is needed. Each increase of 1 in pitch moves up one semitone (one piano-key step, counting white and black keys): 60 is middle C, 62 is D, 64 is E, and 67 is G.

For tones, noise and volume envelopes controlled through registers, the [Sound chip](#sound-chip) at ports `0xA0` to `0xA2` is an emulated AY-3-8910 with three square-wave channels, noise and an envelope. A program can use the audio ports, the Sound chip, or both.

At most 64 notes sound at once; starting another stops the oldest. The editor supplies a General MIDI sound bank, a collection of instrument sounds. The browser loads it automatically on the first note or MIDI-file request after opening or reloading the editor page; that request waits for loading. The bank is shared across later runs and projects.

After a program requests sound, the **Sound** button appears in the execution dock as a mute/unmute control. It sets **Play sound** in **Preferences**, where **Sound volume** is also available. Both settings apply across projects. Muting leaves program-visible timing and results unchanged.
