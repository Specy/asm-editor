# Screen peripherals: implementation plan

Companion to [screen-peripherals.md](./screen-peripherals.md), whose decisions and ADRs this plan implements. Written on 2026-09-06 after the design interview closed with every decision settled. Paths are relative to this repository unless a sibling repository is named.

## Ground rules

- Every phase ends with `npm run check`, `npm run lint` and `npm test` clean, and with its rows added to the manual verification matrix (`docs/manual-verification.md`, recreated in phase 0).
- Core changes live in the sibling repositories and ship as published `@specy/*` versions before the editor phase that consumes them; the editor never depends on an unpublished build. Core work items are independent of each other and can start at any time.
- The guest interface documentation (documentation pages, hover, coding agent prompt) changes in the same phase as the interface it describes.
- Peripheral logic stays plain TypeScript with no Svelte runes, like `Z80Console.ts` today, so it runs under node in tests and probes; reactive facades stay thin.

## Environment order

Z80 first, M68K second, MIPS and RISC-V last:

1. **Z80** needs no Core change ([ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md)) and exercises every peripheral, the wait mechanism and the scheduler end to end. It proves the stack before any sibling repository is touched.
2. **M68K** is the main compatibility target ([ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md)) and needs a Rust Core change that can be prepared while Z80 lands.
3. **MIPS and RISC-V** add the framebuffer mode and the memory observers, the largest Core change, in two Java and TeaVM forks.

## Phase 0: test infrastructure and matrix

- Add `vitest` as a dev dependency and an `npm test` script. Configure it on top of the existing Vite config with the SvelteKit plugin so `.svelte.ts` modules compile, node environment, `src/**/*.test.ts`.
- First tests against the existing pure module `src/lib/languages/Z80/Z80Console.ts`, which proves the setup and guards the console during the Z80 phase.
- Recreate `docs/manual-verification.md` with the sections the phases fill in.

## Phase 1: Screen model, journal and renderer

New directory `src/lib/languages/peripherals/screen/`.

- `Screen.ts`: logical size, visible and drawing images (RGBA byte arrays), buffering mode, pen and fill colors, pen width, drawing position, text cursor and cell font, and the operations of the M68K table: pixel, line, line-to, move-to, filled and unfilled rectangle and ellipse, flood fill, clear, resize, present, text at a pixel position, text at the cursor with wrapping and scrolling, get pixel, get size. A framebuffer mode that maps a word array onto the image for MIPS and RISC-V.
- `ScreenHistory.ts`: one inverse record per operation, a copy of the dirty rectangle before drawing and a full image for clear, present and resize, under a byte budget ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)); `undo()` and `canUndo()`; eviction of the oldest records when the budget is exceeded. Framebuffer mode journals nothing and re-syncs from memory.
- A dirty flag and a version counter for the renderer; the Svelte widget paints with `putImageData` on an animation frame only when dirty, the upstream TRS-80 pattern, so the machine never waits for a frame ([ADR 0006](../adr/0006-screen-double-buffering.md)).
- A fixed-cell bitmap font with a clean license, 8 by 16 cells for the 640 by 480 default and 8 by 8 for the Z80.
- Tests: expected pixels per primitive, including rectangle and ellipse edge inclusion checked against EASy68K; undo restores every state field; budget eviction; cursor wrap and scroll.

## Phase 2: Keyboard, Mouse and program time

Same directory, one module each.

- `Keyboard.ts` ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)): typed-character queue that never drops; transition queue applied at read time, one transition per hold interval in milliseconds; key-state view; last key down and up; EASy68K key codes in a shared `keyCodes.ts`; paste as typed text; release of every key on focus loss.
- `Mouse.ts`: current state and persisting last-down and last-up snapshots with buttons, modifiers sampled from the Keyboard, double-click flag; event counter; clamping to the Screen.
- `ProgramClock.ts` ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)): the Time Source. Host mode: `wait(ms)` on a host timer, `nextFrame()` on an animation frame, `now()` from the host clock since the run started. Virtual mode for scripted runs: waits and frames resolve immediately and advance the clock, which starts at zero.
- `Terminal.svelte.ts` gains a Keyboard-backed interactive input source ([ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md)): character reads take one typed character, line and number reads wait for Enter, echo goes to the transcript and, through the adapter, to the Screen's text layer. Prompts remain the source when no Keyboard is injected.
- Tests for each module, including the hold interval with a simulated polling program and the virtual clock.

