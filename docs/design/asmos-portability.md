# asmOS portability

Status: decided in a discussion with the owner on 2026-11-03; nothing implemented. The Input controller it depends on was decided on 2026-11-03 ([input-controller.md](./input-controller.md)); stage 2 is still open (see Open).

## What it is

asmOS is the C desktop OS example on the x86 Target (`packages/asm-editor/examples/x86/desktop/desktop.asmproj`). It has a window manager, processes, around fifteen apps and DOOM, and reaches the machine through Linux's device files. The port makes it run on the MIPS and RISC-V Targets too, and later on M68K, from one source tree.

## Starting point

- **What is Linux-specific.**
    - `os/main.c`: the framebuffer (`/dev/fb0`, mmap).
    - `os/input.c`: the keyboard and the tablet (evdev).
    - `os/sound.c` and the PCM half of `os/kernel.c`: MIDI (`/dev/snd/midiC1D0`) and sampled sound (`/dev/dsp`).
    - `os/kernel.c`: preemption, through `setitimer` every 10 ms, a `SA_SIGINFO` handler that swaps the signal frame's general registers and fxsave area, and `SIGUSR2` to yield. Also folders (`opendir`, `unlink`, `rmdir`, `rename`, `mkdir`).
    - `os/blit.asm` and DOOM's NASM wrappers.
    - **Linux key codes in the shared API.** `Message.key` and `os_key_down` take Linux's `KEY_*` codes (`os/os.h`), and 29 shared files use them: the window manager, the dialogs, the apps and DOOM. MARS and RARS have no `<linux/input.h>`.

    The window manager, drawing, dialogs and apps, about 30,000 lines, are plain C. asmOS already sizes itself from the framebuffer it gets (`screen_w`, `screen_h`).

- **MARS and RARS today.**
    - **Compiling C:** works, through the Runtime library and `<sim.h>`.
    - **Screen:** `SIM_SCREEN` gives a display of up to 1024 × 1024 whose words are `0x00RRGGBB`, asmOS's pixel format already.
    - **Memory:** static data and the heap share 4 MB (0x10010000 to `dataSegmentLimitAddress`, 0x10400000; `allocateBytesFromHeap` refuses past it). The text segment is another 4 MB.
    - **Keyboard:** programs see only the typed-character queue: printable keys plus Enter, Tab and Backspace. No arrows and no key-up; Ctrl and Meta are dropped (`typedCharacterFromEvent`). Escape never reaches the program: it releases the Screen's focus on every Target but x86 (`ScreenRenderer.svelte`).
    - **Mouse:** none mapped. The Screen already feeds the editor's key state (arrows, Ctrl and Meta included) and its Mouse on MIPS and RISC-V; `MarsDevices` just maps neither into memory.
    - **Interrupts:** setting an interrupt-enable bit stops the program ([screen-peripherals.md](./screen-peripherals.md)).
    - **Files:** open, read, write, lseek and close, no folders.
    - **Speed:** about 4,800 (RARS) and 7,000 (MARS) instructions per ms in the editor, with no `rep stosd`.
- **s68k today.**
    - No C compilation. Its blockers were collected in the terminal on 2026-10-21 and re-checked on 2026-11-01; there is no design doc yet.
    - Drawing traps but no framebuffer.
    - It does have the mouse (task 61), key state (task 19), folders (tasks 50 to 59) and 16 MB of memory.
    - It is big-endian.

## Decisions

1. **Staged.**
    - **Stage 1 is a teaching port.** A platform layer, and MIPS and RISC-V ports on today's Cores plus one extension (2). The platform files are the part worth reading: how each machine draws, reads input, switches context and keeps time.
    - **Stage 2 adds Core extensions** until the ports reach parity with x86.

    Rejected:
    - teaching only, which leaves the weaker Targets reduced for good;
    - parity from the start, which would commit to Core extensions before the first port shows which ones are worth it (32-bit pointers, speed at 640 × 480, the 4 MB limit).

2. **Stage 1 adds input registers to MARS and RARS.** Mouse position and buttons, and key down and up including arrows, in a memory-mapped block, as an editor extension like the Synth at 0xffff0100. The editor already has the Mouse and key-state models for M68K and the Port map; MIPS and RISC-V do not map them.

    Rejected: a keyboard-only asmOS on unchanged Cores. It is a different OS, and every app would need a keyboard path that stage 2 throws away.

    This is the **Input controller**, grilled on its own on 2026-11-03: [input-controller.md](./input-controller.md) and [ADR 0071](../adr/0071-mips-and-risc-v-read-the-keyboard-and-mouse-through-an-input-controller.md), with a dated note on [ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md). Escape is no longer the Screen's release key on any Target: Shift+Tab is.

