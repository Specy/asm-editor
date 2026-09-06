# Screen and input peripherals

## Scope

The current feature includes a graphical **Screen** with optional double buffering, plus **Keyboard** and **Mouse** peripherals for interaction with that Screen. Mouse positions use the Screen's logical pixels, with a top-left origin, independently of GUI zoom. Audio is a future peripheral and is outside this implementation.

Existing EASy68K and MARS/RARS graphics examples are the compatibility target after display configuration.

x86 is outside this version: `@specy/x86` wraps Blink, a Linux x86-64 userland emulator compiled to WebAssembly with no graphics device and no memory or port hook, so a Screen would first require C changes in the Blink fork and a rebuilt module, and Linux userland has no teaching convention for pixels to preserve under [ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md). x86 keeps Terminal I/O only, and its program time stays Blink's real clock, including during Testcases (the exception noted in [ADR 0010](../adr/0010-program-time-without-clock-pacing.md)). The documentation must state this unevenness plainly. Decided on 2026-09-06; easy to reverse, so no ADR.

## Agreed architecture

- [Preserve simulator graphics conventions](../adr/0003-preserve-simulator-graphics-conventions.md), including EASy68K's single output window: in a graphical run, M68K text output and input echo are drawn on the Screen at a text cursor as well as recorded in the Terminal transcript.
- [Inject Screen instances at the Emulator boundary](../adr/0004-inject-screens-at-emulator-boundary.md); Core packages remain independent of the editor's Screen implementation.
- [Restore complete Screen state on Undo](../adr/0005-restore-screen-state-on-undo.md), within the configured instruction-history limit; images that live in Core memory are restored by re-reading that memory rather than by Screen-side journaling.
- [Provide double buffering in Screen](../adr/0006-screen-double-buffering.md), including EASy68K's explicit presentation operation.
- [Let GenericEmulator schedule execution](../adr/0007-generic-emulator-run-scheduling.md), passing time-budget hints to language adapters and yielding occasionally even during compute-only runs.
- [Give programs time through waits and time reads, without clock pacing](../adr/0010-program-time-without-clock-pacing.md): every environment offers a wait for a duration and a read of elapsed time, honored by the scheduler without blocking the GUI; the Z80 gets timer and wait ports; program time follows host time.
- [Reach Screen, Keyboard and Mouse from the Z80 through the port map](../adr/0011-z80-peripherals-through-the-port-map.md), extending the console ports; no memory-mapped framebuffer.
- Scripted Testcase runs use a virtual **Time Source**: waits complete immediately and advance a virtual clock that time reads return, starting at zero for each run ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)).
- [Use polling for keyboard and mouse input first](../adr/0008-poll-keyboard-and-mouse-input.md); device-generated CPU interrupts are deferred. Queued key transitions are applied when the program reads the keyboard, at most one per minimum hold interval in milliseconds, so a brief tap is never missed.
- The Keyboard offers a typed-character queue that never drops keystrokes and a key-state view with the last key down and up; every environment uses EASy68K's key codes ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)).
- The Mouse offers its current state and persisting snapshots taken at the last button down and up, each with position, buttons, modifiers and a double-click flag; right and middle clicks inside the Screen never reach the browser ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)).
- Keyboard and Mouse remain live after Undo; recording and replaying their input observations is deferred, while Screen state still rewinds.
- Keyboard input goes to the focused Screen, with a visible focus indicator, suppression of editor shortcuts for those keys, and release of held keys on focus loss.
- Mouse drags started inside the Screen continue outside it until release, with coordinates clamped to the Screen; a pointer that leaves without a button keeps its last inside position; losing browser-window focus releases held mouse buttons.
- [Share the Keyboard's pending typed input with Terminal character/string/numeric reads](../adr/0009-share-screen-keyboard-input-with-terminal.md) in graphical use, preserving availability-check/read compatibility.
- The injected peripheral configuration selects an input source that remains fixed for the run; changing Screen focus only changes where new keystrokes go.
- With Screen keyboard input, character reads consume one character immediately when available, string and numeric reads wait for Enter, and missing input suspends the program with the GUI and Stop still responsive; availability polls return immediately.
- User-authored Testcases keep their existing scripted text input and output/register/memory checks, without consuming live Screen input. Drawing operations still execute; input-event scripting and graphical assertions are deferred. Implementation tests for the peripherals remain in scope.

## Reference: the upstream TRS-80 emulator

`@specy/z80` descends from Lawrence Kesteloot's [trs80](https://github.com/lkesteloot/trs80) monorepo. Its `Trs80` machine was compared against this design on 2026-09-05 to check the fit; the design was kept and amended with program time (ADR 0010), the key hold interval and memory re-sync on Undo.

| Concern  | Upstream                                                                                                                                                                                                                 | This design                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Devices  | Screen, keyboard, cassette and sound player are injected into the machine constructor; the machine routes memory and port accesses to them                                                                               | Same shape one level up: peripherals are injected into the Emulator and the adapter connects the Core through its hooks (ADR 0004)                 |
| Screen   | A memory-mapped 1 KB character buffer, mirrored to RAM and forwarded to the screen object on every write; the web screen sets a dirty flag and repaints from its own animation-frame loop; hi-res cards are not emulated | Pixel Screen with a dirty-flag renderer; the machine never waits for a frame (ADRs 0006, 0007); the Z80 draws through ports, not memory (ADR 0011) |
| Keyboard | Memory-mapped matrix; DOM events are queued and released one per 50,000 t-states at read time; keys are intercepted only while running and the editor is unfocused; Ctrl and Meta combinations are left to the browser   | Polling with explicit Screen focus and a minimum hold interval (ADR 0008)                                                                          |
| Mouse    | None on the machine; the web screen reports graphics-pixel coordinates for the IDE's screen editor and infers a release outside the canvas from the next move's button state                                             | Logical pixels, drags continue outside the Screen, release on window blur (ADR 0008)                                                               |
| Time     | Real-time pacing: each animation frame runs the t-states the emulated clock would have produced, capped at 100 ms of catch-up, with a speed multiplier; a timer interrupt; the IDE disables interrupts for user programs | Throughput-first scheduling with no emulated clock; waits and time reads instead of pacing (ADRs 0007, 0010)                                       |
| State    | Whole-machine save and restore; the screen is rebuilt by replaying screen RAM                                                                                                                                            | Per-instruction Undo, added in the fork; memory-backed images re-synced from memory (ADR 0005)                                                     |

Sources: [Trs80.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator/src/Trs80.ts), [Keyboard.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator/src/Keyboard.ts), [CanvasScreen.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator-web/src/CanvasScreen.ts), [trs80-ide Emulator.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-ide/src/Emulator.ts).

## Per-environment coverage

### M68K

The s68k Core decodes trap #15 tasks into interrupts ([interpreter.rs](https://github.com/Specy/s68k/blob/main/src/interpreter.rs)); unknown tasks stop the program with an error. First-version coverage, decided on 2026-09-06:

| Group                                  | Tasks                                                                     | Decision                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Screen, already decoded                | 11, 33, 80 to 91, 93, 95                                                  | Wire to the Screen. Fix two decodings: task 33 packs width and height in D1 and uses 0, 1 and 2 as get-size, windowed and full-screen requests; task 11 clears only for $FF00 and otherwise sets or gets the text cursor |
| Screen, missing in Core                | 92 modes 2, 4, 16, 17; 94; 96                                             | Add to the Core: pen-only move, normal drawing, double buffering off and on, repaint, pen position                                                                                                                       |
| Keyboard and Mouse, missing in Core    | 7, 19 both forms, 61 modes 0 to 2, 24                                     | Add to the Core; 24 is a no-op under ADR 0008                                                                                                                                                                            |
| Time                                   | 8, 23                                                                     | 8 returns hundredths of a second (today Unix seconds); 23 moves to the wait path of ADR 0010                                                                                                                             |
| Text additions                         | 17, 18, 20                                                                | Add while the Core is open; they compose existing tasks                                                                                                                                                                  |
| Rejected with an error naming the task | 10, 12, 16, 21, 22, 25, 30, 31, 32, 60, 62, and 92 modes 0, 1, 3, 5 to 15 | Printer, echo and prompt settings, fonts, text-screen reads and scrolling, cycle counter, hardware simulator, interrupt enables, bitwise raster modes                                                                    |

### MIPS and RISC-V

MARS and RARS are identical here: the [bitmap display](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/BitmapDisplay.java) is a grid of words whose low 24 bits are the pixel color, configured by unit width and height (1 to 32), display width and height (64 to 1024, default 512 by 256) and a base address chosen among global data, the global pointer, static data (default, 0x10010000), heap and the memory map; the [keyboard and display simulator](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/KeyboardAndDisplaySimulator.java) uses receiver control and data at 0xFFFF0000 and 0xFFFF0004 and transmitter control and data at 0xFFFF0008 and 0xFFFF000C. First-version coverage, decided on 2026-09-06:

| Concern            | Decision                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bitmap display     | The Screen's framebuffer mode, configured with the same five parameters, choice lists and defaults as the tool. One word is one logical pixel; the unit size becomes the initial zoom. Undo re-syncs from memory (ADR 0005) |
| Keyboard registers | Backed by the typed-character queue: Ready means not empty, reading the data register dequeues one character, and Ready clears only when the queue is empty                                                                 |
| Display registers  | Transmitter Ready is always set. A write appends the character to the Terminal transcript; form feed clears the Terminal output                                                                                             |
| Interrupts         | Setting an interrupt-enable bit stops the program with an error naming the feature                                                                                                                                          |
| Program time       | Sleep (syscall 32) on the wait path; time (syscall 30) through a Core time hook (ADR 0010)                                                                                                                                  |
| Mouse              | Nothing mapped; the simulators have no mouse                                                                                                                                                                                |
| Core changes       | Both wrappers expose memory observers as handlers: writes over the bitmap range, reads and writes on the four register words, plus the time hook. The Java memory class already has range observers                         |

### Z80

Everything goes through the port map of [ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md), whose consequences list the conventions and the four port groups, decided on 2026-09-06: byte coordinates on a Screen of at most 256 by 256 logical pixels (default 256 by 192), B as a read's parameter, one-byte 3-3-2 colors, and console output drawn at the text cursor in 8 by 8 cells as well as recorded in the Terminal transcript. No Core change is needed.

## Display configuration, reset and placement

Decided on 2026-09-06.

| Environment  | Size                                         | Configured by                            |
| ------------ | -------------------------------------------- | ---------------------------------------- |
| M68K         | Default 640 by 480, EASy68K's minimum window | The program, through task 33             |
| Z80          | Default 256 by 192, up to 256 by 256         | The program, through the resize command  |
| MIPS, RISC-V | MARS's five parameters with its defaults     | The user, from the Screen panel's header |

- The MIPS and RISC-V parameters are saved in the project data as a display field, because every example states them in its header comment and a project must reopen with them. Testcases run with the same configuration. Changing a parameter re-syncs the Screen from memory immediately, as MARS does.
- Zoom is GUI only: the Screen fits its panel with integer scaling when that fits, the MARS unit size sets the initial zoom, and zoom is not persisted per project.
- Reset: both images, the buffering mode, pen, cursor and size reset, and the Keyboard and Mouse queues and snapshots clear, on the same path as the Terminal: Build, Clear execution, dispose, and the start of each Testcase. After a program terminates on its own the last frame stays visible, until the next of those. Stop is this editor's Clear execution — one button and one action, which also empties the registers, the memory view and the transcript — so the frame does not survive it; reconciled with the implementation on 2026-09-06, when a review found the two halves of this row contradicting each other.
- Placement: a Screen panel in the project page's right column next to memory, visible by default for the four environments and collapsible through a setting like the memory toggle. The interactive editor shows it as a panel in the fullscreen layout and behind a toggle in the small layout, so lectures, exams and embeds get it. The transcript stays at the bottom. Focus indication and context-menu suppression belong to the panel.

## Validation

Decided on 2026-09-06; measured on 2026-09-06, below.

- Compatibility corpus: EASy68K's own examples and the MARS and RARS bitmap and keyboard samples, checked in under an examples directory with source and license notes (EASy68K is GPL, compatible with this repository's AGPL), plus Z80 programs written here. Graphical assertions are deferred, so this is a manual matrix, recreated as a verification document in `docs/`.
- Automated tests: vitest as a dev dependency with a node environment, the repository's first test infrastructure, for the peripherals' pure logic (Screen journal and Undo, Keyboard queue and hold interval, Mouse views and clamping, virtual time, the Z80 port device), then adapter tests where a Core runs under node.
- History memory: a clear or a present journals a whole image, over a megabyte at 640 by 480, so the Screen history has its own byte budget setting and the Undo depth is the smaller of the Core's history and the Screen's history within that budget ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)). Validation measures typical programs to set the default.
- Scheduling: measure instructions per second with and without yields on every Core, and the frame pacing of the animation examples. Targets: yields cost under five percent of throughput, and Stop is answered within a tenth of a second.

