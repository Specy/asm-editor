# Manual verification matrix

Graphical assertions are deferred ([ADR 0009](./adr/0009-share-screen-keyboard-input-with-terminal.md)), so the compatibility target of [ADR 0003](./adr/0003-preserve-simulator-graphics-conventions.md) — existing EASy68K and MARS/RARS programs drawing what they draw in their own simulator — is checked by hand against this matrix. Automated tests cover the peripherals' pure logic; this document covers what only eyes can confirm: pixels, pacing and the feel of input.

## How to run it

1. `npm run dev` and open the project page for the environment under test. `npm test`, `npm run check` and `npm run lint` must already be clean.
2. Open the program named in the row from `examples/<environment>/`, Build, then Run. Compare against the reference screenshot or the reference simulator named in the row.
3. Walk the row's checks in order. A row passes only if every check passes; record the date, the browser and the result in the row's Result column, and file anything that fails before the phase closes.
4. Undo rows are run after the program has finished: step backwards through the instruction history and watch the Screen follow the program state ([ADR 0005](./adr/0005-restore-screen-state-on-undo.md)).
5. Reset rows use the Terminal's own reset path: Build, Clear execution, closing the project, and the start of each Testcase.

Each environment section is filled in by the phase that implements it (see [screen-peripherals-plan.md](./design/screen-peripherals-plan.md)); the hosting and measurement sections are filled in by phase 4 and phase 8.

## Z80 (phase 5)

Rows for the port-mapped Screen, Keyboard and Mouse of [ADR 0011](./adr/0011-z80-peripherals-through-the-port-map.md), with the three example programs written here (animation with double buffering, keyboard-driven movement, mouse painting). There is no reference simulator for the Z80 Screen — the port map is this project's own interface — so the reference column names the decision a row checks instead. The device's logic is covered by `src/lib/languages/Z80/Z80Device.test.ts` and every program below is run headlessly by `src/lib/languages/Z80/Z80Examples.test.ts`; these rows are what only eyes can confirm.

| #   | Program                                     | Checks                                                                                                                                                                                                | Reference          | Result                                                                                                                           |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | `examples/z80/bouncing-ball.z80`            | The ball is never half drawn and never sits on a half-cleared background; it moves at the display's pace, not the host's; Stop answers at once                                                        | ADR 0006, ADR 0010 | Pass, phase 5 (2026-09-06, headless Chromium 151, embed page): 208 ink pixels at every sample, centroid moved, Stop after 65 ms  |
| Z2  | `examples/z80/keyboard-move.z80`            | The arrows move the square only while the Screen has focus, and only while a key is held                                                                                                              | ADR 0008           | Pass, phase 5: the square's left edge went 120 → 226 while the right arrow was held, then stayed at 228 after the release        |
| Z3  | `examples/z80/mouse-paint.z80`              | The brush lands under the pointer, a drag that leaves the Screen keeps painting at the clamped edge, Shift paints red, the right button clears, no context menu                                       | ADR 0008           | Pass, phase 5, at zoom ×1; other zooms not checked                                                                               |
| Z4  | `examples/z80/keyboard-move.z80`            | The title is on the Screen in 8 by 8 cells and in the Terminal transcript at the same time, and the play area below it is redrawn without wiping it                                                   | ADR 0003, ADR 0011 | Pass, phase 5: 380 ink pixels in the top text rows, the same text in the transcript                                              |
| Z5  | A program that prints and then reads port 0 | With no peripheral port used, the input prompt appears as it always has; after any Screen, Keyboard or Mouse port, the same read takes keystrokes from the focused Screen and echoes them both places | ADR 0009           | Pass, phase 5: the prompt appeared for the text-only program; the graphical one printed `hhii` (echo plus program) in both views |
| Z6  | A program drawing two pixels                | Step forward until both pixels are on the Screen, then Undo: the Screen walks back with the code                                                                                                      | ADR 0005           | Pass, phase 5: ink 0 → 1 → 2 over twelve steps, then 2 → 1 → 0 over the undos                                                    |
| Z7  | Any of the three                            | Build, Clear execution and closing the project each leave a blank Screen, and the keyboard and mouse state is forgotten with it                                                                       | Design record      | Partial: the Screen was blank right after Stop; Build and project close not run                                                  |
| Z8  | A testcase over a drawing program           | Scripted input still answers the character port line by line, waits complete at once, the elapsed-time port starts at zero, and the Screen resets per testcase                                        | ADR 0002, ADR 0010 | Not run                                                                                                                          |
| Z9  | A program using command 10                  | A resize changes the panel's backing store, its header and its zoom, and clears the Screen                                                                                                            | ADR 0011           | Pass, phase 5: the header went 256 × 192 → 128 × 128 and the Screen showed the color it was cleared to                           |
| Z10 | The Z80 I/O documentation page              | The five groups render with their headings, the command table, the color swatches and the examples                                                                                                    | ADR 0011           | Pass, phase 5: five group headings, 27 port cards, 14 commands, 3 mouse views, 11 color swatches                                 |

## M68K (phase 6)

Rows for EASy68K's own examples, checked in under `examples/m68k/` with their license notes, one row per graphics, text, keyboard, mouse and time task group, plus the single-output-window behavior of [ADR 0003](./adr/0003-preserve-simulator-graphics-conventions.md) and the deviations named there.

