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

## Phase 7 (RARS Core part): program time and memory observers — 2026-09-06

Repository `/home/dev/code/rars`, branch `feat/screen-peripherals`, commit `f72406e`. The MIPS half is the MARS section above; the editor part of phase 7 is untouched.

### Done

The same change as MARS, name for name, so the two packages expose one API.

- **Program time.** `RISCVIO.time()` returns milliseconds as a `double`; `SyscallTime` (30) reads it through `SystemIO.time()` instead of `new java.util.Date()` ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)). `JsRISCVIO` exposes it as the `time` handler.
- **Sleep.** `RISCVIO.sleep` existed but no syscall reached it and `JsRISCVIO.sleep` was empty, so syscall 32 was an unknown syscall. Added `SyscallSleep` (`a0` = milliseconds), registered in `SyscallLoader` and numbered 32 in `SyscallProperties` (RARS refuses to start when the syscall list and the number table disagree), routed through `SystemIO.sleep` to the `sleep` handler; a handler returning a promise suspends the program without blocking the host.
- **Memory observers** on `JsRiscV`, over `Memory.addObserver(observer, start, end)`: `addMemoryWriteObserver`, `addMemoryAccessObserver`, `removeMemoryObserver`, `removeMemoryObservers` and `countMemoryObservers`, all with MARS's signatures and semantics.
- **`readMemoryBytes` no longer notifies** (new `Memory.getByteNoNotify`), and **`setPeripheralWord(address, value)`** (new `Memory.setRawWordNoNotify`) writes one word without notifying observers and without recording an undo step.
- **`notifyAnyObservers` walks an array snapshot** instead of allocating an iterator per access, as in MARS. Measured below.
- The smoke test (`rarsjs/ts/test/smoke.mjs`, `npm test`) keeps its original program and both width modes, and gains the same peripheral program as MARS's: both observer shapes, byte and word stores, the read of a preloaded register, `setPeripheralWord` staying invisible, `readMemoryBytes` staying silent, undo notification, survival across `assemble()`/`initialize()`, the sleep and time handlers, and removal by handle.
- Verification: `mise exec -- mvn clean install` from the repository root, then `npm run build` and `npm test` in `rarsjs/ts`, all clean.

### Artifacts

- `/home/dev/code/local-packages/specy-risc-v-2.1.0.tgz`, from `npm pack` after a clean Maven and tsup build. `rarsjs/ts/package.json` is at 2.1.0, not published; the editor should depend on the tarball as a `file:` reference until `@specy/risc-v` 2.1.0 ships.

### API notes for the editor part of phase 7

Everything in the MARS section's API notes holds for RARS with the names unchanged — `time` and `sleep` in `HandlerMap`, `MemoryWriteObserver`, `MemoryAccessObserver`, `MemoryObserverHandle`, the five observer methods and `setPeripheralWord` on `JsRiscV`, the same lifetime, ordering, signedness, range, width and reentrancy rules, and the same "`undo()` does notify" behaviour. The differences are these:

- **Registers are RISC-V's**: syscall 30 splits program time into `a0` (low word) and `a1` (high word), syscall 32 takes its milliseconds in `a0`.
- **Both handlers are now required**, as in MARS: syscall 30 used to read the host clock inside the Core and now throws `No handler registered for time` without one, and syscall 32 used to be an unknown syscall.
- **The memory map only exists in 32 bit mode.** The peripheral smoke test calls `RISCV.setIs64Bit(false)` before touching `0xffff0000`; the editor already runs RV32 unless a project asks for RV64, and a memory-mapped register in RV64 mode is untested.
- **`terminated` is not cleared by `initialize()`.** It reports `stopReason === CLIFF_TERMINATION`, and nothing resets `stopReason`, so after a program has run off the end of its code a second run on the same `JsRiscV` instance must be driven by `simulateWithLimit`/`step` and its stop reason, not by a `while (!terminated)` loop. Pre-existing, unrelated to this change, but it bit the smoke test and will bite the adapter's re-run path.
- **The exit syscall stops with `NORMAL_TERMINATION`**, not `CLIFF_TERMINATION`; a `while (!terminated)` loop only ends because the following step runs off the end of the program.
- `readMemoryBytes` returns an `Int32Array` at runtime although it is typed `number[]`, exactly as in MARS.

### Measurements for phase 8

The same program as the MARS measurement (2048 framebuffer words filled 200 times, about 1.2 M instructions), under node, `simulateWithLimit`, undo disabled, RV32. Two runs per case, the range shown:

| Case                                   | Before the snapshot change | After                |
| -------------------------------------- | -------------------------- | -------------------- |
| No observer registered                 | 4.30 s                     | 4.15 s               |
| One observer, never matching an access | 4.86 to 5.09 s (+13%)      | 4.04 to 4.30 s (+0%) |
| One observer over the written range    | 5.07 to 5.25 s (+19%)      | 4.43 to 4.58 s (+8%) |

RARS is about three times slower per instruction than MARS here, so the same 410 000 handler calls cost a smaller share of the run: about 0.8 µs each, 8% of it. As in MARS, a registered observer no longer taxes unrelated code, and the remaining cost still argues for the dirty-range re-read over a per-word Screen update.

### Choices where the plan left a detail open

- **`SyscallSleep` is numbered 32**, upstream RARS's number and MARS's, and its name and description are upstream's too, so a program written against either simulator works unchanged.
- **The observer snapshot was ported even though RARS's loss is a tenth rather than a quarter**: both packages then have the same memory class shape, and the comment in `Memory.java` states RARS's own measurement.
- The peripheral smoke test drives its second run with `simulateWithLimit` rather than the `terminated` loop, for the reason in the API notes.

### Left and blockers

- No blocker. The editor part of phase 7 (adapters, documentation pages, examples, matrix rows) is untouched, and both `@specy/mips` 2.1.0 and `@specy/risc-v` 2.1.0 are unpublished, so the editor consumes the two tarballs in `/home/dev/code/local-packages/`.

## Phase 3: GenericEmulator integration — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commit `995d353` (this log follows it). Phase 4 (the widget) and phases 5 to 7 (the adapters that draw) are untouched: the peripherals now exist on every Emulator, but only the clock is read by an adapter.

### Done

- **Injection** ([ADR 0004](../adr/0004-inject-screens-at-emulator-boundary.md)). New `src/lib/languages/peripherals/peripheralSet.ts`: `InjectedPeripherals` (Screen, Keyboard, Mouse, clock), `createInjectedPeripherals(language, overrides)` and `defaultScreenOptions(language)`. `EmulatorSettings` gained an optional `peripherals`; `EmulatorLoader.svelte` creates one set per emulator and passes it in; `GenericEmulator` builds whatever is missing, so every existing caller and test keeps working. The set reaches the GUI as `emulator.peripherals`, which is now part of the `Emulator` type next to `stdOut`.
- **Scheduling** ([ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)). New `src/lib/languages/ExecutionSlice.ts` holds the contract; `BaseEmulator._run(limit, breakpoints)` became `_runSlice(request)`. `GenericEmulator.runSlices` loops, yields between slices, keeps the overall limit across them and awaits program-requested waits through the execution generation. All five adapters moved over.
- **Undo** ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)). The Core rolls back first and the Screen follows; `canUndo` refuses once the Screen can no longer restore; a framebuffer adapter re-reads its image through the new optional `_resyncScreenFromMemory` hook, called once per rollback.
- **Reset.** `clear()` — Build, Stop, dispose — resets the Terminal, Screen, Keyboard, Mouse and clock together. A Testcase resets them per testcase (through `compile()`) and selects scripted input and a virtual clock together, restoring the interactive ones in a `finally`.
- **Settings.** `showScreen` (default on) and `screenHistoryBudgetMb` (default 64), rendered automatically by the settings panel, which iterates `settingsStore.values`. The budget is applied to the Screen history on every clear. `CURRENT_VERSION` went to `1.1.8`, which resets stored settings, as it must for the new keys to exist.
- **Project data.** Optional `display` (`unitWidth`, `unitHeight`, `width`, `height`, `baseAddress`) with `DEFAULT_PROJECT_DISPLAY` = MARS's 1 by 1 units, 512 by 256, `0x10010000`. Serialized in `toObject` and `toExternal`, cleaned by `cleanDisplay` on `makeProject` and `set`, like the testcases.
- **Tests.** `src/lib/languages/GenericEmulator.test.ts`, 18 tests on a fake adapter: injection and defaults, the limit across slices, the stop reasons, the two time budgets, waits, Stop during a wait, the Undo rule, the re-sync hook, the reset path and the Testcase run configuration. `src/lib/languages/Z80/Z80Emulator.test.ts`, 3 tests driving the real Z80 Core under node: a program runs to its end across slices, an unbounded run answers Stop (measured at about 8 ms), and a run ends at its instruction limit.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 176 tests passing.

### API notes for the next phases

The slice contract, in `src/lib/languages/ExecutionSlice.ts`:

```ts
type ExecutionSliceRequest = { instructionBudget: number; timeBudgetMs: number; breakpoints: number[] }
type ExecutionSliceReason = 'budget' | 'breakpoint' | 'terminated' | 'limit' | 'wait'
type ExecutionSlice = { reason: ExecutionSliceReason; instructions: number; wait?: Promise<void> }

sliceInstructionBudget(request, instructionsPerMs): number
yieldToHost(): Promise<void>
```

- `instructionBudget` is the **whole rest of the run's limit**, not a slice-sized number: the adapter caps it with `sliceInstructionBudget(request, ITS_OWN_INSTRUCTIONS_PER_MS)` and hands the result to its Core as the halt limit. `budget >= request.instructionBudget` therefore means "this is the last slice of the run", which the M68K adapter uses to decide whether an exhausted limit is the user's error or a slice boundary.
- `instructions` is charged against the overall limit. Only the Z80 Core reports a real count; the others charge the budget when they came back having used all of it, which is exact for the compute-only case the budget exists for. A slice that returns `reason: 'budget'` with no progress ends the run rather than spinning the loop.
- `wait` is for program-requested waits ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)): return the promise from `peripherals.clock.wait(ms)` or `nextFrame()`. The scheduler awaits it through the execution generation, so `clear()` (Stop) resolves it through `clock.cancel()` and the resumed run throws `ExecutionSupersededError` on its own. Waits cost no instructions. A wait an adapter serves _inside_ its slice (MIPS, RISC-V and x86 suspend their pending `simulate`/`run` call on an unsettled handler promise) needs none of this and keeps working as it did.
- `timeBudgetMs` is 16 while `showScreen` is on and `screen.dirty` is set, 100 otherwise (`SCREEN_SLICE_MS`, `COMPUTE_SLICE_MS`). Both, and the five `*_INSTRUCTIONS_PER_MS` constants in the adapters, are provisional and now rows in the measurement matrix.
- The Screen, Keyboard, Mouse and clock are `this._peripherals.screen` and friends inside an adapter, `emulator.peripherals.*` outside. **Read `_peripherals.clock` at the point of use, never cache it**: a Testcase swaps in a virtual clock and swaps the injected one back, because a `ProgramClock`'s mode is fixed for its life.
- Phase 4's widget gets its Screen from `emulator.peripherals.screen` inside `EmulatorLoader`'s children snippet; the loader creates the set but does not export it, because a bindable prop assigned once is an eslint error here.

### Choices where the plan left a detail open

- **The Screen's Undo follows the Core one record per step**, and the depth rule is "the Screen limits the Core only once it has records it can no longer restore" (`history.sequence === 0 || history.depth > 0`, so a program that drew nothing is never limited). Instruction-exact alignment is **not** achievable with today's Core APIs: none of the five reports an instruction count at a Screen operation, and none exposes its undo depth, so there is no key both histories could share. The failure mode is bounded and safe in the direction that matters — with sparse drawing the image rewinds ahead of the code and never behind it, and it re-converges as soon as the Core reaches the drawing step. If phases 5 to 7 find it visible in practice, the fix is a Core-side instruction counter and marks keyed on it; that is a Core change, not an editor one.
- **`_runTestcase` was left un-sliced.** The plan only asked for the Run path, a scripted run has no GUI to keep responsive, and slicing it would have changed five adapters a second time.
- **The Terminal keeps prompts as its interactive source.** Wiring `useKeyboardInput` now would take every input prompt away from a Screen that has no DOM events until phase 4, so the choice of [ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md) belongs to phases 5 to 7, which have both the widget and an echo target.
- **Every language gets a Screen, x86 included**, so the peripheral set has one shape and no adapter needs `screen?.`. Nothing ever draws on x86's; the panel of phase 4 decides who shows one, from the language.
- **The default Screen comes from the language**, from the design record's display table: 640 by 480 with an 8 by 16 cell for the M68K, 256 by 192 with an 8 by 8 cell for the Z80, 512 by 256 for MIPS and RISC-V, and the M68K's for x86.
- **M68K's `Delay` moved onto the clock** rather than `delay()`, which ADR 0010 asks for and which makes a Testcase with a delay finish at once instead of sleeping. Its `GetTime` still answers Unix seconds through `Date.now`: phase 6 moves it to the clock's hundredths together with the Core change.
- **A slice that ends on a breakpoint is detected from the next line** on x86 and MIPS, whose Cores report only "still runnable". A budget boundary that happens to land on a breakpoint line stops the run, which is what a breakpoint means anyway.
- **An M68K slice charges one instruction per interrupt** and the whole budget for an exhausted one. The old loop charged nothing at all, so a program that only ever trapped could not reach the instruction limit; it also re-ran `runWithLimit(haltLimit)` forever when the limit was reached without breakpoints, because `run_with_limit` reports an exhausted limit by throwing and the old loop treated the throw as the caller's problem only on the first pass. Both are now bounded.
- **`settingsStore` is versioned to 1.1.8**, which resets everyone's stored settings once. There is no migration path in that store, and the two new keys have to exist.
- `showScreen` reads "Show screen" and `screenHistoryBudgetMb` "Screen undo history budget (MB)"; the settings panel renders every key of `SettingValues`, so no panel change was needed.

### Left and blockers

- No blocker. Phase 4 (the widget and the panel), phase 5 (Z80), phase 6 (the M68K editor half) and phase 7 (the MIPS and RISC-V editor half) are untouched.
- The five `*_INSTRUCTIONS_PER_MS` estimates are guesses except MIPS and RISC-V, which use the phase 7 Core measurement of roughly a thousand instructions per millisecond. M68K and Z80 are at 20 000 and x86 at 2 000. Phase 8 measures all of them, together with the two slice budgets and the Screen history budget default.
- `emulator.peripherals.screen` is reset on every Build, so a widget must not hold the pixel arrays across one; `screen.visiblePixels` is a fresh array after `reset()`.
- Nothing reads `project.display` yet: phase 4's configuration popover and phase 7's framebuffer wiring are its first users.

## Phase 4: the Screen panel — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commit `8ee9099` (this log follows it). Phases 5 to 7 (the adapters that draw) are untouched: the panel shows a blank Screen, and the only things that reach the peripherals are the GUI's own events.

### Done

- `src/components/specific/project/screen/ScreenRenderer.svelte`: the Screen panel. A canvas painted with `putImageData` from an animation frame that repaints only when `screen.version` moved, then calls `markPainted()` so the scheduler's dirty-Screen slice budget goes back to the long one ([ADR 0006](../adr/0006-screen-double-buffering.md), [ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)). Integer zoom to fit the panel, fractional only when the Screen is larger than it, plus a header with the environment's name, the logical size, a zoom-to-fit toggle and the snippet slot phase 7 hangs its configuration popover on.
- Keyboard: `tabindex` on the canvas, a focus ring on focus itself (not `:focus-visible`), every key routed to `keyboard.keyDown`/`keyUp` with `stopPropagation` so the editor's window-level shortcuts never fire while the Screen has focus, `preventDefault` for everything except Ctrl and Meta combinations, paste through `keyboard.typeText`, and a release of keys and buttons on blur ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)).
- Mouse: pointer events converted to logical pixels and handed to `moveTo`/`buttonDown`/`buttonUp`, pointer capture for the whole drag so it keeps reporting outside the Screen, `contextmenu` and middle-click defaults cancelled, and a window-blur listener that releases keys and buttons.
- Hosting: `src/routes/projects/[project]/Project.svelte` renders it in the right column between the memory row and the transcript, behind `settingsStore.values.showScreen` and the new `languageHasScreen(language)`; `src/components/shared/InteractiveInstructionEditor.svelte` gained a `showScreen` prop with the same default, the panel in the fullscreen layout (between the memory column and the transcript) and a Show/Hide screen bar in the small layout, which covers the lecture, exam, embed, docs and chat surfaces.
- `languageHasScreen` in `src/lib/languages/peripherals/peripheralSet.ts`: x86 is the only language without a panel.
- `docs/manual-verification.md`: the hosting-surface section filled in, rows H1 to H12.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 176 tests passing, `npm run build` clean including the prerendered embed route.

### How the panel was checked

