# Environment library

Design interview started on 2026-10-05. It decides how C and C++ programs from Source compilation call the services of their Target's simulator environment (syscalls, traps, memory-mapped devices) without writing assembly. Vocabulary comes from [CONTEXT.md](../../CONTEXT.md); the related [Runtime library](./source-runtime.md) is the C standard library. This document records accepted decisions. Implementation was authorized on 2026-10-05 and completed on 2026-10-07. The owner subsequently authorized the four Core releases and confirmed their publication; the editor now consumes them from npm. The [plan's Implementation notes](./environment-library-plan.md#implementation-notes) record final behavior and validation. Owner manual checks remain.

## Starting facts

- Source compilation targets MIPS, RISC-V and RISC-V-64, and x86 in its interim form (Start unit, no Runtime library).
- The Runtime library already reaches the environment through eight private `__aed_*` functions ([runtime/PLATFORM.md](../../runtime/PLATFORM.md)); none is exposed to programs.
- MARS and RARS offer the same services under mostly the same numbers: print and read of integers, floats, doubles, strings and characters; sbrk; exit; files; time (30); sleep (32); hexadecimal, binary and unsigned printing (34–36); the seeded random generators (40–44); the dialogs (50–59, with RARS numbering one dialog 60). Files and exit use Linux numbers on RARS. Both also have the bitmap display and the keyboard and display registers at `0xFFFF0000` ([screen-peripherals.md](./screen-peripherals.md)).
- x86 offers only Blink's Linux system calls and has no Screen.

## Accepted decisions

### Scope: one function per service

Every service a Target's Documentation lists gets one C function, including those the Runtime library also covers (printing an integer, sbrk, exit, files), and the memory-mapped devices get functions of their own. A student who learned a syscall in a Course can call the same service from C and find its instruction sequence in the Generated assembly. Decided 2026-10-05.

### Names and inclusion

No name clashes with the C or C++ standard library, and every C or C++ source of a Project can include the library. Decided 2026-10-05.

One header, `<sim.h>`, and one prefix, `sim_`, for every Target (`sim_print_int`, `sim_sleep`, `sim_random_int_range`, `sim_screen_set_pixel`). A service is declared only on the Targets that have it, selected by the compiler's predefined macros (`__mips__`, `__riscv`, ...), so using a service the Target lacks is a compile error naming the function rather than a link failure. A program written against the shared MARS/RARS services compiles for MIPS and RISC-V unchanged, as the Examples ladder expects. The functions have C linkage (`extern "C"` under C++), so C and C++ spell them the same way; there is no C++ namespace. A Project header named `sim.h` does not collide: `#include "sim.h"` finds the Project File, `#include <sim.h>` the library. Decided 2026-10-05. Correction found while planning: every compile passes `-I .`, so today a `sim.h` (or `stdio.h`) at the Project root does shadow the system header; decided while planning: compiles pass `-iquote .`, GCC's own behaviour for quoted includes, which makes this sentence true ([plan](./environment-library-plan.md), M0).

Prefixes considered: `sim` (chosen: names what the functions call, the simulator's services, and stays true for memory-mapped devices), `asm` (the editor's name, but reads as inline assembly or "the assembly version of"), `svc` (ARM's system-call instruction), `env` (C's `getenv`/`environ`), `sys` (Linux kernel entry points; devices are not system calls), `aed` (the Runtime library's private prefix), `mars`/`rars` per simulator (rejected with per-Target headers).

### Header-only

`<sim.h>` defines every function `static inline` with GCC inline assembly, uploaded with each compile in `sysroot/include` beside the Runtime library's headers ([ADR 0034](../adr/0034-environment-library-is-header-only.md)). Nothing is linked: there is no Setting, no Runtime ABI pin and, for MIPS and RISC-V, no Core change; it works with _Link Runtime library_ off, and on x86 before x86 has a Runtime library. Correction found while planning: the x86 Core's translator rejects inline assembly (`#APP` blocks), so x86 needs a Core change; decided while planning: the translator accepts a bounded inline-assembly subset ([plan](./environment-library-plan.md), M2, `@specy/x86` 4.1.0). The system call lands in the student's own Generated assembly: at the call site at `-O2`, as a local `sim_print_int:` function in their unit at `-O0`. A fix reaches a saved Project only when it is recompiled. Decided 2026-10-05.

Source map: lines whose source is `<sim.h>` map to a read-only `@runtime/include/sim.h` (no ABI in the path, since nothing is linked), as gdb shows an inline function's source: for the instructions an inlined `sim_` function contributed, the current line moves into the header's `__asm__` template, then back. Breakpoints and go to definition work there; Step treats it as the student's own unit, never as Runtime library code. Other sysroot headers follow the same rule. Today such lines map to no line at all ([compilerExplorer.ts](../../src/lib/sourceCompilation/compilerExplorer.ts)). Attributing the code to the call site and leaving it unmapped were rejected. Decided 2026-10-05.

### Targets

MIPS, RISC-V and RISC-V-64 share the MARS/RARS services. x86 gets one function for each of the Linux system calls its Documentation lists (181 table rows in 2026-10), generated from the same table (`src/lib/languages/X86/generated/x86Syscalls.ts`) by the same script, so the one-to-one rule has no exception. Each returns the kernel's raw result, a negative error number on failure, as `rax` holds it after the instruction, not libc's -1 and `errno`. Struct arguments are `void *`, so nothing clashes with `<time.h>` or `<sys/stat.h>` once x86 has a Runtime library. x86 C programs can then print and read before that library exists.

The list is what the built Core implements, not what Blink's dispatch table names: about 70 Documented calls are compiled out of Blink today (`DISABLE_NONPOSIX`) and return ENOSYS, and the generator ignores the `#ifdef`. Decided 2026-10-05, with ADR 0035's Linux reference: the Documentation generator follows the Core's build configuration, so the Documentation and `<sim.h>` list exactly the calls that work, and the Core implements every call that can work faithfully in a single browser process (`brk`, `getrandom`, `pipe` within the process, signals to itself, `ioctl(TCGETS)` on descriptors 0 to 2 so `isatty` is true, `time` (201), which works but is undocumented), judged call by call during implementation. Calls that cannot work there, such as `fork`, `execve` or network sockets, are not listed. M68K and Z80 have no Source compilation and so no Environment library. Decided 2026-10-05.

### Bitmap display

A C program declares its display with a macro, `SIM_SCREEN(name, width, height, unit)`, which defines a word-aligned global `unsigned name[...]` grid and emits `# @screen width=... height=... unit=... base=name` through a file-scope `__asm__`. Wherever the compiler places the array, the display follows it through the `@screen` directive's label base, as for an assembly example, so no address is hard-coded and nothing collides with C's data (the default base `0x10010000` is the start of `.data`, and the heap base is where `malloc`'s `sbrk` starts). Drawing is a store into the array (`screen[y * 256 + x] = sim_rgb(255, 0, 0)`), which is what the device teaches; there is no per-pixel function. The Generated assembly filter, which drops every `#` comment line today, keeps `@screen` lines. Decided 2026-10-05.

Checked while planning: the `@screen` label probe resolves a `.bss` label of Generated assembly (GCC and Clang, MIPS and RISC-V). A large grid does not fit today: the GNU-profile layout caps static data at 196,608 bytes on MIPS (it reaches the heap at `0x10040000`) and below 524,288 on RISC-V, so a 256 by 256 grid (256 KiB) cannot build; decided while planning: GNU-profile Builds start the heap after static data, and until that Core release `SIM_SCREEN` rejects a grid above the cap at compile time ([plan](./environment-library-plan.md), M1 and M5).

### Standard input

`sim_read_*` and stdio do not share standard input. Each `sim_read_*` takes a whole line of its own from the Input Source, as its system call does in assembly, while stdio reads descriptor 0 with tty semantics through the Terminal's line buffer and keeps its own pushed-back bytes in `stdin`; `<sim.h>`'s doc comments and the Documentation tell the reader not to mix the two on one line. Existing Testcases are unaffected. Unifying them in the Terminal was rejected: it would change hand-written programs that mix the read syscalls with `read(0)`, and still could not see the byte `scanf` pushes back inside `FILE`. Decided 2026-10-05.

### Every environment matches its Reference environment

Raised 2026-10-05: the owner asked to weigh making syscalls, traps and ports behave like their real simulators and operating systems, in every language, refactoring rather than keeping workarounds. The [audit](../research/environment-services-audit.md) inventoried the departures. Decided: each Target's services match its Reference environment, with documented deviations only where they help a learner, and the Core owns each service's semantics while the editor owns the transport ([ADR 0035](../adr/0035-environments-match-their-reference.md)). Keeping the current behaviour and one editor-wide convention were rejected.

Every reference service that can work faithfully in the browser is implemented, in every Target (ADR 0035, rule 4), generalizing the x86 decision above; the rest are rejected with a stated reason. Order: fix the services that exist but deviate; add the small missing ones (M68K files 50–59, echo 12 and prompt 16, cycle counter 30–31; seed 40 in both Cores; RISC-V GetCWD 17); then an Audio Peripheral, with its own design pass (Undo, Testcases, autoplay policy), for EASy68K 70–77 and MARS/RARS MIDI 31/33. Decided 2026-10-05.

### Input typed in the Terminal, through our own component

Interactive input moves from the app-wide modal prompt into the Terminal, with a Line discipline that gives single-keystroke character reads, line reads until Enter, the reference's Enter code and Ctrl+D End of input; the modal remains only for the MARS/RARS dialog services, which gain Cancel (2 and -2). The Terminal is our own component, not xterm.js; x86 gets SGR colours and clear screen; xterm.js stays a candidate for future Targets that run full-screen terminal programs ([ADR 0036](../adr/0036-programs-read-input-typed-in-the-terminal.md)). Decided 2026-10-05.

### Text encoding

Within each Target the assembler's string literals and every text service use one encoding, decoded by the Terminal with a streaming decoder so a character split across writes survives. M68K uses Windows-1252, as EASy68K does; its Core stops requiring UTF-8 in the text tasks and encodes task 2's answer the same way. Correction found while planning: the s68k assembler stores Latin-1 and rejects characters above it (s68k ADR 0004), which equals Windows-1252 except in `0x80`–`0x9F`; decided while planning: the s68k assembler moves to Windows-1252 too, amending its ADR 0004 ([plan](./environment-library-plan.md), M6). The Z80 keeps one byte per character (Latin-1), its Port map being its own reference. MIPS, RISC-V and x86 use UTF-8 throughout. For MIPS this is a documented deviation: MARS stores literals and prints syscalls 4 and 11 one byte per character (Latin-1) while syscall 15 decodes with the JVM's default charset (UTF-8 since Java 18), so on a faithful MARS a C string such as `"é"`, which GCC emits as UTF-8, would print correctly through `printf` and garbled through `sim_print_string`. Edge cases such as reading one character of a multi-byte character follow RARS. Strict per-service fidelity and UTF-8 everywhere were rejected. Decided 2026-10-05.

### Reproducible time and randomness in Testcases

Every Testcase run is reproducible in time and randomness, on every Target. x86 joins the virtual Time Source through Core clock and sleep hooks, ending ADR 0010's exception and the busy-waiting sleep; random services draw from a Random source, host randomness interactively and a fixed seed in a scripted run; MARS/RARS generators implement `java.util.Random` exactly ([ADR 0037](../adr/0037-testcases-run-on-a-seeded-random-source.md)). Decided 2026-10-05.

### Documentation, reporting and the remaining consequences

Decided 2026-10-05:

- `<sim.h>` is generated from the Documentation data, never written by hand: from the syscall entries for MARS and RARS, from the generated syscall table for x86. Each function's doc comment is its entry's description. Each service's Documentation entry shows its `sim_` prototype under the assembly convention. Header, Documentation and Core cannot drift apart.
- Each language's Documentation lists its deviations from its Reference environment ("Differences from EASy68K / MARS / RARS / Linux"), as ADR 0035's rule 2 requires.
- Each language with Source compilation (MIPS, RISC-V and x86 today) gets a Documentation chapter on using the emulator from C: compiling, the Runtime library, `<sim.h>` and its services, `SIM_SCREEN` and the devices, the calling convention as it appears in Generated assembly, and stepping and breakpoints between C and assembly.
- Every Core reports termination with an exit code and a typed cause (`hasTerminated`, `exitCode`, typed errors instead of text an adapter regex-parses). The Log shows "exited with code N" on every Target and x86 signals as, e.g., "Segmentation fault (signal 11)", with x86 status masked to 0–255 as Linux does. Showing the code is a documented deviation for MARS, whose GUI ignores exit2's code.
- x86 programs see the Project Files: Blink's file calls go through the FileSystem Peripheral with Undo, isolated per run and per Testcase, so nothing leaks between Builds, and the toolchain files (`/program`, `/linker`, `/program.o`) are hidden from the program.
- The Z80's Enter codes stay and are documented: CHAR line reads end in `0x0A` like every language's lines, the key ports report `0x0D` from EASy68K's key codes (ADR 0008).
- The MIPS and RISC-V adapters' duplicated handlers become one shared MARS/RARS module, which is pure transport once the Cores own parsing and formatting.

## Open questions

None as of 2026-10-05.

## Deferred

- The implementation is planned in [environment-library-plan.md](./environment-library-plan.md) (2026-10-05), with twelve decisions taken while planning, confirmed by the owner on 2026-10-05. Besides the corrections above they fix: MARS and RARS float formatting as on JDK 21 (shortest round-trip digits in Java's layout, by the Cores' own code); Undo restoring random generator state; x86 instructions that change a File or consume standard input recorded as irreversible until those effects are journaled; MARS print string without a length limit, as MARS 4.5 (corrected 2026-10-06: the 65,536 limit was the fork's own, not the reference's); EASy68K's cycle counter (30, 31) waiting for a 68000 timing model; a read revealing a hidden console; `<sim.h>` as a committed, generated asset per Target; the Terminal transcript's Undo left out of scope.
- The Audio Peripheral (EASy68K 70–77, MARS/RARS MIDI 31/33): its own design pass for Undo, Testcases and the browser's autoplay policy.
- M68K and Z80 have no Source compilation, so no `<sim.h>`; adding C there would bring them in.
