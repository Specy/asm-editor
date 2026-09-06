# Domain Glossary

## Emulator

The UI-facing object a project interacts with: it holds reactive state (registers, memory tabs, stdout, errors, breakpoints…) and exposes the actions (compile, run, step, undo, test…). One per open project, created per language. Not the underlying language engine — see **Core**.

## Core

The language-specific engine that actually assembles and executes code (s68k's `Interpreter`, `@specy/mips`'s `JsMips`, `@specy/risc-v`'s `JsRiscV`, `@specy/x86`'s emulator, `@specy/z80`'s `Z80Machine`). A Core knows nothing about the UI; an Emulator wraps exactly one Core.

## Diagnostic

A compile/check-time finding about the program's source, tagged `error`, `warning` or `suggestion`. Only `error`-severity diagnostics block compilation and disable Build; the others are reported (amber/info squiggles, listed above stdout) while the program still builds and runs. Distinct from the Emulator's runtime **errors**, which are strings produced while executing. Producers today: the MIPS and RISC-V Cores emit warnings alongside errors in one collection; M68K, x86 and Z80 report errors only (s68k has no warnings concept, the x86 Core only parses its assembler logs when the assembler exits non-zero, discarding the severity marker it matched on, and `@specy/z80` returns one flat diagnostic list with no severity field, so every entry is an error). `suggestion` has no producer yet — the variant exists so one can be added without another type change.

## Interrupt

The generic state "the Emulator is paused mid-execution waiting on the user" (e.g. a program requested keyboard input). Owned by this codebase, not by any Core's type system; language-specific interruption details (like s68k interrupt payloads) are mapped _into_ it. While an Interrupt is pending, execution controls are disabled.

## Pause

A run parked between two instruction slices at the user's request, keeping everything it had: its place in the program, its remaining instruction limit, its breakpoints and what the scheduler learned about its speed. The Run button is Pause while a program runs and Resume once it is parked. Distinct from an **Interrupt**, which the program itself causes by asking for input, and from Stop, which is `clear()` and throws the program away.

## Peripheral

A device owned by an Emulator that programs interact with through the Core: Cores write to it and read from it (via the adapter), the UI presents its output or supplies its input. Peripherals are part of the Emulator, not siblings of it. First peripheral: the **Terminal**. Planned: **Screen**, **Keyboard**, **Mouse**.

## Screen

The Peripheral representing a program's graphical output through its simulator environment's graphics conventions. For environments whose simulator has a single output window, it also shows the program's text output and input echo at a text cursor. In double buffering mode, its visible image remains separate from the image being drawn until the program presents it.

## Keyboard

The Peripheral representing keyboard input for a program interacting with the **Screen**, observed either as typed characters or as key state. Its pending typed input also supplies the **Terminal**'s character, string and numeric reads in graphical use.

## Mouse

The Peripheral representing pointing input for a program interacting with the **Screen**, including mouse buttons and position in the Screen's logical pixels, observed as the current state or as the snapshots taken at the last button down and up. Its coordinates share the drawing origin at the top left and are independent of GUI zoom.

## Terminal

The Peripheral owning program output (stdout) and user input requests. Cores reach it in their own dialect: syscalls for M68K, MIPS, RISC-V and x86, **Console port** reads and writes for the Z80. Input requests go through its current **Input Source**; output accumulates as the text the UI displays. Interactive answers are echoed into the output like a tty; scripted answers are not, like piped stdin.

## Input Source

The source of answers to a **Terminal**'s input requests: interactive user input or a **Testcase**'s scripted answers. Interactive character, string and numeric input can come from prompts or the **Keyboard** associated with a **Screen**.

## Program time

The passage of time as a program observes it through its environment's wait and time operations. It follows host time; no environment emulates a clock rate. Distinct from a Core's instruction or cycle count, which drives the instruction limit and the Undo history.

## Time Source

Where a program's **Program time** comes from: host time in an interactive run, or a virtual clock in a **Testcase**'s scripted run, which starts at zero and advances only through the program's waits. Selected for the whole run together with the **Input Source**.

## Port map

The Z80's way of reaching every **Peripheral**: a fixed assignment of I/O port numbers, read and written with `in` and `out`, grouped by peripheral: the **Console ports** for the **Terminal**, and the ports for the **Screen**, **Keyboard**, **Mouse** and program time. Every port outside the map is an empty bus: writes are ignored and reads return 0xFF. See `docs/adr/0011-z80-peripherals-through-the-port-map.md`.

## Console port

The **Port map**'s group for the **Terminal**. A Z80 has no system calls: programs talk to the outside world with `in`/`out` on one of 256 I/O ports, so the Emulator maps a fixed handful of them (`Z80_PORTS` in `src/lib/languages/Z80/Z80-model.ts`) onto the Terminal, one port per output format (character, unsigned, signed, hexadecimal, 16 bit) instead of one syscall number per operation. A write formats the byte and appends it to the Terminal's output; a read with no buffered input pauses the machine — the Core stops with `WAITING_FOR_INPUT` and the adapter re-executes the `in` once the Terminal's **Input Source** has answered — so a port read raises an **Interrupt** like any other input request. See `docs/adr/0002-z80-console-ports.md`.

## Exam

A Project handed to a student under a track, a password and a time limit, with a submission recorded against it. It is a Project-level concept: the Emulator has no exam-specific restriction, because no Core requires blocking input any more (see **Input Source**).

## Testcase

A declarative check run against a program: starting registers/memory/input, expected registers/memory/output. Language-independent; endianness of memory expectations follows the Emulator's endianness. Its run uses a scripted **Input Source** and a virtual **Time Source**.