The build was served with `npm run preview` and driven through the DevTools protocol in the Playwright-cached headless Chromium, so every row of H1 to H12 above is observed behavior, not inspection: focus after a click, Shift+C never reaching a `window` keydown listener, Escape releasing focus and the keys coming back, `hasPointerCapture` through a drag that left the canvas, cancelled context menu and middle click, the actual-size toggle scrolling inside the panel instead of widening the page, and drawing calls made from the console appearing on the canvas within a frame. The fullscreen layout was checked through a scratch route that was deleted before the commit, because the chat page only mounts its editor once the agent has produced code.

### API notes for the next phases

- The panel takes `screen`, `keyboard` and `mouse` separately rather than the whole peripheral set, plus `name` (the hosts pass the language), `style` (the hosts set the height: 20 rem in both right columns, 16 rem in the small layout) and `configuration`, a `Snippet` rendered in the header between the size and the zoom button. **Phase 7 renders its display-configuration popover into `configuration`** and re-syncs the Screen from memory when a parameter changes; nothing else in the panel needs to know about `project.display`.
- The panel needs no notification when the Screen changes: it polls `version` every animation frame. An adapter that draws only has to draw; there is no repaint call to make and no event to fire.
- `screen.markPainted()` is called by the panel and by nobody else. A surface that shows a Screen **without** this panel would leave `dirty` set forever and hold the scheduler at the 16 ms slice budget.
- The zoom is GUI-only state inside the panel and is not persisted, as the design record asks; `fitToPanel` starts on. Phase 7's MARS unit size, which the design says sets the initial zoom, has to reach the panel as a prop when that phase lands — there is no hook for it yet.

### Choices where the plan left a detail open

- **Placement on the project page is the right column's own stack, under the memory row and above the transcript**, not a third column inside the memory row. The design says "right column next to memory" and "the transcript stays at the bottom"; a third column would have taken 20 rem or more from the editor on a 1280 px screen, while the stack keeps the editor exactly as wide as it was. The interactive editor's fullscreen layout follows the same order.
- **The small layout's toggle starts closed.** "Behind a toggle" is what the design asks for, and a black 640 by 480 box appearing on every documentation instruction page and lecture would have changed pages that have nothing to do with graphics. The bar reads "Show screen" and turns into "Hide screen".
- **Escape releases the panel and is not delivered to the program.** Every other key is taken, so a keyboard-only user would otherwise have no way out of the panel; Tab is delivered like any other key, which the EASy68K code table has an entry for. The canvas's tooltip says so. If a program ever needs Escape, the release gesture has to move to something else.
- **Ctrl and Meta combinations keep their browser default** (copy, paste, devtools) while still being routed to the Keyboard as key transitions. That is the same split phase 2 chose for typed characters, and it is what the upstream TRS-80 keyboard does.
- **Propagation is stopped for every key the panel takes**, which is what actually keeps the editor's shortcuts quiet: `preventDefault` alone does not stop the `window` listener in `Project.svelte`.
- **The focus ring is drawn on `:focus`, not `:focus-visible`**, because clicking is how most users hand the keyboard to the program and they have to see that the editor's shortcuts are off.
- **The zoom-to-fit toggle's off position is 1:1**, and the panel's viewport scrolls when the Screen does not fit. A free zoom control was not part of the design.
- **The viewport is a scroll container (`overflow: auto`)**, which is also what keeps the canvas from widening the column it sits in: a scroll container's min-content contribution is zero, so a 640 px Screen never stretches the project page's right column.
- **No automated tests.** The panel is DOM- and animation-frame-bound and vitest runs in a node environment here; the phase was verified in a real browser instead, as recorded above. The logic worth pinning (Screen version and dirty, Keyboard hold interval, Mouse clamping) already has tests from phases 1 and 2.

### Left and blockers

- No blocker. Phase 5 (Z80), phase 6 (the M68K editor half) and phase 7 (MIPS, RISC-V and the configuration popover) are untouched, and no adapter draws yet.
- The panel is 20 rem tall wherever it is hosted, which leaves a small Screen (the Z80's 256 by 192) with margins and a large one (the M68K's 640 by 480) at about 60 percent. Phase 8 can revisit the height once real programs are on screen.
- The chat page could not be walked end to end: it only mounts its editor once the agent has produced code. The fullscreen layout it uses was checked through a scratch route instead.

## Phase 5: Z80 — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commit `c48f8e2` (this log follows it). Phase 6 (the M68K editor half) and phase 7 (the MIPS and RISC-V editor half) are untouched.

### Done

- **The port map** ([ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md)). `Z80_PORTS` in `src/lib/languages/Z80/Z80-model.ts` grew from the five console ports to 27, in the four groups the ADR asks for, with `Z80_PORT_GROUP_DOCS`, `Z80_SCREEN_COMMANDS`, `Z80_SCREEN_COMMAND_DOCS`, `Z80_MOUSE_VIEWS`, `Z80_MOUSE_FLAGS`, `Z80_COLORS` and a `Z80_PORT_DOCS` row per port next to them.
- **The device.** `Z80Console.ts` became `Z80Device.ts` (`Z80Console` → `Z80Device`, imports and tests renamed): the whole port map, driving the Screen, Keyboard, Mouse and ProgramClock through one host object. Still plain TypeScript, still synchronous, so the machine can call it from inside `run()`.
- **The adapter.** `Z80Emulator.svelte.ts` builds the device from `this._peripherals`, distinguishes a wait from an input request on `WAITING_FOR_INPUT`, reports waits to the scheduler as `{ reason: 'wait', wait }` ([ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)) and serves them inline on the step and testcase paths, and reads the character port one keystroke at a time once the Screen's Keyboard is the Terminal's source.
- **Documentation.** `Z80IoDocumentation.svelte` renders the five groups with headings and ranges, the command table, the color swatches and the mouse views, and each port's example with its input, its printed output and what it draws. The coding agent's prompt is generated from the same tables, grouped the same way, with the command list appended.
- **Examples.** `examples/z80/bouncing-ball.z80` (double buffering and frame sync), `keyboard-move.z80` (key-state polling, with its title printed on the console port and so drawn on the Screen) and `mouse-paint.z80` (mouse polling, Shift for a second color, right button to clear).
- **Tests.** `Z80Device.test.ts` (47 tests) covers every group against real `Screen`, `Keyboard` and `Mouse` instances; `Z80Examples.test.ts` (23) assembles and runs every documented example and the three programs against the real Core under node and looks at the pixels they leave. `npm test`: 228 tests in 12 files.
- **A phase 4 defect fixed.** `ScreenRenderer.svelte` wrote `canvas.width` itself _and_ bound the same value as an attribute, so Svelte's own attribute write cleared the canvas right after the frame that resized it was painted, and `paintedVersion` then suppressed the repaint: a program's resize left a blank panel. The panel now only moves the `logicalWidth`/`logicalHeight` state and paints on the frame that finds the new backing store. Matrix row H12 rechecked.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 228 passing, `npm run build` clean.

### How it was checked in a browser

Rows Z1 to Z6, Z9 and Z10 of `docs/manual-verification.md` are observed behavior, not inspection: the built app was served with `vite preview` and driven through the DevTools protocol in the Playwright-cached headless Chromium (which needs `LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` on this machine for `libnspr4.so`), on the embed page with the example in its `code` parameter. The mouse rows use `Input.dispatchMouseEvent`, not synthetic DOM events: the panel takes pointer capture, and `setPointerCapture` throws for a pointer id the browser does not know, which silently kills a synthetic drag.

### API notes for the next phases

The port map, all in `Z80-model.ts`:

| Group    | Ports       | Members                                                                                              |
| -------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Console  | 0x00 - 0x04 | character, unsigned, signed, hexadecimal, 16 bit (unchanged, ADR 0002)                               |
| Screen   | 0x10 - 0x1A | pen color, fill color, pen width, X, Y, X2, Y2, command, pixel color, cursor column, cursor row      |
| Keyboard | 0x20 - 0x23 | typed input available, key state (B = key code), last key down, last key up                          |
| Mouse    | 0x30 - 0x33 | X, Y, buttons, event count, each with B selecting the view (0 current, 1 last release, 2 last press) |
| Time     | 0x40 - 0x42 | wait (B = hundredths), frame sync, elapsed hundredths (B = byte index, 0 lowest)                     |

- `new Z80Device(host)` where `host` is `{ write, hasInput, timeHundredths, screen, keyboard, mouse, onGraphicalUse? }`. `readPort`/`writePort` are the Core's hooks; `provideInput(port, line)` and `provideCharacter(character)` answer a suspended read; `completeWait(port)` lets a suspended wait finish; `echo(text)` draws the Terminal's echo at the text cursor, handling `\b` by blanking the cell to its left; `reset()` is the clear path. The statics `portNameOf`, `groupOf`, `isWaitPort`, `isCharacterPort` and `waitHundredthsOf` are what an adapter needs to route a pending stop.
- `expandColor` and `packColor` are exported from `Z80Device.ts`: 3-3-2 to the Screen's 24 bit and back, by repeating each field, so every byte round-trips.
- **`GenericEmulator` gained `requestCharacter(question, execution)`** next to `requestInput`: it wraps `terminal.readCharAsync` in the same `ReadInput` interrupt. Phase 6 should use it for EASy68K's task 5 instead of reading a line and keeping its first character.
- **Wiring a Screen adapter is three things**: build the device with the peripherals, mirror console output to `screen.writeText` (the device does it in `print`), and hand the Terminal an echo callback when the Keyboard becomes its source.
- The scheduler's `wait` reason is the only way to suspend a run without blocking the GUI; the promise must also be what re-arms the Core, which here is `clock.wait(...).then(() => device.completeWait(port))`.

### Choices where the plan left a detail open

- **The Terminal's interactive source is chosen by what the program does, once per run.** A Z80 program that only prints keeps the prompt it has always had; the first Screen, Keyboard or Mouse port access calls `onGraphicalUse`, which switches the Terminal to the Screen's Keyboard with an echo to the text cursor. That is [ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md)'s "in graphical use" evaluated instead of guessed, and it is what keeps the `in` instruction's own documentation example (`in a, (1)` then, `in a, (0x11)` since the port map moved up by 0x10 on 2026-09-11 — [ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md) — on a page whose Screen panel starts collapsed) working exactly as before. The switch happens at most once per run and never goes back, so the source is still fixed for a run in the sense the ADR cares about. Phase 6 has the same choice to make for EASy68K, where the graphical signal is the first graphics task.
- **A wait carries an 8 bit duration in B, in hundredths of a second**, 0 to 255. ADR 0010 said "a 16-bit duration rides on the high byte of the address bus, like the WORD console port", but that shape only works for a write, and a write cannot suspend the machine: an `in` has B and the port number and nothing else. 2.55 seconds is the practical range for animation and polling, and a longer wait is a loop; the ADR left the units and width to be settled with the device.
- **Clear takes the fill color and adopts it as the background**, so a scrolled text row and a later resize leave the same color behind as the clear did. The Z80 has no background color port, and a Screen whose text cells were painted with a different background than the image would look wrong the first time a program's output scrolled.
- **X, Y, X2 and Y2 are staging registers, not the Screen's drawing position**: reading one answers the byte last written to it. They are device state, like the buffered input line, so they do not rewind on Undo; the Screen's own pen position, colors, cursor and pixels do.
- **The command port answers with the last command number**, and an undecoded command is dropped rather than stopping the program, the same convention as a write to an undecoded port.
- **The mouse view numbers are EASy68K's task 61 modes** (0 current, 1 last release, 2 last press) and the buttons byte is its flags layout, so the two environments describe a click the same way. An unknown view answers as the current state.
- **The keyboard availability port goes through the Terminal**, not straight to the Keyboard, so that a poll and the character read after it refer to the same pending input, testcase input included — the compatibility ADR 0009 asks for.
- **A size byte of 0 means 256** in a resize, the only size a byte cannot hold; every other coordinate is a plain byte and the Screen clips.
- **Colors are named in the model** (`Z80_COLORS`, eleven of them). The two grays are the nearest the two blue bits allow and are not exactly neutral; that is 3-3-2, not a bug.
- **Ports 0x10 and up used to be "not connected to anything"** in the generated `ini`/`inir`/`ind`/`indr` instruction examples, which is no longer true: they now read 0xF0, which is outside the map and is also the only kind of port whose answer does not change as B counts down.

### Left and blockers

- No blocker. Phase 6 (the M68K editor half) and phase 7 (the MIPS and RISC-V editor half) are untouched, and nothing outside the Z80 changed except `GenericEmulator.requestCharacter` and the `ScreenRenderer` resize fix.
- Matrix rows Z7 (Build and project close reset) and Z8 (a testcase over a drawing program) are not run. Z3 was checked at zoom ×1 only.
- The Screen history budget is untouched by this phase: `bouncing-ball.z80` journals a whole image per clear and per present, which is what phase 8 should measure the default against.
- A program suspended on Screen keyboard input shows nothing in the GUI but disabled execution buttons: the interrupt state has no renderer. It is pre-existing (the prompt was the only visible sign), but it matters more now that a graphical program's reads are silent — worth a small indicator in phase 8.

## Phase 6 (editor part): M68K — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commits `f7086da` (the adapter, the examples and the tests) and `a219bf9` (the documentation, the matrix and this log). Phase 7 (the MIPS and RISC-V editor half) is untouched.

The Core half of this phase **did land**, despite the agent reporting `done=false`: `/home/dev/code/s68k` commit `65de8f7` and the tarball `/home/dev/code/local-packages/specy-s68k-1.4.0.tgz`, whose API notes are the section at the top of this log. Every shape it documents was observed to be correct. The tarball is now a `file:` dependency; `@specy/s68k` 1.4.0 still has to be published before this branch can merge.

### Done

- **The adapter** (`src/lib/languages/M68K/M68KEmulator.svelte.ts`). Every task the Core decodes now reaches a peripheral: the graphics tasks (11, 33, 80 to 96) drive the Screen, printed text goes to the Terminal transcript and the Screen's text cursor at once ([ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md)), tasks 7, 19 and 61 read the Keyboard and the Mouse, 24 is a no-op, 17, 18 and 20 are the new text tasks, task 23 lets program time pass and task 8 answers in hundredths of a second since the run started ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)).
- **The trap table** (`src/lib/languages/M68K/M68K-traps.ts`): one plain-data module holding every supported task with its registers, the rejected tasks with the reason each is rejected, EASy68K's color equates and key codes, the mouse flag and drawing mode numbers, and the two color conversions. The documentation page, the coding agent's prompt and the adapter's error messages all read it, so none of them can drift from the others.
- **The documentation page**: `src/routes/documentation/m68k/traps/+page.svelte` on `src/components/documentation/m68k/M68KTrapsDocumentation.svelte`, linked from the M68K index, the sidebar and the complete-documentation page, grouped like EASy68K's help (Text I/O, Graphics, Keyboard and mouse, Program time) with the key codes, the colors, the rejected tasks and a "Differences from EASy68K" section. `trap`'s own instruction description was rewritten to the current task list and now links to it.
- **The coding agent's prompt** is generated from the same table, grouped the same way, and its opening line no longer claims the editor has no graphics.
- **Examples** in `examples/m68k/`: `graphics-tour.x68`, `bouncing-ball.x68`, `keyboard-move.x68` and `mouse-paint.x68`, plus EASy68K's own `graphicSound.X68`, `mouseWindowSize.X68` and `clockDigital.X68` verbatim under `easy68k/` with a README naming the source and the GPL.
- **Tests**: `src/lib/languages/M68K/M68KEmulator.test.ts`, 34 tests driving the real Core under node — every task group, the register packings, Undo, a testcase, the input source switch, the rejected tasks and all four examples. `npm test`: 262 tests in 14 files.
- **Matrix**: rows M1 to M12 of `docs/manual-verification.md`, ten of them observed in a browser.
- Verification at both commits: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` green, `npm run build` clean including the prerendered `documentation/m68k/traps`.

### How it was checked in a browser

Rows M1, M3 to M7 and M10 to M11 are observed behavior: the built app served with `vite preview` and driven through the DevTools protocol in the Playwright-cached headless Chromium (which still needs `LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` for `libnspr4.so`), on the embed page with the program in its `code` parameter and the small layout's screen toggle opened. Keys and pointer events were dispatched with `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent`, not synthetic DOM events, for the reason phase 5 recorded.

### Choices where the plan left a detail open

- **Task 23 delays hundredths of a second, not milliseconds.** EASy68K's help says "Delay n/100 of a second" and the Core passes D1.L through untouched; the adapter used to treat it as milliseconds and the instruction documentation said so. Compatibility is the target of ADR 0003, so the units are EASy68K's now and the documentation was corrected. A project that relied on the old reading gets a delay a hundred times longer, which is the price of the reference behavior.
- **Task 8 counts from the start of the run**, not from midnight, because that is the Program time of ADR 0010 and it is what a virtual clock can offer a testcase. Programs difference two reads, which is unaffected. Stated on the documentation page.
- **Drawing mode 2 is the GDI `R2_NOP` reading**: a drawing task changes no pixel but the drawing point still moves, so tasks 84 and 85 leave it at their end point. That is what "move cursor but do not draw" means in the Windows raster ops EASy68K sets, and it is what makes the mode useful.
- **Task 33 clamps to EASy68K's minimum 640 by 480**, which its help states for that task, rather than accepting any size. A program asking for less gets the minimum instead of an error.
- **The Terminal's interactive source is chosen by what the program does, once per run**, exactly as phase 5 chose for the Z80: a program that only prints keeps its input prompt, and the first graphics, keyboard or mouse task moves reads to the focused Screen's Keyboard with the echo drawn at the text cursor ([ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md)). Task 7 counts as a keyboard task, so the documented poll-then-read loop (task 7 then task 5) works.
- **Text always mirrors to the Screen**, whether or not the program ever draws, like `Z80Device.print`. A text-only program's Screen therefore holds its output; nothing shows it unless the panel is open, and it costs history the budget already bounds.
- **Task 7 goes through the Terminal**, not straight to the Keyboard, so the poll and the read after it see the same pending input, a testcase's scripted input included.
- **The unsupported-task message is built in the editor**, not the Core: the adapter rewrites the Core's `Unknown interrupt: <n>` into `Trap task <n> (<what it is>) is not supported: <why>` for the eleven tasks the design record rejects, and into `Trap task <n> is not a supported trap #15 task` for anything else. Task 92's and task 61's rejected modes keep the Core's own messages, which already name the mode.
- **Colors** are converted at the boundary: EASy68K's `$00BBGGRR` long to the Screen's `0xRRGGBB` and back for task 83, so EASy68K's colour equates work unchanged.
- **`echoToScreen`** moved out of `Z80Device` into `src/lib/languages/peripherals/screen/textEcho.ts`, since the two single-window environments echo identically. `Z80Device.echo` now calls it.
- **EASy68K's example programs do not assemble here and are not meant to.** `@specy/s68k` has no structured control statements (`if.l … endi`, `repeat … until`), no `SIMHALT`, no `END START` and no `OPT`/`SECTION`, and the programs call tasks this editor rejects on purpose. They are checked in as the reference the matrix compares against, and the README says so. The runnable ports next to them are what the rows actually run.
- **The examples were fetched from `http://www.easy68k.com/files/EASy68K.zip`**, the distribution zip the project's own site links: `https://github.com/ProfKelly/EASy68K` holds the source and help zips but no `Examples` folder. Same programs, same authors, same GPL.
- **`vite.config.ts` inlines `@specy/s68k` for vitest** (`test.server.deps.inline`). The package imports its wasm glue as `./pkg/s68k`, without an extension, which node cannot resolve on its own; going through Vite is what the app already does. Every other Core resolves under node unaided.

