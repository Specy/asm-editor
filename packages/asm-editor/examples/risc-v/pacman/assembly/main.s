# PAC-MAN, in RISC-V assembly for RARS, at the arcade's own 224 by 288 pixels.
#
# @screen unit=1 width=224 height=288 base=display
#
# That comment configures the editor's Screen at every Build: one word a pixel, a 224 by 288
# grid starting at `display`. RARS's own bitmap display only offers power-of-two sizes, so there
# the picture comes out skewed; the editor takes any size.
#
# The pictures are Files of this Project in assets/, read when the program starts: sprites.bmp
# (Pac-Man, the ghosts, the fruit and the points, 16 by 16 each), tiles.bmp (the letters, digits,
# dot and energizer, 8 by 8), maze.bmp (the maze's walls) and maze.txt (where the walls, dots and
# energizers are). Edit them and Build again. The C version in c/ reads the same Files.
#
# Click the Screen to give it the keyboard. W A S D move Pac-Man (Z Q S D and 8 4 5 6 too), P
# pauses, and any key starts a game.
#
# The program is in several Files, which RARS's .include joins into one before assembling it:
#
#   constants.s   names for numbers         maze.s     the maze
#   data.s        variables and tables      pacman.s   Pac-Man
#   assets.s      reading the Files         ghosts.s   the ghosts
#   video.s       drawing                   game.s     states, score, input, frame timing
#   sound.s       the music and the sound effects

        .include "constants.s"

        .data
display:        .space  SCREEN_BYTES            # the Screen, a word a pixel
        .include "data.s"

        .text
main:
        la      a0, text_banner
        li      a7, SYS_PRINT_STRING
        ecall
        jal     load_assets
        jal     init_sounds
        li      a7, SYS_TIME                    # a different game every time
        ecall
        la      t0, rng_state
        lw      t1, 0(t0)
        xor     t1, t1, a0
        bnez    t1, main_seeded
        li      t1, 1
main_seeded:
        sw      t1, 0(t0)
        jal     enter_title
main_loop:
        jal     read_input
        jal     update_game
        jal     render_sprites
        jal     update_sounds
        jal     wait_frame
        j       main_loop

        .include "assets.s"
        .include "video.s"
        .include "maze.s"
        .include "pacman.s"
        .include "ghosts.s"
        .include "game.s"
        .include "sound.s"
