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

Enable sound to hear the game. After the first sound, the **Sound** button beside **Build** and
**Run** mutes or unmutes it. Adjust **Sound volume** in **Preferences**.

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
| `sound.s`     | Arcade sound routines, music and effect data, and Synth controls             |

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
| `sound.c`  | Arcade sound routines, music and effect data, and Synth controls       |

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

The game translates the arcade's sound routines and sound tables to the editor's
[Synth](/documentation/risc-v/synth), using reconstructed waveform data. The arcade had a Namco
wavetable chip with three voices, each with a frequency, a volume from 0 to 15 and one of eight
waveforms containing 32 four-bit samples. Its program updated all three voices every 1/60 s.
Here, Synth channels 0, 1 and 2 use the same wavetable format, and the game writes their frequency
and volume registers once a frame. Nothing waits for the sound, and no system call plays it:
`sound.s` uses `sh` and `sb` stores to registers at `0xFFFF0100` and up; `sound.c` uses
`SIM_SYNTH16` and `SIM_SYNTH8`.

`update_sounds` translates the arcade ROM routines at `0x2D44` and `0x2E6E`, which play songs and
effects. The tables are transcribed from Frédéric Vecoven's
[commented sound-code listing](https://vecoven.com/elec/pacman/pacman.html).
Both `sound.s` and `sound.c` use the same table values:

- An **effect** uses eight packed parameter bytes to control one voice. They describe a pitch
  sweep, its duration and repetition, changes between repetitions, volume and fading, octave and
  waveform. The siren repeats a sweep up and down; a dot makes one quick fall or rise.
- A **song** encodes each note's pitch and duration in one byte, after setup bytes that choose
  the waveform, octave, volume and fading. The start music is two songs played together.

The original chip ran at 96,000 samples per second. It added a frequency register value to a
20-bit phase counter, whose top five bits selected a wavetable sample. To preserve the resulting
pitch, the game converts the arcade register value `f` to a whole-Hz Synth frequency:

- Arcade voice 1: Synth Hz = round(`f` × 96,000 ÷ 2²⁰).
- Arcade voices 2 and 3: Synth Hz = round(`f` × 96,000 ÷ 2¹⁶), because their values occupy counter
  bits four places higher, giving 16 times the frequency for the same `f`.

The start music's bass is therefore 67 Hz and its tune starts at 539 Hz.

The chip's eight waveforms were stored in a PROM. The versions here are reconstructed from measured
overtones, rather than copied sample bytes. Those overtones set the sound's color and pitch: a
waveform that holds 8 cycles in its 32 samples sounds 3 octaves above the frequency the program
sets, which is why the frightened ghosts' climb, low on paper, is heard high.

Each arcade voice maps to one Synth channel and plays one effect or song at a time. A new sound
on that voice replaces the old one:

| Arcade voice | Synth channel | Plays |
| --- | --- | --- |
| 1 | 0 | The start music's bass; the extra life at 10,000 points |
| 2 | 1 | The start music's tune; during play, the siren, the frightened ghosts, the eyes going home |
| 3 | 2 | A dot or an energizer eaten, "wa" and "ka" in turn; the fruit; a ghost; the death |

Once a frame, just before the sleep, `update_sounds` picks what plays under the game and moves
each voice's effect or song on by one frame. The sound counts frames as the game does, so it
keeps time with the game. The game's **P** pause sets the channel volumes to 0 and resumes the
sounds where they were; pausing the editor's debugger instead leaves the Synth sounding. Things
happen when they do in the arcade:

- The siren speeds up and rises after 116, 180, 212 and 228 dots.
- The eyes' sound takes the place of the frightened one, which takes the place of the siren.
- PLAYER ONE and READY! last 256 frames between them at the start of a game: as long as the start
  music.
- When Pac-Man is caught, everything stands still in silence for a second, and he is alone for half
  a second. He then shrivels through nine animation frames, each held for 15 game frames, to a sinking
  wobble, and pops as he vanishes.
