---
status: accepted
date: 2026-10-31
---

# x86 programs run on a serial console

Amends [ADR 0009](./0009-share-screen-keyboard-input-with-terminal.md) for x86.

In the QEMU guest that x86's devices follow ([ADR 0067](./0067-x86-devices-follow-a-qemu-guest.md)), a program's tty is the serial line `ttyS0` (`console=ttyS0`), and the machine has no framebuffer console. The **Terminal** is that serial line. `/dev/fb0` belongs to the program alone, and nothing else draws on it. Keys typed into the focused **Screen** reach the evdev keyboard and never standard input. Keys typed into the Terminal reach standard input and never evdev. The console ioctls (`KDSETMODE`, `KDSKBMODE`, `KIOCSOUND` and the rest) answer `ENOTTY`, as they do on any tty that is not a VT. QEMU's own window shows the same split: its "VGA" and "serial0" views each take the keys while focused.

ADR 0009 therefore does not hold on x86. A program waiting in `scanf` gets nothing from keys typed into the Screen. The Screen's focus hint says where its keys go, and the x86 Documentation says it too.

Running the program on the VT, `tty1`, with the Screen as the console, stays possible as a later **Program** setting. It would need a Linux console emulator following `console_codes(4)` that draws into the framebuffer as fbcon does (blinking cursor included), the kernel keyboard handler with `KDSKBMODE`'s modes, `KDSETMODE`, a font that only looks like the kernel's (its VGA 8x16 is GPL-2.0-only, which this AGPL-3.0 editor cannot include), and Undo for pixels the host writes outside any instruction. Everything built for the serial console carries over to it.

## Considered options

- The VT now: one window as on a real console and in EASy68K, with `printf` showing on the Screen and ADR 0009 kept. But most of its cost is text the Terminal already shows well, and its first effect on a learner is a pitfall: a program that draws without `KD_GRAPHICS` has its pixels overwritten by scrolling text and the cursor.
- The serial console with the Screen's keys also fed to standard input, keeping ADR 0009: cheap, but QEMU never does it, and every key a game moves with would wait in standard input for the next `scanf`.
