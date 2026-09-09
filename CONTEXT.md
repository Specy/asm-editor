# Domain Glossary

## Emulator

The UI-facing object a **Project** interacts with to build, execute, debug, and test its programs. Each open Project has one Emulator for its **Target**, distinct from the underlying **Core**.

## Core

The language-specific engine that actually assembles and executes code (s68k's `Interpreter`, `@specy/mips`'s `JsMips`, `@specy/risc-v`'s `JsRiscV`, `@specy/x86`'s emulator, `@specy/z80`'s `Z80Machine`). A Core knows nothing about the UI; an Emulator wraps exactly one Core.

## Diagnostic

A compile/check-time finding about the program's source, tagged `error`, `warning` or `suggestion`. Only `error`-severity diagnostics block compilation and disable Build; the others are reported (amber/info squiggles, listed above stdout) while the program still builds and runs. Distinct from the Emulator's runtime **errors**, which are strings produced while executing. Producers today: s68k, MIPS and RISC-V preserve their Core-supplied severity; x86 and Z80 report errors only (the x86 Core only parses its assembler logs when the assembler exits non-zero, discarding the severity marker it matched on, and `@specy/z80` returns one flat diagnostic list with no severity field).

## Interrupt

The generic state "the Emulator is paused mid-execution waiting on the user" (e.g. a program requested keyboard input). Owned by this codebase, not by any Core's type system; language-specific interruption details (like s68k interrupt payloads) are mapped _into_ it. While an Interrupt is pending, execution controls are disabled.

## Pause

A user-requested suspension of forward execution within a **Debug session**, retaining the program for inspection, Step, instruction Undo, and Resume. Distinct from an **Interrupt**, which the program causes by requesting input, and from Stop, which ends the Debug session.

## Peripheral

A device owned by an Emulator that programs interact with through the Core: Cores write to it and read from it (via the adapter), the UI presents its output or supplies its input. Peripherals are part of the Emulator, not siblings of it. The shared set includes the **Terminal**, **Screen**, **Keyboard**, **Mouse**, and **FileSystem**; an architecture exposes the devices its adapter can connect to the Core.

## Screen

The Peripheral representing a program's graphical output through its simulator environment's graphics conventions. For environments whose simulator has a single output window, it also shows the program's text output and input echo at a text cursor. In double buffering mode, its visible image remains separate from the image being drawn until the program presents it.

## Keyboard

The Peripheral representing keyboard input for a program interacting with the **Screen**, observed either as typed characters or as key state. Its pending typed input also supplies the **Terminal**'s character, string and numeric reads in graphical use.

## Mouse

The Peripheral representing pointing input for a program interacting with the **Screen**, including mouse buttons and position in the Screen's logical pixels, observed as the current state or as the snapshots taken at the last button down and up. Its coordinates share the drawing origin at the top left and are independent of GUI zoom.

## Terminal

The Peripheral owning program output (stdout) and user input requests. Cores reach it in their own dialect: syscalls for M68K, MIPS, RISC-V and x86, **Console port** reads and writes for the Z80. Input requests go through its current **Input Source**; output accumulates as the text the UI displays. Interactive answers are echoed into the output like a tty; scripted answers are not, like piped stdin.

## FileSystem

The **Peripheral** through which an **Emulator** accesses its **Files**, shared with the editor for an interactive **Project** or isolated for a **Testcase**. These are the files available to assembly and to the running program.
_Avoid_: drive peripheral

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

## Project

The unit of work the editor saves, opens and shares: one **Target**, its **Files**, its **Settings**, its **Testcases**, its **Display configuration**, a name and a description. A record with those parts, not a folder: only its Files are visible to the assembler and the program.
_Avoid_: workspace, folder, program

## Target

The architecture and supported assembler/runtime environment selected for a **Project**, determining the machine its programs run on. Distinct from the **File language** of its individual Files.

## File language

The language of a text **File**, such as target-specific assembly, C, or plain text, used to interpret and present its source. It is independent of the Project's **Target** and the File's storage encoding; selecting a language does not make a compiler for it available.

## Project archive

A portable copy of a **Project**, containing all its named **Files**, its **Entry path**, and its configuration and metadata. Distinct from downloading an individual File; it does not contain a running **Debug session**.

## File

Content available to the assembler or running program through the **FileSystem**, as bytes or valid UTF-8 text, normally named by a **Project**-relative path with or without an extension. Its purpose is independent of storage encoding, and an open handle can retain it after its path is removed.
_Avoid_: document, asset, source file (when the **Entry file** is meant)

## Project root

The top of a **Project**'s file hierarchy and the base for runtime file paths, independent of the **Entry path**'s directory.

## Directory

A grouping of a **Project**'s **Files** under a shared path prefix. It exists while it contains Files, directly or through subdirectories, and cannot also be a File.

## Entry path

The **Project**'s configured path from which a Build begins, `main.<ext>` by default. It can temporarily name a missing File; choosing another Entry path is separate from choosing which File the editor shows.

## Entry file

The **File** found at a Project's **Entry path**, when it exists, which a Build assembles first. Other Files are reached from it through includes or are not built at all.
_Avoid_: main file, active file, selected file, open file

## Displayed file

The **File** currently shown in the editor, chosen independently of the **Entry path**. Its displayed version is either the live Project content selected through file browsing or the **Build snapshot** source selected through debugger navigation.

## Build snapshot

The fixed versions of the **Files** and **Entry path** used by one Build, identifying the source of its running program. Later **FileSystem** changes belong to the current Project Files and affect subsequent Builds.

## Debug session

The lifetime of a built program retained for execution, inspection, and instruction Undo, from a successful Build until Stop or disposal. Program exit does not itself end the session or return host editing access to the **Files**.

## Settings

Per-Project configuration that changes what the **Emulator** or the program does: the undo history size and the separate **Screen** and **FileSystem** undo budgets. They belong to one **Project**, are edited through the editor's GUI and are never a file the program can see. A Project records only the Settings decided for it; anything undecided follows the app's default for its language. The MARS bitmap display is not a Setting, see **Display configuration**.
_Avoid_: preferences, options, config, global settings

## Preferences

Per-person configuration that changes only how the editor looks or behaves for its user, never what a program does: register number base, panel visibility, autosave, theme, shortcuts. They follow the person across every **Project**.
_Avoid_: settings, global settings, user settings

## Display configuration

The MARS and RARS bitmap display parameters of a MIPS or RISC-V **Project**: unit size, display size and base address, distinct from **Settings**. The **Entry file**'s `@screen` comment supplies the parameters it names over the Project's chosen display; included Files do not supply display configuration.
_Avoid_: display settings, screen settings, screen config

## Exam

A Project handed to a student under a track, a password and a time limit, with a submission recorded against it. It is a Project-level concept: the Emulator has no exam-specific restriction, because no Core requires blocking input any more (see **Input Source**).

## Testcase

A declarative check run against a program: starting registers/memory/input and expected registers/memory/output, with memory expectations interpreted in the Emulator's endianness. Each Testcase runs independently with a scripted **Input Source**, a virtual **Time Source**, and its own writable **FileSystem** initialized from the same starting Files as the other cases in that test run.

## Course

A sequence of **Modules** on one subject, listed on the Learn page with its own landing text and metadata (name, description, authors, date, order). Two kinds exist: the **General course** and the **Language courses**. Content only: a Course is a folder of markdown and metadata, never code.

## Module

A themed, ordered group of **Lectures** inside a **Course**. A Module has a name and a description but no body of its own that the reader studies.

## Lecture

One page of a **Course**: markdown text with **Playgrounds**, read in order with Previous and Next. The unit a reader studies in one sitting.

## Playground

A runnable code block inside a **Lecture**: an embedded editor with its own **Emulator**, configured by flags on the code fence (memory, console, tests, program counter, screen, open in the editor). Every Lecture that teaches an instruction shows it in a Playground.

## General course

The Course "Assembly basics": the overview of what most assembly languages share, using several of the editor's languages as examples and covering each topic once, shallowly. Its three Modules define the topic order every **Language course** mirrors.
_Avoid_: beginner course, basics course

## Language course

A **Course** about one of the editor's languages (M68K, MIPS, RISC-V, Z80). It mirrors the **General course** Module for Module and Lecture for Lecture, retitled for the language, with an opening "Getting started" Lecture and the outside-world Module bent to what the machine really has (traps, syscalls, memory-mapped or port-mapped I/O). It closes with an **Examples** Module.
_Avoid_: specific course, single course, deep dive

## Example

A complete, verified program that closes a **Language course**: one **Lecture** in its Examples Module, placed by what the reader needs to know before it. The same ladder of Examples exists in every Language course, program for program (the snake game in M68K is the snake game in RISC-V), so a reader can compare how each language does the same thing.
_Avoid_: demo, sample, snippet

## Exercise

A task that closes a **Lecture** of a **Language course**: a **Playground** preloaded with a skeleton, a stated goal, and a **Testcase** that checks the reader's solution. One or two per Lecture; none in the **General course**, whose Lectures only invite the reader to change a Playground and watch.
_Avoid_: quiz, challenge, problem

## Topic

The subject a **Lecture** teaches, named the same way in every **Course** that covers it (registers, the stack, syscalls, the snake game). It is what ties a **General course** Lecture to its deep dives in the **Language courses**, and an **Example** to the same program in the other languages; the links between them are derived from it, never written by hand.
