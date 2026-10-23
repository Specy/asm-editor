/*
 * PAC-MAN, in C for RISC-V, at the arcade's own 224 by 288 pixels: the same game as the assembly
 * version in ../assembly, reading the same pictures and maze from ../assets.
 *
 * Compile this File, then Build and Run the assembly it generates. Click the Screen to give it the
 * keyboard. W A S D move Pac-Man (Z Q S D and 8 4 5 6 too), P pauses, and any key starts a game.
 *
 * Compile sends Compiler Explorer this File and every File its quoted includes reach, so the parts
 * below are pasted in here and compiled as one program: each is an ordinary .c File, kept apart
 * only to be read apart. pacman.h declares what they share.
 *
 *   state.c    variables and the arcade's tables    player.c   Pac-Man
 *   assets.c   reading the Files                    ghosts.c   the ghosts
 *   video.c    drawing                              game.c     states, score, input, frame timing
 *   maze.c     the maze
 */
#include <stdio.h>
#include <stdlib.h>
#include <sim.h>

#include "pacman.h"

/* The Screen: one word a pixel, configured by this line at every Build. */
SIM_SCREEN(display, GAME_W, GAME_H, 1);

#include "state.c"
#include "assets.c"
#include "video.c"
#include "maze.c"
#include "player.c"
#include "ghosts.c"
#include "game.c"

int main(void) {
    printf("PAC-MAN for RISC-V, in C\n"
           "Click the Screen so it gets the keyboard, then press space.\n"
           "Move with W A S D (Z Q S D and 8 4 5 6 work too), P pauses.\n"
           "The arrow keys do not type characters, so the game cannot see them.\n");
    load_assets();
    rng_state ^= (uint32_t)sim_time(); /* a different game every time */
    if (!rng_state) rng_state = 1;
    enter_title();
    for (;;) {
        read_input();
        update_game();
        render_sprites();
        wait_frame();
    }
}
