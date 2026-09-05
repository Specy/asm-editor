# Screen peripherals: implementation status

A running log of the phases of [screen-peripherals-plan.md](./screen-peripherals-plan.md). Each agent appends its own section: what it did, what it left, blockers, and the API notes the next phases need.

## Phase 6 (Core part): s68k trap tasks — 2026-09-06

Repository `/home/dev/code/s68k`, branch `feat/screen-peripherals`, commit `65de8f7`. The editor part of phase 6 is untouched.

### Done

- New interrupts in `src/instructions.rs`, decoded in `Interpreter::get_trap` and answered in `Interpreter::answer_interrupt` (`src/interpreter.rs`): `CheckKeyboardInput` (7), `GetKeyState` (19, both request forms), `ReadMouse` (61), `SetSimulatorShortcuts` (24), `SetDrawingMode` (92), `Repaint` (94), `GetPenPosition` (96), `DisplaySignedNumberInField` (20), `DisplayStringAndNumber` (17) and `DisplayStringAndReadNumber` (18).
- Task 33 now reads EASy68K's packed request: `SetScreenSize` from the width in the high word and the height in the low word, `GetScreenSize` when D1.L is zero, `SetScreenMode` for the windowed (1) and full-screen (2) requests.
- Task 11 now clears only for `$FF00`: `ClearScreen`, `GetTextCursorPosition` for `$00FF`, `SetTextCursorPosition` otherwise, with the column in the high byte and the row in the low byte.
- Unknown tasks still fail with `Unknown interrupt: <task>`; tasks 92 and 61 fail with an error naming the rejected mode.
- 18 Rust tests covering every new decoding and answer, in `src/test/test.rs` (`mod traps`), on two helpers, `run_answering` and `run_expecting_error`. `cargo test`: 23 passed.
- The whole set was also exercised through the built WebAssembly module under node, so the JSON shapes below are observed, not inferred.
- `ts-lib` is at version 1.4.0 (not published) and re-exports the two new types. `ts-lib/tsconfig.json` gained `esnext.disposable` in `lib`, without which `tsc` rejects the `[Symbol.dispose]()` that wasm-pack 0.15.0 now generates.

### Artifacts

- `/home/dev/code/local-packages/specy-s68k-1.4.0.tgz`, built with `npm run build-all` and `npm pack`. The editor should depend on it as a `file:` reference until `@specy/s68k` 1.4.0 is published.

### Choices where the plan left a detail open

- **Task 19 shape.** One interrupt and one result member, each carrying a nested tagged union (`KeyStateRequest`, `KeyStateResult`), so the request form and the answer shape stay paired and the Core keeps the register packing. The Core does not check that the answer form matches the request; a mismatched answer just packs the other way.
- **Tasks 17 and 18** are single interrupts carrying both parts rather than two interrupts per trap. A queue of pending interrupts would have made one trap answer twice, which the editor's run loop (`runWithLimit` then handle) cannot express today without an inner loop.
- **Task 33 modes 1 and 2** raise `SetScreenMode` and are answered with nothing, like task 24, rather than silently raising no interrupt. The editor must answer them to resume.
- **Task 61** rejects modes above 2 with a runtime error naming the mode, mirroring task 92, so the editor's switch over the modes stays total.
- **Mouse flags** stay a byte owned by the editor: the Core writes D0 without interpreting the bits.
- The null-terminated string read of tasks 13, 14, 17, 18 and 95 became one helper; the UTF-8 error message of task 95 is now the shared one.

### API notes for the editor part of phase 6

Every shape below is what `getCurrentInterrupt()` returns and what `answerInterrupt()` accepts (`@specy/s68k` 1.4.0). Coordinates are unsigned; a number that does not fit its Rust type (`u8` flags, `u16` positions) makes `answerInterrupt` throw.

