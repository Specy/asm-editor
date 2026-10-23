/*
 * The four ghosts, after the arcade as The Pac-Man Dossier describes it. At every tile centre a
 * ghost picks the open direction, never straight back, whose next tile is nearest its target
 * tile, trying up, left, down, right in that order on a tie. Only the targets differ:
 *
 *   Blinky (red)     Pac-Man's own tile.
 *   Pinky (pink)     four tiles ahead of Pac-Man; when he faces up, also four to the left, as the
 *                    arcade's arithmetic overflow made it.
 *   Inky (cyan)      the tile two ahead of Pac-Man (and two left when he faces up), doubled away
 *                    from Blinky.
 *   Clyde (orange)   Pac-Man's tile while more than eight tiles away, else his own corner.
 *
 * In scatter mode each heads for its corner instead; frightened, they turn at random. Modes change
 * on a timetable, and every change turns the ghosts around.
 */

static void eat_ghost(struct Ghost *ghost);

/* Each ghost at its start, not frightened. Their dot counters are kept. */
static void reset_ghosts(void) {
    for (int i = 0; i < 4; i++) {
        int dots = ghosts[i].dots;
        ghosts[i] = ghost_start[i];
        ghosts[i].dots = dots;
    }
}

static void clear_ghost_counters(void) {
    for (int i = 0; i < 4; i++) ghosts[i].dots = 0;
}

/* The ghost next in line to leave the house, Pinky, then Inky, then Clyde, or none. */
static struct Ghost *waiting_ghost(int *number) {
    for (int i = 1; i < 4; i++)
        if (ghosts[i].state == IN_HOUSE) {
            if (number) *number = i;
            return &ghosts[i];
        }
    return 0;
}

/*
 * Lets the waiting ghost out when its dot counter says so, or when Pac-Man has gone four seconds
 * (three from level 5) without eating. After a death one shared counter releases Pinky at 7 dots
 * and Inky at 17; Clyde still in the house at 32 switches it off.
 */
static void release_ghosts(void) {
    int number;
    struct Ghost *ghost = waiting_ghost(&number);
    if (!ghost) return;
    int release = 0;
    if (++dot_timer >= (level <= 4 ? 240 : 180)) {
        dot_timer = 0;
        release = 1;
    } else if (global_mode) {
        if (number == 1 && global_dots == 7) release = 1;
        else if (number == 2 && global_dots == 17) release = 1;
        else if (number == 3 && global_dots == 32) global_mode = 0;
    } else {
        int limit = number == 2 ? level_info->inky_dots : number == 3 ? level_info->clyde_dots : 0;
        release = ghost->dots >= limit;
    }
    if (release) ghost->state = LEAVING;
}

/*
 * This frame's speed, in 1/256 pixel. Slow in the tunnel, slow and blue when frightened, and Blinky
 * speeds up twice as the dots run out ("Cruise Elroy").
 */
static int ghost_speed(const struct Ghost *ghost, int number) {
    switch (ghost->state) {
    case EYES:
    case ENTERING:
        return EYES_SPEED;
    case IN_HOUSE:
        return HOUSE_SPEED;
    case LEAVING:
        return LEAVING_SPEED;
    }
    int column = ghost->x >> 3, row = ghost->y >> 3;
    if (row == TUNNEL_ROW && (column <= 5 || column >= 22)) return level_info->tunnel_speed;
    if (ghost->fright) return level_info->fright_ghost_speed;
    if (number == 0 && elroy_enabled) {
        if (dots_left <= level_info->elroy2_dots) return level_info->elroy2_speed;
        if (dots_left <= level_info->elroy1_dots) return level_info->elroy1_speed;
    }
    return level_info->ghost_speed;
}