### How the numbers were taken

`npm run measure` runs the harness (`vitest.measure.config.ts`, `src/lib/languages/measurements/`): the app's own Vite config pointed at `*.measure.ts` instead of `*.test.ts`, one file at a time in one process, kept out of `npm test` because it takes minutes. Every Core loads under node, x86's Blink included, so all five are measured. A program is built the way the project page builds one — the shipped undo history of a hundred steps, which is not free: RARS records a backstep entry per instruction and runs about ten times slower with it — and a stand-in for the Screen panel repaints on a 16 ms timer and registers itself as a renderer, because the scheduler shortens its slices only for a Screen somebody is painting and no browser runs a graphical program without a panel. A browser's absolute numbers will differ; the ratios and the conclusions are what the values below come from.

### What a Core costs

A compute-only loop, arithmetic in a two instruction loop, run twice: once as a single slice, the way the Emulator ran a whole program before [ADR 0007](../adr/0007-generic-emulator-run-scheduling.md), and once through `run()`, which slices it, yields to the host between slices and re-enters the Core each time.

| Core   | Instructions/s, one slice | Instructions/s, sliced and yielding | Cost of the yields |
| ------ | ------------------------- | ----------------------------------- | ------------------ |
| Z80    | 11 392 676                | 11 182 971                          | 1.9%               |
| M68K   | 19 561 824                | 18 761 858                          | 4.3%               |
| MIPS   | 1 226 522                 | 1 184 756                           | 3.5%               |
| RISC-V | 26 887                    | 26 521                              | 1.4%               |
| x86    | 10 641                    | 10 494                              | 1.4%               |

