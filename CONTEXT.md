# Domain Glossary

## Emulator

The UI-facing object a project interacts with: it holds reactive state (registers, memory tabs, stdout, errors, breakpoints…) and exposes the actions (compile, run, step, undo, test…). One per open project, created per language. Not the underlying language engine — see **Core**.

## Core

The language-specific engine that actually assembles and executes code (s68k's `Interpreter`, `@specy/mips`'s `JsMips`, `@specy/risc-v`'s `JsRiscV`, `@specy/x86`'s emulator, `@specy/z80`'s `Z80Machine`). A Core knows nothing about the UI; an Emulator wraps exactly one Core.

## Diagnostic

A compile/check-time finding about the program's source, tagged `error`, `warning` or `suggestion`. Only `error`-severity diagnostics block compilation and disable Build; the others are reported (amber/info squiggles, listed above stdout) while the program still builds and runs. Distinct from the Emulator's runtime **errors**, which are strings produced while executing. Producers today: the MIPS and RISC-V Cores emit warnings alongside errors in one collection; M68K, x86 and Z80 report errors only (s68k has no warnings concept, the x86 Core only parses its assembler logs when the assembler exits non-zero, discarding the severity marker it matched on, and `@specy/z80` returns one flat diagnostic list with no severity field, so every entry is an error). `suggestion` has no producer yet — the variant exists so one can be added without another type change.

## Interrupt

The generic state "the Emulator is paused mid-execution waiting on the user" (e.g. a program requested keyboard input). Owned by this codebase, not by any Core's type system; language-specific interruption details (like s68k interrupt payloads) are mapped _into_ it. While an Interrupt is pending, execution controls are disabled.

## Peripheral

A device owned by an Emulator that programs interact with through the Core: Cores write to it and read from it (via the adapter), the UI observes it. Peripherals are part of the Emulator, not siblings of it. First peripheral: the **Terminal**. Planned: screen, keyboard.

## Terminal

The Peripheral owning program output (stdout) and user input requests. Cores reach it in their own dialect: syscalls for M68K, MIPS, RISC-V and x86, **Console port** reads and writes for the Z80. Input requests go through its current **Input Source**; output accumulates as the text the UI displays. Interactive answers are echoed into the output like a tty; scripted answers are not, like piped stdin.

## Input Source

The strategy a Terminal uses to answer input requests: interactive (asking the user — today via modal prompt, in the future possibly a terminal widget) or scripted (a Testcase's predefined input list). Swapped per run, e.g. during Testcase execution. Every source answers asynchronously; a Core that needs input suspends its pending execution until the answer arrives.

## Console port

The Z80's way of reaching the **Terminal**. A Z80 has no system calls: programs talk to the outside world with `in`/`out` on one of 256 I/O ports, so the Emulator maps a fixed handful of them (`Z80_PORTS` in `src/lib/languages/Z80/Z80-model.ts`) onto the Terminal, one port per output format (character, unsigned, signed, hexadecimal, 16 bit) instead of one syscall number per operation. A write formats the byte and appends it to the Terminal's output; a read with no buffered input pauses the machine — the Core stops with `WAITING_FOR_INPUT` and the adapter re-executes the `in` once the Terminal's **Input Source** has answered — so a port read raises an **Interrupt** like any other input request. Every unmapped port ignores writes and reads as 0xFF, like an empty bus. See `docs/adr/0002-z80-console-ports.md`.

## Exam

A Project handed to a student under a track, a password and a time limit, with a submission recorded against it. It is a Project-level concept: the Emulator has no exam-specific restriction, because no Core requires blocking input any more (see **Input Source**).

## Testcase

A declarative check run against a program: starting registers/memory/input, expected registers/memory/output. Language-independent; endianness of memory expectations follows the Emulator's endianness.
