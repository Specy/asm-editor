# TRS-80 screen mode for the Z80

## Scope

A second Screen mode for the Z80: the **memory-mapped character display of the TRS-80 Model I/III**,
beside the port-mapped drawing commands of [ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md).
A program stores bytes into `0x3C00` and they appear, exactly as they do on the machine
`@specy/z80` descends from.

The reason is the one ADR 0011 could not serve: the port map is this project's own invention, so no
program written anywhere else draws through it. The TRS-80 display is a real, documented convention
with an existing corpus — this is the only Z80 graphics interface with software already written for
it that is reachable from here. The goal is to run that class of program, and to give programs
written here a blitting idiom (`ldir` into video RAM) that the port map cannot offer.

The **keyboard matrix at `0x3800`** is in scope, because without it no existing program is playable:
all three games shipped in the fork's own IDE poll it (`scarfman` at `0x3840`, `breakdwn` at `0x3801`
and `0x3880`, `wolf` at `0x3800`).

ROM, cassette, floppy, printer, sound and timer interrupts are out of scope; see below.

## Reference: what the convention is

Sources are the fork's own submodule, `emulators/z80` (a fork of
[lkesteloot/trs80](https://github.com/lkesteloot/trs80), MIT, compatible with this repository's
AGPL). Upstream is not a custom design: it carries real ROM dumps, real character-generator glyph
dumps (`GLYPH_CG1`, `GLYPH_CG2`, `GLYPH_CG4`) and real media formats, so the layout below is
hardware, not somebody's interface.

| Concern       | Value                                                                                                                   | Source                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Video RAM     | `0x3C00`–`0x3FFF`, 1 KB, one byte per cell, 64 columns by 16 rows                                                       | `packages/trs80-base/src/Constants.ts`                      |
| Decode        | The machine's `writeMemory` mirrors a write to the screen device **and** to RAM, so reads need no hook                  | `packages/trs80-emulator/src/Trs80.ts:848`                  |
| Glyph banks   | Model III `[0, 64, -1, 128]`: chars 0–63 and 64–127 from the CG, 128–191 block graphics, 192–255 the alternate bank     | `packages/trs80-emulator-web/src/Fonts.ts:743`              |
| Block graphic | `char % 64`, bit 0 top-left, 1 top-right, 2 middle-left, 3 middle-right, 4 bottom-left, 5 bottom-right — a 2 by 3 block | `Fonts.ts`, `makeImageInternal`                             |
| Cell          | 8 pixels wide by 24 tall; the CG data is 12 rows, each drawn twice                                                      | `MODEL3_FONT = new Font(GLYPH_CG4, 8, 24, …)`               |
| Pixels        | 128 by 48 chunky graphics pixels, monochrome; no hi-res exists on the machine or in the repository                      | `TRS80_CHAR_PIXEL_WIDTH = 2`, `TRS80_CHAR_PIXEL_HEIGHT = 3` |
| Keyboard      | 8 rows at `0x3800`; the address's bits select rows and a read ORs every selected row together                           | `packages/trs80-emulator/src/Keyboard.ts:174`               |
| Clear         | The ROM fills the 1 KB with `0x20`, not with zero                                                                       | `Trs80.ts:1298`                                             |

## Agreed architecture

The decision worth an ADR is the first one; it would be **ADR 0020, "Mirror the TRS-80 display in
guest memory"**, whose consequences are the rest of this document.

- **The two Z80 Screen modes are exclusive.** A run is either in _drawing_ mode (the port commands of
  ADR 0011, the default) or in _cell_ mode (this document). This follows the MARS precedent, where
  `useFramebuffer` and `useDrawing` are a switch and not a blend, and it is forced by Undo: cell mode
  restores its image by re-reading guest memory, which repaints whole cells and would erase anything
  the drawing commands had put underneath.
- **Cell mode is memory-backed, so it journals nothing** — the existing rule of
  [ADR 0005](../adr/0005-restore-screen-state-on-undo.md), already carrying the MARS bitmap display.
- **No Core change is needed, again.** `Z80MachineConfig` already offers `onMemoryWrite`,
  `onMemoryRead` and `onDebugRead` (`emulators/z80/packages/z80-machine/src/Z80MachineTypes.ts:190`),
  which is the same seam upstream decodes its devices on.
- **The Screen stays injected at the Emulator boundary** ([ADR 0004](../adr/0004-inject-screens-at-emulator-boundary.md)):
  the new device is plain TypeScript driving the editor's own `Screen`, not upstream's `CanvasScreen`,
  whose CRT renderer and DOM dependency are not wanted here.
