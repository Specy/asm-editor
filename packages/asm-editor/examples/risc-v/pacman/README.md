# Pac-Man

The 1980 arcade game at the arcade's own 224 × 288 pixels, with its music and sound effects,
written twice: in RISC-V assembly in `assembly/`, and in C in `c/`. Both are the same game, and
both read their pictures and maze from the Files in `assets/` when they start.

## Playing

1. Choose the version in the program picker at the right of the bottom panel's tabs: `main.s` is
   the assembly, `pacman.c` the C.
2. **Build**, then **Run**.
3. Click the Screen so it receives the keyboard, then press space.
4. Move with **W A S D**, or **Z Q S D**, or **8 4 5 6** on the number pad. **P** pauses.

Turn your sound on. Once the game has made a sound, the **Sound** button at the end of the bar with
**Build** and **Run** turns it off and on, and **Sound volume** is in **Preferences**.

The arrow keys do not type a character, so the program never sees them. Pac-Man keeps going until
a wall stops him, and he remembers the last direction you pressed, taking it at the next opening.
You can press a key before reaching the turn.

The game follows the arcade:

- Each ghost chases in its own way.
- Scatter and chase modes alternate on a timetable.
- Ghosts slow down in the tunnel.
- Blinky speeds up as the dots run out ("Cruise Elroy").
- Fruit appears after 70 and 170 dots.
- An extra life comes at 10,000 points.
- The arcade's speed and frightened-time table runs up to level 21.

## The assembly version

`assembly/main.s` is the Entry file. RARS's `.include` joins the other Files into it before
assembling, and finds them beside it.

| File          | What it holds                                                                |
| ------------- | ---------------------------------------------------------------------------- |
| `main.s`      | The Screen directive, the main loop and the `.include` lines                 |
| `constants.s` | Names for every number the program uses                                      |
| `data.s`      | The variables, and the arcade's level, speed and timing tables               |
| `assets.s`    | Reads the pictures and the maze with the file services (ecalls 1024, 63, 57) |
| `video.s`     | Drawing: tiles, text, numbers and sprites                                    |
| `maze.s`      | The maze as the game plays it                                                |
| `pacman.s`    | Pac-Man's movement and eating                                                |
| `ghosts.s`    | The ghosts: the house, their targets, frightened mode, collisions            |
| `game.s`      | The game's states, the score, the keyboard and the frame timing              |
| `sound.s`     | The music and the sound effects, and the arcade's sound program on the Synth |

## The C version

`c/pacman.c` includes `pacman.h` and then each other `.c` File with `#include "video.c"` and so
on, `sound.c` before the parts that play its sounds, since they name its tables. **Compile** sends
Compiler Explorer the source and every File its quoted includes reach, so the parts are pasted
into `pacman.c` and compiled as one program, as the assembly version is assembled as one. The
pictures never go to Compiler Explorer: the program reads them in the editor when it runs, with
`fopen` and `fread`.

| File       | What it holds                                                          |
| ---------- | ---------------------------------------------------------------------- |
| `pacman.c` | `main`, the `SIM_SCREEN` line and the includes                         |
| `pacman.h` | The constants, types and prototypes the parts share                    |
| `state.c`  | The variables, and the arcade's level, speed and timing tables         |
| `assets.c` | Reads the pictures and the maze                                        |
| `video.c`  | Drawing                                                                |
| `maze.c`   | The maze as the game plays it                                          |
| `player.c` | Pac-Man                                                                |
| `ghosts.c` | The ghosts                                                             |
| `game.c`   | The game's states, the score, the keyboard and the frame timing        |
| `sound.c`  | The music and the sound effects, and the arcade's sound program        |

`c/pacman.c.riscv` is the program **Build** assembles: Clang's output for `pacman.c` at **-O2**,
which the Project comes with so the C version runs without compiling first. Compile again after
changing a `.c` File, which needs an internet connection. Keep **-O2**: at -O0 every variable lives
in memory, a frame takes about four times the instructions, and the game falls to a crawl.

## The pictures and the maze

| File                 | What it holds                                                                  |
| -------------------- | ------------------------------------------------------------------------------ |
| `assets/sprites.bmp` | Pac-Man, the ghosts, the fruit and the points: 16 × 16 cells, 16 across, 9 down |
| `assets/tiles.bmp`   | The letters and digits (ASCII 32 to 95), then the dot and the energizer: 8 × 8 |
| `assets/maze.bmp`    | The picture of the maze's walls, 224 × 248                                     |
| `assets/maze.txt`    | Where the walls, dots and energizers are: 31 lines of 28 characters            |

Both versions read these Files every time they start. Stop the program, change a picture, then
Build and Run again to see the change. To edit one, download it from the Explorer, change it in a
paint program, and drop it back on the Explorer, which asks before replacing it. It must keep its
size, and be saved as a 24 or 32 bit BMP without compression. A wrong one stops the program with a
message saying which File and what is wrong with it.

Black is transparent in `sprites.bmp`. In a 32 bit BMP with an alpha channel, transparent pixels
are transparent too. Each ghost has its own row, so recoloring one is a matter of painting it.
Row by row, the cells are:

