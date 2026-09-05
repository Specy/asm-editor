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