- **Glyph data is copied, not imported.** `Fonts.ts` lives in `trs80-emulator-web`, which pulls in the
  DOM; the spec takes the `GLYPH_CG4` array and the procedural block-graphics rule into a plain-data
  module, the pattern `Z80-model.ts` and `src/lib/languages/mars/` already set.

## The display

512 by 384 logical pixels: 64 by 16 cells of 8 by 24. That is the Model III's own geometry, it is
4:3 as the machine was, each chunky graphics pixel is 4 by 8 logical pixels at the real aspect, and
it sits between the MIPS default (512 by 256) and the M68K's (640 by 480), so the Screen panel needs
nothing new.

The display is monochrome: the Screen's pen color is ink and its background color is paper. The Z80's
3-3-2 pen and fill ports keep working as the choice of those two colors, which is how a program picks
green, amber or white without a new port.

## Entering and leaving the mode

Two doors, one piece of state, following what MIPS and RISC-V already do for the bitmap display:

1. **A `; @screen trs80` comment directive**, read at compile time, so the Screen is right before the
   first instruction and during a Testcase run. It is a comment, so a source file that also assembles
   in `trs80-asm` or zasm is unaffected — and adding one comment line is the whole ceremony for a
   program brought in from outside. This generalizes `src/lib/languages/mars/screenDirective.ts`,
   whose parser is already Core-free and reusable.
2. **Two new screen commands on the existing command port** (`0x27`):
   `MODE_CELLS = 14` and `MODE_DRAWING = 15`, for programs written in this editor that want to switch
   at runtime.

A project setting is the natural third door — the per-project Settings of
[ADR 0014](../adr/0014-settings-split-by-effect.md) are the Z80's equivalent of the MARS display
popover — and should follow once the directive exists, not before it.

## Coexistence with the port map

In cell mode the port map keeps working except where it would fight the memory-mapped image. The
rule is the M68K's: an operation the mode cannot honor **stops the program with an error naming it**,
rather than appearing to work until the next repaint wipes it.

| Ports                                   | In cell mode                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `0x27` command: `PIXEL` … `PRESENT`     | Error naming the command. The program draws by storing bytes                                                  |
| `0x27` command: `MODE_DRAWING`          | Leaves cell mode; the image stays as it is until something draws                                              |
| `0x10`, `0x11` pen and fill color       | Work: they choose ink and paper                                                                               |
| `0x12`–`0x16` pen width and coordinates | Accepted and read back, as today; they are staging registers and affect nothing until a drawing command runs  |
| `0x18` pixel read                       | Error. A program reads its own video RAM                                                                      |
| `0x19`, `0x1A` text cursor              | Error. There is no text cursor: printing on this machine _is_ storing a byte                                  |
| `0x00`–`0x04` console                   | Write to the Terminal transcript only, **not** to the Screen (see below)                                      |
| `0x20`–`0x23` keyboard                  | Work unchanged, beside the matrix at `0x3800`                                                                 |
| `0x30`–`0x33` mouse                     | Work unchanged. The machine had no mouse; this is the editor's own extra and conflicts with nothing           |
| `0x40`–`0x42` time                      | Work unchanged. `TIME_FRAME` is how a program written here paces itself without the machine's timer interrupt |

**Console output stops being drawn on the Screen in cell mode**, and this is the one place where
[ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md)'s single output window is honored
differently: the window shows video RAM, and the Terminal keeps the transcript that Testcases assert
on. The alternative — having the character port store into video RAM at a cursor — was rejected
because a device-side store bypasses the Core's journal (`Z80Machine.writeMemory` only records a
write it actually performs) and Undo would leave the image and memory disagreeing.

**Double buffering needs nothing.** A program keeps a back buffer anywhere in its 64 KB and `ldir`s
1024 bytes into `0x3C00`, which is what a real program does, is faster than the command port's
present, and is atomic as far as the display is concerned because the flush happens after the slice.

## How a write reaches the Screen

- `onMemoryWrite(address, value)` widens a dirty cell range when `0x3C00 <= address < 0x4000`, then
  **returns `false`** so RAM takes the write. The return value is load-bearing: returning `true` tells
  the Core the device handled it, and the write is then neither stored nor journaled
  (`Z80Machine.writeMemory`, `emulators/z80/packages/z80-machine/src/Z80Machine.ts:197`).
- The dirty range is flushed at the end of each execution slice, where `MarsDevices.flush` already
  flushes, and repaints only the cells that changed.
- All 256 glyphs are rasterized once, on entering the mode, into a mask; a cell repaint is then a copy
  of 8 by 24 pixels in two colors. A worst-case full-screen flush is 196 608 pixel writes, below the
  M68K's 640 by 480 clear, which the Screen already does per frame in the bouncing-ball example.

