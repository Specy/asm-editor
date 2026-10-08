# Source runtime

Design interview started on 2026-10-04. It decides how programs from Source compilation, and optionally hand-written assembly, use a C standard library that reaches the Terminal and the FileSystem through each Target's syscalls. Vocabulary comes from [CONTEXT.md](../../CONTEXT.md). This document records accepted decisions; the [implementation plan](./source-runtime-plan.md) orders the work. Implementation has not been authorized.

## Proposed layering

1. **Platform contract.** A versioned specification per Target of the syscalls the Runtime library may rely on (`read`, `write`, `open`, `close`, `sbrk`, `exit`, and Terminal behaviour on descriptors 0–2). Gaps are fixed in the Cores and adapters rather than worked around in the library.
2. **Runtime library.** A `runtime/` project in this repository: lean headers, one function per source file, a per-Target syscall layer and a hand-written `crt0`. A pinned cross toolchain builds it offline into Library members per Target, a symbol index, function metadata and member Source maps, tested on each Core.
3. **Startup.** `crt0` defines `_start`, runs initialization (including `.init_array`), calls `main` and passes its result to `exit`. The Cores take an entry-symbol option, which retires the `-Dmain` rename and the generated wrapper.
4. **Linking.** The Cores assemble several units and resolve Library members ([ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md)).
5. **GNU assembler profiles** for MARS and RARS, so compiler output assembles without rewriting.
6. **Editor integration** through the Compiler driver, Build sources, the Compilation record, the language service and the Workbench.

## Accepted decisions

### Compiler driver

Source compilation stays on Compiler Explorer. It sits behind a replaceable Compiler driver so an in-browser compiler can be considered later; nothing outside the driver depends on Compiler Explorer. Consequence: Runtime library headers are uploaded with every compile and must stay small.

### Runtime library scope

The Runtime library is our own, not picolibc ([ADR 0029](../adr/0029-hosted-programs-link-an-editor-owned-runtime-library.md)). Its written function list covers at least:

1. Terminal stdio: `printf` with float formatting, `scanf`, `fgets`.
2. FileSystem stdio: `fopen`, `fscanf`, `fprintf` on Project Files.
3. `malloc`/`free`, `qsort`, `strtol`, `<string.h>`, `<ctype.h>`.
4. `<math.h>`, including `sin` and `pow`.
5. C++ support for global constructors, `new`/`delete` and virtual destructors.

Hard algorithms are taken from musl's MIT-licensed sources. Behaviour is tested against host glibc output. The code written for the library is under the repository's AGPL-3.0 with a linking exception ([runtime/LICENSE-EXCEPTION.md](../../runtime/LICENSE-EXCEPTION.md)), since its members are linked into every program that uses it.

### Member resolution

The Core resolves Library members from the program's undefined globals with `ld` semantics ([ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md)).

### Which Builds link the Runtime library

Linking is a Project Setting, _Link Runtime library_, not a property of Generated assembly, so hand-written assembly can call `printf`. It is off by default for manual assembly; a Compilation record requires it for its Generated assembly. When the Setting is off, an undefined symbol that the Runtime library defines carries a Hint suggesting the Setting.

Off by default because enabling it silently would let a call to an unwritten or misspelled function such as `strlen` link the library version, which defeats graded exercises and Testcases, and would remove the undefined-symbol diagnostic for every libc name.

A Build that links the Runtime library may mix assembler profiles per unit: Library members use the GNU profile while a manual Entry keeps its MARS or RARS dialect.

### Language service

Live checking calls the same Core API with the same libraries as Build, so diagnostics agree with Build. The setting and library assets travel through the worker protocol, and a setting-only change starts a new analysis revision. When the Setting is on:

- `jal`/`call` operand completion offers library functions; hover and signature help show the C prototype, a doc line and the Target's calling convention, all emitted by the offline runtime build.
- The same metadata becomes Documentation entries under a Runtime library heading for each Target.
- Go to definition opens the read-only Library member or, through its Source map, its C source. Rename and find-references treat library symbols as read-only.

C Files get no language service from this work; that belongs with a future in-browser compiler (clangd).

### Stream buffering

Every output stream writes through: each stdio call issues its `write` syscall before returning, and `printf` formats into a local buffer and writes once. `fflush` and `setvbuf` exist and succeed but change nothing. This deliberately departs from C's line-buffered `stdout` and fully buffered files: only the timing of bytes differs, never their content. Output then appears on the step that produced it, survives a runtime error or a raw exit syscall from manual assembly that never calls `exit()`, keeps `stdout` and `stderr` in call order, and lands each file write in the FileSystem in step with FileSystem Undo ([ADR 0015](../adr/0015-restore-file-operations-on-undo.md)). Do not "fix" this to standard buffering.

### Versioning

Projects pin the Runtime ABI, not an implementation ([ADR 0031](../adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)). The _Link Runtime library_ Setting's value is `off` or an ABI such as `v1`; a Compilation record requires its ABI. The editor ships the latest implementation of each supported ABI. Exam submissions are graded once, at submission, so a later library fix changing a re-run is acceptable.