### API notes for the next phases

- `M68K-traps.ts` is the pattern `Z80-model.ts` set: plain data, relative imports only, safe to import from a prerendered route or from node. Phase 7 can do the same for the MARS bitmap display and register documentation.
- `echoToScreen(screen, text)` in `peripherals/screen/textEcho.ts` is the shared echo for a single-window environment. MIPS and RISC-V do **not** want it: MARS keeps a separate console, which the design record calls its own convention.
- The M68K adapter's `_runSlice` now returns `{ reason: 'wait', wait }` for task 23 and answers the interrupt **before** returning the wait, because the program is no longer stopped on the trap, only on time passing. `_step` and `_runTestcase` await the same promise inline. Phase 7's `sleep` syscall can follow the same shape or keep suspending inside the Core call, as the x86 adapter does.
- `settingsStore.values.showScreen` gates the panel but not the drawing: an adapter always draws, and the Screen's `dirty` flag is what makes the scheduler pick the short slice budget. Nothing in phase 6 reads the setting.

### Left and blockers

- **`@specy/s68k` 1.4.0 is unpublished.** `package.json` points at the tarball; publishing it and restoring a caret range is the last step before this branch can merge. Nothing else in the editor depends on an unpublished build.
- Matrix rows M8 (Undo) and M9 (a testcase over a drawing program) are covered by node tests but were not walked by hand in the GUI; M10 was not checked for a project close.
- **An exhausted instruction limit names the last slice's budget, not the run's.** A program stopped by the limit reports `Execution limit of 18 instructions reached` when the user's limit was 200, because `runWithLimit` is given what is left of the run and the Core's error carries that number. Pre-existing (phase 3 split the run into slices), harmless to correctness — the whole limit is still enforced exactly — but the message is confusing enough to be worth a line in phase 8.
- **Stop blanks the Screen**, because this editor's Stop button is `emulator.clear()`, which is the design record's "Clear execution". A program that ends on its own leaves its last frame, which is what the record asks for; phase 5 saw the same thing and recorded it the same way.
- Task 95 draws text transparently and the text cursor paints an opaque cell, the choice phase 1 made and asked phase 6 to check against EASy68K. It was not checked: EASy68K runs on Windows and no reference screenshot of overlapping text exists in the help. Both readings are defensible and the current one is the more useful; if a real EASy68K run ever contradicts it, `Screen.drawText` is the one place to change.
- The Screen history budget is untouched by this phase. `bouncing-ball.x68` journals a whole 640 by 480 image per clear and per present, which is a megabyte a frame and the heaviest thing phase 8 has to measure the default against.

## Phase 7 (editor part): MIPS and RISC-V — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commits `46d40e2` (the adapters, the shared module, the examples and the tests), `a6ea0ab` (the configuration popover, the documentation and the agent prompt) and the one this log follows. This is the last environment phase; only phase 8 is left.

Both Core halves of this phase **did land**, despite the orchestrator reporting `done=false` for each: `/home/dev/code/mars` commits `db4ec5b`/`cea61e5` and `/home/dev/code/rars` commit `f72406e`, packed as `/home/dev/code/local-packages/specy-mips-2.1.0.tgz` and `specy-risc-v-2.1.0.tgz`. Both are now `file:` dependencies next to `@specy/s68k`, and every API shape their sections of this log document was observed to be correct — the observers, `setPeripheralWord`, the silent `readMemoryBytes`, the `time` and `sleep` handlers, and the fact that `undo()` notifies.

### Done

- **The shared module** `src/lib/languages/mars/`, because RARS's tools are ports of MARS's and both Cores now expose the same observer API:
    - `marsDisplay.ts`: MARS's five parameters with its own choice lists (`1..32`, `64..1024`, five base addresses) and default indices, `normalizeMarsDisplay` (which snaps anything off the lists back on) and `marsDisplayGeometry` (columns, rows, words and the inclusive end address). `ProjectDisplay` and `DEFAULT_PROJECT_DISPLAY` **moved here** from `Project.svelte.ts`, which re-exports them, so a documentation page and the agent prompt can read the parameters without pulling the project module into a prerendered route.
    - `MarsDevices.ts`: the bitmap display and the keyboard-and-display simulator. Plain TypeScript, no runes, driven through a structural `MarsCore` type that both `JsMips` and `JsRiscV` satisfy.