| Row | Cells                                                                           |
| --- | ------------------------------------------------------------------------------- |
| 0   | Pac-Man round, then half open and open facing right, left, up, down             |
| 1   | Pac-Man dying, eleven frames                                                    |
| 2–5 | Blinky, Pinky, Inky, Clyde: two frames each facing right, left, up, down        |
| 6   | Frightened: blue twice, white twice; then the eyes facing right, left, up, down |
| 7   | Cherry, strawberry, peach, apple, melon, Galaxian, bell, key                    |
| 8   | 200, 400, 800, 1600 for ghosts; then 100 to 5000 for the fruit                  |

The letters in `tiles.bmp` are drawn in any color, and the program paints them in its own. Each
glyph sits in the cell of its ASCII code minus 32.

In `maze.txt`, `#` is a wall, `.` a dot, `o` an energizer, a space an empty corridor and `-` the
ghost house door. The program counts the dots, so it knows when the level is over. The side tunnel
is row 14, and the ghost house and the starting places are the arcade's. `maze.bmp` is only the
picture, so a changed wall in `maze.txt` needs the same change painted in `maze.bmp`.

## How it draws

The Screen is 224 × 288 words, one word a pixel, as the `@screen` line at the top of `main.s` and
the `SIM_SCREEN` line of `pacman.c` ask. RARS's own bitmap display only offers power-of-two sizes,
so in RARS itself the picture would come out skewed; this editor takes any size.

Each version keeps a second copy of the picture without the sprites, `background`. Moving a sprite
is then two copies:

- the background back over the pixels the sprite covered last frame;
- the sprite's own pixels at its new place.

Each frame ends with a sleep until the next 1/60 of a second. The sleep is also when the editor
puts the frame on the Screen.

## How it sounds

The sound is the arcade's own, made the arcade's way. The arcade had a Namco wavetable chip with
three voices, each a frequency, a volume from 0 to 15 and one of eight waveforms of 32 four-bit
samples, and its program set all three anew every 1/60 s. The editor's
[Synth](/documentation/risc-v/synth) works the same way: three of its channels play their
wavetables, the same 32 four-bit samples, and the game writes their frequency and volume registers,
at 0xFFFF0100 and up, once a frame. Nothing waits for the sound, and no system call plays it: it is
stores to memory, `sh` and `sb` in `sound.s`, `SIM_SYNTH16` and `SIM_SYNTH8` in `sound.c`.

`update_sounds` is the arcade's sound program, translated: the routines at 0x2D44 and 0x2E6E of
its ROM that play songs and effects. Its tables are the arcade's bytes, as Frédéric Vecoven's
commented listing of the sound code gives them, at
[vecoven.com](https://vecoven.com/elec/pacman/pacman.html), the same numbers in `sound.s` and
`sound.c`:

- An **effect** is 8 bytes on one voice: a starting frequency and how much to add to it each
  frame, how many frames a run lasts and whether it turns back at the end of each, how many runs
  there are, the volume and how it fades, and the octave and the waveform. The siren is a run up
  and down, again and again; a dot is one quick fall or rise.
- A **song** is a byte a note, its pitch and its length, after a few bytes that set the waveform,
  the octave, the volume and how each note fades. The start music is two songs played together.

The chip's frequency becomes Hz as the chip made it: it ran at 96,000 samples a second, adding the
frequency to a 20-bit counter whose top 5 bits picked the sample, so voice 1 sounds at frequency ×
96000 ÷ 2²⁰ Hz, and voices 2 and 3, which hold their frequency 4 bits higher up the counter, at 16
times that. The start music's bass is therefore 67 Hz and its tune starts at 539 Hz.

The chip's eight waveforms were in a PROM. The ones here are drawn with the overtones measured from
it, which set their color and their pitch: a waveform that holds 8 cycles in its 32 samples sounds
3 octaves above the frequency the program sets, which is why the frightened ghosts' climb, low on
paper, is heard high.

Three channels play together, as the arcade's three voices did, each one effect or song at a time.
A new sound on a channel replaces the old one:

| Channel | Plays                                                                                         |
| ------- | --------------------------------------------------------------------------------------------- |
| 1       | The start music's bass; the extra life at 10,000 points                                       |
| 2       | The start music's tune; under the game, the siren, the frightened ghosts, the eyes going home |
| 3       | A dot or an energizer eaten, "wa" and "ka" in turn; the fruit; a ghost; the death             |

Once a frame, just before the sleep, `update_sounds` picks what plays under the game and moves
every channel's effect or song on by one frame. The sound counts frames as the game does, so it
keeps time with the game; a paused game is silent and picks up where it was. Things happen when
they do in the arcade:

- The siren speeds up and rises after 116, 180, 212 and 228 dots.
- The eyes' sound takes the place of the frightened one, which takes the place of the siren.
- PLAYER ONE and READY! last 256 frames between them at the start of a game: as long as the start
  music.
- When Pac-Man is caught, everything stands still in silence for a second, and he is alone for half
  a second. He then shrivels for nine frames of 15 to a sinking wobble, and pops as he vanishes.
