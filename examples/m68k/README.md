# M68K screen, keyboard and mouse examples

Programs for the manual verification matrix in [`docs/manual-verification.md`](../../docs/manual-verification.md). Open one in an M68K project, Build, then Run.

## The programs

| File                  | What it exercises                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `graphics-tour.x68`   | Every drawing task: 80 to 96, plus the text cursor of task 11 and the screen size of task 33          |
| `bouncing-ball.x68`   | Double buffering (task 92 mode 17 and task 94) and program time (task 23)                             |
| `keyboard-move.x68`   | Key state polling (task 19) and text printed to the transcript and the screen at once                 |
| `mouse-paint.x68`     | Mouse reading (task 61), its flags byte and its screen pixel coordinates                              |

`bouncing-ball.x68`, `keyboard-move.x68` and `mouse-paint.x68` run until you press Stop.

## `flappy-bird.x68`: a game

`flappy-bird.x68` It is a playable flappy bird built out of the same tasks the others check one at a time: double buffering (92 mode 17 and 94), the delay (23), key state (19), the mouse (61) and text drawn at a pixel position (95). Build it, Run it, click the screen panel so it has the keyboard, then tap SPACE to flap.

It runs until you press Stop. A frame costs about 61 instructions, so the default two million instruction limit ends it after roughly a quarter of an hour; set "Instruction execution limit" to 0 in the settings to play longer than that.

The M68K course's [Flappy bird](../../src/content/m68k/examples/flappy-bird/index.md) Example page carries the same program in its playground, so a change here belongs there too.

## `easy68k/`: the reference programs

`easy68k/` holds three of EASy68K's own example programs, unchanged apart from their line endings. They are the compatibility reference of [ADR 0003](../../docs/adr/0003-preserve-simulator-graphics-conventions.md): what a task draws here is compared against what these draw in EASy68K itself.

They are compatibility inputs rather than runnable examples. The assembler now accepts their `SIMHALT`, `END START`, `OPT` and `SECTION` directives; the remaining build errors identify the macros and structured-control statements (`if.l … endi`, `repeat … until`) that are deliberately not implemented. They also call simulator tasks this editor rejects at runtime on purpose (sound, the hardware window, the mouse IRQ). `graphics-tour.x68` is the runnable port of `graphicSound.X68`, and `mouse-paint.x68` covers what `mouseWindowSize.X68` demonstrates about task 61.

| File                       | Author       | Demonstrates                                              |
| -------------------------- | ------------ | --------------------------------------------------------- |
| `easy68k/graphicSound.X68` | Chuck Kelly  | Tasks 80 to 93, the drawing modes, and the sound tasks    |
| `easy68k/mouseWindowSize.X68` | Chuck Kelly | Tasks 60, 61 and 33: mouse state, IRQs and window size |
| `easy68k/clockDigital.X68` | Chuck Kelly  | Tasks 8, 23 and the graphics tasks, as an animated clock  |

Source: the `Examples` folder of the EASy68K distribution, <http://www.easy68k.com/files/EASy68K.zip> (version 5.16.1), whose sources are also published at <https://github.com/ProfKelly/EASy68K>.

License: EASy68K is distributed under the GNU General Public License. Portions are Copyright (C) 2002-2018 Charles Kelly and Tim Larson. The GPL is compatible with this repository's AGPL-3.0.
