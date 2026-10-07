# MIPS bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in a MIPS project, then Build and Run: the `# @screen` comment in each header configures the screen panel's display, so there is nothing to set by hand.

| File                    | What it exercises                                                                                       | Its `@screen` directive                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bitmap-tour.asm`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid       | `unit=1 width=256 height=256 base=display`        |
| `bouncing-ball.asm`     | Animation paced by syscall 32 (sleep) and the elapsed program time of syscall 30                         | `unit=4 width=512 height=512 base=display`        |
| `keyboard-display.asm`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter     | `unit=8 width=512 height=256 base=display`        |

`bouncing-ball.asm` and `keyboard-display.asm` run until you Stop them, or until you type `q` in the second one.

## Where they come from

These examples were written for this repository. The `@screen` line in each source file sets the display unit size, width, height, and base address used by the Playground's screen panel. The keyboard example uses the memory-mapped input and output registers listed in its header.

The RISC-V ports of all three are in [`../risc-v/`](../risc-v/).
