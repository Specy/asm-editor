---
status: accepted
date: 2026-10-31
---

# The x86 Runtime library offers the Linux device interfaces

Widens [ADR 0029](./0029-hosted-programs-link-an-editor-owned-runtime-library.md) on x86 beyond the C standard library.

An x86 program reaches its Screen, Keyboard, Mouse and sound through Linux's device files ([x86 devices](../design/x86-devices.md)). To program them in C it needs the kernel's structures and constants and the POSIX calls that open, control and map a device, none of which a C standard library has. Every x86 compile therefore gets, beside the **Runtime library**'s headers:

- **Headers shaped like the kernel's**, under their real names: `<linux/fb.h>`, `<linux/input.h>` with the event codes, `<linux/soundcard.h>` and `<sys/soundcard.h>`, the raw MIDI part of `<sound/asound.h>`, and `<sys/time.h>`. They use the kernel's structure, field and constant names and contain only what the design covers. They are written for the editor, not copied, generated from one table as `<sim.h>` is, and a test checks their sizes, offsets and values against the kernel's own UAPI headers.
- **The POSIX calls those programs make**, returning -1 and setting the Runtime library's `errno` as a C library does: `read`, `write`, `close` and `usleep` in `<unistd.h>`, `open` in `<fcntl.h>`, `ioctl` in `<sys/ioctl.h>`, `mmap` and `munmap` in `<sys/mman.h>`, `poll` in `<poll.h>`, `tcgetattr`, `tcsetattr` and `cfmakeraw` in `<termios.h>`, and `nanosleep` and `clock_gettime` in `<time.h>`.
- **NASM include files generated from the same table**, at a read-only Runtime path as `<sim.h>` is (`%include "linux/fb.inc"`): `%define` constants and `struc` layouts under the kernel's names.

They are **header-only and x86-only, as `<sim.h>` is**: uploaded with x86 compiles alone, from an x86 directory searched before the Runtime library's shared one, the POSIX calls `static inline` over the system call. The Runtime library's own headers and members are shared by every **Target** and versioned in its ABI, and every function it documents needs a member on every Target and a corpus run on each; none of that fits calls that only x86 has. The shared `errno.h` gains Linux's values for the codes the devices return, which every Target can name.

Tutorial code for fbdev and evdev then compiles unchanged, and so does C written here that should also build on real Linux. `<sim.h>`'s functions stay, for a program that wants the bare system call and the kernel's negative error numbers.

## Considered options

- Constants and structures only, with `<sim.h>`'s functions for the calls: the smallest addition, but C written here would not compile on Linux, and code from tutorials would need translating first.
- The kernel's UAPI headers copied as they are: exact, but GPL-2.0 files inside a library under the AGPL with a linking exception, and thousands of lines the design does not use.
- The POSIX calls as Runtime library members: one library for everything, but every Target would need each call, its member and its corpus run.