## Phase 3: GenericEmulator integration

Files: `src/lib/languages/GenericEmulator.svelte.ts`, `BaseEmulator.svelte.ts`, `ExecutionController.ts`, `commonLanguageFeatures.svelte.ts`, `Emulator.ts`, `src/components/shared/providers/EmulatorLoader.svelte`, `src/stores/settingsStore.svelte.ts`, `src/lib/Project.svelte.ts`.

- Injection ([ADR 0004](../adr/0004-inject-screens-at-emulator-boundary.md)): `EmulatorSettings` gains an optional peripheral set (Screen, Keyboard, Mouse, clock); `EmulatorLoader.svelte` creates it and passes it in; `GenericEmulator` falls back to defaults so existing callers and tests keep working.
- Scheduling ([ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)): the adapter contract changes from `_run(limit, breakpoints)` to a slice call that receives an instruction budget, a time hint and breakpoints, and returns a reason (budget, breakpoint, terminated, limit, wait) with the instruction count. `GenericEmulator` loops over slices, yields to the host between them, keeps the overall instruction limit across slices, and awaits program-requested waits through the clock and the execution generation so Stop still cancels them. Time hints: a short budget while a Screen is visible and dirty, a long one for compute-only runs; the values come from phase 8.
- Undo: Core undo then Screen undo; `canUndo` is the smaller of the two; framebuffer mode re-syncs from memory after the Core rollback.
- Reset: `clear()` resets the Screen, Keyboard, Mouse and clock on the same path as the Terminal; a Testcase run resets them per testcase, selects scripted input and the virtual clock together, and restores the interactive sources afterwards.
- Settings: a Screen visibility toggle like the memory toggle and the Screen history budget in megabytes. Project data: an optional display field for the MIPS and RISC-V parameters with MARS defaults, serialized in `toObject` and cleaned on load like testcases.
- Tests with a fake adapter: slicing keeps the instruction limit, Stop during a wait, undo depth rule, reset coverage.

## Phase 4: Screen panel

- `src/components/specific/project/screen/ScreenRenderer.svelte`: canvas, integer zoom to fit, focus ring, DOM bindings for the Keyboard (focus, shortcut suppression, blur release) and the Mouse (pointer capture for drags, context-menu and middle-click suppression, window blur release), and the configuration popover for MIPS and RISC-V that re-syncs from memory on change.
- Hosting: the right column of `src/routes/projects/[project]/Project.svelte` next to memory, behind the new setting; `src/components/shared/InteractiveInstructionEditor.svelte` as a panel in the fullscreen layout and a toggle in the small layout, which covers lectures, the exam page, embeds and chat.

## Phase 5: Z80

Files: `src/lib/languages/Z80/Z80-model.ts`, `Z80Console.ts`, `Z80Emulator.svelte.ts`, `Z80-documentation.ts`, `src/components/documentation/z80/Z80IoDocumentation.svelte`, `src/components/shared/agent/defaultCodingAgent/prompts.ts`.

- Extend the port table in `Z80-model.ts` with the four groups of ADR 0011 and their documentation entries; the documentation page, hover and agent prompt pick them up.
- Grow `Z80Console` into the whole port device: Screen commands with byte coordinates and 3-3-2 colors, console output mirrored to the text cursor, keyboard and mouse views with B as the read parameter, wait and frame-sync reads that return no data and are resumed by the clock, time reads.
- The adapter's input loop distinguishes the pending port: console input goes to the Terminal, wait and frame-sync go to the clock, and the slice contract reports them as waits.
- Tests against the device under node; three example programs (animation with double buffering, keyboard-driven movement, mouse painting) in `examples/z80/` and matrix rows.