- **The framebuffer.** A write observer over the configured range records a dirty word range; the range is re-read with `readMemoryBytes` and handed to `Screen.syncFramebuffer` at the end of every slice, step and testcase, and from the `sleep` handler. One word is one logical pixel and the low 24 bits are the color. Undo re-syncs the whole grid through `_resyncScreenFromMemory`, which framebuffer mode needs because it journals nothing ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)).
- **The four registers** at `0xffff0000`, as read and write observers on single words: the receiver is backed by the Keyboard's typed queue with the Ready bit kept in memory through `setPeripheralWord`, the transmitter is always Ready and appends to the Terminal with ASCII 12 clearing it, and a write that sets bit 1 of either control register throws from the handler, which the Core turns into a program error naming the feature.
- **Program time.** Syscall 30 answers from `_peripherals.clock` (read at the point of use, never cached) and syscall 32 suspends the pending `simulate` call on `clock.wait`, through `executionController.waitFor` so Stop is answered.
- **The configuration popover.** `ScreenDisplayConfiguration.svelte` renders into the Screen panel header's `configuration` snippet, which phase 4 left for this phase. On the project page it is bound to `project.display` and saves; on `InteractiveInstructionEditor` it lives as long as the page, which covers lectures, exams, embeds and chat. `ScreenRenderer` gained `actualSizeZoom`, which MIPS and RISC-V set to MARS's unit width.
- **Documentation.** One `MarsScreenDocumentation.svelte` for both environments on `/documentation/mips/screen` and `/documentation/risc-v/screen`, in both complete-documentation pages, linked from the index and the sidebar. Syscall 30's description was wrong (it counts from the start of the run now, not from 1970) and syscall 32 was commented out entirely; both are documented. The coding agent's prompt is generated from the same tables.
- **Examples** in `examples/mips/` and `examples/risc-v/`, three each with a README: `bitmap-tour`, `bouncing-ball` (sleep and program time) and `keyboard-display` (the four registers).
- **Tests.** `MIPSEmulator.test.ts` and `RISC-VEmulator.test.ts`, 15 each against the real Cores under node, plus 7 in `marsDisplay.test.ts`. `npm test`: 297 tests in 16 files.
- **Matrix**: rows P1 to P10 and V1 to V11 of `docs/manual-verification.md`, six of them observed in a browser.
- Verification at every commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` green, `npm run build` clean including the two new prerendered documentation routes.

### How it was checked in a browser

The built app was served with `vite preview` and driven through the DevTools protocol in the Playwright-cached headless Chromium 151, on the embed page. Note for the next agent: the embed's `code` parameter is **lz-string compressed** (`compressToEncodedURIComponent`), not plain percent-encoding — a plain-encoded program silently loads the language's default program instead, which looks like the feature not working. `showConsole=true` is needed to see the transcript. Observed: the bitmap tour's picture pixel for pixel on both Cores, the popover's lists and its immediate re-sync, typing into the keyboard example through `Input.dispatchMouseEvent`/`dispatchKeyEvent`, the transmitter's characters in the console, the interrupt-enable error text, and a blank Screen in the configured geometry after Build and after Stop.

### Choices where the plan left a detail open

- **The Screen is the word grid, not MARS's display area.** The design record says "one word is one logical pixel", so a 512 by 256 display with 8 by 8 units is a 64 by 32 Screen. MARS's unit size survives as the panel's actual-size zoom (`actualSizeZoom`), so turning the zoom-to-fit off reproduces the tool's own geometry; fit-to-panel stays the panel's default, because "the Screen fits its panel with integer scaling" is the rule that always applies and its integer scale already lands near the unit size.
- **The receiver reads the Keyboard directly, not the Terminal.** Phases 5 and 6 routed their availability polls through the Terminal so a testcase's scripted input answers them, but a memory-mapped read observer runs **inside** the load instruction and cannot await anything, while `Terminal.readCharAsync` is async. The queue is synchronous, so that is what the register uses. A testcase's scripted input therefore does not reach the receiver; graphical input scripting is deferred anyway ([ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md)).
- **The Terminal keeps prompts** for MIPS and RISC-V. ADR 0009 asks for shared input "in graphical use" and allows prompts for programs without graphical input; MARS keeps a separate console with no text cursor to echo to, and its keyboard _is_ the receiver register, which is already backed by the Keyboard. There is no single-window compatibility to preserve here, unlike EASy68K's task 7/5 pairing.
- **`sleep` suspends inside the slice** rather than being reported as a slice `wait`. The Core's handler promise is what suspends the pending `simulate` call, and an adapter cannot return from `_runSlice` while that call is outstanding without stashing it across slices. Phase 3's notes explicitly bless the in-slice shape for these Cores and phase 6's notes offer it as the choice. The handler **flushes the Screen first**, which is what makes an animation work: a program draws a frame and then sleeps, and the frame has to be on screen while it waits rather than at the end of the slice several frames later.
- **The interrupt-enable error is thrown from the observer.** A JavaScript exception thrown inside a memory observer propagates cleanly out of `simulate*` in both Cores (verified before relying on it), so the program stops on the storing instruction rather than some slices later.
- **A program's write to a control register does not move the Ready bit**: the device re-asserts its own view with `setPeripheralWord` afterwards, which is what MARS's tool does.
- **The grid is clamped and probed.** `marsDisplayGeometry` stops a grid that would run past `0xffffffff` (the memory-map base with a megapixel grid), and `MarsDevices` binary-searches the largest readable prefix once per configuration, because a 1024 by 1024 grid at 1 by 1 units is four megabytes and every base address but the first runs out of segment before that — a read past the end throws rather than answering zeroes.
- **A byte or halfword store re-reads its whole word.** The observer's `value` carries only the bytes the store touched, so only the address is used.
- **`removeMemoryObserver` per handle, never `removeMemoryObservers()`.** Registrations live on the Core's memory singleton and are shared by every instance, so clearing them all would unhook another open project's devices.
- **The configured geometry survives the clear path.** `clear()` resets the Screen to the language default; both adapters override it to put the geometry straight back, blank. The size is the user's configuration rather than something a program asked for, and a panel that flips to 512 by 256 on Stop and back on Build reads as a bug.
- **The two keyboard examples sleep ten milliseconds per empty poll** instead of spinning like MARS's own samples. A wait costs no instructions ([ADR 0010](../adr/0010-program-time-without-clock-pacing.md)), so the editor's two-million-instruction execution limit never ends a program that is only waiting for a key; MARS has no such limit. The documentation page and the agent prompt say so.
- **The examples are this repository's own.** The plan asked for MARS's and RARS's bitmap and keyboard samples "if they can be fetched from their repositories": neither repository has any. `dpetersanderson/MARS` ships tools and no example programs at all, and `TheThirdOne/rars`'s `examples/` folder has eight programs, none of which touches either tool. The READMEs say so and cite the two Java tools as the interface reference.
- **The shared code lives in `src/lib/languages/mars/`**, named for the simulator whose tools both environments implement, following the `Z80-model.ts` and `M68K-traps.ts` pattern of plain-data modules a prerendered route can import.

### API notes for phase 8

- `MarsDevices` is `attach(core, display)` / `detach()` / `dispose()`, `setDisplay(display)`, `resetScreen(display)`, `flush()` and `resync()`. `flush()` is the per-slice dirty-range re-read and `resync()` the whole-grid one; both are what phase 8 measures if the framebuffer turns out to cost more than the five percent ADR 0007 budgets.
- The measurement that matters here: a full 512 by 256 re-read is about 15 ms under node (a 1024 by 1024 one about 135 ms), which is why only the dirty range is read per slice. A full re-read happens on a build, an undo and a display change.
- `Emulator.setDisplay` is optional and present only on these two adapters; `emulator.setDisplay !== undefined` is how the GUI decides whether to show the popover at all.
- `MIPS_INSTRUCTIONS_PER_MS` and `RISCV_INSTRUCTIONS_PER_MS` are still the Core agents' 1000, and are now the estimates with the most evidence behind them of the five.

### Left and blockers

- **`@specy/mips` 2.1.0 and `@specy/risc-v` 2.1.0 are unpublished**, like `@specy/s68k` 1.4.0. All three are `file:` tarballs in `package.json`; publishing them and restoring caret ranges is the last step before this branch can merge.
- **Undo cannot be walked in the GUI on MIPS or RISC-V**, and this is **pre-existing and not caused by this phase**. `_checkCode` assembles a throwaway Core, and `assemble()` reallocates the backstep buffer that MARS and RARS keep as a **singleton shared by every instance**, so the semantic check that follows every Build (and every keystroke, through the debounced `setCode`) empties the undo history: `canUndo` is false and the Undo button is disabled. The node tests drain the pending check with `await emulator.check()` before building, which is the only way to see undo work at all. The fix is a per-instance backstepper in the two Cores, a Core change; the matrix rows P7 and V7 record it. It has nothing to do with the Screen — the same is true of register and memory undo.
- **The memory-mapped registers are untested in RV64 mode** (matrix row V11); the Core's own smoke test pins them for RV32 only, and the memory map may not exist at `0xffff0000` there.
- A **testcase cannot script keyboard input into the receiver register**, by the choice above; it answers only what a live Keyboard has typed.
- Matrix rows P10's project-close case and V-side browser runs beyond V1 and V2 were not walked by hand; everything else on the RISC-V side is covered by the node suite, which is the same suite as the MIPS one against the other Core.

## Phase 8: validation and tuning — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commits `717ee3b` (the harness, the tuning and the two mechanisms), `be0ae55` (the design record's Validation section, the matrix and this log) and `60853c3` (the matrix's "needs manual run" markers). The last phase of the plan.

### Done

- **The measurement harness.** `npm run measure` (`vitest.measure.config.ts`, `src/lib/languages/measurements/`): the app's own Vite config pointed at `*.measure.ts` instead of `*.test.ts`, one file at a time in one process. `throughput` (compute-only instructions a second with and without the scheduler's yields), `responsiveness` (how long the host is held while a program runs, and how long Stop then takes), `animation` (frame pacing and the Screen journal of the four `bouncing-ball` examples) and `examples` (every program in `examples/`, run headlessly). Kept out of `npm test`: it takes minutes and asserts almost nothing.
- **Every example runs headlessly**, on every Core — all five load under node, x86's Blink included. The table is the new "Headless runs" section of `docs/manual-verification.md`. The two bitmap tours draw the same picture pixel for pixel on MARS and RARS; the three EASy68K reference programs do not assemble, on purpose; `Bad_Apple.s68k` prints and draws nothing because its only trap is task 23 and it writes its frames into memory.
- **Every provisional number is measured and recorded**: the design record's Validation section holds the tables and the reasoning, `docs/manual-verification.md` holds the measurement rows, and both name the values chosen.
- **The estimates are tuned.** `RISCV_INSTRUCTIONS_PER_MS` 1 000 → 25 and `X86_INSTRUCTIONS_PER_MS` 2 000 → 10 were the two that mattered: the first held the host for 3.7 seconds a slice, the second answered Stop seventeen seconds after it was pressed. Z80 20 000 → 10 000, M68K 20 000 → 15 000, MIPS unchanged at 1 000. `COMPUTE_SLICE_MS` 100 → 50, `SCREEN_SLICE_MS` unchanged at 16, `screenHistoryBudgetMb` unchanged at 64 with `DEFAULT_SCREEN_HISTORY_BYTES` raised from 32 to 64 MB to agree with it.
- **A slice deadline on the Z80 and the M68K** (`sliceDeadline` in `ExecutionSlice.ts`). Their instructions are not all the same size — one `out` or one trap can clear a whole Screen — and a drawing loop that never waits held the host for 57 seconds on the Z80 and for the whole run on the M68K. The Z80 spends its budget in chunks it resizes from what the last one cost (`nextSliceChunk`), the M68K looks at the clock between the traps its loop already breaks on. Both now hold the host for about 50 ms.
- **A speed correction in the scheduler** (`nextSpeedCorrection`, `GenericEmulator.learnSliceSpeed`). One constant per Core is not one speed: RARS runs `addi`/`j` at 26 instructions a millisecond and everything else at 150 to 320. The scheduler multiplies the adapter's estimate by what its own slices cost, within a factor of sixteen, starting again at every clear. Only a slice that came back on its budget teaches it, and only the part of it that was not the program's own wait — `ProgramClock` gained `waitedMs` for that, because MIPS, RISC-V and x86 serve a `sleep` without leaving their slice.
- **An M68K run stopped by its instruction limit names the user's limit**, not the last slice's share of it: `ExecutionSliceRequest` gained `runInstructionLimit`, which is what the adapter puts in the error it rebuilds. The confusing message was phase 6's last open item.
- **Matrix rows Z7 and Z8 are covered**, under node, in `Z80Emulator.test.ts`: a rebuild blanks the Screen and forgets the typed queue and the last click, and a testcase over a drawing program answers the character port from the scripted input, completes its wait at once and reads the elapsed-time port as 10 hundredths. Rows M8, M9, P7 to P10 and V3 to V10 were already covered by the node suites; what is left needs a browser and now has steps.
- **`docs/manual-verification.md`** gained the headless-run table, the x86 rows (X1 to X3, which the empty section was missing), a "Rows still needing a browser" section with the steps for each, and the filled-in measurements table.
- Verification at both commits: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 320 tests in 17 files, `npm run format:check` clean.

### The numbers that settle ADR 0007

Both targets are met on every Core (the full tables are in the design record):

- Yields cost **1.4% to 4.3%** of compute-only throughput — Z80 1.9, M68K 4.3, MIPS 3.5, RISC-V 1.4, x86 1.4. One yield is about 1.1 ms under node, which has no `scheduler.yield()`, so it is the slice length that keeps the cost down.
- **Nothing holds the host for a tenth of a second**: the worst tick of a 10 ms timer during a run was 85 ms, and the compute loops settle at 41 ms, which is a 50 ms slice sampled at a random point. Stop itself, once the host is free, is answered in 0.7 to 2.6 ms.
- Frame pacing: Z80 17.0 ms, M68K 24.0 (asking 20), MIPS 17.2 (asking 16), RISC-V 18.4 (asking 16).
- The Screen journal of 100 undo steps: Z80 6.4 MB at 256 by 192, M68K 58.8 MB at 640 by 480, MIPS and RISC-V nothing at all.

### Choices where the plan left a detail open

- **The harness is committed rather than thrown away.** The plan only asked for numbers, but a number nobody can take again is a claim; `npm run measure` is how the next person checks one. It is a separate config so `npm test` stays seconds long.
- **The estimates are calibrated on a compute-only loop and rounded down**, because that loop is the fastest a Core ever goes and everything else is slower. The correction is what covers the spread; without it the choice would have been between a laggy host and a slow run, and neither meets the ADR.
- **The correction moves the instruction budget, never the deadline.** `timeBudgetMs` stays the true target, which is what the Z80 and M68K deadlines are measured against, and the correction rides in `speedCorrection` next to it. Otherwise a correction of four would have let a drawing loop hold the host for four times the budget.
- **A slice under a millisecond teaches nothing**, which is also what keeps the fake-adapter tests of phase 3 exact: their slices return instantly.
- **The correction is bounded to a factor of sixteen either way** and to four per slice. Sixteen covers the spread measured inside a single Core (twelve to one on RARS); the per-slice bound means a slice distorted by something other than compute is forgotten in two or three slices.
- **The animation runs are ended from inside the clock**, by throwing once the program has asked for its 120th frame, rather than by Stop (which resets the Screen and its journal) or by an instruction limit (which buys a thousand times more frames on the M68K, whose slices charge one instruction per trap, than on the Z80).
- **A program that never terminates is given the app's own instruction limit and 2.5 seconds of wall clock** in the headless runs, because a program paced by waits spends no instructions while it waits.
- **The measurements run with a stand-in for the Screen panel's repaint**, a 16 ms timer that calls `markPainted()`. Without it a Screen stays dirty and the scheduler holds the short slice budget for the whole run, which is not what a browser does — and is a real defect on any surface that runs a program with the Screen panel closed (see the gaps).
- **The key hold interval and the double-click interval keep phase 2's values.** 30 ms is more than the 17 to 24 ms frame the pacing measurement found, so a program polling once a frame sees every transition; 500 ms is Windows' own double-click default, which is what EASy68K's flag means, and nothing here can measure a human.

### Overall status of the feature

**Complete.** Every phase of `screen-peripherals-plan.md` has landed: the test infrastructure and the Screen model, the Keyboard, Mouse and ProgramClock, the injection and the slice scheduler, the Screen panel and its hosting, the Z80 port map, the M68K trap tasks, the MIPS and RISC-V bitmap display and memory-mapped registers, and this phase's validation. 320 tests, the type check at its branch baseline, the lint clean, `npm run build` clean, and a manual matrix whose remaining rows are listed with the steps to run them.

**What the user must do before this branch can merge.**

1. **Publish the three Core packages** and replace the `file:` tarballs in `package.json` with caret ranges: `@specy/s68k` 1.4.0 (`/home/dev/code/s68k`, branch `feat/screen-peripherals`, commit `65de8f7`), `@specy/mips` 2.1.0 (`/home/dev/code/mars`, commits `db4ec5b` and `cea61e5`) and `@specy/risc-v` 2.1.0 (`/home/dev/code/rars`, commit `f72406e`). The tarballs are in `/home/dev/code/local-packages/`. Nothing else in the editor depends on an unpublished build. Remember npm's `save-exact` here: the caret ranges have to be restored by hand after an install.
2. **Walk the rows that need a browser**, listed with their steps in `docs/manual-verification.md`: the zoom half of Z3, the project-close half of Z7, M10, P10 and V10, M8's Undo in the GUI, the RISC-V browser spot check V3 to V9, RV64 (V11), the chat page (H9) and a live exam session (H10).
3. Decide whether the settings reset that `CURRENT_VERSION` 1.1.8 causes is worth announcing: every user's stored settings go back to their defaults once, which is what makes the two new keys exist.

**Known gaps**, none of them blocking:

- **Undo cannot be walked in the GUI on MIPS or RISC-V**, and it is not this feature's doing: `assemble()` reallocates the backstep buffer that MARS and RARS keep as a singleton, so the semantic check that follows every Build empties the undo history. The fix is a per-instance backstepper in the two Cores. Rows P7 and V7.
- **The M68K charges one instruction per trap**, so a trap-heavy program runs far past the instruction limit the user set — the limit is enforced exactly in instructions the Core reports, and the Core reports none. Only a Core-side instruction counter fixes it; the slice deadline at least bounds the time such a program can hold the host.
- **The Screen's Undo follows the Core one record per step**, not by instruction, because no Core reports an instruction count at a Screen operation. With sparse drawing the image rewinds ahead of the code and re-converges; phase 3 recorded the reasoning.
- **A Screen with no renderer stays dirty**, so a surface that runs a program with the Screen panel closed (the small layout's toggle, or `showScreen` on with no panel mounted) keeps the scheduler at the 16 ms slice budget. It costs throughput, not correctness, and the fix belongs to whoever gives the panel a "is anyone watching" signal.
- **A program suspended on Screen keyboard input shows nothing in the GUI** but disabled execution buttons. Phase 5 asked for a small indicator; it is a panel change rather than a measurement, so this phase left it.
- **A testcase cannot script keyboard input into the MIPS and RISC-V receiver register**, by phase 7's choice: a memory read observer runs inside the load instruction and cannot await the Terminal.
- **The memory-mapped registers are untested in RV64 mode** (row V11).
- **The panel is 20 rem tall wherever it is hosted**, which leaves a 640 by 480 Screen at about 60 percent. Phase 4 asked whether phase 8 should revisit it; with real programs on screen it reads fine, and a taller panel would take room from the editor, so it stays.

## Review fixes — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, commits `306d16f` (the Screen journal), `6b96484` (the panel keys, the slice gate, the receiver and the design record) and this log's own. A reviewer walked the whole branch and reported seven findings; each was verified against the code before anything was changed.

### Finding by finding

| #   | Finding                                                                                                                                                | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The three Core packages are `file:` tarballs, so `npm i` fails on any other checkout and the PR-validation job never reaches lint, format or the tests | **Confirmed, not fixable here.** `npm view` on 2026-09-06: `@specy/s68k` is published up to 1.3.1, `@specy/mips` and `@specy/risc-v` up to 2.0.1, so the three builds this branch needs do not exist on the registry. Publishing them is the user's own step (npm credentials, three sibling repositories), and it is already step 1 of the pre-merge list at the end of phase 8. Nothing in the editor can stand in for it: pointing the ranges at unpublished versions would break the local install too, and committing the tarballs would be exactly the unpublished dependency the plan's ground rule forbids. Blocker, restated below |
| 2   | One instruction that journals two Screen records offsets the journal from the Core history for good                                                    | **Confirmed and fixed** (`306d16f`). See below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3   | The panel stops key ups, so a modifier released over the Screen stays in the project page's held-key map                                               | **Confirmed and fixed** (`6b96484`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | Escape is the one key a focused Screen does not suppress                                                                                               | **Confirmed and fixed** (`6b96484`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5   | A Screen nobody paints stays dirty, so x86 always runs on the 16 ms slice                                                                              | **Confirmed and fixed** (`6b96484`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | Stop blanks the Screen although the design record says the last frame survives it                                                                      | **Confirmed; the design record was wrong, not the code.** Reconciled in `6b96484`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | The MIPS and RISC-V receiver register drains the live Keyboard queue during a scripted run                                                             | **Confirmed and fixed** (`6b96484`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### The Screen journal (finding 2)

`GenericEmulator.undo` pops one Screen record per rolled back Core step, and no Core can key the two histories together (phase 3's note), so the invariant the editor has to keep is **one journal record per Core step**. Two paths broke it, both verified by reading the code: the Z80's clear command called `setBackgroundColor` and then `clear` for a single `out`, and `Terminal.readLineFromKeyboard` echoes character by character — three records for a backspace — while one trap or one `in` is suspended. M68K task 18 adds a `print` before the read on top of that.

The fix is the reviewer's second option, because the first is not reachable: rewinding by journal position needs a mark per Core step, and a slice runs thousands of steps inside a Core that reports none of them. Instead `Screen` gained **compound operations**:

```ts
screen.beginCompoundOperation()
// … any number of Screen operations …
screen.endCompoundOperation()
```

Everything journaled inside becomes one record (`ScreenPixelRecord` kind `'compound'`, the inner records oldest first), which `apply` undoes newest first — exactly what separate Undos would have done, since every inner record carries the state it restores. A compound holding one record pushes that record itself; one holding none pushes nothing; nesting is counted; `reset()` and the framebuffer switches discard an open one, because Stop can land on a program suspended in the middle of a read. `recordBytes` charges the compound for what is inside it, so the byte budget still sees every glyph.

Three call sites use it: the Z80 clear command, the whole of `Z80Emulator.provideInput` (the echo belongs to the `in` the machine re-executes) and the whole of `M68KEmulator.handleInterrupt` (one `trap #15` is one step, whatever the task draws).

### The other fixes

