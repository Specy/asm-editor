# RISC-V bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in a RISC-V project, then Build and Run: the `# @screen` comment in each header configures the screen panel's display, so there is nothing to set by hand.

| File                  | What it exercises                                                                                     | Its `@screen` directive                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `bitmap-tour.s`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid     | `unit=1 width=256 height=256 base=display` |
| `bouncing-ball.s`     | Animation paced by ecall 32 (sleep) and the elapsed program time of ecall 30                          | `unit=4 width=512 height=512 base=display` |
| `keyboard-display.s`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter   | `unit=8 width=512 height=256 base=display` |

`bouncing-ball.s` and `keyboard-display.s` run until you Stop them, or until you type `q` in the second one.

These programs demonstrate the simulator's memory-mapped display and keyboard, along with timing through sleep and elapsed-time services. The `@screen` comment is an editor directive: it configures the display when you Build and is ignored as a normal assembly comment by other assemblers.