## Undo

Cell mode inherits the framebuffer rule exactly:

- The Screen journals nothing while the mode is on.
- `Z80Emulator._resyncScreenFromMemory()` — the optional hook declared at
  [BaseEmulator.svelte.ts:160](src/lib/languages/BaseEmulator.svelte.ts:160) and called after a
  rollback at [GenericEmulator.svelte.ts:1231](src/lib/languages/GenericEmulator.svelte.ts:1231) —
  re-reads the whole kilobyte and repaints every cell.
- Video RAM itself is restored by the Core: `ExecutionRecord.memoryWrites` records the before-value of
  every write and `undo()` reverses them newest first (`Z80Machine.ts:525`).

A welcome consequence: **in cell mode the Z80's undo depth is the Core's history alone.** Today it is
the smaller of the Core's history and what the Screen's byte budget allows, because command drawing
journals images; a memory-backed image has no such cost.

Switching modes mid-run clears the Screen's history, so a single undo chain never spans both models.

## Reset and lifecycle

On Build, Clear execution, dispose and the start of each Testcase — the existing reset path — the
mode returns to what the directive asked for, the Screen resets, and **video RAM is filled with
`0x20`**, which is what the ROM's clear does. Zero-filled RAM would otherwise show 1024 copies of
glyph 0. That fill writes `machine.memory` directly, which is correct exactly there: the Core
documents direct access as bypassing the hooks and the journal, and the history is empty at that
point anyway.

## The keyboard matrix

Eight rows at `0x3800`–`0x38FF`, served from `onMemoryRead`: take `address - 0x3800`, and for each
set bit `i` OR in row `i`. Each row is a bitmask of eight keys; the table mapping a key to its
(row, column) is plain data in upstream's `Keyboard.ts` and ports directly.

- Rows are answered from the editor's existing `Keyboard` peripheral and its held-key state
  ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md)), so Screen focus, the focus ring and
  shortcut suppression all keep working.
- The editor's minimum hold interval already serves the purpose of upstream's 50 000 t-state key
  delay: not overwhelming a program's polling loop with transitions.
- Upstream's shift-forcing exists to make _typing a character_ come out right; the held-key model here
  needs only the (row, column) bits, and the shift key is a key like any other.
- **`onDebugRead` must fall through to RAM for this range.** It defaults to `onMemoryRead`, and the
  memory viewer and disassembler read constantly — without this, opening the memory panel would poll
  the keyboard. This is what the hook exists for.

## Out of scope

- **ROM.** Programs calling ROM entry points will not run: of the three games, `breakdwn` and `wolf`
  make no ROM calls at all, and `scarfman` makes two (`0x0033` print character, `0x01C9` clear
  screen). Shipping Tandy's ROM in an AGPL public app is not something to do casually, so the options
  later are a documented shim for the handful of common entry points, or nothing. State the limit in
  the documentation rather than half-implementing it.
- Cassette, floppy, printer, sound, the expanded/alternate character latch at `0x37E8`, and the timer
  interrupt. The Z80 environment raises no interrupts at all today
  ([Z80Emulator.svelte.ts:314](src/lib/languages/Z80/Z80Emulator.svelte.ts:314)); programs written
  here pace themselves with `TIME_FRAME`.

## Implementation plan

| Step | Work                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `src/lib/languages/Z80/trs80/trs80Display.ts`: plain data — the memory map constants, the glyph table copied from `GLYPH_CG4` with its provenance note, the block-graphics rule, the rasterizer |
| 2    | `Screen`: `useCells(columns, rows, cell)` and `syncCells(bytes, from, to)` beside `useFramebuffer`/`syncFramebuffer`; the journaling guards become "any memory-backed mode"                     |
| 3    | `src/lib/languages/Z80/trs80/Trs80Devices.ts`: dirty tracking, flush, resync and the keyboard matrix, modeled on `src/lib/languages/mars/MarsDevices.ts`, plain TypeScript                      |
| 4    | `Z80-model.ts`: the two new commands and their documentation rows; `Z80Device.ts`: reject the drawing ports in cell mode and stop echoing console output to the Screen                          |
| 5    | `Z80Emulator.svelte.ts`: the three memory hooks, `_resyncScreenFromMemory`, the per-slice flush, the reset fill                                                                                 |
| 6    | The `; @screen trs80` directive, generalizing `mars/screenDirective.ts`                                                                                                                         |
| 7    | Documentation: the Z80 I/O page gains the mode and the memory map; `docs/manual-verification.md` gains its rows; ADR 0020 is written                                                            |
| 8    | Examples under `examples/z80/`: a text-and-block-graphics program and a game loop that `ldir`s a back buffer                                                                                    |