## Phase 6: M68K

Core, in the s68k repository (`src/instructions.rs` interrupt enums near line 207, `src/interpreter.rs` trap decoding near line 1548 and answers near line 660, `src/ts_types.rs`, `ts-lib/src/index.ts`), published as a new `@specy/s68k`:

- New interrupts: check keyboard input (7), get key state (19, both forms), read mouse (61, modes 0 to 2), set drawing mode (92, modes 2, 4, 16, 17; others error), repaint (94), get pen position (96), display in field (20), the compositions 17 and 18, and a no-op for 24. The commented-out variants for 92, 94 and 96 already in `answer_interrupt` show where they go.
- Fix task 33 to EASy68K's packed D1 with the get-size, windowed and full-screen requests, and task 11 to clear only on $FF00 and otherwise set or get the cursor. Task 8 keeps returning through the adapter, which supplies hundredths.

Editor, in `src/lib/languages/M68K/M68KEmulator.svelte.ts` and a new trap task documentation page under `src/routes/documentation/m68k/`:

- Every graphics interrupt to the Screen; text output to the Terminal and the Screen's text cursor; keyboard and mouse interrupts to the peripherals; delay through the clock's wait; time through the clock in hundredths.
- Examples from EASy68K checked in under `examples/m68k/` with license notes, matrix rows for each, and the deviations of ADR 0003 stated on the documentation page.

## Phase 7: MIPS and RISC-V

Core, in `/home/dev/code/mars` (`mars/src/main/java/app/specy/mars/mips/io/MIPSIO.java`, `mars/.../syscalls/SyscallTime.java`, `marsjs/.../JsMips.java`, `JsMIPSIO.java`) and `/home/dev/code/rars` (the `rars` and `rarsjs` counterparts), published as new `@specy/mips` and `@specy/risc-v`:

- A `time()` method on the IO abstraction, used by the time syscall instead of the Java clock, so the adapter can answer with host or virtual time.
- Memory observers exposed by the wrapper on top of the existing `Memory.addObserver(observer, start, end)`: a write observer over a range for the framebuffer and read and write observers on single words for the four registers. Observers are synchronous handlers. Confirm whether backstep restores notify observers; if not, the adapter re-syncs after undo, which ADR 0005 requires anyway.

Editor, in `src/lib/languages/MIPS/MIPSEmulator.svelte.ts` and `src/lib/languages/RISC-V/RISC-VEmulator.svelte.ts`:

- `sleep` on the clock's wait; the framebuffer observer marks words dirty and the Screen re-reads the range at the end of each slice, measured against per-word updates in phase 8; the receiver registers backed by the Keyboard queue with the Ready bit kept in memory; the transmitter to the Terminal with form feed clearing it; interrupt-enable writes stop with an error.
- Documentation pages for the bitmap display and the registers, MARS and RARS samples under `examples/mips/` and `examples/risc-v/`, matrix rows.

## Phase 8: validation and tuning

- Run the matrix on every hosting surface, including exam and embed.
- Measure instructions per second with and without yields on each Core, frame pacing of the animation examples, and Stop latency; tune the time hints and record the numbers in the design document. Targets are in ADR 0007.
- Measure the Screen history of the animation examples and set the budget default.

## Implementation risks

- Rasterization fidelity: EASy68K draws through Windows GDI, whose rectangles and ellipses exclude their right and bottom edges; the phase 1 tests must pin the chosen behavior against the reference.
- Observer throughput on MIPS and RISC-V: a handler call per stored word crosses the TeaVM boundary; the dirty-range re-read is the fallback if it is too slow.
- The s68k `GetKeyState` answer must carry either four booleans or two key codes depending on the request form; the result type needs both shapes.
- Testing rune modules under vitest depends on the Svelte plugin compiling `.svelte.ts` in node; keeping peripheral logic in plain modules limits the exposure.