### Program start and layout

A manual-assembly Build that links the Runtime library keeps its own start, the first text statement or `main` as today, with no `crt0`; only Builds whose Entry is Generated assembly start at `crt0`'s `_start` through the Cores' configurable start label (today a fixed `main` with a `startAtMain` flag in both MARS and RARS). The Runtime library therefore needs no initialization: stdio streams are initialized statically, `malloc` sets up its heap on first use, and `exit()` remains callable from assembly to run `atexit` handlers. The runtime test corpus calls every function from a bare assembly program without `crt0`.

User units come first in every section, so linking the library does not move a manual program's addresses; library data follows user data, and the heap follows both.

### Stepping and Undo around library code

By default Step never stops in Runtime library code: when an instruction lands in a Library member, execution continues until the program counter is back in user code, stopping early for a breakpoint, an input Interrupt, an exit or an error. Stepping over `call printf` lands on the next user instruction with the output already printed; stepping into `qsort` stops at the student's comparator, because the library calls back into user code ("Just My Code" semantics). Undo returns to the previous stop: each Step records how many instructions it ran, and Undo pops that many through the existing per-instruction history, so FileSystem and Screen journals need no change. When the history no longer holds the whole stretch, Undo is unavailable for that Step rather than landing partway through library code. The History panel shows a library stretch as one row whose _Undo to here_ returns to before the call. Run keeps per-instruction Undo. The call stack names library frames either way. The editor recognizes library code from the File identity every assembled statement carries.

A Build whose program starts in library code, a compiled program at `_start`, runs that code before handing the program over, up to its first instruction of user code: `main`, or a C++ global constructor that runs before it, which is where a Step from `_start` would stop. The start code runs outside the Undo history, so the Debug session begins on the program's own line and Undo never returns into `_start`. A Testcase still starts at `_start`.

A Workbench toggle, _Step into Runtime library_, makes library code ordinary: Step stops in it, the read-only member is shown, breakpoints can be set there, Undo goes one instruction at a time, and a Build stops at `_start`.

No Core-native grouping is needed. The Cores' backstep stacks instead allocate slots on first use, and the history limit behind the unchanged on/off _Undo_ Setting rises to fit a library call.

### Standard input

Descriptor 0 has tty semantics owned by the adapter and the Terminal. `read(0, buf, n)` first returns bytes left over from the current line; otherwise it asks the Input Source for one line through the existing prompt or Keyboard path and echo rules, appends `\n`, returns up to `n` bytes and keeps the rest. `scanf("%d", …)` followed by `fgets` therefore sees the leftover newline, as in C.

Reads on descriptor 0 report End of input by returning 0: when a Testcase's scripted answers are exhausted, and interactively when the user presses Ctrl+D or the visible End of input button in the input prompt (each answers one read). The educational read-int and read-string syscalls keep their current behaviour, including the "no input left" error, so existing Testcases are unaffected.

Today both Cores route `read(0)` to a synchronous `stdIn(buffer, length)` handler that returns nothing, and both adapters leave it unimplemented. The Cores change it to an asynchronous handler that returns a byte count, as `readFile` already returns `[count, bytes]`. The Cores are ours to change: platform gaps are fixed there rather than worked around in the editor or the Runtime library.

### Targets and order

1. **First release: MIPS, RISC-V and RISC-V-64**, the current Source compilation Targets: one runtime source tree, MARS and RARS syscall layers, and Core work in MARS and RARS only.
2. **Second: x86.** The same runtime sources with a syscall layer for blink's Linux syscalls. Members are built offline through the GCC `-masm=intel` to NASM translator that x86 Source compilation will use, so x86 stays NASM throughout, and the Core's existing `ld` step links them as an archive, which already gives [ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md)'s semantics.
3. **Out of scope: M68K and Z80.** Compiler Explorer has m68k GCC and SDCC, but EASy68K's `trap #15` and the Z80 Port map would each need their own syscall layer, ABI audit and Core linking work. Nothing here prevents adding them later.

## Assumed, to confirm

- Library members appear in the Workbench as read-only Files under a reserved namespace, outside the program-visible FileSystem, and are never persisted, shared or archived. Build sources carry them in a separate `libraries` field.

## Open questions

- Settled 2026-10-04: no grouping of executed instructions. Stop-based Undo uses the existing history, which grows lazily to a larger limit chosen by measurement.
- The exact supported function list and the syscalls the Cores must add for it beyond standard input (for example `lseek` and time).
- Settled 2026-10-04 by a live probe: Compiler Explorer accepts uploaded files in subdirectories, and `-nostdinc -isystem sysroot/include` selects them. `-nostdinc` also removes GCC's freestanding headers, so the Runtime library ships its own. The headers' total size against the 1 MiB request limit is checked as they are written.

## Deferred

- An in-browser compiler, multi-file C compilation and a C language service (clangd), all tied to replacing the Compiler driver.
- Rust, which needs `core` and `compiler_builtins` as Library members built with the same compiler version the driver uses.