/* The tile a ghost is heading for. */
static void ghost_target(const struct Ghost *ghost, int number, int *target_x, int *target_y) {
    int chase = mode_index & 1;
    /* Blinky as Elroy chases while the others scatter */
    if (!chase && number == 0 && elroy_enabled && dots_left <= level_info->elroy1_dots) chase = 1;
    int pac_column = pac_x >> 3, pac_row = pac_y >> 3;
    int dx = dir_dx[pac_dir], dy = dir_dy[pac_dir];
    *target_x = ghost->scatter_x;
    *target_y = ghost->scatter_y;
    if (!chase) return;
    switch (number) {
    case 0: /* Blinky */
        *target_x = pac_column;
        *target_y = pac_row;
        break;
    case 1: /* Pinky */
        *target_x = pac_column + 4 * dx - (pac_dir == UP ? 4 : 0);
        *target_y = pac_row + 4 * dy;
        break;
    case 2: { /* Inky: Blinky's tile, mirrored through the pivot */
        int pivot_x = pac_column + 2 * dx - (pac_dir == UP ? 2 : 0);
        int pivot_y = pac_row + 2 * dy;
        *target_x = 2 * pivot_x - (ghosts[0].x >> 3);
        *target_y = 2 * pivot_y - (ghosts[0].y >> 3);
        break;
    }
    case 3: { /* Clyde */
        int far_x = (ghost->x >> 3) - pac_column, far_y = (ghost->y >> 3) - pac_row;
        if (far_x * far_x + far_y * far_y >= 64) {
            *target_x = pac_column;
            *target_y = pac_row;
        }
        break;
    }
    }
}

/* A ghost at a tile centre picks where to go next. */
static void choose_direction(struct Ghost *ghost, int number) {
    int column = ghost->x >> 3, row = ghost->y >> 3;
    int back = ghost->dir ^ 1;
    if (ghost->state == EYES && row == 14 && (column == 13 || column == 14)) {
        ghost->dir = column == 13 ? RIGHT : LEFT; /* eyes beside the door turn to it */
        return;
    }
    if (ghost->state == ACTIVE && ghost->fright) {
        /* frightened: a random way that is open, else on round the tie-break order */
        int start = random_number() & 3;
        for (int i = 0; i < 4; i++) {
            int dir = choice_order[(start + i) & 3];
            if (dir != back && is_open(column + dir_dx[dir], row + dir_dy[dir])) {
                ghost->dir = dir;
                return;
            }
        }
        ghost->dir = back;
        return;
    }
    int target_x = 13, target_y = 14; /* eyes head home */
    if (ghost->state != EYES) ghost_target(ghost, number, &target_x, &target_y);
    int best = -1, best_distance = 0;
    for (int i = 0; i < 4; i++) {
        int dir = choice_order[i];
        int next_x = column + dir_dx[dir], next_y = row + dir_dy[dir];
        if (dir == back || !is_open(next_x, next_y)) continue;
        /* no turning up just above the ghost house or Pac-Man's start, eyes excepted */
        if (dir == UP && ghost->state != EYES && (row == 14 || row == 26) &&
            (column == 12 || column == 15))
            continue;
        int distance = (next_x - target_x) * (next_x - target_x) +
                       (next_y - target_y) * (next_y - target_y);
        if (best < 0 || distance < best_distance) { /* a tie keeps the earlier direction */
            best = dir;
            best_distance = distance;
        }
    }
    ghost->dir = best >= 0 ? best : back; /* a dead end: back the way it came */
}

/* One pixel of a ghost. */
static void ghost_step(struct Ghost *ghost, int number) {
    switch (ghost->state) {
    case IN_HOUSE: /* bob up and down */
        if (ghost->dir == UP) {
            if (--ghost->y <= HOUSE_TOP_Y) ghost->dir = DOWN;
        } else {
            if (++ghost->y >= HOUSE_BOTTOM_Y) ghost->dir = UP;
        }
        return;
    case LEAVING: /* to the middle, across to the door, up and out */
        if (ghost->x != HOUSE_DOOR_X) {
            if (ghost->y != HOUSE_MID_Y) {
                ghost->dir = ghost->y < HOUSE_MID_Y ? DOWN : UP;
                ghost->y += toward(ghost->y, HOUSE_MID_Y);
            } else {
                ghost->dir = ghost->x < HOUSE_DOOR_X ? RIGHT : LEFT;
                ghost->x += toward(ghost->x, HOUSE_DOOR_X);
            }
        } else if (--ghost->y > HOUSE_DOOR_Y) {
            ghost->dir = UP;
        } else {
            ghost->dir = LEFT; /* out: they always set off to the left */
            ghost->state = ACTIVE;
            if (number == 3) elroy_enabled = 1; /* Clyde out again: Blinky's Elroy resumes */
        }
        return;
    case ENTERING: /* eyes: down into the house, across to home */
        if (ghost->y < HOUSE_MID_Y) {
            ghost->y++;
            ghost->dir = DOWN;
        } else if (ghost->x != ghost->home_x) {
            ghost->dir = ghost->x < ghost->home_x ? RIGHT : LEFT;
            ghost->x += toward(ghost->x, ghost->home_x);
        } else {
            ghost->state = LEAVING; /* home: a ghost again, and straight back out */
            ghost->fright = 0;
        }
        return;
    }
    /* in the maze: decide at each tile centre, then move */
    if ((ghost->x & 7) == 3 && (ghost->y & 7) == 3) choose_direction(ghost, number);
    ghost->x += dir_dx[ghost->dir];
    ghost->y += dir_dy[ghost->dir];
    if (ghost->x < -8) ghost->x += 240; /* through the tunnel */
    if (ghost->x > 231) ghost->x -= 240;
    if (ghost->state == EYES && ghost->x == HOUSE_DOOR_X && ghost->y == HOUSE_DOOR_Y) {
        ghost->state = ENTERING; /* eyes above the door go in */
        ghost->dir = DOWN;
    }
}

