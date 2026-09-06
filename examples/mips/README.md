# MIPS bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in a MIPS project, set the display parameters its header comment names in the screen panel's **Display** popover, then Build and Run.

| File                    | What it exercises                                                                                       | Display                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `bitmap-tour.asm`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid       | 1 × 1 units, 256 × 256, static data  |
| `bouncing-ball.asm`     | Animation paced by syscall 32 (sleep) and the elapsed program time of syscall 30                         | 4 × 4 units, 512 × 512, static data  |
| `keyboard-display.asm`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter     | 8 × 8 units, 512 × 256, static data  |

`bouncing-ball.asm` and `keyboard-display.asm` run until you Stop them, or until you type `q` in the second one.

## Where they come from

They were written for this repository. MARS's own bitmap and keyboard sample programs are not in [its source repository](https://github.com/dpetersanderson/MARS) — it ships tools, not example programs — so there was nothing to check in with a license note, and these cover the same two tools. The interface they use is MARS's: the [bitmap display](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/BitmapDisplay.java) and the [keyboard and display simulator](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/KeyboardAndDisplaySimulator.java), whose parameters, defaults and register layout the editor follows exactly. A program written against those tools runs here unchanged once the display parameters match.

The RISC-V ports of all three are in [`../risc-v/`](../risc-v/).