| Task | Interrupt                                                                         | Answer                                                                  | Registers written        |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| 7    | `{ type: "CheckKeyboardInput" }`                                                  | `{ type: "CheckKeyboardInput", value: boolean }`                        | D1.B = 1 or 0            |
| 19   | `{ type: "GetKeyState", value: KeyStateRequest }`                                 | `{ type: "GetKeyState", value: KeyStateResult }`                        | D1.L                     |
| 61   | `{ type: "ReadMouse", value: number }`                                            | `{ type: "ReadMouse", value: { flags: number, x: number, y: number } }` | D0.L = flags, D1.L = Y:X |
| 24   | `{ type: "SetSimulatorShortcuts", value: number }`                                | `{ type: "SetSimulatorShortcuts" }`                                     | none                     |
| 92   | `{ type: "SetDrawingMode", value: number }`                                       | `{ type: "SetDrawingMode" }`                                            | none                     |
| 94   | `{ type: "Repaint" }`                                                             | `{ type: "Repaint" }`                                                   | none                     |
| 96   | `{ type: "GetPenPosition" }`                                                      | `{ type: "GetPenPosition", value: [x, y] }`                             | D1.W = x, D2.W = y       |
| 20   | `{ type: "DisplaySignedNumberInField", value: { value: number, width: number } }` | `{ type: "DisplaySignedNumberInField" }`                                | none                     |
| 17   | `{ type: "DisplayStringAndNumber", value: { string: string, number: number } }`   | `{ type: "DisplayStringAndNumber" }`                                    | none                     |
| 18   | `{ type: "DisplayStringAndReadNumber", value: string }`                           | `{ type: "DisplayStringAndReadNumber", value: number }`                 | D1.L                     |
| 33   | `{ type: "SetScreenSize", value: [width, height] }`                               | `{ type: "SetScreenSize" }`                                             | none                     |
| 33   | `{ type: "GetScreenSize" }`                                                       | `{ type: "GetScreenSize", value: [width, height] }`                     | D1.L = width:height      |
| 33   | `{ type: "SetScreenMode", value: number }`                                        | `{ type: "SetScreenMode" }`                                             | none                     |
| 11   | `{ type: "ClearScreen" }`                                                         | `{ type: "ClearScreen" }`                                               | none                     |
| 11   | `{ type: "SetTextCursorPosition", value: [column, row] }`                         | `{ type: "SetTextCursorPosition" }`                                     | none                     |
| 11   | `{ type: "GetTextCursorPosition" }`                                               | `{ type: "GetTextCursorPosition", value: [column, row] }`               | D1.W = column:row        |

The two new exported types:

```ts
type KeyStateRequest =
    { type: 'Keys'; value: [number, number, number, number] } | { type: 'LastKeys' }

type KeyStateResult =
    | { type: 'Keys'; value: [boolean, boolean, boolean, boolean] }
    | { type: 'LastKeys'; value: { up: number; down: number } }
```

Details the editor needs:

- **19.** `Keys` carries the four key codes of D1.L, high byte first, and is answered with one boolean per code in the same order; the Core packs them as `$FF`/`$00` bytes. `LastKeys` is the D1.L = 0 form and is answered with the code of the last key released and of the last key pressed; the Core writes `up` in the upper word and `down` in the lower word.
- **61.** The value is EASy68K's mode: 0 the current state, **1 the last button up**, **2 the last button down** (that order, confirmed against the EASy68K help). The flags byte, from the same source, is `Ctrl, Alt, Shift, Double, Middle, Right, Left` written from the high bit down, so bit 0 is the left button and bit 6 is Ctrl. The position is answered in logical Screen pixels and packed by the Core as Y in the upper word, X in the lower word.
- **92.** Only 2 (move the pen without drawing), 4 (draw normally, the default), 16 (double buffering off) and 17 (double buffering on) reach the editor; everything else stops the program in the Core.
- **24.** D1.L = 0 enables the simulator shortcuts and 1 disables them; under ADR 0008 both are no-ops, so answer and continue.
- **17 and 18** display the string without CR/LF first, as task 14 does, then the number or the number read of tasks 3 and 4.
- **20** is task 3 with a field width: display `value` right-justified in `width` columns.
- **33.** `SetScreenSize` is already unpacked into width and height. `GetScreenSize` wants the current Screen size. `SetScreenMode` is 1 for windowed and 2 for full screen; both are no-ops.
- **11.** Column and row are text cells, not pixels, and are already unpacked.
- Task 8 (`GetTime`) and task 23 (`Delay`) are unchanged: the adapter still supplies hundredths of a second and the wait.

### Left and blockers

- No blocker. The editor part of phase 6 (adapter wiring, documentation page, examples, matrix rows) is untouched, and `@specy/s68k` 1.4.0 is unpublished, so the editor consumes the tarball above.

