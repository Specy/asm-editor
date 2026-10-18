# Domain Glossary

## Emulator

The UI-facing object a **Project** interacts with to build, execute, debug, and test its programs. Each open Project has one Emulator for its **Target**, distinct from the underlying **Core**.

## Core

The language-specific engine that actually assembles and executes code (s68k's `Interpreter`, `@specy/mips`'s `JsMips`, `@specy/risc-v`'s `JsRiscV`, `@specy/x86`'s emulator, `@specy/z80`'s `Z80Machine`). A Core knows nothing about the UI; an Emulator wraps exactly one Core.

## Register file

A named, ordered set of an **Emulator**'s registers that share a width and a way of reading their values, read from the **Core** as one unit, optionally with a row of **Status flags** of its own. Every Emulator has a Register file for its general registers; an architecture adds the files its Core holds, such as floating-point registers or control and status registers. The program counter and the CPU's Status flags are not Register files.
_Avoid_: coprocessor registers, register group, register set, extra registers

## Format

The way a **Register file**'s bit patterns are read for display: hex, single precision or double precision. A file offers the Formats that make sense for its registers and the person picks one; a Format changes what is shown, never the value.
_Avoid_: view, representation, interpretation, display mode

## Size name

What a **Target** calls one of the widths the editor reads values at: the same four bytes are a `Long` to the 68000, a `Word` to MIPS and RISC-V and a `Dword` to x86, and the same two are a `Word` to the 68000 and a `Halfword` to MIPS. The width itself is the same everywhere — `RegisterSize` is a count of bytes, spelled the way the 68000 spells it because M68K was the first language here — and only the name shown changes, in `packages/asm-editor/src/lib/languages/sizeNames.ts`. Used by the width grouping strip of the **Register file** panel and by anything that writes a width out.
_Avoid_: size alias, operand size, B/W/L

## Status flag

A named one-bit condition of an **Emulator**, shown as 0 or 1 with its change highlighted. The CPU has a row of them (the M68K CCR bits, the x86 EFLAGS bits, the Z80 F bits; MIPS and RISC-V have none), and a **Register file** may carry a row of its own, such as the MIPS FPU condition flags.
_Avoid_: status register, status codes, condition codes, CCR (except for the M68K register itself)

## Diagnostic

A compile/check-time finding about the program's source, tagged `error`, `warning` or `suggestion`. Only `error`-severity diagnostics block compilation and disable Build; the others are reported (amber/info squiggles, listed above stdout) while the program still builds and runs. A Core may supply a **Hint**, which is shown directly with the finding. Distinct from the Emulator's runtime **errors**, which are strings produced while executing. Producers today: s68k, MIPS and RISC-V preserve their Core-supplied severity; x86 and Z80 report errors only (the x86 Core only parses its assembler logs when the assembler exits non-zero, discarding the severity marker it matched on, and `@specy/z80` returns one flat diagnostic list with no severity field).

## Hint

Actionable help supplied with a **Diagnostic** so the learner knows how to correct the source or investigate it further. It is displayed directly after the finding rather than hidden behind another interaction.

## Interrupt

The generic state "the Emulator is paused mid-execution waiting on the user" (e.g. a program requested keyboard input). Owned by this codebase, not by any Core's type system; language-specific interruption details (like s68k interrupt payloads) are mapped _into_ it. While an Interrupt is pending, execution controls are disabled.

## Pause

A user-requested suspension of forward execution within a **Debug session**, retaining the program for inspection, Step, instruction Undo, and Resume. Distinct from an **Interrupt**, which the program causes by requesting input, and from Stop, which ends the Debug session.

## Breakpoint

A line of a **File** marked so that a **Debug session** stops there: a Run reaching it stops before the line's instruction executes, with that instruction still to run. The instruction a Run _starts_ on is the exception, and runs whether or not a Breakpoint names it, which is what lets Run continue from the Breakpoint it stopped at; a loop closing on its own Breakpoint still stops on every pass. A line that assembles to no instruction stops nothing, and one that assembles to several is a single Breakpoint, taken where the line is entered. A Breakpoint on a **Listing** is an address in its **Executable** rather than a line, and stops before the instruction at that address. A Breakpoint on a line of a C or C++ File stops on the **Generated assembly** compiled from it: on the first instruction of each block mapped to that line by a current **Source map**, where a block ends at an instruction mapped to another line and labels and directives do not end it. A `for` header therefore stops once on entry and once per pass, at its increment, and a stale or missing map places none. A Breakpoint on a line of **Pseudocode** is the same rule applied through the decompiler's addresses: it places address Breakpoints on the Listing, kept as the Listing's own. Distinct from a **Pause**, which the user asks for mid-run, and from `simhalt` and the Z80 cliff, which are the program stopping itself. See [ADR 0023](./docs/adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md).
_Avoid_: break, stop point, halt point

## Poke

A change a person or the coding agent makes to one register or memory value of a **Debug session** between two instructions, kept in the same Undo history as the instructions as a step of its own. Distinct from a mutation, which is a write the program made, and from a **Testcase**'s starting values, which are preset before the run and never undone.
_Avoid_: edit, value edit, override, set value, host write, manual write; patch, except for the **Patch** of an instruction

## Patch

A **Poke** that replaces one instruction of an **Executable**'s code, typed on its line of the **Listing** during a **Debug session** and assembled to fit the bytes it replaces, a shorter encoding padded with `nop`. It lives in memory only: it is undone like any Poke, gone at the next Build, and the Executable's File never changes. Distinct from a **Byte edit**, which changes the File.
_Avoid_: edit, binary patch, hot patch, modification

## Hex editor

The **Workbench**'s view of a **File** stored as bytes, as rows of hexadecimal bytes beside their text, where typing over the bytes makes **Byte edits**. An **Executable** opens in it, and so does any byte File the browser cannot preview, in every **Target**. Distinct from the memory view, which shows a **Debug session**'s memory rather than a File.
_Avoid_: hex view, hex dump, byte viewer

## Preview

The **Workbench**'s view of a **File** as it reads rather than as its bytes or text: a byte File as the browser itself shows its kind, an image, a PDF, audio or video, recognised by the File's first bytes and never by its name, which can be switched to the **Hex editor**; or a Markdown text File rendered, recognised by its name as a C File is, which can be switched back to its text or to the Hex editor.
_Avoid_: viewer, render, thumbnail

## Byte edit

A change typed into a byte **File** in the **Hex editor**, saved with the **Project** apart from the File's original bytes, which are kept unchanged. It overwrites bytes and never changes the File's length. Everything that reads the File (the **FileSystem**, a Build, the **Listing**, a download) sees the edited bytes, and nothing in the interface yet lists Byte edits or shows the original. Distinct from a **Patch** and any other **Poke**, which change only a Debug session's memory. See [ADR 0047](./docs/adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md).
_Avoid_: patch (the memory-only **Patch**), binary patch, modification, diff

## Peripheral

A device owned by an Emulator that programs interact with through the Core: Cores write to it and read from it (via the adapter), the UI presents its output or supplies its input. Peripherals are part of the Emulator, not siblings of it. The shared set includes the **Terminal**, **Screen**, **Keyboard**, **Mouse**, and **FileSystem**; an architecture exposes the devices its adapter can connect to the Core.

## Screen

The Peripheral representing a program's graphical output through its simulator environment's graphics conventions. For environments whose simulator has a single output window, it also shows the program's text output and input echo at a text cursor. In double buffering mode, its visible image remains separate from the image being drawn until the program presents it.

## Keyboard

The Peripheral representing keyboard input for a program interacting with the **Screen**, observed either as typed characters or as key state. Its pending typed input also supplies the **Terminal**'s character, string and numeric reads in graphical use.

## Mouse

The Peripheral representing pointing input for a program interacting with the **Screen**, including mouse buttons and position in the Screen's logical pixels, observed as the current state or as the snapshots taken at the last button down and up. Its coordinates share the drawing origin at the top left and are independent of GUI zoom.

## Terminal

The Peripheral owning program output (stdout) and user input requests. Cores reach it in their own dialect: syscalls for M68K, MIPS, RISC-V and x86, **Console port** reads and writes for the Z80. Input requests go through its current **Input Source**; output accumulates as the text the UI displays. Interactive input is typed in the Terminal itself, after the output, and its **Line discipline** decides what each read receives ([ADR 0036](./docs/adr/0036-programs-read-input-typed-in-the-terminal.md)). Interactive answers are echoed into the output like a tty; scripted answers are not, like piped stdin.

## Command line

The **Terminal**'s first line, `$ ./crackme hunter2`: the name an x86, MIPS or RISC-V program is started under followed by its **Arguments**, editable outside a **Debug session** and locked during one to what that run started with. It says how Build and Run start the program; it is not a shell and runs no commands.
_Avoid_: prompt, shell, run line

## Arguments

The words an x86, MIPS or RISC-V program receives after its own name in `argv`, a **Setting** of the **Project** edited on the **Command line**. A **Testcase** can bring its own. MIPS and RISC-V programs find `argc` and `argv` in `a0` and `a1`, stored above the stack ([ADR 0046](./docs/adr/0046-mips-and-risc-v-programs-get-argv-above-their-stack.md)).
_Avoid_: args, parameters, command-line options

## Line discipline

The **Terminal**'s rules for turning typed keys into what a program's read receives: a line read edits a line until Enter, a character read returns on a single keystroke with Enter giving the **Reference environment**'s code, and Ctrl+D gives **End of input** to standard input. It also decides the echo. It belongs to the editor, not to a Core or to the component that draws the Terminal.
_Avoid_: tty driver, input mode, canonical mode (except when contrasting line reads with character reads in a Linux context)

## FileSystem

The **Peripheral** through which an **Emulator** accesses its **Files**, shared with the editor for an interactive **Project** or isolated for a **Testcase**. These are the files available to assembly and to the running program.
_Avoid_: drive peripheral

## Input Source

The source of answers to a **Terminal**'s input requests: interactive user input or a **Testcase**'s scripted answers. Interactive character, string and numeric input can come from the **Terminal** or the **Keyboard** associated with a **Screen**.

## End of input

The answer an **Input Source** gives a read of standard input (descriptor 0) when it has no more lines: a **Testcase** whose scripted answers are exhausted, or an interactive user pressing Ctrl+D or the End of input button. The read returns 0 bytes; the educational read syscalls never receive it.
_Avoid_: EOF (for the Terminal-level event)

## Program time

The passage of time as a program observes it through its environment's wait and time operations. It follows host time; no environment emulates a clock rate. Distinct from a Core's instruction or cycle count, which drives the instruction limit and the Undo history.

## Time Source

Where a program's **Program time** comes from: host time in an interactive run, or a virtual clock in a **Testcase**'s scripted run, which starts at zero and advances only through the program's waits. Selected for the whole run together with the **Input Source** and the **Random source**.

## Random source

Where a program's random services get their starting state: host randomness in an interactive run, or a fixed seed in a **Testcase**'s scripted run, so its numbers are the same on every run. A program that seeds a generator itself gets that seed's sequence either way. Selected for the whole run together with the **Input Source** and the **Time Source**. See [ADR 0037](./docs/adr/0037-testcases-run-on-a-seeded-random-source.md).
_Avoid_: RNG, entropy source, random seed (when the source, not one seed, is meant)

## Port map

The Z80's way of reaching every **Peripheral**: a fixed assignment of I/O port numbers, read and written with `in` and `out`, grouped by peripheral: the **Console ports** for the **Terminal**, and the ports for the **Screen**, **Keyboard**, **Mouse** and program time. Every port outside the map is an empty bus: writes are ignored and reads return 0xFF. See `docs/adr/0011-z80-peripherals-through-the-port-map.md`.

## Console port

The **Port map**'s group for the **Terminal**. A Z80 has no system calls: programs talk to the outside world with `in`/`out` on one of 256 I/O ports, so the Emulator maps a fixed handful of them (`Z80_PORTS` in `packages/asm-editor/src/lib/languages/Z80/Z80-model.ts`) onto the Terminal, one port per output format (character, unsigned, signed, hexadecimal, 16 bit) instead of one syscall number per operation. A write formats the byte and appends it to the Terminal's output; a read with no buffered input pauses the machine — the Core stops with `WAITING_FOR_INPUT` and the adapter re-executes the `in` once the Terminal's **Input Source** has answered — so a port read raises an **Interrupt** like any other input request. See `docs/adr/0002-z80-console-ports.md`.

## Project

The unit of work the editor saves, opens and shares: one **Target**, its **Files**, its **Settings**, its **Testcases**, its **Display configuration**, a name and a description. A record with those parts, not a folder: only its Files are visible to the assembler and the program.
_Avoid_: workspace, folder, program

## Target

The architecture and supported assembler/runtime environment selected for a **Project**, determining the machine its programs run on. Distinct from the **File language** of its individual Files.

## File language

The language of a text **File**, such as target-specific assembly, C, or plain text, used to interpret and present its source. It is independent of the Project's **Target** and the File's storage encoding; selecting a language does not make a compiler for it available.

## Hosted program

A program compiled from a higher-level **File language** for a **Target** that may use the standard library its **Runtime library** provides. See [ADR 0029](./docs/adr/0029-hosted-programs-link-an-editor-owned-runtime-library.md).
_Avoid_: Self-contained program (the earlier, library-free boundary of ADR 0027, which x86 keeps until it has a **Runtime library**)

## Runtime library

The editor-owned, versioned C standard library and startup code for a **Target**, with its own headers, whose supported functions are a written list. It reaches the **Terminal** and **FileSystem** through the Target's syscalls.
_Avoid_: libc (when this specific library is meant), runtime

## Runtime ABI

The named, versioned binary interface of a **Runtime library** (`v1`, …) that a Project's Setting or a **Compilation record** pins: its exported symbols, their signatures and its public struct layouts. Each Runtime ABI has one current implementation, which the editor may update under saved Projects. See [ADR 0031](./docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md).
_Avoid_: runtime version (when the interface, not a release, is meant)

## Reference environment

The real simulator or operating system whose behaviour a **Target**'s services match: EASy68K for M68K, MARS for MIPS, RARS for RISC-V, a Linux process on a tty for x86, and the **Port map** itself for the Z80, which has no real counterpart. A service departs from it only through a documented deviation that helps a learner. See [ADR 0035](./docs/adr/0035-environments-match-their-reference.md).
_Avoid_: real world, upstream (when the behaviour, not the source code, is meant)

## Environment library

The editor's C interface, `<sim.h>` with `sim_`-prefixed functions shared by every **Target**, to the services a Target's simulator environment offers, one function for each service its **Documentation** lists (every syscall, including those the **Runtime library** also covers, such as printing an integer or sbrk) and functions for its memory-mapped devices, such as the bitmap display and the keyboard registers. Its names cannot clash with the C or C++ standard library, and any C or C++ source can include it. Distinct from the **Runtime library**, which is the C standard library and reaches the same services only privately.
_Avoid_: hardware library, syscall library, platform library (none of these services is hardware, and "platform contract" names the Runtime library's internal layer)

## Library member

One assembly unit of a **Runtime library**, usually a single function, which a **Core** adds to a Build only to resolve a global symbol the program uses but does not define. See [ADR 0030](./docs/adr/0030-cores-resolve-runtime-library-members.md).

## Start unit

The editor's own start code for x86 programs compiled from C or C++, until x86 has a **Runtime library**: two read-only NASM Files outside the **Project**, offered to every x86 Build of a Project that holds **Generated assembly** whose **Compilation record** requires no **Runtime ABI**. The linker takes `@runtime/start.asm` for a program without a `_start` of its own: it runs the constructors, calls `main`, runs the static destructors and exits with `main`'s result. It takes `@runtime/support.asm` for what the program uses of it: as weak symbols, what GCC's output calls without the program asking, `memcpy`, `memmove`, `memset`, `memcmp` and the C++ ABI's hooks. The debugger steps through it as it does through **Library member** code. See [the x86 translation plan](./docs/design/x86-compiler-assembly-translation-plan.md), milestone 3a.
_Avoid_: crt0 (the Runtime library's start code, which takes its place once x86 has one)

## Source compilation

The conversion of a selected higher-level **File** and its project-local headers into **Generated assembly** for the **Project**'s **Target**. Distinct from a Build, which assembles Files into a program for the **Emulator**.

## C/C++ language help

The editor's lightweight assistance while writing C or C++: language keywords and snippets, function suggestions, parameter hints and hover documentation for the **Project**'s **Target**, including its **Environment library** and supported **Runtime library** functions. It also recognizes ordinary variable, parameter and function declarations in the current File using basic lexical scopes. It does not establish whether a program is valid; Compile reports compiler errors.
_Avoid_: LSP (when this assistance, rather than the Language Server Protocol, is meant), C++ IntelliSense (when full type-aware analysis is implied)

## Compiler driver

The replaceable component that performs **Source compilation**, turning source Files and headers into **Generated assembly** and its **Source map** for a Target's compiler preset. Compiler Explorer is the current driver; nothing outside it depends on which compiler service is used.
_Avoid_: Compiler Explorer (when the role is meant)

## Generated assembly

An assembly **File** produced by **Source compilation** for the **Project**'s **Target**. Distinct from the machine code produced when a Build assembles it.

## Compilation record

Saved **Project** metadata identifying a **Source compilation**'s input Files and **Generated assembly** by their paths and content fingerprints. It retains the compilation's origin independently of its transient **Source map**.

## Source map

The correspondence between lines of **Generated assembly** and the higher-level **Files** used by its **Source compilation**, held as transient editor data belonging to the **Project**. Distinct from a Core's mapping between assembled instructions and assembly lines.

## Stale assembly

**Generated assembly** whose source File or a project-local header used to compile it has subsequently changed. Its contents remain available, but its Source map has been removed and the editor identifies it as stale.

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

The **File** found at a Project's **Entry path**, when it exists, from which a Build begins. Depending on the Target, other Files are reached through includes or linked as separate units. x86 assembles every `.asm`, `.s` and `.nasm` File that another unit does not include, and links with the Entry's unit only those that define a symbol the program needs, as a linker takes members from an archive ([ADR 0033](./docs/adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md)). When the Entry file is an **Executable**, a Build loads it and assembles nothing.
_Avoid_: main file, active file, selected file, open file

## Executable

A **File** holding a program already built for the **Project**'s **Target** by a compiler and linker outside the editor, which a Build loads as it is instead of assembling. Today only an x86-64 Linux ELF in an x86 Project; its own symbols may have been stripped. See [the binary import design](./docs/design/binary-import.md).
_Avoid_: binary (any File that is not text is binary), imported binary, compiled program, ELF (as a noun)

## Listing

The read-only assembly text the editor shows for an **Executable**, or for a shared library it loads: one line per instruction of its code, with the instruction's address and bytes, labelled where a symbol names it. It is generated whenever it is shown and never saved, and nothing builds from it.
_Avoid_: disassembly (the decoding that produces it), dump, decompilation (see **Pseudocode**), listing file

## Pseudocode

The read-only C-like text the editor shows for one function of an **Executable**, produced by Ghidra's decompiler from the File's current bytes: the function the **Listing**'s cursor is in, or the program counter's during a **Debug session**, shown beside the Listing and linked to it line by line by address. It is generated whenever it is shown and never saved, and it reads like C without being meant to compile. See [ADR 0048](./docs/adr/0048-decompiled-code-is-a-view-not-a-file.md).
_Avoid_: decompiled C, decompilation (when the text is meant), source, C code

## Invented name

A name the **Listing** gives an address its **Executable** names nowhere: `FUN_<adjective>_<animal>` for a function, `DAT_<adjective>_<animal>` for data. It is derived from the address in the file, so it is the same on every open and for everyone, from word lists that are never edited once released. Distinct from the names the bytes give (symbols, `name@plt`, an `s_` string's text) and from the numbered `.LAB_n` of a jump target. See [ADR 0045](./docs/adr/0045-invented-names-are-frozen-words-from-file-addresses.md).
_Avoid_: random name, generated name, placeholder name

## Bundled library

One of the five Linux shared libraries the x86 **Core** ships for the **Executables** that need them, from one Ubuntu release: glibc's dynamic linker, `libc.so.6` and `libm.so.6`, and GCC's `libstdc++.so.6` and `libgcc_s.so.1`. An Executable that needs any other library does not start. Unrelated to the **Runtime library**: an Executable was linked against glibc elsewhere and cannot use the editor's library.
_Avoid_: system libraries, libc (when all five are meant), runtime

## Library code

The code a Step runs through in one go rather than entering, unless the _Step into library code_ **Preference** is on: a **Runtime library**'s **Library members** and the **Start unit**, shown read-only under `@runtime/`, and the shared libraries an **Executable** loads, each shown as its **Listing** under `@lib/<soname>` (`@lib/libc.so.6`). Neither path is a **File** of the **Project**, and a library's Listing takes no **Breakpoint**. An Executable's own PLT stubs are stepped through as library code too.
_Avoid_: system code, external code, foreign code

## Displayed file

The **File** currently shown in the editor, chosen independently of the **Entry path**. Its displayed version is either the live Project content selected through file browsing or the **Build snapshot** source selected through debugger navigation. A File stored as bytes is displayed in the **Hex editor**, or as a **Preview** when the browser can show its kind; an **Executable** opens in the Hex editor too and can be switched to its **Listing** or its **Pseudocode**.

## Build snapshot

The fixed versions of the **Files** and **Entry path** used by one Build, identifying the source of its running program. Later **FileSystem** changes belong to the current Project Files and affect subsequent Builds.

## Build output

The executable an x86 Build links from its sources, shown in the Explorer as a read-only File of that Build and present in the program's **FileSystem**, so it opens like any **Executable** and can be downloaded or run elsewhere. Each Build replaces it, and it is never saved with the **Project**; keeping one copies it into the Project as an Executable. See [ADR 0050](./docs/adr/0050-the-built-program-is-a-build-output-never-saved.md).
_Avoid_: a.out, binary, compiled program, artifact (the Core's build artifacts are line data, not this File)

## Debug session

The lifetime of a built program retained for execution, inspection, and instruction Undo, from a successful Build until Stop or disposal. Program exit does not itself end the session or return host editing access to the **Files**.

## Workbench

The full-screen editor in which a person writes, builds, debugs and tests a program, laid out like an IDE and hosted by a page that owns everything around it: the project page and the exam session. Distinct from the **Interactive editor**; the two are separate on purpose.
_Avoid_: project editor, IDE, full editor, fullscreen editor

## Interactive editor

The editor embedded inside another page's content, showing only the panels its host asks for: every **Playground**, the documentation's instruction pages, the exam builder, the lecture agent and the chat page. Distinct from the **Workbench**.
_Avoid_: embed editor, small editor, playground editor, inline editor (for the component)

## Debug tools

The three views of a **Debug session** that follow execution step by step: the Stack pointer (the memory around the stack pointer), the History (the steps instruction Undo can take back, **Pokes** included) and the Call stack. In the **Workbench** they are floating windows or sections of the debug column, as a **Preference** chooses. Registers, memory and the **Screen** are not debug tools.
_Avoid_: inspectors, trackers, user tools, floating panels

## Memory region

A range of a **Debug session**'s memory with one kind of content, worked out from the **Core**'s layout (or, for a memory-mapped device, reported by its **Peripheral**) and covering what the program occupies now rather than what its environment reserves. The program's own bytes split into a region for each run of one kind (code from instructions, data from `dc`/`.word`/`db`, reserved room from `ds`/`.space`/`.bss`) inside one section, so instructions, a `dc` and more instructions are three regions; a language with only `org` takes each contiguous assembled run as its section. The heap, the stack, the program's **Arguments** and each memory-mapped device are regions of their own: the heap runs from its start to the current break and the stack from the stack pointer to its top, so both move as the program runs, and a region the program has not touched yet is empty at its start address. The Arguments region sits above the stack and holds what the program was started with, as the Core wrote it at the start: the `argv` array and its strings ("Arguments" on MIPS and RISC-V), or on x86 the whole Linux process-start block with the environment and the auxiliary vector ("Arguments and environment"), its parts named like data labels (`argv`, `argv[1]`). A device region can overlap the program's own, as the MARS bitmap display does `.data` by default, and both stay regions. The memory view draws a data or reserved region in chunks, one for each data label in it, so the variables of a section read apart. Distinct from a page, which is the fixed-size window the memory view shows at a time.
_Avoid_: segment (the Z80 Core's name for a contiguous assembled run), area, zone, memory map entry

## Log

The **Workbench**'s record of what it did for the person: each Build with its result, each test run with the outcome of every **Testcase**, and each program exit with its running time and how it ended (its exit code, or the signal or runtime error that ended it), followed by notes on what the program met that the **Emulator** lacks, such as a system call it does not implement or an instruction it cannot run. Distinct from the **Terminal**, which holds what the program itself wrote, and from the **Diagnostics**, which are listed on their own.
_Avoid_: output, build output, console

## Settings

Per-Project configuration that changes what the **Emulator** or the program does: the undo history size, the separate **Screen** and **FileSystem** undo budgets, and an x86, MIPS or RISC-V program's **Arguments**. They belong to one **Project**, are edited through the editor's GUI and are never a file the program can see. A Project records only the Settings decided for it; anything undecided follows the app's default for its language. The MARS bitmap display is not a Setting, see **Display configuration**.
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

A declarative check run against a program: starting registers/memory/input (and, on x86, MIPS and RISC-V, **Arguments**) and expected registers/memory/output, with memory expectations interpreted in the Emulator's endianness. Each Testcase runs independently with a scripted **Input Source**, a virtual **Time Source**, a seeded **Random source**, and its own writable **FileSystem** initialized from the same starting Files as the other cases in that test run.

## Documentation

The reference for one language: its instructions, directives, registers and the services its environment offers (traps, syscalls, ports, the **Screen**), read on the language's documentation pages and in the **Workbench**'s Documentation panel. It says what each thing does, where a **Course** teaches; a RISC-V-64 **Project** reads the RISC-V Documentation.
_Avoid_: reference, manual, help, docs (in prose)

## Documentation entry

One thing the **Documentation** describes, shown, found and linked on its own: an instruction, a directive, a syscall or trap task, a register, an addressing mode, a port, an exception, or one heading's worth of a longer explanation such as the Screen's. The Workbench's Documentation panel, the documentation pages and search all read the same entries. See [ADR 0025](./docs/adr/0025-documentation-is-a-list-of-entries.md).
_Avoid_: doc item, article, card, topic (a **Topic** is what a Lecture teaches)

## Chapter

A named group of one language's **Documentation entries** that share a kind or a subject: Instructions, Directives, Trap tasks, Registers, the Screen. It is a heading in the Documentation panel and one page of the language's documentation site.
_Avoid_: section, category (an **Instruction category** groups instructions inside the Instructions Chapter), group (a **Module** groups Lectures)

## Instruction category

The one kind of work an instruction does, such as Arithmetic or Control flow: its **Documentation entry** is listed under it in the Instructions **Chapter**, and its page, its row and the editor's hover name it. Every language draws its Instruction categories from one shared list and uses the ones that apply, adding one of its own only where nothing in the shared list fits. A mnemonic has exactly one, decided by its main job rather than by what each of its **Instruction forms** does.
_Avoid_: section (NASM's heading for an x86 instruction), class, family, group

## Instruction form

One operand shape a mnemonic is accepted with, as the **Core**'s assembler lists it: `lw $t1, -100($t2)` and `lw $t1, label` are two forms of MIPS `lw`. A mnemonic's **Documentation entry** lists its forms.
_Avoid_: variant (in prose; the code's `variants` are forms), overload, syntax

## Form pattern

One row of an instruction's list of forms, standing for every **Instruction form** that differs only in an operand's width or in which register of one class it names: x86 `add r/m, imm` for its 8, 16, 32 and 64-bit forms, Z80 `ld r, r'` for 49 forms. Forms with different **Instruction tags** are never one Form pattern.
_Avoid_: template, shape, syntax line, variant

## Instruction tag

A fact about an **Instruction form** as its assembler or its real processor defines it, from one shared list: Pseudo-instruction, RV64 only, Undocumented, Privileged. Privileged means the processor reserves the form for supervisor mode, even where the **Core** runs every program in that mode, as s68k does. A form can have several or none; a mnemonic shows a tag beside its name only when every one of its forms has it, and otherwise the tag sits on the forms that have it. Unlike an **Instruction category**, a tag says nothing about the kind of work done.
_Avoid_: category, flag (a **Status flag** is a CPU bit), badge, attribute

## Instruction example

A small runnable program attached to an instruction's **Documentation entry**, focused on that instruction with only the supporting code needed to demonstrate it and all register and memory setup visible in its source. It can show variations and quirks within the same program, with faulting variations commented out for the reader to enable; distinct from a **Language course**'s **Example**.

## Lecture section

The part of a **Lecture** under one second-level heading, with any third-level headings inside it, or the opening text before the first one: the unit a search finds in a **Course** and opens the Lecture at.
_Avoid_: chunk, passage, paragraph

## Search scope

What one search looks through, set by the place it is made from rather than chosen by the reader. For a language, its **Documentation**, its **Language course** and the **General course**, whether the search starts in the **Workbench**, the language's documentation pages or the Language course. On a General course page and on the list of Courses, the General course and every Language course, with no Documentation. In an **Exam**, the Documentation alone, so no **Example** hands a student a finished program.
_Avoid_: corpus, index, search set, filter

## Course

A sequence of **Modules** on one subject, listed on the Learn page with its own landing text and metadata (name, description, authors, date, order). Two kinds exist: the **General course** and the **Language courses**. Content only: a Course is a folder of markdown and metadata, never code.

## Module

A themed, ordered group of **Lectures** inside a **Course**. A Module has a name and a description but no body of its own that the reader studies.

## Lecture

One page of a **Course**: markdown text with **Playgrounds**, read in order with Previous and Next. The unit a reader studies in one sitting.

## Playground

A runnable code block inside a **Lecture** or **Blog post**: an embedded editor with its own **Emulator**, configured by flags on the code fence (memory, console, tests, program counter, screen, open in the editor). Every Lecture that teaches an instruction shows it in a Playground.

## General course

The Course "Assembly basics": the overview of what most assembly languages share, using several of the editor's languages as examples and covering each topic once, shallowly. Its three Modules define the topic order every **Language course** mirrors.
_Avoid_: beginner course, basics course

## Language course

A **Course** about one of the editor's languages (M68K, MIPS, RISC-V, Z80, x86). It mirrors the **General course** Module for Module and Lecture for Lecture, retitled for the language, with an opening "Getting started" Lecture and the outside-world Module bent to what the machine really has (traps, syscalls, memory-mapped or port-mapped I/O). It closes with an **Examples** Module. A Lecture with no counterpart in the General course is allowed where the machine has something the others do not: RISC-V's "Going 64-bit", and the floating point Lecture of the three languages whose Core has a floating point unit.
_Avoid_: specific course, single course, deep dive

## Example

A complete, verified program that closes a **Language course**: one **Lecture** in its Examples Module, placed by what the reader needs to know before it. The same ladder of Examples exists in every Language course, program for program (the snake game in M68K is the snake game in RISC-V), so a reader can compare how each language does the same thing. A rung is missing only where the environment cannot run it: x86 has nineteen of the twenty five and no Screen, though it can read standard input from the Terminal.
_Avoid_: demo, sample, snippet

## Exercise

A task that closes a **Lecture** of a **Language course**: a **Playground** preloaded with a skeleton, a stated goal, and a **Testcase** that checks the reader's solution. One or two per Lecture; none in the **General course**, whose Lectures only invite the reader to change a Playground and watch.
_Avoid_: quiz, challenge, problem

## Topic

The subject a **Lecture** teaches, named the same way in every **Course** that covers it (registers, the stack, syscalls, the snake game). It is what ties a **General course** Lecture to its deep dives in the **Language courses**, and an **Example** to the same program in the other languages; the links between them are derived from it, never written by hand.

## Blog post

A standalone article on the ASM Editor website explaining an app workflow, a **Use case**, or how the app is built. It can contain screenshots and **Playgrounds**, without belonging to a **Course**'s ordered Lectures.
_Avoid_: Lecture (for a standalone article), Documentation entry

## Use case

A concrete task a reader can accomplish with ASM Editor, explained in a **Blog post** tagged "use case".
_Avoid_: feature (one capability that may support several tasks), Topic (a Course's teaching subject)

## Guided tour

A **Blog post** that introduces the app through steps illustrated by annotated screenshots, **Playgrounds**, and actions to open examples in the editor.
_Avoid_: in-app tour (an interface overlay), Lecture

## Blog tag

A shared label classifying **Blog posts** by their purpose or subject. A post can have several Blog tags, including both "guide" and "use case".
_Avoid_: Topic (a Course's teaching subject), category (when it implies mutually exclusive groups)
