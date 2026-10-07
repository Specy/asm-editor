# Environment services audit

Gathered 2026-10-05 for the [Environment library](../design/environment-library.md) interview, when the owner asked to weigh making every language's syscalls, traps and ports behave more like their real simulator or operating system. Four read-only audits compared the editor with EASy68K 5.16.1 (`CODE9.CPP`, `simIOu.cpp`, `SIMOPS2.CPP`), MARS 4.5 and RARS 1.6 (the forks' first commits), a Linux process on a tty (probes against the built `@specy/x86` Core), and real Z80 conventions, and inventoried how the five adapters implement the same concerns. Behaviour marked "probe" was observed by running the published Cores under Node. This is a fact base, not a set of decisions.

Classes: **(a)** deliberate and documented, **(b)** a necessary browser adaptation, **(c)** a workaround in the editor that would be cleaner in the Core, **bug** an unintended gap.

## Where the editor is better than its reference (keep)

- Typed-character queues that never drop a key: M68K task 7 and the MARS/RARS receiver (EASy68K and MARS overwrite a single slot).
- Program time and waits on a virtual clock in Testcases, so they are instant and deterministic (ADR 0010), except x86.
- tty semantics with End of input for MIPS/RISC-V `read(0)` (MARS and RARS have no EOF); MIPS `write` returns the right count (MARS returns len+1 and prints a NUL).
- Unsupported M68K tasks stop with a reason, where EASy68K does nothing; SIMHALT pauses and resumes; Screen state rewinds with Undo.

## Findings by theme

### 1. Service semantics decided in the adapter, not the Core (c)

| Language     | Finding                                                                                                                                                                                                                                                                                      | Where                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| MIPS         | print float/double use JS `String(v)`: `0.1f` prints `0.10000000149011612`, `1.0` prints `1`, `1e-5` prints `0.00001`. RISC-V formats in Java inside the Core and matches RARS, so the two Targets disagree, and MIPS service 57 (formatted in Java) disagrees with service 2.               | `MIPSEmulator.svelte.ts:950-951`                        |
| MIPS, RISC-V | read int/float/double parsed by the adapter with `Number()` and truncated with `\|0`: `""`→0, `"3.7"`→3, `"1e10"`→1410065408, `"0x1F"`→31; errors read "Handler readInt rejected: Invalid number" with no line or address. MARS/RARS use `parseInt`/`parseFloat` and error with the address. | `MIPS:896-900`, `RISC-V:983-987`                        |
| MIPS, RISC-V | read char demands exactly one typed character plus Enter; Enter alone ends the run. MARS returns one keystroke, Enter gives 10.                                                                                                                                                              | `MIPS:903-907`, `RISC-V:990-994`                        |
| M68K         | task 15 prints lowercase hex (`ff`; EASy68K uppercases); task 20's width is read unsigned, so a negative width (left-justify) gives a 250-column field.                                                                                                                                      | `M68KEmulator.svelte.ts:620,627`; `interpreter.rs:2339` |
| M68K         | tasks 4/18 parse with `Number()`: empty stops the run, `0x1F` and `1e3` are accepted, `1.5`/`3e9` reach the Core as a raw serde error. EASy68K uses `atoi` ("12abc"→12, "abc"→0, never an error).                                                                                            | `M68K:934-941`                                          |
| M68K         | the adapter regex-parses the Core's text "Unknown interrupt: N" to explain a task.                                                                                                                                                                                                           | `M68K:987-994`                                          |

### 2. Standard input and the Terminal contract