## Phases 0 and 1: test infrastructure and the Screen model — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commits `6250c0b` (phase 0) and `f37969e` (phase 1). Phase 1's Svelte widget belongs to phase 4 and is untouched.

### Done

- **Phase 0.** `vitest` 5.0.0 as a dev dependency, `npm test` (`vitest run`) and `npm run test:watch`. Configured in `vite.config.ts` itself, through `defineConfig` from `vitest/config`, so tests run on the app's own plugin list and alias set: node environment, `include: ['src/**/*.test.ts']`. 18 tests for `src/lib/languages/Z80/Z80Console.ts` prove the setup and guard the console through the Z80 phase. `npm test` also runs in PR validation next to lint and format.
- `docs/manual-verification.md` recreated with the intro on how to run the matrix and the empty sections the phases fill in: one per environment (Z80, M68K, MIPS, RISC-V, plus x86's "no Screen" row), the hosting surfaces, and the measurements table for phase 8.
- **Phase 1.** `src/lib/languages/peripherals/screen/`: `Screen.ts`, `ScreenHistory.ts`, `bitmapFont.ts`, `color.ts` and 59 tests over them. Plain TypeScript, no runes.
- Verification at both commits: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 77 tests passing.

### API notes for the next phases

Peripheral modules are plain TypeScript, but the vitest setup does compile rune modules under node: a test can `import { Terminal } from '$lib/languages/peripherals/Terminal.svelte'` (the `.ts` dropped, as everywhere) and construct it. Phase 3 can therefore test `GenericEmulator.svelte.ts` with a fake adapter as the plan expects.

`new Screen({ width, height, backgroundColor?, penColor?, fillColor?, cell?, historyByteBudget? })`. Colors are 24-bit RGB numbers (`0xRRGGBB`), helpers in `color.ts` (`rgb`, `redOf`, `greenOf`, `blueOf`, `BLACK`, `WHITE`); every adapter converts its own encoding (EASy68K's `0x00BBGGRR`, the Z80's 3-3-2 byte, MARS's low 24 bits). `cell` is `SCREEN_CELL_8X8` or `SCREEN_CELL_8X16` from `bitmapFont.ts`.

| Group          | Members                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size and state | `width`, `height`, `getSize()`, `columns`, `rows`, `cell`, `penColor`, `fillColor`, `backgroundColor`, `penWidth`, `penX`, `penY`, `cursorColumn`, `cursorRow`, `doubleBuffering`, `framebuffer`           |
| Settings       | `setPenColor`, `setFillColor`, `setBackgroundColor`, `setPenWidth`, `setCell`, `setCursor(column, row)`, `setDoubleBuffering(enabled)`                                                                     |
| Drawing        | `drawPixel`, `getPixel`, `moveTo`, `drawLine(x1, y1, x2, y2)`, `lineTo`, `drawRectangle`, `drawUnfilledRectangle`, `drawEllipse`, `drawUnfilledEllipse`, `floodFill`, `clear(color?)`, `resize`, `present` |
| Text           | `drawText(x, y, text)` at a pixel position, `writeText(text)` at the cursor                                                                                                                                |
| Framebuffer    | `useFramebuffer(width, height)`, `useDrawing()`, `syncFramebuffer(words, from?, to?)`                                                                                                                      |
| Undo           | `canUndo()`, `undo()`, `undoToSequence(sequence)`, `history`                                                                                                                                               |
| Renderer       | `visiblePixels`, `drawingPixels`, `dirty`, `version`, `markPainted()`                                                                                                                                      |
| Lifecycle      | `reset()`                                                                                                                                                                                                  |

- The images are RGBA bytes, so the phase 4 widget can build `new ImageData(screen.visiblePixels, screen.width, screen.height)` and `putImageData` it. Paint when `dirty` is set on an animation frame, then call `markPainted()`; `version` changes with every visible change if a frame needs to be told apart without diffing.
- `dirty` and `version` move only when the **visible** image changes: with double buffering on, drawing is invisible until `present()`.
- Undo bookkeeping for phase 3: `screen.history.sequence` is a counter of recorded-and-not-yet-undone operations that eviction does not touch. Note it before a slice, then `screen.undoToSequence(mark)` after the Core rollback; it returns `false` when the byte budget had already dropped some of those records, which is exactly the "Undo depth is the smaller of the two histories" rule of ADR 0005. `screen.history.byteBudget` is the user setting in bytes and evicts immediately when lowered; `screen.history.bytes` and `.depth` are what phase 8 measures.
- Framebuffer mode journals nothing, and `useFramebuffer`/`useDrawing` clear the history, so MIPS and RISC-V Undo must re-sync from Core memory (ADR 0005). `syncFramebuffer` takes the word range `[from, to)` for the dirty-range re-read.
- `reset()` returns everything to the constructor's state and clears the history; it is the Screen's half of the Terminal's clear path.

### Choices where the plan left a detail open

- **Rectangle and ellipse edges are right- and bottom-exclusive**, as the plan required: EASy68K draws through the Windows GDI `Rectangle` and `Ellipse`, which "extend up to, but do not include, the right and bottom coordinates". A rectangle whose edges meet draws nothing, as GDI's does, and corners given the other way round are normalized. Pinned in `Screen.test.ts` with that citation.
- **Filled shapes** are the fill color inside and the pen color on the border, GDI's brush and pen; the unfilled ones are the border alone.
- **Pen width** stamps a square centered on the path (`floor((width - 1) / 2)` before it), used by lines and by both outlines. `drawPixel` ignores it, as GDI's `SetPixel` does.
- **Flood fill** is four-way on the exact color under the starting point and journals a whole image, because its extent is only known once it has run. Filling with the color already there is a no-op that journals nothing.
- **Clear** fills with the background color unless a color is passed, and homes the text cursor. **Resize** clears both images and resets the drawing position: pixels of a differently shaped image cannot be carried over, and programs resize before they draw.
- **Double buffering on** starts the off-screen image as a copy of what is visible; turning it off discards the off-screen image without showing it, since presenting is the explicit operation. With it off, the two images are literally the same array.
- **Line feed starts a new line and carriage return returns to the first column**, the pairing a terminal shows, so the Screen and the Terminal transcript agree on a program that prints `"\n"` only. Wrapping is immediate: the cursor never sits outside the grid, so filling the last cell of the last row scrolls at once.
- **Text at the cursor paints an opaque cell** (background color, then the glyph in the pen color), so scrolled rows leave nothing behind; **text at a pixel position is transparent**, so a label can sit on a drawing. Phase 6 should check both against EASy68K and change them here if the reference disagrees.
- **A character the font has no shape for draws a blank cell** and still advances the cursor. The font covers 0x20 to 0x7F.
- `getPixel` reads the image being drawn on, so it sees the off-screen frame while double buffering; outside the Screen it answers with the background color. Every operation clips instead of failing.
- **History accounting**: `RECORD_OVERHEAD_BYTES` is 64 per record on top of the pixels it copied, so a program setting the pen color in a loop is still bounded by the budget. The default budget is 32 MB, a placeholder for phase 8's measurement. A single record larger than the whole budget empties the history, because keeping older records without it would restore state out of order.
- **The font** is the public domain 8x8 table from [dhepper/font8x8](https://github.com/dhepper/font8x8) (`font8x8_basic.h`, itself from Marcel Sondaar's public domain font). Public domain, so no license terms can conflict with the AGPL. The 8 by 16 cell doubles every row, so both cells show the same shapes.
- Prettier reformatted `docs/design/screen-peripherals.md`'s tables in the phase 0 commit: PR validation runs `npm run format:check` over `docs/`, which the design document did not pass.

### Left and blockers

- No blocker. Phase 2 (Keyboard, Mouse, ProgramClock), phase 3 (GenericEmulator) and phase 4 (the widget, including the renderer loop this model is shaped for) are untouched, and no adapter uses the Screen yet.
- The Screen has no notion of a GUI zoom, focus or events, by design: those belong to the phase 4 widget.

## Phase 7 (MARS Core part): program time and memory observers — 2026-09-06

Repository `/home/dev/code/mars`, branch `feat/screen-peripherals`, commits `db4ec5b` and `cea61e5`. The RARS counterpart and the editor part of phase 7 are untouched.

### Done

- **Program time.** `MIPSIO.time()` returns milliseconds as a `double`; `SyscallTime` (30) reads it through `SystemIO.time()` instead of `new java.util.Date()`, so a scripted run can answer with a virtual clock ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)). `JsMIPSIO` exposes it as the `time` handler.
- **Sleep.** `MIPSIO.sleep` existed but no syscall reached it and `JsMIPSIO.sleep` was empty, so syscall 32 was an unknown-syscall error. Added `SyscallSleep` (32, `$a0` = milliseconds), registered in `SyscallLoader`, routed through `SystemIO.sleep` to the `sleep` handler; a handler returning a promise suspends the program without blocking the host.
- **Memory observers** on `JsMips`, over `Memory.addObserver(observer, start, end)`: `addMemoryWriteObserver` for the framebuffer range, `addMemoryAccessObserver` for one memory-mapped word, `removeMemoryObserver`, `removeMemoryObservers` and `countMemoryObservers`. Handlers are synchronous JavaScript functions called with plain numbers; a returned promise is ignored, unlike an IO handler's.
- **`readMemoryBytes` no longer notifies** (new `Memory.getByteNoNotify`): the memory viewer inspecting a register is not the program reading it, and must not make it consume its pending input.
- **`setPeripheralWord(address, value)`** (new `Memory.setRawWordNoNotify`) writes one word without notifying observers and without recording an undo step, which is how the adapter refreshes a Ready bit or a pending character.
- **`notifyAnyObservers` walks an array snapshot** instead of allocating an iterator per access. It runs on every instruction fetch and every data access, so the plan's "observer throughput" risk was real: see the measurements below.
- The smoke test (`marsjs/ts/test/smoke.mjs`, `npm test`) keeps its original program and gains a peripheral program covering both observer shapes, byte and word stores, the read of a preloaded register, `setPeripheralWord` staying invisible, `readMemoryBytes` staying silent, undo notification, survival across `assemble()`/`initialize()`, the sleep and time handlers, and removal by handle.
- Verification: `mise exec -- mvn clean install` from the repository root, then `npm run build` and `npm test` in `marsjs/ts`, all clean.

### Artifacts

- `/home/dev/code/local-packages/specy-mips-2.1.0.tgz`, from `npm pack` after a clean Maven and tsup build. `marsjs/ts/package.json` is at 2.1.0, not published; the editor should depend on the tarball as a `file:` reference until `@specy/mips` 2.1.0 ships.

### API notes for the editor part of phase 7

Two new handlers in `HandlerMap`. **Both are now required**: syscall 30 used to read the host clock inside the Core and now throws `No handler registered for time` without one, and syscall 32 used to be an unknown syscall.

| Handler | Shape                                       | Meaning                                                                                     |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `time`  | `{ in: [], out: number }`                   | Syscall 30. Milliseconds; the syscall splits it into `$a0` (low word) and `$a1` (high word) |
| `sleep` | `{ in: [milliseconds: number], out: void }` | Syscall 32, `$a0` = milliseconds. Return a promise to suspend the program until it settles  |

The memory API, all on `JsMips`:

```ts
type MemoryWriteObserver = (address: number, length: number, value: number) => void
type MemoryAccessObserver = (address: number, value: number) => void
type MemoryObserverHandle = number

addMemoryWriteObserver(startAddress: number, endAddress: number, handler: MemoryWriteObserver): MemoryObserverHandle
addMemoryAccessObserver(address: number, onRead: MemoryAccessObserver | null, onWrite: MemoryAccessObserver | null): MemoryObserverHandle
removeMemoryObserver(handle: MemoryObserverHandle): void
removeMemoryObservers(): void
countMemoryObservers(): number
setPeripheralWord(address: number, value: number): void
```

- **Lifetime.** Registrations live on the memory singleton, which assembling and initializing only clear the contents of, so they survive `assemble()` and `initialize()` and — exactly like a registered IO handler — are shared by every `JsMips` instance. Verified with a second `assemble()`/`initialize()`/run and with a second instance. A new build must therefore reuse or remove the previous registrations; `removeMemoryObservers()` is the reset. Notifications start once a program has been assembled (`notifyAnyObservers` ignores everything while `Globals.program` is null).
- **Backstep does notify.** `undo()` restores memory through the same `setWord`/`setByte` calls, so an observed range reports each restored word as an ordinary write, newest first, with the restored value. Pinned in the smoke test. The framebuffer can therefore follow notifications alone across an undo; the re-read from memory that [ADR 0005](../adr/0005-restore-screen-state-on-undo.md) requires anyway stays the simpler option and is still correct.
- **Ordering.** An observer is called _after_ the access, with the value the program read or stored. A register whose value is consumed by reading it must be reloaded for the next read from inside the read handler, with `setPeripheralWord`.
- **Signedness.** Handlers get the guest's signed 32 bit integers: `0xffff000c` arrives as `-65524`, and a pixel word with its high bit set arrives negative. Use `>>> 0` for the unsigned form. Addresses _passed in_ accept either spelling — `0xffff0000` and `0xffff0000 | 0` name the same word.
- **Ranges.** Both addresses word-aligned, `endAddress` inclusive and covering its whole word, no range crossing `0x80000000` (register two instead). A violation throws a TeaVM error whose `message` is MARS's own text, e.g. `address not aligned on word boundary 0x10010001`. A failed registration consumes no handle.
- **Widths.** `length` is 4, 2 or 1, and `value` carries only the bytes the store touched: `sb` of `0x00ff0012` reports `(address, 1, 0x12)`. A framebuffer mirroring whole words should re-read the containing word rather than trust `value`.
- **Reentrancy.** Handlers run inside the storing or loading instruction. Writing back into an observed range from a handler re-enters the notification; `setPeripheralWord` is the way out.
- **`readMemoryBytes` returns an `Int32Array` at runtime** although it is typed `number[]` — pre-existing, unchanged, but it bites `assert.deepEqual` and anything expecting `Array.isArray`.
- **`setMemoryBytes` is unchanged**: it writes the way the program does, notifying write observers and recording an undo step per byte while undo is enabled.

### Measurements for phase 8

A program filling 2048 framebuffer words 200 times (about 1.2 M instructions), under node, `simulateWithLimit`, undo disabled:

| Case                                   | Before the snapshot change | After         |
| -------------------------------------- | -------------------------- | ------------- |
| No observer registered                 | 1.51 s                     | 1.22 s        |
| One observer, never matching an access | 1.95 s (+29%)              | 1.21 s (+0%)  |
| One observer over the written range    | 2.24 s (+48%)              | 1.45 s (+16%) |

So a registered observer no longer taxes unrelated code, and the remaining 16% is the notification itself: about 410 000 handler calls across the run, roughly 0.5 µs each. Under the plan's five-percent budget this still argues for the dirty-range re-read over a per-word Screen update.

### Choices where the plan left a detail open

- **Syscall 32 was added**, though the task described `sleep` as already present: the handler existed on both sides but nothing in the Core called it, so the design's "Sleep (syscall 32) on the wait path" was not reachable. The number, name and `$a0` convention follow upstream MARS.
- **`setPeripheralWord` and the silent `readMemoryBytes`** are not in the plan's list, but keeping the Ready bit in memory needs a write that neither re-enters its own observer nor consumes undo history, and a read observer is a trap if a memory viewer can fire it.
- **Handles are plain numbers** from a counter shared by every instance, rather than returned removal closures, so the same value can cross a worker boundary later.
- **Removal rebuilds the registration list.** `Memory.deleteObserver` leaves an empty observable behind for every removal and every access walks that list, so a rebuild-from-survivors keeps repeated builds from degrading throughput.
- **The observer snapshot** in `Memory` is a performance change to shared Core code, justified by the table above; it also makes the no-observer baseline about 19% faster.
- `time()` returns a `double` rather than a `long`: TeaVM emulates `long`, and the syscall's own split into two registers is the only place the value has to be integral.

### Left and blockers

- No blocker. The RARS counterpart (`/home/dev/code/rars`) and the editor part of phase 7 — the framebuffer wiring, the four registers, the documentation pages, the samples and the matrix rows — are untouched.
- `@specy/mips` 2.1.0 is unpublished, so the editor consumes the tarball above. `marsjs/ts/package.json`'s `build:all` still runs a bare `mvn`; use `mise exec -- mvn clean install` from the repository root instead, as the toolchain comes from mise.

## Phase 2: Keyboard, Mouse and program time — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commit `c32a41b` (this log follows it). Phases 3 and 4 are untouched: nothing constructs these peripherals yet, and no adapter reads them.

### Done

- `src/lib/languages/peripherals/`: `keyCodes.ts`, `Keyboard.ts`, `Mouse.ts`, `ProgramClock.ts` and the Keyboard-backed input source in `Terminal.svelte.ts`, with 78 tests in five files next to them. Plain TypeScript, no runes, no DOM types.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 155 tests passing.
- `docs/manual-verification.md` gained two measurement rows for phase 8, the key hold interval and the double-click interval, since both are placeholders the design asked to validate.

### Where the modules live

The plan says "same directory" and means `peripherals/screen/`; these went in `peripherals/` itself, one level up, as this phase's instructions asked. It also reads better: `Terminal.svelte.ts` is already there, the Keyboard answers Terminal reads with no Screen in sight, and `Mouse.ts` needs nothing from the Screen but the `ScreenSize` type.

### API notes for the next phases

`new Keyboard({ now?, holdIntervalMs? })` — `now` is a `ClockReader` (`() => number`, milliseconds), defaulting to `performance.now`; phase 3 can pass the host clock or leave it. `holdIntervalMs` defaults to `DEFAULT_KEY_HOLD_INTERVAL_MS`, 30.

| Group       | Members                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GUI input   | `keyDown(event)`, `keyUp(event)`, `pressKey(code)`, `releaseKey(code)`, `typeText(text)`, `releaseAll()`                                    |
| Typed queue | `hasTypedInput()`, `typedCount`, `peekCharacter()`, `readCharacter()`, `readCharacterCode()`, `clearTypedInput()`, `onTypedInput(listener)` |
| Key state   | `isKeyDown(code)`, `areKeysDown(codes)`, `anyKeyDown()`, `lastKeys()`, `modifiers()`, `pendingTransitions`                                  |
| Lifecycle   | `reset()`                                                                                                                                   |

- `keyDown`/`keyUp` take a `KeyboardEventLike`, the `{ code, key, repeat?, ctrlKey?, altKey?, metaKey?, shiftKey? }` subset of a DOM event, so the phase 4 widget passes the event straight through and a test passes an object literal.
- Every key-state read applies at most one queued transition, and only when the hold interval has passed since the last one. `modifiers()` applies none and reads the physically held keys, so a Mouse snapshot is not distorted by the interval and does not consume the transition budget.
- `lastKeys()` answers `{ down, up }`, both 0 until the first press and release: that is task 19's D1.L = 0 form, `down` in the lower word and `up` in the upper.
- `areKeysDown(codes)` is task 19's other form; hand it the four codes high byte first and answer with the booleans in that order.
- `onTypedInput` returns its unsubscribe. It is how the Terminal resumes a suspended read; the phase 4 widget does not need it.
- `reset()` clears the queue, the transitions, the key state and the last keys, and keeps the subscriptions.

`new Mouse({ screen, keyboard?, now?, doubleClickIntervalMs? })` — `screen` is anything with `getSize()`, so pass the Screen; `keyboard` is anything with `modifiers()`, so pass the Keyboard. `moveTo(x, y)`, `buttonDown(button, x?, y?)`, `buttonUp(button, x?, y?)`, `releaseAll()`, `reset()`; the views are `state()`, `lastDown()` and `lastUp()`, plus `x`, `y`, `isButtonDown(button)` and `eventCount`.

- A `MouseSnapshot` is `{ x, y, left, right, middle, shift, alt, ctrl, double, event }`. `double` is only ever set on `lastDown()`; `event` is the event counter at that moment and is 0 when the event has not happened yet, which is how an adapter tells "no click yet" from a click at the origin.
- The M68K adapter packs the flags byte itself: `Ctrl, Alt, Shift, Double, Middle, Right, Left` from the high bit down, per the phase 6 Core notes.
- Coordinates are logical Screen pixels, floored and clamped, and the size comes from `screen.getSize()` at every event.

`new ProgramClock({ mode?, now?, frameIntervalMs? })`, `mode` `'host'` (default) or `'virtual'`. `start()`, `now()`, `nowHundredths()`, `wait(ms)`, `waitHundredths(h)`, `nextFrame()`, `cancel()`, `reset()`, plus `mode`, `isVirtual` and `pendingWaits`.

- Phase 3 selects the mode with the Input Source: a Testcase run gets a virtual clock and the interactive run a host one. The mode is fixed for a clock's life, so a run configuration swaps the instance rather than the mode.
- `cancel()` resolves pending waits instead of rejecting them, because Stop invalidates the execution generation first and the resumed run throws `ExecutionSupersededError` on its own. `reset()` is `cancel()` then `start()`, the clock's half of the clear path.
- Under node there is no animation frame, so `nextFrame()` falls back to a `HOST_FRAME_FALLBACK_MS` timer; the browser path is the real `requestAnimationFrame`.

`Terminal` (unchanged for every existing caller):

- `useKeyboardInput(keyboard, echo?)` makes Screen input the interactive source and `usePromptInput()` takes it away. The choice survives `useScriptedInput` and `useInteractiveInput`, so a Testcase run comes back to the keyboard by itself; `interactiveSource` reports which it is.
- `readAsync` is the line read: with a keyboard it waits for Enter and edits with backspace; `readCharAsync(question, execution)` is new and consumes one typed character. Without a keyboard both prompt exactly as before, `readCharAsync` keeping the line's first character, which is what `M68KEmulator` does inline today.
- `hasPendingInput()` is the availability poll of ADR 0009 (EASy68K's task 7, MARS's receiver Ready bit): scripted values left, or characters in the typed queue. It consumes nothing, so the read after it sees the same input.
- The `echo` callback receives the characters as typed, `\n` for the Enter that ended a line and `\b` for a backspace that erased one; the adapter forwards them to the Screen's text cursor. The transcript is echoed through `write` as before, and a backspace erases the character it echoed there.
- `cancelPendingInput()` releases a program suspended on Screen input. `clear()` and `useScriptedInput()` already call it, and `GenericEmulator.clear()` is Stop's path and calls `terminal.clear()`, so phase 3 needs no extra call; anything that invalidates the generation without clearing the Terminal must call it.

### Choices where the plan left a detail open

- **Hold interval semantics**: at most one transition per key-state read _and_ never faster than the interval. The first half is the upstream TRS-80 rule and is what guarantees every state is observed at least once; the interval is what keeps a state alive long enough for a program that polls once a frame. Both are pinned in `Keyboard.test.ts`, including the millisecond tap the plan asked for.
- **30 ms** for the hold interval and **500 ms** for the double click, both named constants with a comment saying they are placeholders, both now rows in the measurement matrix.
- **Double click is time and button only**, no distance: positions are clamped logical pixels, one of which can be one GUI pixel or twenty depending on zoom, so a pixel threshold would mean something different on every Screen.
- **The typed queue holds code points**, read as a string by `readCharacter()` or as a number by `readCharacterCode()`; a character outside an environment's byte stays the adapter's problem, as in `Z80Console`, which substitutes a question mark.
- **Auto-repeat types again but presses once**, like a terminal: the key never came up, so the key-state view must not see a second press.
- **Ctrl and Meta combinations type nothing** and are left to the host, as the upstream keyboard does; Alt does type, because AltGr is a text modifier on several layouts. They still produce key transitions, so a program can use them as keys.
- **`typeText` normalizes `\r\n` and `\r` to `\n`**, so a paste and the Enter key look the same to a line read.
- **A line read drops the control characters it cannot show** (escape, bell) and keeps tab; backspace edits and erases its own echo, never program output printed before the read.
- **The event counter counts a move only when the clamped pixel changes**, so dragging further past an edge does not spin it.
- **Mouse snapshots before their first event are all zeroes** with `event: 0` rather than null, so an adapter always has registers to fill.
- **The virtual clock's waits resolve as microtasks.** They are "immediate", so a Testcase of ten thousand waits stays fast; keeping the GUI responsive during a scripted run remains phase 3's slice yields.
- **`Keyboard` and `Mouse` are constructed with `now` injected** rather than taking a `ProgramClock`, because their intervals are host time even during a Testcase, where the ProgramClock is virtual and would freeze them.

### Left and blockers

- No blocker. Phase 3 injects these into `GenericEmulator` (peripheral set, reset path, the wait path of the slice contract, the virtual clock for Testcases) and phase 4 wires the widget's focus, key, pointer and blur events to `keyDown`/`keyUp`/`releaseAll` and `moveTo`/`buttonDown`/`buttonUp`/`releaseAll`.
- No adapter calls `readCharAsync` yet: `M68KEmulator` still reads a line and keeps its first character, which is the same behavior. Phases 5 to 7 move their character reads onto it when they wire the Keyboard.
- The Keyboard has no notion of focus, and the Mouse none of pointer capture or the context menu: those are the widget's, as ADR 0008 describes them.