- **Key routing** (`ScreenRenderer.svelte`). `routeKey` takes a `stopShortcuts` flag: a key down still stops propagation, a key up no longer does. Shortcuts fire on key down, and `Keyboard.releaseKey` ignores a key it never saw pressed, so nothing is lost. The Escape branch of `handleKeyDown` now stops propagation before blurring; its key up is deliberately left to bubble, for the same reason as every other release — the page has to see it to forget it.
- **A watched Screen** (`Screen.watch()`, `GenericEmulator.sliceTimeBudgetMs`). A renderer registers with `screen.watch()` and unregisters with the function it returns; `watched` is true while at least one is registered. The slice budget is now `screen.watched && screen.dirty`, and the `settingsStore.showScreen` read is gone from the scheduler: a panel can be mounted with the global setting off (the interactive editor's `showScreen` prop), and "is anyone painting this" is the precise question. The panel registers from an `$effect`, so a changed `screen` prop moves the registration; the measurement harness's stand-in registers too, which keeps phase 8's numbers comparable.
- **The MARS receiver** (`MarsDevices.refillReceiver`). Gated on `terminal.inputSource === 'scripted'`; the narrowed terminal type gained the getter. The register is already blank when a scripted run starts, because a Testcase compiles before it runs and `attach` clears both words. A keystroke typed during a Testcase now stays in the Keyboard queue for the interactive run that follows.
- **The reset row** (`screen-peripherals.md`). Stop is wired to `emulator.clear()` from both hosts and there is no separate Clear execution button — the shortcut and the button are the same action — so the row now says that the frame does not survive Stop and that it survives a program's own termination. Phases 5 to 7 implemented and tested that behavior (`MIPSEmulator.test.ts:124` and its RISC-V twin say so in as many words); the sentence was the stale half.

### Tests

`npm test` is 334 tests in 18 files, up from 320 in 17.

- `Screen.test.ts`: a compound journals one record, undoes its operations newest first, counts nesting, pushes nothing when it drew nothing, charges the budget for what it holds, and is discarded by `reset`. Watchers: counted, released once per registration, kept across a reset.
- `Z80Device.test.ts`: the clear command is worth exactly one record, and undoing it brings the image and the background color back.
- `Z80Emulator.test.ts`: a program that draws and then reads a typed line through the Screen keyboard journals four records for its four Screen-touching steps — the echo of `ax\bb\n` was seven before — and walking the whole program back with Undo empties the journal exactly.
- `M68KEmulator.test.ts`: a read trap whose echo includes a backspace journals one record, next to the pen-color task's one.
- `MarsDevices.test.ts` (new, against a fake Core): the receiver takes a typed character in an interactive run, leaves it in the queue during a scripted one, and picks the queue back up afterwards.
- `GenericEmulator.test.ts`: the short budget needs a watched Screen, an unwatched dirty Screen keeps the long one, and a renderer going away mid-run puts the budget back.
- `docs/manual-verification.md`: rows H13 (a modifier released over the Screen) and H14 (an action rebound to Escape), with their steps in the "Rows still needing a browser" section. Neither can be asserted under node — the panel is DOM- and animation-frame-bound, which is why phase 4 has no automated tests for it — and this phase had no browser.

Verification at both commits: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm run format:check` clean, `npm test` 334 passing.

### Left and blockers

- **The three Core packages are still unpublished** (finding 1). Until `@specy/s68k` 1.4.0, `@specy/mips` 2.1.0 and `@specy/risc-v` 2.1.0 are on the registry and the caret ranges are back in `package.json` and the lockfile, `npm i` works only on this machine and the PR-validation job cannot run. Everything else in this section was validated locally instead.
- The two panel rows H13 and H14 need a browser, like the rest of the panel's behavior.
- `GenericEmulator.test.ts`'s "grows the budget of a Core the estimate was too slow for" failed once during this phase, while the machine's `/tmp` was full, and passed on every run before and after (including eight runs of the file alone and three full suites). It burns five milliseconds a slice and asserts the correction that follows, so it is sensitive to a loaded machine; it was left as it is, but a CI failure there is a flake rather than a regression.
- The known gap "a Screen with no renderer stays dirty", recorded at the end of phase 8, is closed by finding 5's fix.

## Core packages published — 2026-09-06

The three `file:` tarball dependencies are gone; `package.json` names registry versions again, with the caret ranges this repository uses.

| Package         | Version | Where it came from                                                       |
| --------------- | ------- | ------------------------------------------------------------------------ |
| `@specy/mips`   | 2.1.0   | published from `Specy/mars`                                              |
| `@specy/risc-v` | 2.1.0   | published from `Specy/rars`                                              |
| `@specy/s68k`   | 1.4.0   | published from `Specy/s68k` by its new CD workflow, with SLSA provenance |

`Specy/s68k` had no CI at all, so it gained `ci.yml` and `cd.yml` mirroring the MARS and RARS workflows: CI runs the Rust suite, the wasm-pack build, the TypeScript build and a smoke test; CD publishes on a `v*` tag through npm trusted publishing, guarded by an owner check, an ancestry check against the default branch, and a tag-versus-manifest version check.

Publishing 1.4.0 needed two fixes to the package itself, both of which also affect this repository:

- `ts-lib/src/index.ts` imported `./pkg/s68k` without an extension, so `tsc` emitted a specifier node's ESM resolver rejects and the package could only be loaded through a bundler. **The `deps.inline` workaround for `@specy/s68k` in `vite.config.ts` existed only for that, and has been removed**; all 334 tests pass without it.
- `ts-lib/package.json` had no `files` field, so npm fell back to `.gitignore` and shipped `dist/` only because it refuses to exclude the directory holding `main`. An explicit allowlist now pins the tarball's contents.

Of the pre-merge list at the end of phase 8, item 1 is done. What remains is the browser-only matrix rows and the note about the settings version bump.

## Follow-up 1: the transcript's position and how the Screen panel sizes itself — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`. This section ships in the same commit as the change it describes. One of four follow-up parts the user asked for after the feature landed; the other three are untouched here.

**Where this contradicts the design record.** The Placement row of `screen-peripherals.md` said "the transcript stays at the bottom" and its zoom row said the panel fits "with integer scaling when that fits". The user asked for the opposite of both — the transcript before the Screen, and a fit that fills the constraining dimension exactly — so both rows have been rewritten to match, each naming the date and what it used to say.

### Done

- **Order.** `src/routes/projects/[project]/Project.svelte` renders the transcript before the Screen panel, so the right column is memory, transcript, Screen. `src/components/shared/InteractiveInstructionEditor.svelte` does the same in both layouts: the fullscreen right column is the memory wrapper, the transcript, the panel; the small layout is the top row, the transcript (or the transcript-and-memory bottom row), then the Show/Hide screen bar and the panel. That covers the project page, lectures, the exam page, embeds, the documentation pages and chat, which is every surface that hosts the panel.
- **Fit.** The panel's zoom moved out of the component into `src/components/specific/project/screen/screenZoom.ts` (`screenZoom`, `screenZoomLabel`) so it could be tested. Fitting no longer floors the scale: it is `min(box width / logical width, box height / logical height)`, which fills the constraining dimension exactly. `image-rendering: pixelated` was already on the canvas and is what keeps a fractional scale looking like square pixels. The zoom label reads as a percentage while fitting and as `×n` at actual size, because the fitted number is no longer whole.
- **No scrollbar while fitting.** The canvas now sits in a `.screen-stage` inside the padded `.screen-viewport`, and the stage is what is measured. `clientWidth` counts padding, so the old measurement was 0.6 rem larger than the box the canvas actually had, and the image overflowed by exactly that much. The stage is also `overflow: hidden` while fitting and `overflow: auto` at actual size, so a sub-pixel rounding cannot put a scrollbar on a panel that fits. Actual size keeps its whole-number zoom and still scrolls.
- **Size.** The panel is 26 rem tall in the project page's right column and in the fullscreen layout (was 20 rem), and 20 rem in the small layout (was 16 rem).
- **Floating window.** A second header button expands the panel into a window fixed to the right of the viewport: `top: 0.5rem; right: 0.5rem; bottom: 4rem; width: min(58vw, 68rem)`. It closes on the same button and on Escape, keeps the fit behaviour inside its larger box, and leaves the page underneath fully interactive — there is no backdrop, because the point is to press Run while watching the Screen. Default is still the in-page panel.
- **One registration.** Expanding is a class on the panel's own root element, not a second component: `screen.watch()` is registered exactly once whichever container is showing, so the scheduler's dirty-Screen slice budget stays right ([ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)). The host's `style` prop (which carries the in-page height) is dropped while expanded so the fixed geometry is not fought by an inline `height`.
- **Tests.** `src/components/specific/project/screen/screenZoom.test.ts`, 10 tests: the constraining dimension is filled exactly on either axis, the scale is not rounded down, a Screen larger than the box scales down, no box and Screen pair ever asks for more room than it has, an unmeasured panel and a zero-area Screen answer 1:1, actual size floors the environment's unit and never goes below 1:1, and the two label forms. 344 tests pass, up from 334.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 344 passing, `npm run format:check` clean, `npm run build` clean.

### How it was checked in a browser

The build was served with `vite preview` and driven through the DevTools protocol in the Playwright-cached headless Chromium (`LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` for `libnspr4.so`), on `/projects/share?project=…` for the project page — the payload is the project object under lz-string, the same encoding `createShareLink` produces — on `/embed` for the small layout, and on a scratch route for the fullscreen layout, deleted before the commit. Note for the next agent: a `vite preview` started before a rebuild serves blank pages afterwards, which looks exactly like a broken route; restart it after every build.

| What                          | M68K, 640 × 480                     | Z80, 256 × 192                      |
| ----------------------------- | ----------------------------------- | ----------------------------------- |
| Right column order            | memory, transcript, Screen          | memory, transcript, Screen          |
| Panel in the page, 1600 × 900 | 691 × 416, canvas 507 × 380 at 79%  | 671 × 416, canvas 507 × 380 at 198% |
| Was, with the integer fit     | canvas 395 × 296                    | canvas 256 × 192 at ×1              |
| Scroll while fitting          | none, `overflow: hidden`            | none, `overflow: hidden`            |
| Floating window               | 928 × 828, canvas 918 × 689 at 143% | 928 × 828, canvas 918 × 689 at 359% |
| Actual size                   | canvas 640 × 480, the stage scrolls | canvas 256 × 192, no scroll needed  |

The floating window was checked at 1280 × 800, 1600 × 900 and 1920 × 1080: it never overlaps `.project-controls`, `elementFromPoint` over Stop returns the button itself, and clicking Stop while the window is open works and does not close it. Escape with the canvas unfocused closes the window; with the canvas focused the first Escape only releases the input (the canvas stops its own Escape from propagating) and the second closes. A click on the floating canvas focuses it, draws the ring, and `Shift+R` afterwards reaches no `window` keydown listener, so the editor's shortcuts stay quiet. Painting follows the window: with the window opened **before** Run, eight position-weighted samples of `m68k/bouncing-ball.x68` taken 400 ms apart were all different. The small layout was walked on the embed page (panel 1580 × 320, canvas 379 × 284 at 148%, no scroll) and the fullscreen layout on the scratch route (panel 671 × 416, canvas 507 × 380 at 198%).

### Choices where the brief left a detail open

- **26 rem for the two right columns, 20 rem for the small layout.** The right column is about 43 rem wide and every Screen in it is 4 by 3, so the height is what constrains the fit at any height under about 34 rem: the panel fills its height exactly and the choice is only how much of the column to spend. 26 rem draws a 640 × 480 Screen at 507 × 380 and a 256 × 192 one at the same size, against 395 × 296 and 256 × 192 before. It is not chosen to avoid scrolling the right column, because that column already scrolls at any panel height over about 12 rem — the registers column alone is 33.25 rem — and it scrolled at 20 rem too. Now that the Screen is last, that scrolling costs the transcript nothing, which is the point of the reorder; the floating window is the answer for a Screen worth looking at full size.
- **The floating window clears the controls with a bottom inset, not a left edge.** Every surface that hosts the panel puts its control bar at the bottom of the editor column, as wide as that column, so any window wide enough to be worth opening reaches over the bar's right end — a window narrow enough to miss it would be no wider than the in-page panel. `bottom: 4rem` keeps the whole row visible instead, Testcases included, and costs a 4 by 3 Screen nothing because in a box that shape the width is what constrains the fit.
- **No backdrop and no click-outside close.** The user asked for the controls to stay clickable, which is the opposite of a modal.
- **Escape layers behind the panel's existing release gesture.** A focused Screen owns Escape ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md), and phase 4's choice), so the first press releases the input and the second closes the window. The window's own listener is on `window`, and the canvas's `stopPropagation` is what keeps the two apart.
- **The window's geometry is `min(58vw, 68rem)` wide.** Wide enough to more than double a 4 by 3 Screen on a 1600 px page, narrow enough to leave the editor readable underneath.
- **`window-maximize` and `window-restore` for the new button**, so it is not confused with the `expand`/`compress` pair the zoom toggle already uses.
- **The zoom arithmetic is the only part extracted for tests.** The rest of the panel is DOM- and animation-frame-bound and vitest runs in a node environment here, which is the same split phase 4 recorded.

### Left and blockers

- No blocker for the other three follow-up parts; nothing outside the panel, its two hosts and the two documents changed.
- **On the small layout the floating window can still cover the control bar.** That layout is a page that scrolls, so its bar is wherever the editor ends — measured at y 391 on the embed page — and a bottom inset cannot clear it. The bar is one click or one Escape away from being uncovered, and the surface it matters on, the project page, is clear at every size checked.
- The right column scrolls further than it did, by the 6 rem the panel grew. Making the panel fill the column instead of taking a fixed height would need the registers column's fixed 33.25 rem to go first, which is outside this change.

## Follow-up 2: Run becomes Pause while a program is running — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`. This section ships in the same commit as the change it describes. The second of four follow-up parts the user asked for after the feature landed; the other three are untouched here.

The Run button was disabled for the whole run and the only way out was Stop, which is `clear()` and throws the program away. It is now Pause while a program is running and Resume once the run is parked, so a long program can be stopped where it is and looked at.

**Where this contradicts the design record.** Nowhere. Nothing in `screen-peripherals.md` or the ADRs says what the run controls do; this is the first thing that suspends a run without ending it, and it uses the slice boundary [ADR 0007](../adr/0007-generic-emulator-run-scheduling.md) already yields at.

### Done

- **`GenericEmulator.pause()`, `resume()` and `paused`** (`src/lib/languages/GenericEmulator.svelte.ts`). `pause()` sets a flag that the slice scheduler honors at its next boundary — the top of the loop, before a slice is asked for, which is the only place the Core is not running. The parked run awaits a promise through `executionController.waitFor(execution, …)`, the same way it awaits a program-requested wait, so Stop cancels it exactly as it cancels a wait: `clear()` releases the promise and invalidates the generation, and the woken run throws `ExecutionSupersededError` and ends itself. Nothing about the run is touched by the pause: `remaining`, `state.breakpoints` and `speedCorrection` all live in the loop and are picked up again by the next slice, so resuming carries on rather than restarting the program or resetting the limit.
- **The state the user inspects is refreshed on the pause.** The tail of `runInternal` moved into `refreshVisibleState(terminated)` — the current line, `canUndo`, and the registers, memory, status registers, program counter and history views (`refreshCoreViews`, which `stepInternal` now shares) — and the pause calls it. Without it the panels would still hold whatever they showed when Run was pressed: on the Z80 the browser check below saw exactly that, all registers at zero and `PC 8000` through a whole run, and `A=0d BC=fdfe DE=8876 PC 8032` the moment it was paused.
- **`runSlices` split into a wrapper and `sliceLoop`**, so the wrapper owns `runInFlight` (which makes `pause()` with no run a no-op) and releases any pause whichever way the run ends, including an exception.
- **`BaseEmulatorState` gained `paused` and `BaseEmulatorActions` gained `pause`/`resume`**, so the whole `Emulator` type carries them; `GenericEmulator` is the only implementation.
- **The button** (`src/components/specific/project/Controls.svelte`): one Button whose mode is `!running ? 'run' : paused ? 'resume' : 'pause'`, dispatching an event of that name, with the pause icon in the Pause state. Stop is untouched and works in both states.
- **Both hosts.** `src/routes/projects/[project]/Project.svelte` and `src/components/shared/InteractiveInstructionEditor.svelte` pass `paused={emulator.paused}` and answer `pause`/`resume`. Both grew a `startRun()` that awaits the run, so `running` is true for as long as the program is in flight — the interactive editor used to set `running = false` on the tick it started, which left its Run button live for the whole run. The project page's Run shortcut (Shift+R) goes through `startRun()` too and toggles Pause/Resume while a run is in flight, so the shortcut and the button never disagree.
- **Tests.** 8 more in `src/lib/languages/GenericEmulator.test.ts` on the phase 3 fake adapter: the run parks at a slice boundary and stops asking for slices, resume carries on with the same three requests and the same limit an un-paused run makes, the breakpoints and the speed correction survive it, the visible state refreshes on the pause (registers, memory, PC, status registers, line, `canUndo`), a pause asked for during a program-requested wait is taken _after_ the wait rather than skipping it, a pause with no run in flight does nothing and is not remembered by the next run, Stop tears a paused run down and leaves the emulator able to compile again, and the paused time is left out of the reported execution time.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 352 passing (was 344), `npm run format:check` clean for this change, `npm run build` clean.

### How it was checked in a browser

The build was served with `vite preview --port 4183` and driven through the DevTools protocol in the Playwright-cached headless Chromium (`LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` for `libnspr4.so`, as the previous follow-up recorded), on `/projects/share?project=…` for the project page and `/embed?language=Z80&code=…` for the interactive editor's small layout, both payloads lz-string compressed. The animation was measured as a hash of the Screen canvas' pixels, sampled through `getImageData`.

| What                             | `m68k/bouncing-ball.x68`                     | `z80/bouncing-ball.z80`                      |
| -------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Controls while running           | Stop, **Pause**, Undo off, Step off          | Stop, **Pause**, Undo off, Step off          |
| Canvas over 0.75 s while running | 3 samples, all different                     | 3 samples, all different                     |
| Controls once paused             | Stop, **Resume**, Undo off, Step off         | Stop, **Resume**, Undo off, Step off         |
| Canvas over 1.6 s while paused   | 4 samples, all identical                     | 4 samples, all identical                     |
| Registers while running          | live (the M68K adapter refreshes on traps)   | `A=00 BC=0000 DE=0000`, the Build values     |
| Registers at the pause           | `D2=f2 D3=1a2 D4=122`, the ball's frame      | `A=0d BC=fdfe DE=8876`, `PC 8032`            |
| Registers 1.6 s later            | unchanged                                    | unchanged                                    |
| After Resume                     | canvas moving again                          | 8 samples over 1.6 s, all different          |
| At a second pause                | a later frame's registers                    | `BC=0302 DE=9748`, a later frame             |
| Stop while paused                | back to Build; Build and Run again both work | back to Build; Build and Run again both work |

The embed page (the small layout) behaves identically: Run to Pause to Resume, registers frozen at `A=0d BC=fd02 DE=e2ac` for 1.2 s and a later frame at the second pause, Stop back to Build. Shift+R on the project page cycles Pause, Resume, Pause. A program suspended on input (trap task 4, with the prompt up) shows Pause **disabled**, and Stop still ends it. No console errors in any run.

### Choices where the brief left a detail open

- **Step and Undo are disabled for the whole run, paused included**, which is the brief's "if in doubt". `duringCoreOperation` is a counter, not a mutex, and a paused run is still inside it, so it would not stop a Step from entering the Core; the gesture that breaks it is Step then Resume in quick succession, because `_step()` is async on the MARS/RARS-derived adapters and the resumed slice would re-enter a Core the step has not left — precisely the hijack `duringCoreOperation`'s own comment describes. Making them safe needs a real mutual exclusion between the resumed loop and any other Core operation, which is a scheduler change, not a button change. They were in fact _enabled_ during a run before this change (only Run was disabled), so this closes an existing hazard as well.
- **Pause is disabled while the program waits for input**, because the button's `executionDisabled` already covers `interrupt !== undefined`. A program suspended on input is not executing, there is nothing to park, and the pause would only be taken once the input was answered. `pause()` itself is harmless there — the request is honored at the next boundary — so the disabling is a GUI choice, not a rule the Emulator enforces.
- **A pause asked for during a program-requested wait is taken after the wait.** The check is at the top of the loop and a wait `continue`s to it, so the wait runs to its end and the pause lands before the next slice. Pausing must not make a program's `sleep` shorter.
- **`paused` flips when the pause is actually taken**, not when the button is pressed. The window is one slice — 16 or 50 ms — and reporting a pause the Core has not reached yet would be a lie the Screen would contradict.
- **The paused time is subtracted from `executionTime`.** "Ran in 4.2 s" for a program the user held for four seconds would be wrong; program waits stay in it, because those are the program's own.
- **The Run shortcut toggles.** Shift+R with a run in flight pauses it and pauses again resume it, rather than doing nothing. It also now goes through the same `startRun()` the button uses, so a run started from the keyboard sets `running` and shows Pause; before this it did not, and the button stayed on Run for the whole run.
- **No new setting and no new shortcut.** Pause is the Run button's second state, which is what the user asked for.