- Three line buffers: the Terminal's (`Terminal.svelte.ts:159`), the Z80 device's (`Z80Device:348`) and Blink's stdin (`blink-runtime.ts:581`).
- x86 `read(0)` asks for a new line on every read and throws the leftover away (probe: read 3 of "hello", "lo\n" lost); it never returns End of input (the prompt has no End of input button, `ensureLineInput` always adds `\n`); an exhausted Testcase throws. `readv`/`read(dup(0))` return 0 without asking; `read(0, buf, 0)` prompts; `poll` aborts the wasm module. (c/bug; `X86Emulator.svelte.ts:576-581,893`, `syscall.c:2353`)
- Character reads differ per language for the same scripted `"abc"`: 'a' (M68K), error (MIPS/RISC-V), 'a','b','c' (Z80). Empty number input: 0 on MIPS, error on M68K; M68K's message prints `NaN` instead of the answer.
- M68K task 5 and the Screen keyboard give Enter as `$0A`; EASy68K gives `$0D`, so `cmp.b #$0D,d1` loops never end (bug). Z80 CHAR lines end in `0x0A` while KEY_LAST_DOWN reports Enter as `0x0D`.
- MIPS/RISC-V dialogs: confirm cannot return Cancel (2), input dialogs cannot return -2, cancel ends the run, and dialog answers are echoed into the console; message dialogs use a blocking `window.alert` (ADR 0001's last blocking call) and throw in Testcases.
- The MARS MMIO receiver ignores scripted input, while M68K task 7 and the Z80 key port answer it (`MarsDevices.ts:327`); a form feed clears the whole Terminal, including pending reads and the stdin buffer.
- The Z80 adapter reads the Terminal's `inputSource` internals to choose a character or a line read (`Z80Emulator:766-770`).

### 3. Text encoding

- M68K: strings must be valid UTF-8, so `dc.b 'café',0` with task 13 fails ("expected UTF-8") although the assembler stores `é` as Latin-1 and task 6 is Latin-1; task 2 writes UTF-8 and counts bytes (bug, `interpreter.rs:2237,2266,1038`).
- x86: output decoded one byte at a time with `String.fromCharCode`, so `é` prints `Ã©` (c, `X86:173-176`).
- MIPS: syscall 4 shows byte 0xE9 as `é`, syscall 15 as U+FFFD; a new non-streaming `TextDecoder` per call splits multi-byte characters across writes (c).

### 4. Exit, failures and their reporting

- Exit codes are never shown: MARS `exit2` sets `Globals.exitCode` with no API; x86 `stopReason.exitCode` is ignored and not masked to 0–255; the RISC-V Documentation says the code is ignored.
- x86 signals (SIGSEGV) end the run as "terminated" with nothing shown (c, `X86:472,498-502`).
- M68K collapses the Core's exception to "Program terminated with errors" and bypasses `reportRuntimeFailure`.
- Exit is detected by adapter bookkeeping: an `ended` flag on MIPS/RISC-V because the Core has a next statement after exit; MIPS and RISC-V return different types from the same call; Z80 computes cliff breakpoints in the adapter.
- MIPS/RISC-V file write failures are swallowed: the Core's `writeFile` handler returns void, so a failed write reports success (comment claims otherwise, `MIPS:974-980`).
- The MARS/RARS byte-array handlers pass `[javaByteArray]` instead of the published `number[]`; the adapters unwrap it (`handlerBytes`, c).

### 5. Time and randomness

- x86 bypasses the Time Source: real clock in Testcases, and `nanosleep` busy-waits on the JS thread (probe: 0 timer ticks in a 300 ms sleep), which should freeze the tab and Stop for the whole sleep (bug); `alarm`+`pause` never delivers SIGALRM.
- Syscall 40 (set seed) is registered in neither Core (MIPS deleted the class, RISC-V never adds it); 41–44's Documentation still says "use Set Seed (40)". TeaVM's `Random.nextInt(bound)` differs from Java's, so even seeded sequences would not match MARS. The `RandomStreams` map is static and unseeded. (bug)

### 6. Missing or broken services

- x86: about 70 Documented system calls are compiled out of Blink (`DISABLE_NONPOSIX`, `config.h:4-21`) and return ENOSYS, including `brk`, `pipe`, `kill`, `getrandom`; the docs generator ignores the `#ifdef` (`scripts/x86-docs/sources.mjs:270`) and the generated file claims "a call listed here is a call that works". `time` (201) works but is undocumented. `ioctl(TCGETS)` on 0–2 gives ENOTTY, so `isatty` is false.
- x86 files: Project Files are invisible to programs (the FileSystem peripheral is not wired to x86); Emscripten MEMFS files survive across Builds and Testcases with no Undo; `/program`, `/linker`, `/program.o` are visible and writable.
- RISC-V syscall 17 (GetCWD) crashes every call under TeaVM (`user.dir` is null).
- M68K files (50–59), sound (70–77), serial (40–43) and network (100–107) are rejected with the generic message, without the reason the other rejected tasks carry; the FileSystem peripheral that serves MIPS/RISC-V could serve 50–59. Task 12 (echo off), common in EASy68K games, ends the program.
- MARS/RARS MIDI (31, 33) removed and undocumented. MARS print string stops after 65,536 characters.
- M68K tasks 0/1: error for D1.W > 255 (EASy68K clips) and task 1 prints past a NUL.

### 7. Z80

The Port map is an invention by design (ADR 0002, 0011): no CP/M BDOS, no TRS-80 ROM calls, a data-only character port whose read blocks rather than a status/data UART pair, hardware number formatting ports no real machine has. `ei` + `halt` counts as termination because there is no interrupt source. The map starts at 0x10 to avoid the TRS-80 joystick port.

### 8. Duplication

The MIPS and RISC-V adapters duplicate about 200 lines (`read`, `readNumber`, `readCharacter`, `confirm`, `sleep`, `readStandardInput`, `makeHandlers`, `decodeBuffer`, `handlerBytes`).

### Documentation errors noticed

RISC-V-documentation.ts:581 says syscall 1024 returns in `v0` (it is `a0`); neither MIPS nor RISC-V lists 62 lseek; the RISC-V exit2 entry says the code is ignored.
