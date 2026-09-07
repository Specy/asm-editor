# MIPS bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in a MIPS project, then Build and Run: the `# @screen` comment in each header configures the screen panel's display, so there is nothing to set by hand. MARS reads that line as an ordinary comment, so the same file still assembles there, where you set the five values in its bitmap display window yourself.

| File                    | What it exercises                                                                                       | Its `@screen` directive                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bitmap-tour.asm`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid       | `unit=1 width=256 height=256 base=display`        |
| `bouncing-ball.asm`     | Animation paced by syscall 32 (sleep) and the elapsed program time of syscall 30                         | `unit=4 width=512 height=512 base=display`        |
| `keyboard-display.asm`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter     | `unit=8 width=512 height=256 base=display`        |

`bouncing-ball.asm` and `keyboard-display.asm` run until you Stop them, or until you type `q` in the second one.

## Where they come from

They were written for this repository. MARS's own bitmap and keyboard sample programs are not in [its source repository](https://github.com/dpetersanderson/MARS) — it ships tools, not example programs — so there was nothing to check in with a license note, and these cover the same two tools. The interface they use is MARS's: the [bitmap display](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/BitmapDisplay.java) and the [keyboard and display simulator](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/KeyboardAndDisplaySimulator.java), whose parameters, defaults and register layout the editor follows exactly. A program written against those tools runs here unchanged once the display parameters match, which is what the `@screen` line saves you from doing by hand.

The RISC-V ports of all three are in [`../risc-v/`](../risc-v/).