### Left and blockers

- No blocker for the other two follow-up parts; outside `GenericEmulator`, the two emulator types and the three GUI files, nothing changed.
- **Nothing pauses a Testcase run.** `_runTestcase` was never sliced (phase 3's choice), so there is no boundary to park at, and a scripted run has no GUI to keep responsive. `pause()` during one does nothing.
- **A pause is answered at the next slice boundary, so how quickly it lands is how long a slice is**: 16 ms while a Screen is being painted, 50 ms otherwise, plus whatever a program's own wait or input prompt is doing. Phase 8 measured the same numbers for Stop.
- The Emulator does not remember a pause across a Build: `clear()` releases it, which is what lets the Build through.

## Follow-up 3: a program configures the Screen from its source — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, one commit (this log is in it). The user's words: "is there some way to make the code in mips/risc set the settings for the screen so i dont have to remember to change it manually?"

### The directive

```asm
# @screen unit=1 width=256 height=256 base=display
```

A comment, so the same file still assembles in real MARS and RARS, where the five values are still set in the tool's own window. It is read at compile time, so the Screen is configured before the first instruction runs and during a Testcase run rather than part way through.

- `width`, `height`: MARS's display sizes, 64 to 1024.
- `unit`: both unit sizes at once; `unitWidth` and `unitHeight` set them apart. `unit-width` and `unitwidth` are the same name — the name is lowercased and its dashes and underscores dropped.
- `base`: an address (`0x10010000` or `268500992`) **or a label the program defines**, which is the point of the whole feature.
- Order and spacing are free, commas are allowed between settings, `#` may be repeated, the keyword is case-insensitive, and the line may follow code (`nop # @screen unit=2`). The first directive wins; a second one is reported and ignored.

### Done

- `src/lib/languages/mars/screenDirective.ts`: the parser (`parseScreenDirective`), the layering (`applyScreenDirective`) and the label probe (`screenLabelProbeSource`, `readScreenLabelProbe`, `SCREEN_LABEL_PROBE_ADDRESS`). Plain TypeScript with no Core, so the 20 tests in `screenDirective.test.ts` cover every form without an assembler.
- Both adapters read it in `_compile`, before the Core is built, and again in `_checkCode`, so the warning is on the line while it is being typed and does not vanish half a second after a Build (the semantic check is debounced 500 ms and replaces `state.compilerDiagnostics` wholesale). `getDisplay()` joins `setDisplay()` on the Emulator: it answers the display and whether the source asked for it.
- `marsDisplay.ts` gained `MarsDisplayOrigin`, `MarsDisplayConfiguration` and `marsDisplayEquals`, and `normalizeMarsDisplay` no longer snaps a base address onto MARS's five: a resolved label is by construction not one of them.
- The popover shows an `@` next to **Display**, a note saying where the values came from, and the resolved address as its own base entry (`0x10010028 (label grid)`). The project page saves a directive-derived display like any other, so a reopened project starts on it.
- The six examples in `examples/mips` and `examples/risc-v` carry the directive and their prose now describes it; both READMEs, `MarsScreenDocumentation.svelte` (a new "Configuring the screen from the program" section, so both documentation pages and both complete-documentation pages) and the coding agent's prompt follow.
- 36 tests added (20 parser, 2 `marsDisplay`, 7 per adapter against the real Cores). `npm test`: 388 tests in 20 files. The three example tests now pass **no** display at all, so the directive is what configures them.
- Matrix rows P11, P12, V12 and V13 in `docs/manual-verification.md`.
- Verification: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` green, `npm run format:check` clean, `npm run build` clean.

### How the label is resolved, and why it is not the symbol table

The brief asked for "the Core's symbol table after assembly". **Neither Core has one to ask.** `JsMips` and `JsRiscV` expose `getLabelAtAddress(address)` — address to name, the direction the call stack needs — and nothing the other way; MARS's `getSymbolGivenIntAddress` is what it wraps, and a missing symbol makes it throw rather than answer null. Scanning for the name was measured and rejected: a miss costs about 18 µs because it is a thrown TeaVM exception (a hit costs 0.6 µs), so a label 64 KB into `.data` would cost a third of a second and an unaligned one far more.

What the adapters do instead is ask the assembler, which is the component that actually knows: the program is assembled once more in a throwaway Core with two lines appended,

```asm
.data 0x10040000
.word <label>
```

and that word is read back. `.data <address>` sets the location counter without moving the program's own data, `0x10040000` is MARS's and RARS's heap base and nothing is assembled there, and the throwaway Core never runs. `.eqv` names, forward references and text labels all resolve, in RV64 as well as RV32, because the assembler resolved them. A label that does not exist makes the appended line — and only it — fail, which is exactly the "no such label" answer wanted. The probe costs one extra assembly, only when `base=` names a label, and it runs **before** the real `assemble()` so the singletons both Cores keep (memory, the backstep buffer) end up in the real build's state; the real assemble also clears memory, so the probe word leaves no trace.

### Choices where the brief left a detail open

- **Every directive diagnostic is a `warning`, never an `error`** — the brief offered the choice for an out-of-list size and left the label failure as "a clear error". A size MARS has no entry for snaps to the nearest one it does offer and warns; an unknown setting, a value that is not a number, a base that is neither an address nor a label name, an address past the top of memory and a label that does not exist are all warnings that leave that one parameter as it was. The reason is uniform: the directive is a comment, the same file assembles in MARS and RARS, and a comment must not stop a program from building here. A blocking error would also have made a typo in a comment undo a whole Build.
- **A hand edit wins until the next Build**, the rule the brief called the simplest coherent one. `setDisplay` marks the origin `user` and clears the badge; the next `_compile` reads the directive again and puts it back. Stop does not re-read it, because Stop is `clear()` and not a build.
- **The directive layers onto the current configuration**: it changes only the parameters it names, and a program with no directive changes nothing at all.
- **The base address is not validated against MARS's five**, though the two size lists are: a `base=<label>` resolves to wherever the assembler put the label, which is never one of the five. `normalizeMarsDisplay` now keeps any word address and only rounds one down onto a word boundary (with a warning naming `.align 2`), because the Core's memory ranges want an aligned start. The five choices are the popover's menu, not a whitelist.
- **The GUI pulls, it is not pushed.** Both hosts call `emulator.getDisplay()` in the `finally` of their build, rather than the Emulator holding a reactive display field: the adapters are the only ones that have one, `BaseEmulatorState` is shared by five languages, and a Build is the only moment the value can change on its own. It is pulled after a _failed_ build too, since the directive is read before the program is assembled.
- **`_checkCode` reports the directive as well**, label resolution included, which doubles the check's assembly only for a program that names a label in its `base=`. Without it the warning would appear at Build and disappear 500 ms later, which reads as a bug.
- **The keyword must be the whole comment**: `# see @screen below` is prose, `# @screen …` is a directive. A `#` inside a string literal that happens to be followed by `@screen` would be read as one; no program in the corpus does that and the cost of a real tokenizer here is not worth it.

### How it was checked in a browser

Built, served with `vite preview`, and driven through the DevTools protocol in the Playwright-cached headless Chromium 151 on the embed page, as phase 7 did. Two notes for the next agent, both of which cost time here:

- The cached `chromium-1234` build **cannot start on this machine**: `libnspr4.so` is missing from the system. It starts with `LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox`, which ships the NSS and NSPR libraries Chromium wants; `chromium_headless_shell-1234` works the same way and is lighter.
- A `vite preview` server left running from **before** a rebuild serves an `index.html` whose hashed entry chunk no longer exists, so every page is blank with a 404 in the console and looks exactly like a broken change. Kill it and start a new one after every build. And pick the DevTools target by URL and close old tabs: `/json/list` is not ordered by age.

Observed, on both `examples/mips/bitmap-tour.asm` and `examples/risc-v/bitmap-tour.s`: the panel is MARS's default 512 × 256 before the Build and 256 × 256 after it, with the `@` badge on the Display button and the popover's note; Run then paints the tour (`#0000ff` centre, `#c82800` ramp, white first and last rows). On a program whose `grid` label sits 40 bytes into `.data`, the popover's base entry reads `0x10010028 (label grid)`; a hand edit took the panel to 512 × 64 and cleared the badge, Stop kept it, and the next Build put 256 × 64 and the badge back. On `# @screen unit=1 width=300 height=64 base=grid depth=8` the panel came up 256 wide and the console listed both warnings — before any Build, from the semantic check, and again after it.

### Left and blockers

- No blocker. Nothing outside the MIPS and RISC-V adapters changed behaviour: the M68K, Z80 and x86 Emulators have no `getDisplay`, as they have no `setDisplay`.
- **Monaco squiggles were not observed** for these warnings in the embed page, and neither were the assembler's own, so it is not this change: the markers are set from the same list, by the same `Editor.svelte` effect. Worth a look on the project page some time.
- The directive is read from the whole source with a per-line regular expression, so a program that assembles a `#` into a string could in principle be misread; see the choice above.
- The probe assembles the program a second time whenever `base=` names a label, on every Build and on every debounced semantic check. It was not measured against a large program; if it ever shows, the fix is a label lookup in the two Cores, which is where it belongs.

## Review: the four follow-up parts checked and fixed — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`, one commit (this log is in it). The fourth of four follow-up parts: a review of the three above (`c6779ae` the transcript and the panel, `4b02c36` Pause, `213b3b6` the `@screen` directive), by reading the diff and by driving the built application.

**Where this contradicts the design record.** Nowhere; two of the three fixes restore it. The failed-Build fix puts back the Reset row's "both images reset … on the same path as the Terminal: Build", which the directive work had broken for a failed Build. The Placement row gained a clause saying the floating window sits under the page's own drawers and prompts, which is what the third fix makes true.

### What was checked, and how

| Claim under review                                                              | Verdict                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The transcript precedes the Screen on every hosting surface                     | Holds. Measured in the browser on all three: project page `memory-wrapper, std-out, screen-panel`; fullscreen `fullscreen-memory-wrapper, std-out, screen-panel`; small layout `top-row, std-out, screen-toggle, screen-panel`                                  |
| Fit fills the constraining dimension and never scrolls                          | Holds at six aspect ratios (512×256, 1024×64, 64×1024, 128×128, 1024×1024, 64×64): the constrained axis is filled to the pixel and `scrollWidth - clientWidth` and `scrollHeight - clientHeight` are 0 in every one                                             |
| The floating window leaves the execution controls visible                       | Holds at 1280×800, 1600×900 and 1920×1080: no rectangle overlap with `.project-controls`, and `elementFromPoint` over every button returns the button                                                                                                           |
| The floating window closes on Escape                                            | Holds at all three sizes                                                                                                                                                                                                                                        |
| One `screen.watch()` registration whichever container is showing                | Holds. The `$effect` that calls `watch()` reads only the `screen` prop, and a property stamped on the canvas element survives expanding and restoring, so the component is never re-created                                                                     |
| The instruction limit, the breakpoints and the speed correction survive a pause | Holds (the phase 3 fake adapter's tests)                                                                                                                                                                                                                        |
| Stop during a pause tears the run down                                          | Holds, in the browser too: Pause, Stop, Build and Run again all work on `m68k/bouncing-ball.x68`                                                                                                                                                                |
| A Build during a pause is clean                                                 | Holds, and no GUI can reach it: `buildCode` on both hosts returns early while `running`, so a Build needs a Stop first. `compile()` on a paused Emulator is covered by phase 4's own test                                                                       |
| The visible state refreshes on the pause                                        | Holds: the registers change at the pause and are unchanged 1.6 s later                                                                                                                                                                                          |
| Nothing can leave the Emulator paused with no way back                          | **Broken.** Fixed, see below                                                                                                                                                                                                                                    |
| A bad directive cannot crash a Build                                            | Holds. Fourteen malformed directives on both Cores — an unmapped base, a base past the top of memory, a megapixel grid at the memory map, `base=`, `=`, `base=0x`, `width=-5`, `width=0`, `base=$`, `base=.` — all build, all execute, all warn and never error |
| Label resolution works on both Cores                                            | Holds (the adapters' own tests, and in the browser on both bitmap tours)                                                                                                                                                                                        |
| An absent directive leaves the manual configuration alone                       | Holds                                                                                                                                                                                                                                                           |
| A Testcase run uses the same configuration                                      | Holds, and now has a test on each adapter: `test()` recompiles per testcase, so the directive is read again and the Screen draws on the grid it names                                                                                                           |
| A failed Build leaves the Screen blank                                          | **Broken.** Fixed, see below                                                                                                                                                                                                                                    |
| The floating window does not trap the page underneath                           | **Broken.** Fixed, see below                                                                                                                                                                                                                                    |

The browser work was `npm run build`, `vite preview --port 4185`, and the Playwright-cached `chromium_headless_shell-1234` driven over the DevTools protocol (`LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` for `libnspr4.so`, and a fresh `vite preview` after every build, both as the earlier follow-ups recorded). Node 24's own `WebSocket` is enough for CDP, so no `ws` dependency is needed. The project page was reached through `/projects/share?project=…` with an lz-string payload, the small layout through `/embed`, and the fullscreen layout through a scratch route deleted before the commit.

### The three defects, and their fixes

- **A paused run whose panel refresh threw left `paused` set for good.** `pauseUntilResumed` set `this.state.paused = true` and called `refreshVisibleState` _before_ its `try`, and `refreshVisibleState` only guards the instruction lookup: `updateRegisters`, `scrollStackTab`, `updateData` and `updateStatusRegisters` all read the Core with nothing around them. A Core that could not answer therefore ended the run with `paused` still true and `resumePausedRun` null — and from there `resume()` had nothing to release and `pause()` was a no-op, so the **next** run showed Resume for its whole length and did nothing when pressed. Only a Stop or a Build cleared it. Everything now lives inside the `try`/`finally`, so the flag is dropped however the pause is left. Two tests: the refresh throwing ends the run as `TerminatedWithException` and leaves the next run free, and a `pause()` that lands between `resume()` and the parked run's continuation is honored at the next slice boundary instead of being wiped by the released one's `finally` (`pauseRequested` is now cleared where the request is _spent_, not where the run is let go).
- **A failed Build repainted the Screen with the previous program's memory.** `_compile` on both MARS adapters called `devices.setDisplay`, whose whole job is the user's own change: it re-syncs the Screen from memory. At that point the devices still hold the **previous** Core, and `clear()` has just blanked the Screen — so the last program's picture came straight back at the new geometry. A successful Build hid it, because `_initialize`'s `attach` re-syncs from the fresh Core; a Build that failed never got there and kept the stale picture, against the design record's Reset row. Both adapters now call `resetScreen`, the build path, which takes the geometry without the re-sync. A test on each adapter runs a program that paints white, then fails a Build carrying a directive with a spelled-out base (a `base=<label>` would have hidden the defect, because the label probe's own `assemble()` clears the shared memory first) and asserts the Screen is black.
- **The floating window opened in front of the Settings, Documentation and Share drawers.** At `z-index: 15` it was above everything on the page except the toasts and the prompt, so a drawer opened while the window was up came out **behind** it — measured on the project page: `elementFromPoint` at the drawer's own centre returned the Screen panel. The window deliberately has no backdrop and leaves the page interactive, so it belongs over the _page_ and under the _application_: it is now `z-index: 4`, above the editor (2) and the sidebars (3) and below the drawers (5), the input prompt and the toasts (20). Re-checked in the browser: the drawer now answers `elementFromPoint`, and the window is still the topmost thing over the page on both the project page and the embed, still clear of the controls, and still closes on Escape.

### Findings left unfixed

- **A directive warning's squiggle disappears after a Build.** It is there while the program is being typed — one `squiggly-warning` on the directive's line from the semantic check, which is what follow-up 3 wanted and could not observe — and the transcript lists the warnings after the Build, but the marker itself goes. `Editor.svelte` calls `setEditorValue(codeOverride)` when a build succeeds, and replacing a model's value drops its markers; the effect that sets them only re-runs when the diagnostics list changes. This is the editor's behaviour for every diagnostic, not the directive's, and fixing it means re-applying markers after a value change, which is outside this review.
- **A Pause pressed inside the 50 ms both hosts wait before calling `run()` is dropped.** `runInFlight` is false until the first slice, and `pause()` deliberately does not remember a request with no run. The button already reads Pause during that window because the host's own `running` is set first. A human click cannot land there; two clicks in quick succession can, and the second one works.
- **The floating window can still cover the control bar in the small layout**, as follow-up 1 recorded: that layout scrolls, so its bar is wherever the editor ends and a bottom inset cannot clear it.
- **`base=` accepts an address that points at nothing** — `0x00000000` builds and runs with a Screen that stays black, no warning. `normalizeMarsDisplay` keeps any word address on purpose, since a resolved label is never one of MARS's five, and the Core's readable-word probe already answers zero without failing. A warning would need the adapter to ask the Core what is mapped, which is a Core question, not a directive one.
- The working tree carries changes that are not this branch's (`examples/Bad_Apple.s68k` moved to `examples/m68k/bad-apple.x68`, `examples.measure.ts`, `docs/design/screen-rendering-performance-research.md`). They were there before this review and are left uncommitted.

### Verification at the commit

`npm run check` at the branch baseline — the same two pre-existing errors (the sitemap's `String#at` and the z80 instruction page's `description` prop) and 205 warnings; `npm run lint` 0 errors and 18 warnings; `npm test` 398 passing, up from 390; `npm run format:check` clean; `npm run build` clean. Each of the four fixes' tests was also run against the code before the fix: the two pause tests and the two failed-Build tests fail there and pass after, so none of them is vacuous.

## Follow-up 5: the Screen's window becomes the app's own draggable window — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`. This section ships in the same commit as the change it describes. One of three parts the user asked for after the review; the other two are untouched here.

The user asked for two things: "for the screen use the floating window already implemented in the app so i can also drag the screen around (check if it is possible to inject buttons, at that point the 'eye' that is used to collapse should instead be used to hide the floating window, with a different icon too)", and "the viewport seems to overflow hidden clip the outline when the screen is clicked to focus, id like to see the whole outline (without increasing the padding)".

**Where this contradicts the design record.** The Placement row of `screen-peripherals.md` said the header "offers a floating window anchored to the right of the viewport". It is now the app's draggable window, opened at the top right and moved wherever the user likes; the row has been rewritten to say so, naming the date and what it used to say. Nothing else in the design or the ADRs changes: the window still floats over the page and under the drawers, still leaves the controls visible when it opens, and there is still exactly one `screen.watch()`.

### Done

- **The window is `DraggableContainer` now.** `ScreenRenderer.svelte` renders the same canvas in one of two containers: the panel in the page, or the draggable window. The bespoke `.screen-panel.expanded` fixed-position block is gone. The window's header is the draggable's own bar — grip, the environment's name, the panel's controls, and the button that closes it — so the panel's header row is not drawn twice.
- **One registration.** The canvas, its header controls and its stage are three snippets rendered into whichever container is showing; the component itself is mounted once, so the `$effect` that calls `screen.watch()` runs once whichever container is up ([ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)). Observed in the browser: with the window open the page holds exactly one `.screen-panel` and one Screen canvas, and no `.screen-header`.
- **Moving the canvas is now a real element swap**, which the old class toggle was not, so two things had to be handled: the cached 2D context belongs to the element that went away and the new canvas is blank (a `$effect` on the canvas drops the context and the painted-version mark), and a removed element never fires its own blur, so its teardown releases the held keys and buttons ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)). A Screen that had focus is refocused in the new container after `tick()`, so a keyboard-only user does not lose the program's input by opening the window.
- **Injected controls.** `DraggableContainer` takes an optional `headerActions` snippet, rendered between the title and the button on the right. The Screen puts its logical size, the MIPS and RISC-V display popover and the zoom toggle there. The actions are marked `data-no-drag`, and `Draggable` now refuses to start a drag from a press inside such an element — pressing a control has to work the control, not pick the window up. `onHeaderClick` ignores clicks that come from them too, so a caller that combines injected controls with the collapse behaviour does not collapse when its own buttons are pressed.
- **The eye is a choice the caller makes.** `DraggableContainer` takes an optional `onClose` callback with a `closeTitle`: given, the header's button closes the whole window through it and shows `window-restore` instead of the eye; left unset, it is the eye that collapses the body, which is what the Call stack, History and Stack pointer panels keep. A window with `onClose` has no collapsed state at all (`collapsed` is derived as false), because its bar goes away with its body.
- **Injected controls must not nest in a button.** The collapse callers' bar is a `<button>`; a caller's controls inside it would be interactive content inside a button — invalid, and a `<select>` in the MIPS popover would be nested in it. In close mode the bar is a `<div>` instead, with the same class and styles, and the drag is the `Draggable`'s own handler. The bar's font size is written down as `0.85rem` so the two variants read the same; a `<button>`'s UA default was 13.33px, which is the 0.27px the three existing panels moved.
- **The window's geometry moved into `screenWindow.ts`** (`screenWindowGeometry`), because a box the user drags cannot be written as CSS insets the way the panel's height is. It opens at the top right with a 0.5 rem margin, is `min(58vw, 68rem)` wide with a 20 rem floor, and is as tall as the viewport allows above a 4 rem clearance for the execution controls — the same numbers the fixed window used. A window already open keeps the place it was dragged to and is only pulled back inside when the browser is resized, since the container clamps only while dragging.
- **The focus ring is drawn inside the canvas** (`outline-offset: -0.15rem`). The stage around it clips in both containers — `overflow: hidden` while fitting, a scroll container at actual size — so an outward ring loses its outer half wherever the Screen is. No padding was added, the fitted size of the canvas is unchanged, and fit mode still has no scrollbar.
- **A latent bug in `Draggable`:** `--hidden-on-mobile` resolved to `flex` for a window that stays on a touch screen, and `.draggable` is a block everywhere else, so on a `(hover: none)` device the header and the body were laid out side by side. The Screen's window is the first caller to pass `hiddenOnMobile={false}` — the in-page panel is not rendered while the window is open, so the Screen must not vanish on a tablet. It is `block` now.
- **Tests.** `screenWindow.test.ts`, 10 tests: it opens at the top right, leaves the 4 rem clearance under the whole window at five viewport heights, is 58% wide and capped at 68 rem, never asks for more room than the viewport has at seven widths, keeps a usable size on a tiny viewport, leaves a dragged window where it is, pulls one back inside a viewport that has shrunk, scales with the root font size, answers in whole pixels, and falls back to 16 px when the root font size cannot be read. 408 tests pass, up from 398.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors, 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 408 passing, `npm run format:check` clean, `npm run build` clean.

