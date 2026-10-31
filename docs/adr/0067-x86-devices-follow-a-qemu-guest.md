---
status: accepted
date: 2026-10-31
---

# x86 devices follow a QEMU guest

Amends [ADR 0035](./0035-environments-match-their-reference.md) for x86, whose **Reference environment** was a Linux process on a tty.

An x86 program reaches the **Screen**, **Keyboard**, **Mouse** and **Audio** through the Linux kernel's device files: fbdev, evdev, OSS, raw MIDI and the PC speaker. Those interfaces say what a program may ask, but not what it gets back. The pixel format, the screen size, whether the pointer is absolute and the names the devices give all come from the machine. The machine is an x86-64 QEMU guest running Linux, logged in as root on its serial console, with ALSA's virtual raw MIDI card played by FluidSynth, and the devices behave as they do there. Rule 1 of ADR 0035 is judged against it: a static binary built here can boot in that guest, so a disputed detail is settled by running it, as MARS's jar settles a MIPS one. The guest is pinned to one configuration (QEMU's version and machine type, the distribution and kernel, the devices and the kernel command line), because details such as the order of `/dev/input` devices and the tablet's buttons depend on it; [x86-devices.md](../design/x86-devices.md) records it.

QEMU fits for reasons beyond being checkable. It is x86. Its USB tablet reports absolute positions because a VM's window is a canvas inside a host window, which is also how a program's Screen sits in the editor. Its display goes through DRM's fbdev emulation, so the machine sets the screen size and the program reads it, as MARS's Bitmap Display does.

A General MIDI module on a USB-MIDI cable was the first choice for Notes. QEMU emulates no USB-MIDI device, and its own sound cards (an AdLib, a Gravis Ultrasound, HDA) have no General MIDI synthesizer, so that machine could not be booted. `snd-virmidi` gives the same `/dev/snd/midiC1D0` a hardware interface gives, and FluidSynth inside the guest plays it (changed on 2026-10-31, after the design's review).

## Considered options

- An unnamed Linux PC console: the same interfaces, but no machine to settle a question, so every detail the interfaces leave open would be decided by taste.
- A Raspberry Pi: the usual machine for framebuffer programming, but ARM.
- DOS and the BIOS (mode 13h, `int 16h`, `int 33h`, PC speaker): the classic x86 graphics convention, but a 16-bit real-mode machine and not the Linux process x86 programs here are. That would be a separate **Target**.
- A physical USB-MIDI interface passed through to the guest: real, but nobody can check the reference without owning the hardware.
