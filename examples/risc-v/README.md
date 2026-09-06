# RISC-V bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in a RISC-V project, set the display parameters its header comment names in the screen panel's **Display** popover, then Build and Run.

| File                  | What it exercises                                                                                     | Display                              |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `bitmap-tour.s`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid     | 1 × 1 units, 256 × 256, static data  |
| `bouncing-ball.s`     | Animation paced by ecall 32 (sleep) and the elapsed program time of ecall 30                          | 4 × 4 units, 512 × 512, static data  |
| `keyboard-display.s`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter   | 8 × 8 units, 512 × 256, static data  |

`bouncing-ball.s` and `keyboard-display.s` run until you Stop them, or until you type `q` in the second one.

They are the RISC-V ports of the MIPS programs in [`../mips/`](../mips/), instruction for instruction: RARS's [bitmap display](https://github.com/TheThirdOne/rars/blob/master/src/rars/tools/BitmapDisplay.java) and [keyboard and display simulator](https://github.com/TheThirdOne/rars/blob/master/src/rars/tools/KeyboardAndDisplaySimulator.java) are ports of MARS's, with the same parameters and the same registers. RARS's own `examples/` folder has no program for either tool, so there was nothing to check in with a license note.
