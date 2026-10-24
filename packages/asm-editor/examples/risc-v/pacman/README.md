# Pac-Man

1. Choose the version in the program picker at the right of the bottom panel's tabs: `main.s` is the assembly, `pacman.c` the C.
2. **Build**, then **Run**.
3. Click the Screen so it receives the keyboard, then press space.
4. Move with **W A S D**, or **Z Q S D**, or **8 4 5 6** on the number pad. **P** pauses.

## The assembly version

`assembly/main.s` is the Entry file of the game.

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

| File       | What it holds                                                    |
| ---------- | ---------------------------------------------------------------- |
| `pacman.c` | `main`, the `SIM_SCREEN` line and the includes                   |
| `pacman.h` | The constants, types and prototypes the parts share              |
| `state.c`  | The variables, and the arcade's level, speed and timing tables   |
| `assets.c` | Reads the pictures and the maze                                  |
| `video.c`  | Drawing                                                          |
| `maze.c`   | The maze as the game plays it                                    |
| `player.c` | Pac-Man                                                          |
| `ghosts.c` | The ghosts                                                       |
| `game.c`   | The game's states, the score, the keyboard and the frame timing  |
| `sound.c`  | Arcade sound routines, music and effect data, and Synth controls |