3. **640 × 480 on every Target.** The app layouts stay identical, so the differences live in the platform layer. On MIPS and RISC-V in stage 1:
    - the framebuffer takes 1.2 MB of the 4 MB;
    - asmOS composites straight into it, with no back buffer;
    - the wallpaper is a colour or pattern instead of the picture;
    - process stacks shrink from 256 KB to about 32 KB (the stack size becomes a platform constant).

    That leaves room for about four or five open windows. A full redraw costs about 1M instructions, roughly 0.2 s on RARS, while most interactions redraw small rects. The fallback, if measurements disappoint, is 512 × 384, which costs layout fixes only. Stage 2's bigger memory brings back the back buffer and the wallpaper.

    **The risk to measure first** is the editor's cost of reading the framebuffer back out of the Core, not the program's drawing. That read-back took 47% of the wall clock at 256 KB a frame (the `DIRTY_BLOCK_WORDS` comment in `MarsDevices.ts`), and 640 × 480 is 1.2 MB. A redraw that size may also outrun the Undo history. If it does, MARS/RARS native dirty tracking, deferred in the speed-up plan, becomes a prerequisite rather than a later improvement.

    Rejected: 320 × 240 at unit 2, which would make most of the UI code and the 8 × 13 font no longer fit.

4. **Preemptive where the machine has a timer, cooperative elsewhere.** The kernel supports both. The platform layer says whether there is a timer, and supplies the context switch: x86 keeps its signal-frame swap, and each cooperative machine gets a short assembly routine saving the callee-saved registers and the stack pointer. Every app gets yield points in its long loops (frame loops, flood fill, run slices, Terminal commands). They are required on a cooperative machine and nearly free on a preemptive one. asmOS's DOOM build had a cooperative mode once, so the kernel side is known ground.

    In stage 2 both MIPS and RISC-V become preemptive, through their own conventions rather than an invented device:
    - **MIPS:** MIPS32's CP0 Count (`$9`) and Compare (`$11`), raising Cause IP7. MARS's Core already has `$8`, `$12` Status, `$13` Cause and `$14` EPC, the `.ktext` handler at 0x80000180, `eret`, and the Simulator's external-interrupt hook.
    - **RISC-V:** RARS's Timer Tool (mtime at 0xFFFF0018, mtimecmp at 0xFFFF0020) through `utvec`. The RARS Core already has `InterruptController` and the user-level interrupt CSRs.

    Rejected: cooperative everywhere. One scheduler, but it gives up the contrast between a Linux signal frame and a RISC-V trap handler, the best teaching material the port has.

5. **One archive per Target.** asmOS (x86), asmOS (RISC-V) and asmOS (MIPS) are packed from one source tree laid out as shared `os/` plus `os/platform/<target>/`. Each archive carries its own Compiler Explorer outputs and Build output. No editor change.

    Rejected for now: one archive with a Program per Target. It needs a Target per Program, which [programs.md](./programs.md) deferred, and would amend [ADR 0054](../adr/0054-a-project-holds-programs-identified-by-their-entry-file.md). The source tree is the same either way, so that remains a packing change if it is built later.

6. **M68K waits for its own C compilation.** It is ported after M68K C compilation exists, which gets its own grill, and it will also need a framebuffer in s68k. Rejected: designing M68K C compilation as a stage of this port, which would shape it around one program. Until then the portable code reads files through little-endian helpers (`read_le16`, `read_le32`) in the BMP, WAV, MIDI and font readers, so the first big-endian Target finds nothing to fix there.

## Order of work

1. Merge the assembly IDE app into the asmOS source tree. It was built separately as an app (2026-11-03, `.cache/asmos-ide-source`): RV32IM, RARS-compatible, its own compiled unit. It ports with the rest.
2. Build the platform layer on x86 with no behaviour change, checked with harness screenshots and DOOM's demo checksum. This includes:
    - the yield points;
    - the little-endian helpers;
    - per-Target stack sizes;
    - a check for 64-bit assumptions, since the other Targets are ILP32;
    - a `KEY_*` header of asmOS's own and, in the MIPS/RISC-V platform file, a table from HID usages to `KEY_*`, as Linux's HID driver has. The driver also resynchronises its key state from the controller's bitmap on a dropped record; asmOS ignores Linux's `SYN_DROPPED` today.
3. Implement the Input controller (2), alongside step 2, after measuring the framebuffer read-back at 640 × 480 (decision 3).
4. Port to RISC-V, then MIPS.
5. Stage 2.

## Open

- **Stage 2:**
    - whether the timers tick on Program time ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)) or on instruction count;
    - a larger memory configuration for MARS and RARS;
    - folder calls (list, mkdir, unlink, rename);
    - whether DOOM comes to MIPS and RISC-V. It needs more than 4 MB.
- **Where the shared source tree lives.** At the owner's request, asmOS's sources exist in the repository only inside the archive. A tree that is packed into three archives needs a home of its own.