Under the five percent the ADR budgets, on every Core. One yield costs about 1.1 ms under node, which has no `scheduler.yield()` and falls back to a timer, so what keeps the cost down is the length of the slice rather than the price of the yield.

The compute loop is the fastest a Core ever goes, and it is not the whole story: inside one Core the spread is large. RARS runs `addi`/`j` at 26 instructions a millisecond and everything else — a store loop, the bitmap tour — at 150 to 320, because its unconditional jump is an order of magnitude dearer than a branch. One M68K trap or one Z80 `out` can clear a whole Screen, which is a hundred thousand pixels and a journal record of the image it overwrote. A single constant per Core therefore cannot both keep the host free and keep the throughput, which is what the two mechanisms below are for.

### What the host feels

A Core runs on the main thread, so a click on Stop is not delivered until the slice it lands in comes back: the honest form of "Stop is answered within a tenth of a second" is how long the host is held. The measurement is the loop lag, how late a 10 ms timer fires while a program runs, over three kinds of program.

| Program                  | Core   | Median loop lag | Worst loop lag | Ticks over 100 ms | Stop answered in |
| ------------------------ | ------ | --------------- | -------------- | ----------------- | ---------------- |
| compute loop             | Z80    | 41.0 ms         | 54.1 ms        | 0                 | 0.7 ms           |
| compute loop             | M68K   | 41.0 ms         | 85.4 ms        | 0                 | 1.0 ms           |
| compute loop             | MIPS   | 41.0 ms         | 60.8 ms        | 0                 | 0.8 ms           |
| compute loop             | RISC-V | 41.2 ms         | 56.3 ms        | 0                 | 0.9 ms           |
| compute loop             | x86    | 41.3 ms         | 77.0 ms        | 0                 | 2.6 ms           |
| `z80/bouncing-ball.z80`  | Z80    | 0.2 ms          | 2.0 ms         | 0                 | 0.7 ms           |
| `m68k/bouncing-ball.x68` | M68K   | 0.2 ms          | 3.7 ms         | 0                 | 1.2 ms           |
| `mips/bouncing-ball.asm` | MIPS   | 0.2 ms          | 66.9 ms        | 0                 | 1.0 ms           |
| `risc-v/bouncing-ball.s` | RISC-V | 0.2 ms          | 52.5 ms        | 0                 | 1.0 ms           |
| drawing loop, no wait    | Z80    | 51.0 ms         | 57.3 ms        | 0                 | 0.8 ms           |
| drawing loop, no wait    | M68K   | 43.5 ms         | 47.1 ms        | 0                 | 1.6 ms           |