## Validation

- Unit tests per the existing pattern: `trs80Display.test.ts` for the glyph and block-graphics
  rasterization, a device test for dirty tracking, the matrix decode and resync, and an example test
  that runs the new programs headlessly and looks at the pixels.
- **A real compatibility check is available and should be taken.** `wolf` and `breakdwn` are checked
  into the submodule as assembly source (`emulators/z80/packages/trs80-ide/src/`) and call no ROM, so
  a test can assemble one of them against the real Core under node and assert that it paints. That is
  the first time anything in this repository has run a Z80 program written for another environment —
  which is the whole point of the mode. The sources stay in the submodule and are not copied into this
  repository.
- Manual rows: text and block graphics render at the right aspect, `ldir` animation does not tear,
  Undo rewinds the image with the memory, the memory viewer does not eat keystrokes, and the mode
  survives Build.

## Open questions

- **Model I or Model III glyphs.** The spec assumes Model III (8-wide cells, `GLYPH_CG4`, an alternate
  bank at 192). Model I is 6-wide with no alternate bank, and is what most of the existing corpus was
  written for, though the difference is only the shape of the letters. Recommendation: ship Model III
  and keep the `Font`-style bank table so the other is a data change.
- **Whether a project setting ships with the directive or after it.** Recommendation: after, matching
  how the MARS display arrived.

## What shipped

Implemented on 2026-09-11, as [ADR 0020](../adr/0020-mirror-the-trs80-display-in-guest-memory.md).

| Piece            | Where                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The machine data | `src/lib/languages/Z80/trs80/trs80Display.ts`: the memory map, the `GLYPH_CG4` dump, the block rule, the key matrix, doc rows                                  |
| The Screen mode  | `Screen.useCells` / `syncCells` / `cells` / `memoryBacked`, beside the framebuffer pair                                                                        |
| The device       | `src/lib/languages/Z80/trs80/Trs80Devices.ts`: dirty tracking, flush, resync, the matrix decode                                                                |
| The directive    | `src/lib/languages/Z80/trs80/z80ScreenDirective.ts`                                                                                                            |
| The port device  | `Z80Device`: the two mode commands, the rejections, console output kept off the display                                                                        |
| The adapter      | `Z80Emulator`: the three memory hooks, `_resyncScreenFromMemory`, the per-slice flush, the directive read at compile time                                      |
| Documentation    | The Z80 I/O page's "The TRS-80 display" card, the coding agent's prompt, `docs/manual-verification.md` rows Z11 to Z15                                         |
| Examples         | `examples/z80/trs80-text.z80`, `examples/z80/trs80-bounce.z80`                                                                                                 |
| Tests            | 41 across `trs80Display.test.ts`, `Trs80Devices.test.ts`, `z80ScreenDirective.test.ts`, `Trs80Emulator.test.ts`, and two example rows in `Z80Examples.test.ts` |

Four things came out differently from the plan above:

- **The Screen takes the glyph sheet as an argument** (`useCells(grid, cell, glyphs)`) rather than knowing the font. It stays a cell-mapped display with a glyph sheet, and only `trs80Display.ts` knows the machine — the same distance `useFramebuffer` keeps from MARS.
- **The fill-color port sets the paper** in cell mode, and either color port repaints every cell. The plan said pen is ink and background is paper but left a program no way to say what the background should be; the fill port is the one that already adopts a background in drawing mode, when the clear command runs.
- **The editor's port map moved up by 0x10.** The plan assumed the two IO maps did not overlap and never checked. They overlapped at exactly one address: the machine decodes 0x00 (joystick), 0x75, 0x79, 0xB5, 0xB9 and 0xE0 upward, and 0x00 was this editor's character port. Two of the three games in the fork's own IDE poll it, and a character read suspended them on an input prompt for a line nobody was typing. Rather than special-case the port by mode, every group moved — console 0x10, Screen 0x20, Keyboard 0x30, Mouse 0x40, time 0x50 — so an unmapped port 0 floats high, which is what the machine answers with no joystick attached ([ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md)). A breaking change, taken on 2026-09-11 while the Z80 environment was days old.
- **Model III glyphs**, the recommendation of the open question above: 8-wide cells, `GLYPH_CG4`, the alternate bank at 192. The bank table is kept in the shape upstream's `Font` uses, so Model I is a data change.

The open question about a project setting is still open, and still "after the directive".

### What a manual pass still owes

Rows Z11 to Z15 of `docs/manual-verification.md`. The one that only a browser can answer is **Z15**: `onDebugRead` is pointed at RAM so the memory panel's own reads do not dequeue key transitions, and nothing under node opens a memory panel.
