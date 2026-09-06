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

- **The Terminal's interactive source is chosen by what the program does, once per run.** A Z80 program that only prints keeps the prompt it has always had; the first Screen, Keyboard or Mouse port access calls `onGraphicalUse`, which switches the Terminal to the Screen's Keyboard with an echo to the text cursor. That is [ADR 0009](../adr/0009-share-screen-keyboard-input-with-terminal.md)'s "in graphical use" evaluated instead of guessed, and it is what keeps the `in` instruction's own documentation example (`in a, (1)`, on a page whose Screen panel starts collapsed) working exactly as before. The switch happens at most once per run and never goes back, so the source is still fixed for a run in the sense the ADR cares about. Phase 6 has the same choice to make for EASy68K, where the graphical signal is the first graphics task.
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
