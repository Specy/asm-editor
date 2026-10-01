## Ports

A Z80 has no system calls. Programs reach the outside world with `in` and `out`, which address one of 256 ports: `out (n), a` sends A to port `n`, `in a, (n)` reads a byte back. The `(c)` forms (`out (c), r` and `in r, (c)`) take the port number from C, which lets a program compute it, and put B on the high byte of the address bus, which is how a read carries a parameter: the key code, the mouse view, the byte of the clock, the length of a wait.

The emulator connects the ports below to the terminal, the screen, the keyboard, the mouse and the clock. Every other port behaves like an empty bus: writes are dropped and reads answer `0xFF`. Reading a connected port with nothing to read pauses the program until there is something, so `in` never fails, it only waits.

## Screen commands

Written to the command port, `0x27`. One write runs one operation on the coordinates and colors already set.

## The TRS-80 display

Command `14` switches the screen to the memory-mapped display of the TRS-80, the machine this Z80 emulator descends from — the one graphics interface here that programs written elsewhere already target. A program can also ask for it before it starts, with a `; @screen trs80` comment, which is what a program brought in from outside needs. The drawing commands above are not available in this mode, and console output goes only to the terminal: on this machine, printing _is_ storing a byte.

{memory}

Port `0x00` is the machine's joystick, and the reason the ports above start at `0x10`: nothing of this editor's is mapped there, so a program's joystick poll reads an empty bus floating high — `0xFF`, exactly what the machine answers with none attached. While the character port lived at `0x00` that poll stopped the program to wait for a line nobody was typing. Everything else the machine decodes is at `0x75` or above, clear of this map entirely.

Characters `0x20` to `0x7F` are text. Characters `128` to `191` are 2 by 3 blocks of chunky pixels — the low six bits are the blocks, bit 0 top-left then across and down — so the screen is also a 128 by 48 pixel grid. `191` is solid and `128` is blank.

{keys}

## Colors

A color is one byte: three bits of red in bits 7-5, three of green in bits 4-2 and two of blue in bits 1-0. Each field is stretched over the screen's eight bits by repeating it, so `0xFF` is white and `0xE0` pure red.

## Mouse views

Put one of these in B before reading a mouse port.

{views}