### How it was checked in a browser

`npm run build`, `vite preview --port 4174`, and the Playwright-cached `chromium_headless_shell-1234` over the DevTools protocol (`LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` for `libnspr4.so`, a unique `--user-data-dir`, a fresh `vite preview` after every build), on `/projects/share?project=…` for the project page and `/embed` for the small layout.

Two traps for the next agent, both new:

- **The headless shell matches `(hover: none)`**, so every `DraggableContainer` on the page is `display: none` there and the Screen's window was laid out as a flex row. Launch it with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4` to get a desktop pointer. `Emulation.setEmulatedMedia` cannot do it: it has no `hover` feature.
- **A synthetic drag needs a settling `mouseMoved` before the press, and its moves must carry `button: 'none'` with `buttons: 1`.** `Draggable` moves the window by `event.movementX`, which the browser computes from the previous pointer position, so a press that follows a `.click()` or a far-away pointer produces one enormous first delta and the drag lands nowhere. Half a dozen apparent "the window will not drag" results were this.

| What                                   | Observed at 1600 × 900                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The window opens                       | 928 × 823 at (664, 8), canvas 918 × 689 at 143% — the same box the fixed window had                                                                                                           |
| Controls                               | `.project-controls` at y 857, no overlap; `elementFromPoint` returns Build and Testcases                                                                                                      |
| Dragged left and down                  | clamped to (6, 71): the container keeps the whole window on screen                                                                                                                            |
| Dragged past either corner             | never leaves the viewport                                                                                                                                                                     |
| The zoom control in the header         | a press on it does not drag the window; a real click toggles 918 × 689 ↔ 640 × 480 at 1:1                                                                                                     |
| The MIPS display popover in the header | opens over the canvas, 5 selects; a display width change re-sized the canvas 512 → 256 and the header's size and zoom followed                                                                |
| The focus ring                         | `outline 2px solid, offset -2px`, canvas box entirely inside the clipping stage, both containers                                                                                              |
| The close button                       | window gone, panel back in the page at its 26 rem height                                                                                                                                      |
| Escape                                 | unfocused, one press closes; focused, the first releases the input and the second closes                                                                                                      |
| A key while the Screen has focus       | 0 `window` keydown listeners saw it, so the editor's shortcuts stay quiet                                                                                                                     |
| Painting                               | 6 of 6 samples of `m68k/bouncing-ball.x68` differ in the window, 4 of 4 in the page after closing it mid-run, and 4 of 4 after reopening mid-run                                              |
| Drawers                                | a probe layer at `z-index: 5` is topmost over the window, so the drawers still come out in front                                                                                              |
| 1280 × 800, 1920 × 1080                | window 742 × 723 and 1088 × 1003, no overlap with the controls in either                                                                                                                      |
| The small layout (`/embed`)            | the Show screen bar, panel 1580 × 320, the window opens the same way                                                                                                                          |
| Call stack, History, Stack pointer     | byte-for-byte the same geometry as the build before this change (collapsed 144 × 24, expanded 192 × 68 and 256 × 358), the eye expands, a click on the bar collapses, a drag moves and clamps |

The three existing panels were compared against a build of the same tree with only these three files reverted to `HEAD`: same boxes, same behaviour, screenshots indistinguishable, the only computed difference the bar's font size (13.33px → 13.6px).

### Choices where the brief left a detail open

- **`window-restore` for the close button**, the same icon the panel's header used for "put the screen back in the page" before this change and the counterpart of the `window-maximize` that opens it. It reads as putting the window back where it came from rather than hiding contents, which is what the user asked for, and it cannot be confused with the `expand`/`compress` pair the zoom toggle uses. The tooltip is the caller's (`closeTitle`), so the container does not have to know what a Screen is.
- **`onClose` is the whole API for the choice**, not a mode enum plus a callback: a caller that has somewhere to put the panel back gives one, a caller that lives only in the window does not. The container derives everything else from it — the icon, the tooltip, the bar's element, and that there is no collapsed state.
- **The window is placed in a zero-sized fixed layer** (`.screen-window-layer`), not straight into the page. `Draggable` is `position: absolute` and clamps against `window.innerWidth/innerHeight`, so it needs a containing block at viewport 0,0 — which the panel's place deep in the right column is not. A layer with no size cannot cover the page it floats on, and its `z-index: 4` keeps the whole window over the page and under the drawers without the drag code knowing anything about it.
- **Opening always starts at the top right**, whatever the last drag left behind. A window that came back where it was last dragged would be a preference to persist, which the design record does not ask for, and the top right is the one place known to clear the controls.
- **A resize keeps the dragged place and only pulls it back inside.** The container clamps while dragging and nowhere else, so a shrunk browser would otherwise leave the Screen somewhere unreachable; re-anchoring it to the top right instead would move a window the user had put somewhere on purpose.
- **The header's font size is written down rather than left to the UA.** The alternative was a 13.33px literal for the div variant, or letting the two bars differ by 2%.
- **The in-page panel keeps its own header.** Only the window's is the draggable's; the panel in the page is unchanged apart from the window button losing an `aria-pressed` that is now always false.

### Left and blockers

- No blocker for the other two parts; nothing outside the two draggable components, the Screen panel, its new geometry module and the two documents changed.
- **The window still covers the page header's icons when it opens** (Share, Documentation, Settings), as the fixed window did at the same coordinates. It is one drag away from not covering them now, which it was not before.
- **The small layout can still have its control bar covered**, as follow-up 1 recorded: that layout scrolls, so its bar is wherever the editor ends. Dragging the window is now the way out.
- The window cannot be resized, only moved: its size follows the viewport. A resize handle would be a new gesture on `Draggable`, which the brief did not ask for.

## Follow-up 6: Screen rendering performance — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`. This section ships in the same commit as the change it describes.

Four changes, one of which is separable and named here in case a reviewer wants it out on its own: the **panel refresh rate limit** is `RUNNING_PANEL_REFRESH_MS` and `refreshRunningPanels` in `GenericEmulator.svelte.ts` plus the six lines in `M68KEmulator.handleInterpreterInterruption` that call it, and it is the only change here that touches how often a panel is read rather than how a pixel is drawn or when a slice ends. It is measured below and it is the largest single gain on the M68K examples; it is also the one an owner of that adapter might want to decide for themselves.

