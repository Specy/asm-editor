# asmOS portability

Status: decided in a discussion with the owner on 2026-11-03, and stage 1 implemented the same day, all uncommitted:

- **editor:** branch `feat/asmos-stage1`, worktree `.cache/wt/stage1`;
- **Cores:** `.cache/wt/stage1-{mips,risc-v,x86}` on `feat/stage1`;
- **asmOS:** `asm-examples/shared/asmos/`.

See "Stage 1 record" below.

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

    **Measured on 2026-11-03** in the editor, with plain assembly that sleeps 16 ms a frame (scratch results; numbers are Undo on / off):
    - **A full 640 × 480 redraw** is about 0.92M instructions and runs at 2.5 to 4.4 frames a second. That is 0.25 to 0.4 s a redraw, not 0.2 s, because drawing code runs at 2.3 to 4 million instructions a second.
    - **A 300 × 200 window copy** runs at 8 to 13 frames a second.
    - **A moving 32 × 32 sprite** runs at 35 to 45.
    - **512 × 384 helps only full redraws** (1.3 to 2 times faster). Window copies and the sprite cost the same at both sizes, so 640 × 480 stays.
    - **The main cost is the Core's per-store framebuffer observer**, a Java-to-JavaScript crossing on every store: 55 to 65% of the Core's time. Reading the framebuffer back costs 6 to 13% of the wall clock, not the 47% feared. Removing the observer would give 1.5 to 2 times.
    - **Native dirty tracking is therefore a later improvement, not a prerequisite.** The cheaper levers come first:
        - asmOS's MIPS and RISC-V Programs ship with Undo off (1.3 to 1.8 times);
        - asmOS redraws only damaged rects, with tight copy loops;
        - row-aware dirty runs in the editor;
        - a bulk word read in the Cores.
    - **A full redraw outruns the Undo history** (200,000 steps, about 22% of a frame on MIPS and 11% on RISC-V). This is harmless: the oldest steps drop and the run is unaffected.
    - **The memory budget must count asmOS's process table**, about 0.8 MB even on ILP32, mostly 32 processes' 128-entry message queues. On MIPS and RISC-V the platform layer lowers the process count and queue size, and takes process stacks from the far end of the 4 MiB stack segment instead of the heap.

    Rejected: 320 × 240 at unit 2, which would make most of the UI code and the 8 × 13 font no longer fit.

4. **Preemptive where the machine has a timer, cooperative elsewhere.** The kernel supports both. The platform layer says whether there is a timer, and supplies the context switch: x86 keeps its signal-frame swap, and each cooperative machine gets a short assembly routine saving the callee-saved registers and the stack pointer. Every app gets yield points in its long loops (frame loops, flood fill, run slices, Terminal commands). They are required on a cooperative machine and nearly free on a preemptive one. asmOS's DOOM build had a cooperative mode once, so the kernel side is known ground.

    In stage 2 both MIPS and RISC-V become preemptive, through their own conventions rather than an invented device:
    - **MIPS:** MIPS32's CP0 Count (`$9`) and Compare (`$11`), raising Cause IP7. MARS's Core already has `$8`, `$12` Status, `$13` Cause and `$14` EPC, the `.ktext` handler at 0x80000180, `eret`, and the Simulator's external-interrupt hook.
    - **RISC-V:** RARS's Timer Tool (mtime at 0xFFFF0018, mtimecmp at 0xFFFF0020) through `utvec`. The RARS Core already has `InterruptController` and the user-level interrupt CSRs.

    Rejected: cooperative everywhere. One scheduler, but it gives up the contrast between a Linux signal frame and a RISC-V trap handler, the best teaching material the port has.

