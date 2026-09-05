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