Nothing held the host for a tenth of a second, on any Core or any kind of program. The compute loops all settle at about 41 ms, which is a 50 ms slice sampled at a random point inside it: the scheduler's correction has found every Core's real speed whatever its constant said. The animation examples hold the host for a fifth of a millisecond between frames, and their worst tick is the first slice of the MIPS and RISC-V ball, which fills its whole grid before it ever sleeps. Stop itself, once the host is free, is answered in one to three milliseconds — the lag is the whole of the wait.

### Frame pacing

Every animation example paces itself with a wait, and none of them is late by more than a frame. The Z80 waits for the host's animation frame, the M68K asks for two hundredths of a second, MIPS and RISC-V sleep 16 ms.

| Core   | Program                  | Asks for       | Median frame | Slowest frame | Frames/s |
| ------ | ------------------------ | -------------- | ------------ | ------------- | -------- |
| Z80    | `z80/bouncing-ball.z80`  | the next frame | 17.0 ms      | 17.5 ms       | 58.9     |
| M68K   | `m68k/bouncing-ball.x68` | 20 ms          | 24.0 ms      | 28.7 ms       | 41.6     |
| MIPS   | `mips/bouncing-ball.asm` | 16 ms          | 17.2 ms      | 18.7 ms       | 58.2     |
| RISC-V | `risc-v/bouncing-ball.s` | 16 ms          | 18.4 ms      | 21.7 ms       | 54.5     |

