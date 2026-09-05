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

Rows for the port-mapped Screen, Keyboard and Mouse of [ADR 0011](./adr/0011-z80-peripherals-through-the-port-map.md), with the three example programs written here (animation with double buffering, keyboard-driven movement, mouse painting).

| #   | Program | Checks | Reference | Result |
| --- | ------- | ------ | --------- | ------ |
|     |         |        |           |        |

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

| #   | Surface | Checks | Result |
| --- | ------- | ------ | ------ |
|     |         |        |        |

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