/* One frame of each ghost. */
static void update_ghosts(void) {
    for (int number = 0; number < 4; number++) {
        struct Ghost *ghost = &ghosts[number];
        ghost->acc += ghost_speed(ghost, number);
        int steps = ghost->acc >> 8;
        ghost->acc &= 255;
        while (steps-- > 0) ghost_step(ghost, number);
    }
}

/* Every ghost in the maze turns around, as at every change of mode. */
static void reverse_ghosts(void) {
    for (int i = 0; i < 4; i++)
        if (ghosts[i].state == ACTIVE) ghosts[i].dir ^= 1;
}

/*
 * Pac-Man ate an energizer. The ghosts turn around and, while the level still has a frightened
 * time, turn blue: those in the house too, not the eyes.
 */
static void energize(void) {
    ghosts_eaten = 0;
    reverse_ghosts();
    if (!level_info->fright_frames) return;
    fright_timer = level_info->fright_frames;
    for (int i = 0; i < 4; i++)
        if (ghosts[i].state != EYES && ghosts[i].state != ENTERING) ghosts[i].fright = 1;
}

/*
 * Frightened time, then the scatter and chase timetable, which stands still while the ghosts are
 * blue, then the fruit.
 */
static void update_timers(void) {
    if (fright_timer) {
        if (--fright_timer == 0)
            for (int i = 0; i < 4; i++) ghosts[i].fright = 0; /* blue no more */
    } else if (mode_index < 7 && --mode_timer == 0) {
        /* the eighth mode, chase, never ends */
        if (++mode_index < 7) mode_timer = level_info->modes[mode_index];
        reverse_ghosts();
    }
    if (fruit_timer) fruit_timer--;
    if (fruit_score_timer) fruit_score_timer--;
}

/* A ghost on Pac-Man's tile either is eaten or catches him. */
static void check_collisions(void) {
    int column = pac_x >> 3, row = pac_y >> 3;
    for (int i = 0; i < 4; i++) {
        struct Ghost *ghost = &ghosts[i];
        if (ghost->state != ACTIVE || ghost->x >> 3 != column || ghost->y >> 3 != row) continue;
        if (ghost->fright) eat_ghost(ghost);
        else enter_state(DYING);
        return;
    }
}

/*
 * 200, 400, 800 then 1600 points, and the game stops for a second to show them where the ghost
 * was. The ghost becomes a pair of eyes.
 */
static void eat_ghost(struct Ghost *ghost) {
    ghosts_eaten++;
    add_score(100 << ghosts_eaten);
    ghost->state = EYES;
    ghost->fright = 0;
    eaten_ghost = ghost;
    enter_state(EAT_GHOST);
}

/*
 * The cell of sprites.bmp for a ghost now. Its skirt changes every eight frames; frightened, it
 * flashes white for the last few seconds.
 */
static const uint32_t *ghost_frame(const struct Ghost *ghost) {
    int skirt = (frame_count >> 3) & 1;
    if (ghost->state == EYES || ghost->state == ENTERING) return sheet_cell(4 + ghost->dir, 6);
    if (ghost->fright) {
        int flashing = fright_timer <= level_info->flashes * 28; /* 14 frames white, 14 blue */
        int white = flashing && fright_timer % 28 < 14;
        return sheet_cell(skirt + (white ? 2 : 0), 6);
    }
    return sheet_cell(ghost->dir * 2 + skirt, ghost->sheet_row);
}

/* The next number of a xorshift generator. */
static uint32_t random_number(void) {
    rng_state ^= rng_state << 13;
    rng_state ^= rng_state >> 17;
    rng_state ^= rng_state << 5;
    return rng_state;
}