5. **One archive per Target.** asmOS (x86), asmOS (RISC-V) and asmOS (MIPS) are packed from one source tree laid out as shared `os/` plus `os/platform/<target>/`. Each archive carries its own Compiler Explorer outputs and Build output. This needs editor or Core work after all, measured on 2026-11-03: MIPS and RISC-V assemble one unit (the Entry and what it includes), so asmOS's separately compiled parts cannot be linked there today, and one translation unit does not fit Compiler Explorer's limits. Those Targets have no saved Build output either (ADR 0056 is x86's). Decisions 11 and 12 answer this.

    Rejected for now: one archive with a Program per Target. It needs a Target per Program, which [programs.md](./programs.md) deferred, and would amend [ADR 0054](../adr/0054-a-project-holds-programs-identified-by-their-entry-file.md). The source tree is the same either way, so that remains a packing change if it is built later.

6. **M68K waits for its own C compilation.** It is ported after M68K C compilation exists, which gets its own grill, and it will also need a framebuffer in s68k. Rejected: designing M68K C compilation as a stage of this port, which would shape it around one program. Until then the portable code reads files through little-endian helpers (`read_le16`, `read_le32`) in the BMP, WAV, MIDI and font readers, so the first big-endian Target finds nothing to fix there.

## Stage 1 scope, decided 2026-11-03

7. **asmOS gets its own repository**, as the Cores have. The shared tree, the platform folders, the harness and the pack script live there, and the three archives are packed from it into the editor's examples. It is the `asmOS/` folder of `Specy/asm-examples`, the owner's public repository for the editor's larger examples, under GPL-2.0-or-later: doomgeneric is GPL-2.0 and every build links DOOM in, so what ships is GPL anyway, as with unicorn-edu. Third-party notices go in a NOTICE file. The editor gets plain archive copies, not a submodule, so its clones and CI stay as they are.

    Rejected:
    - **The tree git-ignored here, carried whole in each archive:** the only working copy would be on one machine.
    - **The tree committed into the editor:** asmOS is a program of its own, not editor code.

    _Amended 2026-11-03:_ every example moves to asm-examples, and the editor takes the repository as a submodule at `packages/examples`, building and serving its archives itself instead of receiving copies ([examples-repository.md](./examples-repository.md), [ADR 0073](../adr/0073-examples-live-in-asm-examples-a-submodule-the-editor-bundles.md)). asmOS moves to `shared/asmos/`, and its `build.mjs` packs the three archives.

8. **Folder calls come in stage 1**, as a second MARS/RARS extension beside the Input controller: list a folder, make one, delete, rename. Files and the Terminal then work fully on MIPS and RISC-V. Designed the same day in [folder-calls.md](./folder-calls.md) ([ADR 0072](../adr/0072-mips-and-risc-v-folder-calls-continue-rars-s-linux-numbering.md)), weighing existing conventions:
    - RARS's file syscalls already use Linux's generic numbers (the old generic `open` at 1024, `read` 63, `write` 64, `close` 57, `lseek` 62).
    - x86 already offers these calls through the editor's FileSystem.

    Rejected:
    - **An index file asmOS keeps:** a read-only disk with greyed-out commands.
    - **No folders at all.**

9. **No sound on MIPS and RISC-V in stage 1.** Music, Pac-Man and the Video Player play silently there; x86 keeps its sound.
10. **Every app but DOOM** goes to MIPS and RISC-V. DOOM needs more than 4 MB. An app that measures unusable is left out of that Target's build, with a line in the README; the Video Player is the likeliest.

11. **MIPS and RISC-V link several compiled units, by x86's rule** ([ADR 0033](../adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md), dated note):
    - **The Entry's unit is always linked**, with what it includes.
    - **The Project's other GNU-profile units** (compiled C and C++) are linked only when they define a symbol the program still needs.
    - **Each unit keeps its own local labels and file-scope names.** The Cores expose for user units the per-unit link they already use for Runtime library members (`GnuAssembler(List<…>)`), and the editor feeds them the Project's units.
    - **Every unit is ordinary user code**: steppable, editable, and with its own source map.

    Decided 2026-11-03 after the measurement showed one translation unit is over Compiler Explorer's limits (a 1.07 MB request against a 1 MiB cap; answers of 17 to 31 MB against 16 MiB).

    Rejected:
    - **Passing the units as library members from the editor alone:** Just My Code would step over them, they would show read-only, and their symbols would carry the library flag.
    - **Reshaping asmOS into fewer, smaller units:** borderline even at -Os, and every larger C Project would hit the same wall.

    _Implementation notes, 2026-11-03:_
    - **Units link only for GNU-profile Builds.** A Build's other units are the Generated assembly of the Project's Compilation records for its Target, other than the Entry, in path order (`resolveLinkUnits` in `assemblyProfile.ts`). A Build in the MARS or RARS dialect, such as a hand-written Entry, links its includes alone, and the Cores refuse `units` with any other profile.
    - **The units come before the Runtime library**, so a unit's definition wins over a library member's, while `_start` still comes from the library's start code. A unit the Entry's unit includes is part of that unit, not one of its own. A unit the link leaves out gets a Hint (`not-linked`), as on x86.
    - **Duplicate strong globals are errors only among linked units**, as `ld` reports them: a unit the link leaves out may define a global that a linked unit defines too. The owner decided the same day that x86 follows the same rule, where it had rejected such a duplicate across every user unit ([ADR 0039](../adr/0039-x86-links-start-objects-before-user-and-support-archives.md), amended 2026-11-03), so all three Targets agree. Implemented the same day on x86's `feat/stage1` (`.cache/wt/stage1-x86`), for `@specy/x86` 8.0.0.

12. **MIPS and RISC-V Builds cache each unit, and the assembler is profiled.**
    - **The cache.** The Cores keep each unit's assembled result keyed by its exact text, as x86's Core caches its library objects. A Build then re-assembles only units that changed: the first Build of asmOS after opening it takes about 10 s, and editing one app re-assembles that unit alone.
    - **The profiling pass**, inside the linking work (11), looks for cheap wins in the assembler's 110 µs a statement. It is time-boxed, and its wins help every MIPS/RISC-V program.

    _Implementation notes, 2026-11-03:_
    - **Only parsing and statement encodings are cached, not layout or emission.** A unit's tokens and parse are kept by its path and exact text, and the encoding of each statement that names no symbol by the statement's text. Every Build still lays out and emits the whole program, so an unchanged unit costs its layout and emission but no parse.
    - **A unit that includes another File is never cached**, since the included File can change on its own, and a parse is kept only when it reported nothing.
    - **The cache lives in the Core's module**, shared by every Core of that package, and keeps up to 32 MiB of unit text, the least recently used going first. `MIPS.clearAssemblyCache()` and `RISCV.clearAssemblyCache()` empty it; `getAssembledUnits()` tells which units the last assembly parsed.

    Saved Build output stays x86's ([ADR 0056](../adr/0056-a-build-saves-the-program-it-links-as-a-file.md)).

    Rejected for now: a saved program image for MIPS and RISC-V, carried in the archive so that even the first Build is instant. It needs a new image format in both Cores; it waits until we know whether a first Build of a few seconds is acceptable.

## Order of work

1. Merge the assembly IDE app into the asmOS source tree. It was built separately as an app (2026-11-03, `.cache/asmos-ide-source`): RV32IM, RARS-compatible, its own compiled unit. It ports with the rest.
2. Build the platform layer on x86 with no behaviour change, checked with harness screenshots and DOOM's demo checksum. This includes:
    - the yield points;
    - the little-endian helpers;
    - per-Target stack sizes;
    - a check for 64-bit assumptions, since the other Targets are ILP32;
    - a `KEY_*` header of asmOS's own and, in the MIPS/RISC-V platform file, a table from HID usages to `KEY_*`, as Linux's HID driver has. The driver also resynchronises its key state from the controller's bitmap on a dropped record; asmOS ignores Linux's `SYN_DROPPED` today.
3. Implement the Input controller (2), alongside step 2, after measuring the framebuffer read-back at 640 × 480 (decision 3).
4. Move the tree into asmOS's own repository (7), and design and implement the folder calls (8).
5. Port to RISC-V, then MIPS.
6. Stage 2.

## Stage 1 record, 2026-11-03

**Ported the same day, uncommitted.** asmOS builds and runs on RISC-V and MIPS from the one tree in `asm-examples/shared/asmos/`, which `build.mjs` packs into three archives. The x86 build is unchanged: identical screenshots, and DOOM's demo 1 still gives 5,026 tics, sum cf6b7f4d.

- **`os/platform/sim/`** holds what MIPS and RISC-V share, since both run on the editor's MARS/RARS devices:
    - the 640 × 480 `SIM_SCREEN`;
    - the Input controller driver;
    - time through syscalls 30 and 32;
    - stacks from the stack segment;
    - silent sound;
    - a machine header with 12 processes, 64-message queues, 32 KB stacks, no back buffer and no wallpaper picture.

    `os/platform/riscv/` and `os/platform/mips/` add only the context switch and the instruction counter. The design had no shared folder; it saves writing the same driver twice.

- **The context switch is inline assembly in C.** A MIPS/RISC-V Build links only compiled units: `resolveLinkUnits` takes Compilation records' outputs. A hand-written `.riscv`/`.mips` unit therefore cannot join the Build. Linking hand-written GNU-profile units is a possible follow-up.
- **Files and folders are shared code** (`os/platform/files.c`), compiled against the Runtime library's POSIX functions on all three Targets.
- **The window manager has a single-buffer mode**, chosen when the back buffer is the framebuffer. It repaints under the pointer and the resize outline.
- **An app that cannot get a window says "not enough memory" and ends.** A small-memory machine keeps a 224 KB reserve so the message can always appear.
- **Apps:** 16 of x86's 18. DOOM and the Video Player are left out for memory (the Video Player reads its whole 2.5 MB video). Music, Pac-Man and Blocks run silent. Paint keeps 2 undo levels, and the Assembly Editor 32 KB of text and 8,192 Step-back entries.
- **Compiler Explorer:** `apps.c` is compiled at -Os on MIPS and RISC-V; -O2 exceeds the 16 MiB answer cap. The other units are -O2.
- **Measured** (harness, Undo off):

    |                                         | RISC-V                                | MIPS        |
    | --------------------------------------- | ------------------------------------- | ----------- |
    | Static data, the 1.2 MB screen included | 1,464 KB                              | 1,468 KB    |
    | Left after boot                         | 2,227 KB                              | 2,223 KB    |
    | Core speed                              | 2.8–3.2 million instructions a second | 5.4 million |
    | Boot to desktop                         | 2.6 s                                 | 2.4 s       |
    | First Build in the browser              | ~6 s                                  | ~7 s        |

    Responsiveness is the limit. Every pixel goes through C loops and the per-store framebuffer observer, so a window drag shows about five steps a second, and a key in the Assembly Editor takes about a quarter of a second. That is where native dirty tracking (decision 3) would pay off.

- **A Core bug the port found:** the GNU tokenizer of both Cores overflowed the stack on string literals over about 1,500 characters, which a C byte table of a few hundred bytes produces. It is fixed on `feat/stage1` with a test. The 5.0.0 releases need it, or asmOS cannot build.

## Open

- **Stage 2:**
    - whether the timers tick on Program time ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)) or on instruction count;
    - a larger memory configuration for MARS and RARS;
    - whether DOOM comes to MIPS and RISC-V. It needs more than 4 MB.
