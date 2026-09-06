# RISC-V bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in a RISC-V project, then Build and Run: the `# @screen` comment in each header configures the screen panel's display, so there is nothing to set by hand. RARS reads that line as an ordinary comment, so the same file still assembles there, where you set the five values in its bitmap display window yourself.

| File                  | What it exercises                                                                                     | Its `@screen` directive                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `bitmap-tour.s`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid     | `unit=1 width=256 height=256 base=display` |
| `bouncing-ball.s`     | Animation paced by ecall 32 (sleep) and the elapsed program time of ecall 30                          | `unit=4 width=512 height=512 base=display` |
| `keyboard-display.s`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter   | `unit=8 width=512 height=256 base=display` |

`bouncing-ball.s` and `keyboard-display.s` run until you Stop them, or until you type `q` in the second one.

They are the RISC-V ports of the MIPS programs in [`../mips/`](../mips/), instruction for instruction: RARS's [bitmap display](https://github.com/TheThirdOne/rars/blob/master/src/rars/tools/BitmapDisplay.java) and [keyboard and display simulator](https://github.com/TheThirdOne/rars/blob/master/src/rars/tools/KeyboardAndDisplaySimulator.java) are ports of MARS's, with the same parameters and the same registers. RARS's own `examples/` folder has no program for either tool, so there was nothing to check in with a license note.