| #   | Program | Checks | Reference | Result |
| --- | ------- | ------ | --------- | ------ |
|     |         |        |           |        |

## MIPS (phase 7)

Rows for the MARS bitmap display and the keyboard and display simulator, with the five display parameters, the memory re-sync after Undo and the transmitter's Terminal output.

| #   | Program | Checks | Reference | Result |
| --- | ------- | ------ | --------- | ------ |
|     |         |        |           |        |

## RISC-V (phase 7)

The MIPS rows repeated against the RARS samples; the two simulators are identical here, so a divergence between the two sections is itself a defect.

| #   | Program | Checks | Reference | Result |
| --- | ------- | ------ | --------- | ------ |
|     |         |        |           |        |

## x86

No Screen: `@specy/x86` wraps a Linux userland emulator with no graphics device, so x86 keeps Terminal I/O only and its program time stays the real clock, including during Testcases. The row here only confirms that the Screen panel is absent and that nothing about the Terminal changed.

| #   | Program | Checks | Reference | Result |
| --- | ------- | ------ | --------- | ------ |
|     |         |        |           |        |

## Hosting surfaces (phases 4 and 8)

The Screen panel appears in the project page's right column and in the interactive editor, so every surface that embeds the editor has to be walked: project page, lecture pages, the exam page, embeds and chat, in both the fullscreen and the small layout. Focus indication, editor-shortcut suppression and context-menu suppression are checked on each.

| #   | Surface                               | Checks                                                                                                                           | Result                                                                               |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| H1  | Project page, M68K                    | Panel in the right column under memory, header reads the language and 640 × 480, transcript still at the bottom, editor unshrunk | Pass, phase 4 (2026-09-06)                                                           |
| H2  | Project page, Z80                     | Integer zoom ×1 on a 256 × 192 Screen                                                                                            | Pass, phase 4                                                                        |
| H3  | Project page, x86                     | No Screen panel at all                                                                                                           | Pass, phase 4                                                                        |
| H4  | Project page, narrow window           | Panel spans the column without widening the page                                                                                 | Pass, phase 4 (700 px viewport)                                                      |
| H5  | Project page, focus and shortcuts     | Click gives the canvas focus and a visible ring; Shift+C never reaches the window handler; Esc releases and the keys return      | Pass, phase 4 (driven through CDP)                                                   |
| H6  | Project page, mouse                   | Pointer capture held through a drag that leaves the canvas, released on button up; context menu and middle click both cancelled  | Pass, phase 4                                                                        |
| H7  | Project page, zoom toggle             | Actual size shows 640 × 480 inside the panel's own scroll box without widening the page                                          | Pass, phase 4                                                                        |
| H8  | Interactive editor, small layout      | Show/Hide screen bar above the transcript, panel appears below it (embed page, lecture page)                                     | Pass, phase 4                                                                        |
| H9  | Interactive editor, fullscreen layout | Panel between the memory column and the transcript                                                                               | Pass, phase 4 (scratch route; the chat page needs a conversation to show the editor) |
| H10 | Exam page                             | Small layout, toggle present, nothing else moved                                                                                 | Pass, phase 4 (exam authoring page; the session page needs a live exam)              |
| H11 | Rendering                             | Drawing on the Screen reaches the canvas within a frame and clears `dirty`                                                       | Pass, phase 4 (rectangle, line and text drawn from the console)                      |
| H12 | Resize                                | A program's resize follows through to the backing store, the header and the zoom                                                 | Pass, phase 4; rechecked in phase 5 after fixing a canvas left blank by a resize     |

## Measurements (phase 8)

The numbers behind the tuning decisions, recorded here and summarized in [screen-peripherals.md](./design/screen-peripherals.md). Targets from [ADR 0007](./adr/0007-generic-emulator-run-scheduling.md): yields cost under five percent of compute-only throughput on every Core, and Stop is answered within a tenth of a second.

| Measurement                                               | Environment | Method | Value |
| --------------------------------------------------------- | ----------- | ------ | ----- |
| Instructions per second, no yields                        |             |        |       |
| Instructions per second, with yields                      |             |        |       |
| Stop latency                                              |             |        |       |
| Frame pacing of the animation examples                    |             |        |       |
| Screen history bytes of the animation examples            |             |        |       |
| Key hold interval, `DEFAULT_KEY_HOLD_INTERVAL_MS`         |             |        |       |
| Double-click interval, `DEFAULT_DOUBLE_CLICK_INTERVAL_MS` |             |        |       |
| Screen slice budget, `SCREEN_SLICE_MS`                    |             |        |       |
| Compute slice budget, `COMPUTE_SLICE_MS`                  |             |        |       |
| Instructions per millisecond, `M68K_INSTRUCTIONS_PER_MS`  | M68K        |        |       |
| Instructions per millisecond, `Z80_INSTRUCTIONS_PER_MS`   | Z80         |        |       |
| Instructions per millisecond, `MIPS_INSTRUCTIONS_PER_MS`  | MIPS        |        |       |
| Instructions per millisecond, `RISCV_INSTRUCTIONS_PER_MS` | RISC-V      |        |       |
| Instructions per millisecond, `X86_INSTRUCTIONS_PER_MS`   | x86         |        |       |
| Screen history budget default, `screenHistoryBudgetMb`    |             |        |       |
