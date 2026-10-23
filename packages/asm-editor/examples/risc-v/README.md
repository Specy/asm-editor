# RISC-V bitmap display and keyboard examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../../../docs/manual-verification.md). Open one in a RISC-V project, then Build and Run: the `# @screen` comment in each header configures the screen panel's display, so there is nothing to set by hand.

| File                  | What it exercises                                                                                     | Its `@screen` directive                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `bitmap-tour.s`       | The bitmap display: one word per pixel, the low 24 bits as the color, over a whole 256 by 256 grid     | `unit=1 width=256 height=256 base=display` |
| `bouncing-ball.s`     | Animation paced by ecall 32 (sleep) and the elapsed program time of ecall 30                          | `unit=4 width=512 height=512 base=display` |
| `keyboard-display.s`  | The four memory-mapped registers at `0xffff0000`: the receiver's Ready bit and data, the transmitter   | `unit=8 width=512 height=256 base=display` |

`bouncing-ball.s` and `keyboard-display.s` run until you Stop them, or until you type `q` in the second one.

These programs demonstrate the simulator's memory-mapped display and keyboard, along with timing through sleep and elapsed-time services. The `@screen` comment is an editor directive: it configures the display when you Build and is ignored as a normal assembly comment by other assemblers.

## Flappy Bird in C

`flappy-bird.c` reimplements the course's RISC-V Flappy Bird using the simulator API in `<sim.h>`.
Add it as a C file in a RISC-V project, Compile it, then Build and Run its Generated assembly.
`SIM_SCREEN(display, 256, 256, 4)` configures a 64 × 64 cell grid automatically.

Open the Screen panel and click it to focus the keyboard. Tap Space, lowercase `w`, or Enter to
start and flap. After a collision, tap once to reset, then again to start. Scores and the session's
best score appear in the console. The program runs until you press Stop.

The [Flappy bird in C example page](../../src/content/risc-v/examples/flappy-bird-in-c/index.md)
contains the same source; keep both copies together when changing the game.

## Pac-Man

`pacman/` is a whole Project of several Files and two Programs: the arcade game on a Screen of its
own 224 × 288 pixels, a size RARS's tool does not offer and this editor does, written once in
assembly (`assembly/`, Entry `main.s`) and once in C (`c/pacman.c`, which `#include`s its other
`.c` Files). Both read their sprites, letters and maze from `assets/` (`sprites.bmp`, `tiles.bmp`,
`maze.bmp`, `maze.txt`) when they start, through the file services, so the pictures can be viewed
in the Preview and changed without touching the code. Its music and sound effects are Notes played
with RARS's MIDI service 31, which the C version calls as `sim_midi_out`, from tables both versions
share note for note. Import `pacman/pacman.asmproj` on the
Projects page, pick a Program, Build and Run, then click the Screen and press space. The Project's
own `README.md` describes the controls and the Files.

`pacman.asmproj` is packed from the folder by `node scripts/pack-example-projects.mjs`, run from
`packages/asm-editor`; pack it again after changing a File. The C Program comes with its Generated
assembly, `c/pacman.c.riscv`, so after changing a C File, Compile `c/pacman.c` in the editor at -O2
and save its assembly into the folder before packing. The RISC-V example tests check that the
archive and the folder agree and that the assembly is current.