The brief was `docs/design/screen-rendering-performance-research.md`, the research pass from earlier the same day: read it, measure its candidates in a browser, implement the subset the measurements justify, and update that record rather than writing another. **The record now carries the measurements and the decision**, in its second half, [Measured, and what was implemented](./screen-rendering-performance-research.md#measured-and-what-was-implemented). This section is the change log; that one is the evidence.

### What the measurements said, in one paragraph

The two candidates the research put first — dirty-rectangle `putImageData` and an opaque canvas context — are both worthless here: canvas submission is 0.16% to 0.93% of the wall clock in every workload measured, so the whole prize is under one percent. What was actually costing frames was the yield between two slices. `scheduler.yield()` hands the continuation back ahead of the browser's own rendering, and a loop that burns a slice and yields left the browser drawing **9 frames a second, whether the slice was 16 ms or 50 ms**. Everything else follows from that.

### Done

- **`yieldToHost` posts a message instead of calling `scheduler.yield()`.** Measured in isolation: 8.9 browser frames a second with `scheduler.yield()` against 59.6 with a posted message, at 16 ms slices. End to end on an M68K drawing loop with no guest wait, 8.2 delivered frames a second against 35.2. The yield costs 0.8 ms instead of 0.2 to 0.5 ms, which is 0.7 percentage points more of a 50 ms slice and well inside the five percent [ADR 0007](../adr/0007-generic-emulator-run-scheduling.md) budgets. `setTimeout(0)` also lets the browser draw but is clamped to about 4 ms once a few timers deep — 21% of a 16 ms slice — and `requestAnimationFrame` was a hair faster but stops a run in a hidden tab. One port pair for the page and a queue of resolvers, not a pair per yield. Node keeps the timer: it has no clamping problem and a `MessagePort` would hold vitest open.
- **The animation slice budget follows a 200 ms activity window** (`SCREEN_ACTIVITY_MS`) since the last change to `screen.version`, not the instantaneous `screen.dirty`. The renderer clears dirty the moment it paints, so the next slice of a program that keeps drawing used to get the 50 ms compute budget and spend all of it on frames nothing could show. With the yield fixed and only the window removed: the drawing loop drops from 38.0 to 16.1 delivered frames a second and the bouncing ball from 40.6 to 27.5. The Screen still has to be watched, so x86 and a closed Screen panel are unaffected.
- **The Screen's bulk pixel writes go through a `Uint32Array` view** of the same RGBA buffer: `fillImage` (so `clear` and `newImage`), the interior of a filled rectangle, the row a text scroll leaves behind, and `syncFramebuffer`. Measured 19.9× for a 640 × 480 fill, 14.2× for a 300 × 300 filled rectangle, 3.0× for a 30 × 30 one, 1.6× for a full framebuffer sync. The view is built where it is used, never kept beside the image, so a resize, an Undo or a buffering change cannot leave a stale one behind; `packColor` is host-endian-aware, because a typed-array view uses the host's byte order and the images are RGBA in memory order.
- **`GenericEmulator.refreshRunningPanels` rate-limits the panels to one display frame** while a program runs, forced for the interrupts that stop to ask the user something. A Step and the end of a run go through `refreshCoreViews` instead, which is never rate limited, so nothing a stopped program leaves on screen is stale. `M68KEmulator` refreshed the registers, every memory page, the call stack and the undo history on **every** Core interrupt; a graphical program reaches a few hundred a second and nothing they write can be seen more than sixty times a second. On `m68k/bouncing-ball.x68` that is 31.5 → 40.6 delivered frames a second and 75% → 47% of the main thread; on a nine-rectangles-a-frame program, 118% → 34%.
- **Tests**, 415 passing, up from 408: a filled rectangle clipped at every edge covers exactly the pixels the per-pixel path did; every pixel comes back out as opaque RGBA bytes in memory order after a clear, a pixel and a rectangle; a framebuffer word leaves its pixel opaque whatever the high byte held; the slice budget stays short after the renderer has painted while the program keeps drawing, and goes long once the drawing stops; the panels read the Core at most once a display frame unless forced; and every `yieldToHost` resolves in the order it was asked for.
- Verification at the commit: `npm run check` at the branch baseline (the same two pre-existing errors — the sitemap `String#at` and the z80 instruction page's `description` prop — and 205 warnings), `npm run lint` 0 errors and 18 warnings, `npm test` 415 passing, `npm run format:check` clean, `npm run build` clean.

### What was measured and rejected

- **Dirty-rectangle uploads.** A renderer-only replay put nine 30 × 30 rectangles at 0.049 ms against 0.240 ms for the whole 640 × 480 image: 0.19 ms a frame, which at 29 frames a second is 0.6% of the wall clock. Damage would have to be tracked through double buffering, Undo, `syncFramebuffer`, resize and reset to collect it.
- **An opaque context.** 0.240 ms against 0.259 ms for the default, on a clock whose own resolution is 0.1 ms.
- **A contiguous `copyRegion`.** The row loop is 0.320 ms for a whole 640 × 480 image and one `slice()` of the same bytes is 0.346 ms. The research pass expected the 480 temporary row views to cost something; they do not.
- **A packed word for single pixels.** 1.13× on scattered pixels, because the bounds check dominates, so `paint` keeps its byte stores and with it every line, glyph, ellipse border and flood fill.
- **A snapshot pool for the Undo journal.** The garbage collector is 14 to 17 ms/s across the graphical workloads, one to two percent of the wall clock, and `apply` hands an `images` record's array straight to the live Screen, so a pool would have to know which buffers are still reachable.
- **Workers and WebGL.** Both were conditional on canvas submission being the limiting stage. It is under one percent.

### Left and blockers

- **The MIPS and RISC-V framebuffer bridge is the next thing worth doing, and it is measured.** `MarsDevices` keeps one minimum/maximum dirty word interval, so a program writing two words at opposite ends of its grid has the whole grid re-read and converted: a program written for the measurement reached 29 delivered frames a second instead of the 60 its sleep asks for, with **47% of the wall clock inside the Core's `wasm-bindgen` memory-read glue**. The fix is dirty blocks of words instead of one interval, flushed as contiguous runs. It was left out because no shipped example triggers it — `mips/bouncing-ball.asm` redraws adjacent cells and already runs at 56 frames a second — and because a bug in that bridge is wrong pixels on two languages. The measurement and the design are in the [record](./screen-rendering-performance-research.md#the-mips-and-risc-v-framebuffer-bridge).
- **`getBoundingClientRect` is 21 to 48 ms/s in the profiles of two graphical workloads**, from the panels rather than from anything the Screen does. The rate limit above cuts how often it is reached; where it is called from was not chased.
- **The measurements are one machine, one browser, and a headless shell that rasterizes in software.** The absolute cost of a canvas submission on a GPU-backed browser will differ, and the conclusion drawn from it — that submission is a rounding error — has that much room in it. No Firefox, no Safari, no slower machine.
- **`examples/m68k/bad-apple.x68` was not measured.** It exists only in the working tree, and its 3.4 MB source never finished loading into the editor in the headless shell. A nine-scattered-rectangles-a-frame program written for the measurement stands in for its drawing shape, so nothing recorded here depends on an uncommitted file.
- The `scheduler.yield()` starvation also starved ordinary tasks — page timers and anything else queued — for the whole of a run without a guest wait. A synthetic click was still answered in 37 ms, because input outranks both, which is why ADR 0007's Stop contract never noticed. Both are fixed by the same change.
- One pre-existing test is timing-flaky: `GenericEmulator.test.ts`'s "starts again from the adapters' own estimates after a clear" burns 5 ms and expects the correction to land on exactly 4, which a loaded machine can miss. Seen once before any of this work, not touched.

### How it was checked in a browser

`npm run build`, `vite preview --port 4183`, and the Playwright-cached `chrome-headless-shell-1234` over the DevTools protocol (`LD_LIBRARY_PATH=~/.cache/ms-playwright/firefox-1538/firefox` for `libnspr4.so`, a unique `--user-data-dir`, a fresh `vite preview` after every build), on `/projects/share?project=…` with the project compressed into the URL. Before and after were built from the same commit with only the changed files stashed, so the comparison is not against an older HEAD.

Pixel output is identical: `m68k/graphics-tour.x68`, `mips/bitmap-tour.asm`, `z80/mouse-paint.z80` and `m68k/keyboard-move.x68` hash to the same canvas before and after (`7bd0baa9`, `e8853fc5`, `e4ea9dc5`, `454ffea5`), read outside any timed run. A later review corrected this section's original claim that 80 M68K Undos retraced 80 stepped canvas images exactly: direct drawing retains the known coarse alignment from phase 3, while a differential Screen check and the MIPS memory-backed path establish that this change preserved both forms of Undo. Pause froze the image, Resume moved it again, Stop cleared the Screen to a canvas with no non-zero byte.

Three traps for the next agent, all new:

- **The binary is `chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`**, not the `chrome-linux/headless_shell` path earlier sections imply.
- **A page running a program without a guest wait used to starve every `Runtime.evaluate`** — over a minute with no answer — so the driver clicks Run and Stop with `Input.dispatchMouseEvent` and reads its counters after Stop, windowing them by the timestamps it recorded. That is no longer necessary after this change, but the rig still does it, and it is the only way to measure a build that has the old yield in it.
- **`Tracing.start` with `disabled-by-default-devtools.timeline` on a saturated main thread never completes**, so the trace is opt-in and the attribution comes from `Profiler.start` at a 200 µs sampling interval instead. The production bundle is minified: `fillImage` is `J` in `DpfhWv1T.js` (checked against its body in the bundle), while `copyRegion`, `syncFramebuffer` and `readInto` keep their names.

## Follow-up 7: review of the draggable window and rendering performance — 2026-09-06

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`. Reviewed commits
`72c266c`, `2133746` and `73c545e` by reading their diffs, running the node checks and driving built
before/after applications over the DevTools protocol. The before build was the same tree with only
the four performance source files restored to `2133746`; no comparison crosses unrelated commits.

### Findings and fixes

- **No product-code regression was found in either change.** The window, focus, painting,
  scheduling, bulk-pixel and panel-refresh changes all held under the checks below.
- **The performance section overstated Undo.** Its final paragraph said 80 M68K Undos retraced 80
  stepped canvases exactly. A 90-step node check disproved that: the direct-drawing Screen journal
  rewinds at Screen operations, ahead of intervening non-drawing Core steps. This is the known,
  bounded limitation already recorded in phase 3, not a regression in `73c545e`; exact alignment
  needs a Core-side instruction/Undo key the current APIs do not expose. The research record now
  says what was actually verified: the Screen before and after the bulk rewrite is byte-identical
  through its operations and Undos, while the MIPS memory-backed path retraces Core steps exactly.
- **The scheduler tests were genuinely timing-flaky.** Four correction tests and the paused-time
  test burned real wall-clock milliseconds and asserted exact factors. Under load the full suite
  produced corrections such as 3.20 and 12.81 instead of 4 and 16, despite the pure correction
  function being correct. They now advance a mocked `performance.now()` explicitly. This keeps the
  integration assertions exact, removes their busy loops, and makes host scheduling load irrelevant.
- **A dragged window can cover the controls if the user deliberately puts it there.** Opening at
  1600 × 900 places it at (664, 8), 928 × 823, above controls whose top is 857; resizes to
  1280 × 800, 1920 × 1080 and 1024 × 700 also keep the opening/retained position clear. It
  can then be dragged over any page content, as an ordinary floating window can. This was not
  changed: the user's original requirement was that it not cover the execution controls **when it
  opens**, and excluding a moving page rectangle from free dragging would be a new interaction.

### Window, focus and input in the browser

- Instrumenting `Screen.watch()` found one inactive Screen left by project setup and exactly one
  watcher on the active Screen in-page, in the window, after closing, after six round trips and
  after opening again. Every state had one `.screen-panel` and one canvas; no registration leaked.
- The window opened at the geometry above, clamped at every viewport edge, followed viewport
  shrinkage, and left the page underneath hit-testable. The zoom and display controls did not start
  a drag. The close/restore button returned the same frame to the page; focus followed the new
  canvas, and a key on it reached zero window keydown listeners.
- Call stack, History and Stack pointer kept their eye/collapse behavior and their established
  geometry: collapsed 144 × 24, expanded 192 × 69 and 256 × 359 in this build.
- The focused canvas computed to a 2 px solid outline with a -2 px offset. Screenshot pixels on all
  four canvas edges confirmed the complete ring for M68K, Z80 and MIPS, in the page and window, fit
  and actual size. Fit mode kept zero scroll range and its existing canvas dimensions. An actual
  640 × 480 canvas in the shorter page stage still scrolls by design; its inset ring scrolls with
  the canvas rather than being clipped outside it.

### Correctness and reproduced performance

- Current and pre-performance `Screen.ts` produced the same terminating-example hashes:
  `m68k/graphics-tour.x68` = `7bd0baa9` at 640 × 480 and `mips/bitmap-tour.asm` = `e8853fc5`
  at 256 × 256. A differential script added clipped rectangles, lines, ellipses, flood fill,
  scrolled and positioned text, double buffering and presentation, full and partial framebuffer
  sync, resize, reset and all retained Undos. All 25 checkpoints matched at 64 × 64 and 37 × 21.
- The independent browser rerun reproduced the performance conclusion. The no-wait M68K drawing
  loop moved from 9.0 to 45.6 delivered frames/s and 9.0 to 45.4 browser frames/s, with long tasks
  falling from 45 to zero. The paced M68K ball moved from 33.2 to 40.8 delivered frames/s and the
  main-thread load index from 62% to 46%. The already display-limited MIPS ball stayed effectively
  unchanged, 57.8 to 58.0 delivered frames/s. These absolute values differ from the original 38.0,
  40.6 and 56.6, but reproduce both the starvation mechanism and the claimed direction.
- Stop after the change answered in 44 to 55 ms in that run. Page-side instrumentation measured
  Pause at 16.0 ms before and 17.5 ms after on the double-buffered M68K ball, and 184 ms before and
  164 ms after on the MIPS ball. Both images froze while paused and changed after Resume. The longer
  MIPS latency is pre-existing: its asynchronous Core serves guest sleeps inside a pending slice;
  the rendering change did not regress it.

### Verification

- `GenericEmulator.test.ts`: 35 passing in five consecutive runs after replacing wall-clock burns.
- `npm test`: 460 passing in 23 files, in three consecutive full runs.
- `npm run check`: the same two baseline errors (the sitemap's `String#at` and the z80
  instruction page's `description` prop) and 205 warnings.
- `npm run lint`: 0 errors and 18 warnings; `npm run format:check` clean; `npm run build` clean.

### Left and blockers

- No blocker. The review leaves the measured sparse MIPS/RISC-V framebuffer optimization rejected
  for the reasons in follow-up 6 and does not change the known Core API limitations around exact
  direct-drawing Undo or MARS/RARS pause boundaries.

## Follow-up 8: a pause lands on MIPS and RISC-V while a program sleeps — 2026-09-07

Repository `/home/dev/code/asm-editor`, branch `feat/screen-peripherals`. This section ships in the same commit as the change it describes. The user reported that MIPS and RISC-V programs could not be paused; M68K and Z80 could.

**Where this contradicts the design record.** Nowhere. Follow-up 2 recorded that a pause is answered at the next slice boundary "plus whatever a program's own wait is doing", and the review of the four follow-ups left "MARS/RARS pause boundaries" as a known Core limitation. This narrows the boundary rather than moving it: [ADR 0007](../adr/0007-generic-emulator-run-scheduling.md)'s pause is still taken between two slices, and a pending program wait still completes first.

### What was wrong

The two MARS-derived adapters serve a `sleep` (syscall 32) inside the slice: the Core suspends the pending `simulate*` call until the handler's promise settles, and nothing outside the Core can end the call before its halt limit. Phase 7 chose that (the alternative is a Core change), and it was fine for what phase 8 measured, which was compute. For a sleeping program the halt limit is the only bound on how long one call holds the slice, and the halt limit is the slice's whole compute budget: 50 ms worth of instructions, then 16 times that once `speedCorrection` has decided a program that sleeps most of its slice is a fast one. Reproduced under node on a loop of four instructions and a ten millisecond sleep, with `pause()` pressed 30 ms into the run: RISC-V honored it after 3.3 s (1 250 instructions a slice, a sleep every four), MIPS not within 30 s (50 000 instructions a slice is 125 s of sleeps). A compute-only loop paused in 3 to 5 ms on both. Stop was never affected: `clear()` cancels the clock, which releases the sleep, and the superseded slice ends at its next instruction.

### Done

- **`src/lib/languages/mars/marsSlice.ts`**: `MarsSlicePacer`, which spends a slice's budget in chunks and looks at the deadline between them, and `nextMarsChunk`, which sizes the next chunk on what the last one cost in wall time, sleeps included. A chunk that slept is sized with no floor (the floor guards the cost of re-entering the Core, which is nothing next to a sleep), a chunk that came back at once grows by at most a factor of two (so it creeps up on the next sleep instead of jumping to the compute size and carrying a dozen sleeps), and a chunk whose instructions turned out expensive shrinks no further than `MIN_MARS_CHUNK` (64). The chunk is kept across slices, so a sleeping program is not rediscovered at every slice, and reset at Build. The deadline check is new to these two adapters as well: before this, a slice of expensive syscalls (printing in a loop) had nothing but the instruction count to end it.
- **`MIPSEmulator.svelte.ts` and `RISC-VEmulator.svelte.ts`** run `_runSlice` through the pacer, each with its own chunk target: 1 ms on MIPS, 4 ms on RISC-V. Measured under node with the shipped undo history: a `simulateWithBreakpointsAndLimit` call costs about 5 µs on MIPS, which reaches its full 1 100 instructions a millisecond from 64-instruction chunks (823 a millisecond from chunks of 16), and the RISC-V Core spends 40 µs on every instruction, so its throughput is the same at any chunk size from one instruction up. The breakpoint and termination handling is unchanged, it runs per chunk instead of per slice.
- **Tests**: 11 in `src/lib/languages/mars/marsSlice.test.ts` on a scripted Core (growth, the two floors, the cap, the deadline, the budget, the persisted chunk, the walk back up to the next sleep, breakpoints and termination), and one regression test each in `MIPSEmulator.test.ts` and `RISC-VEmulator.test.ts`: the sleeping loop above pauses within a second, which fails against the previous adapters (3.3 s and 125 s).
- **Measured after the change**, same loop, same 30 ms: the pause lands after 140 ms on MIPS and 146 ms on RISC-V, which is the first chunk (64 instructions, 16 sleeps) since the request arrives inside it; a later request lands within a sleep or two. Compute-only loops: 5 ms and 3 ms.

### Choices where the brief left a detail open

- **Chunking rather than a Core-side stop.** RARS's `Simulator` has `stopExecution` and a `StopReason.PAUSE`, and MARS's has the same flag, but neither `JsRiscV` nor `JsMips` exposes it, so a pause that ends a `simulate*` call at the next instruction needs a change and a release of both `@specy/mips` and `@specy/risc-v`. Chunking gets the pause within a sleep or two from the editor alone; the Core-side stop would get it within one sleep exactly and is the fix to make when the wrappers are next touched.
- **Sized on wall time, not busy time.** The scheduler's own `learnSliceSpeed` deliberately takes the waits out, because it is estimating the Core's speed. The pacer is bounding how long the host is held between two checks, and a sleep holds it as surely as an instruction does.
- **Kept out of `ExecutionSlice.ts`.** `nextSliceChunk` and `MIN_SLICE_CHUNK` are the Z80's, whose waits end the slice; the sleeping-chunk rules are specific to Cores that serve waits inside a call, which is the MARS family, so they live beside `MarsDevices` in `src/lib/languages/mars/`.

### Left and blockers

- **One sleep still completes before a pause**, as ADR 0007 says it must. A program sleeping five seconds per iteration takes up to five seconds to pause on every Core.
- **The first sleeping chunk after a compute phase carries a chunk target's worth of instructions** of sleeps once: about a thousand instructions on MIPS, which is two frames of `bouncing-ball.asm` or three iterations of a game loop that sleeps a tenth of a second; a hundred instructions on RISC-V. The Core-side stop above is what removes it.
- **Testcase runs are still unsliced and unpausable** (follow-up 2).

### Verification

- `npm test`: 1 276 passing in 26 files on a quiet machine. A run with `svelte-check` and `eslint` going at the same time had the two RISC-V drawing examples (`bitmap-tour`, `bouncing-ball`, 2.4 s each alone, on either adapter) time out at their 5 s default, which is load, not the change: the same suite against the previous RISC-V adapter, run quietly, passes everything except the new pause regression test, which fails there at 1.7 s.
- Compute-only throughput (`throughput.measure.ts`, ADR 0007's five percent budget for yields), sliced and yielding against one slice: MIPS 860 132 against 845 215 instructions a second (−1.7%, noise), RISC-V 25 431 against 25 460 (0.1%). The other Cores are untouched: Z80 4.3%, M68K 2.8%, x86 5.9%, as before.
- `npm run check`: the same two baseline errors (the sitemap's `String#at` and the z80 instruction page's `description` prop) and 205 warnings; `npm run lint`: 0 errors and 18 warnings; `npm run format:check` clean.
- In a headless Chrome (151) against `npm run dev`: a shared MIPS project with a `@screen` directive builds with no save prompt and Save still asks (the second bug report of the day, `src/routes/projects/[project]/+page.svelte`); a page scrolled 300 px lands at the top after a navigation and back at 300 px after Back, with the navbar pinned throughout (the third: the body was the scroll container, `src/global.css` and `src/components/shared/layout/Navbar.svelte`). Both reproduced on the code before the change with the same script.