The M68K's four milliseconds over its 20 are the frame itself: a clear, a filled ellipse and a present at 640 by 480, each of the first and last journaling a whole image.

### The Screen journal

Undo walks the Core's instruction history one Screen record per step, and the shipped Core history is a hundred steps, so what the budget has to hold is the newest hundred records.

| Core   | Program                  | Screen    | Records per frame | Journal for 100 undo steps |
| ------ | ------------------------ | --------- | ----------------- | -------------------------- |
| Z80    | `z80/bouncing-ball.z80`  | 256 × 192 | 6.0               | 6.4 MB                     |
| M68K   | `m68k/bouncing-ball.x68` | 640 × 480 | 4.0               | 58.8 MB                    |
| MIPS   | `mips/bouncing-ball.asm` | 128 × 128 | 0                 | 0                          |
| RISC-V | `risc-v/bouncing-ball.s` | 128 × 128 | 0                 | 0                          |

The M68K program is the heaviest case there is: double buffered at EASy68K's window size, it journals a whole 1.2 MB image for its clear and another for its present, twice a frame. MIPS and RISC-V journal nothing at all, because their image lives in Core memory and Undo re-reads it from there ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)).

### The values chosen

| Value                              | Was    | Now    | Why                                                                                                                                                                                     |
| ---------------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPUTE_SLICE_MS`                 | 100    | 50     | The host is held for as long as the slice runs, and half the ADR's tenth of a second leaves room for a program two or three times slower than the loop the estimates were calibrated on |
| `SCREEN_SLICE_MS`                  | 16     | 16     | One display frame; the animation examples end every slice on a wait long before it anyway                                                                                               |
| `Z80_INSTRUCTIONS_PER_MS`          | 20 000 | 10 000 | Measured 11 000, rounded down                                                                                                                                                           |
| `M68K_INSTRUCTIONS_PER_MS`         | 20 000 | 15 000 | Measured 18 800, rounded down                                                                                                                                                           |
| `MIPS_INSTRUCTIONS_PER_MS`         | 1 000  | 1 000  | Measured 1 200; the phase 7 estimate stands                                                                                                                                             |
| `RISCV_INSTRUCTIONS_PER_MS`        | 1 000  | 25     | Measured 27 with the shipped undo history. The old estimate made one slice hold the host for 3.7 seconds                                                                                |
| `X86_INSTRUCTIONS_PER_MS`          | 2 000  | 10     | Measured 11. The old estimate held the host for 0.9 s a slice and answered Stop 17 seconds after it was pressed                                                                         |
| `screenHistoryBudgetMb`            | 64     | 64     | The heaviest animation example needs 58.8 MB for the hundred undo steps the Core history keeps                                                                                          |
| `DEFAULT_SCREEN_HISTORY_BYTES`     | 32 MB  | 64 MB  | The Screen's own default now agrees with the setting every Emulator applies                                                                                                             |
| `DEFAULT_KEY_HOLD_INTERVAL_MS`     | 30     | 30     | A program polls once a frame, and a frame is 17 to 24 ms: a 30 ms hold is seen by at least one poll                                                                                     |
| `DEFAULT_DOUBLE_CLICK_INTERVAL_MS` | 500    | 500    | Windows' own default, which is what EASy68K's double-click flag means; nothing measured argues with it                                                                                  |

### Two mechanisms the numbers forced

- **A slice deadline on the Z80 and the M68K.** Their instructions are not all the same size: a drawing loop that clears and presents without ever waiting held the host for 57 seconds on the Z80 and for the whole run on the M68K, because the budget counts instructions and one of those instructions is a hundred thousand pixels. Both adapters now watch the clock as well — the Z80 by spending its budget in chunks it resizes from what the last one cost, the M68K between the traps its loop already breaks on — and both drawing loops now hold the host for about 50 ms.
- **A speed correction in the scheduler.** Each adapter's constant is one number for a Core that is not one speed, so `GenericEmulator` multiplies it by what its own slices have cost, within a factor of sixteen either way and starting again at every clear. A slice that came back on its budget is the only one that teaches, and only the part of it that was not the program's own wait, which the clock now reports. Without it the tuned RISC-V estimate — right for a `j` loop — made everything else run six times more slices than it needed and cost 17% of the throughput.

## Open decisions

None. Every decision above was settled between 2026-09-05 and 2026-09-06; the implementation plan is in [screen-peripherals-plan.md](./screen-peripherals-plan.md).
