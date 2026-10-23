/*
 * The game's states, from the title to the game over, and everything drawn around the maze: the
 * score, the lives, the fruit. Also the keyboard and the frame timing.
 */

static void draw_hud(void);
static void draw_lives(void);
static void begin_life(int intro);

static void enter_state(int state) {
    game_state = state;
    state_timer = 0;
}

/* A full maze, the scores of the last game, and PUSH SPACE. */
static void enter_title(void) {
    level = 0; /* no lives and no fruit at the bottom */
    lives = 0;
    reset_maze();
    draw_maze();
    draw_hud();
    draw_text("PUSH SPACE", 9, 14, COLOR_ORANGE);
    key_pressed = 0;
    enter_state(TITLE);
}

/* A full maze, and the level's settings. `intro` shows PLAYER ONE first. */
static void start_level(int intro) {
    level_info = &level_table[(level < LEVEL_TABLE_LAST ? level : LEVEL_TABLE_LAST) - 1];
    reset_maze();
    clear_ghost_counters();
    global_mode = 0;
    elroy_enabled = 1;
    fruit_timer = fruit_score_timer = 0;
    draw_maze();
    draw_hud();
    begin_life(intro);
}

/* Three Pac-Men, one playing and two spare, from level 1. */
static void start_game(void) {
    score = 0;
    extra_life_given = 0;
    lives = 2;
    level = 1;
    start_level(1);
}

/*
 * Everyone back at the start, and READY!, after PLAYER ONE when `intro` says so: then the start
 * music plays, and the two last as long as it does.
 */
static void begin_life(int intro) {
    stop_sounds();
    reset_pacman();
    reset_ghosts();
    mode_index = 0;
    mode_timer = level_info->modes[0];
    fright_timer = ghosts_eaten = dot_timer = paused = 0;
    energizers_lit = 1;
    draw_energizers(1);
    draw_text("READY!", 11, 20, COLOR_YELLOW);
    show_actors = !intro; /* no one on the maze until PLAYER ONE goes */
    ready_intro = intro ? 136 : 0;
    if (intro) {
        draw_text("PLAYER ONE", 9, 14, COLOR_CYAN);
        play_sound(CHANNEL_1, music_bass);
        play_sound(CHANNEL_2, music_melody);
    }
    enter_state(READY);
}

static void ready_update(void) {
    state_timer++;
    if (ready_intro && state_timer == ready_intro) {
        clear_text(9, 14, 10); /* PLAYER ONE goes and the actors come */
        show_actors = 1;
    } else if (state_timer >= ready_intro + 120) {
        clear_text(11, 20, 6);
        enter_state(PLAY);
    }
}

static void play_update(void) {
    if (pause_requested) {
        pause_requested = 0;
        paused = !paused;
        if (paused) draw_text("PAUSED", 11, 20, COLOR_YELLOW);
        else clear_text(11, 20, 6);
    }
    if (paused) return;
    update_pacman();
    if (game_state != PLAY) return;
    check_collisions();
    if (game_state != PLAY) return;
    update_ghosts();
    check_collisions();
    if (game_state != PLAY) return;
    release_ghosts();
    update_timers();
    if (frame_count % 10 == 0) draw_energizers(energizers_lit = !energizers_lit);
}

/*
 * The arcade's death: everything still for a second, Pac-Man alone for half a second, then nine
 * frames of shrivelling to the falling wobble, and the pop as he vanishes.
 */
static void dying_update(void) {
    int t = ++state_timer;
    if (t == 90) play_sound(CHANNEL_3, sound_death);
    if (t == 225) play_sound(CHANNEL_3, sound_pop);
    if (t < 300) return;
    if (!lives) {
        draw_text("GAME  OVER", 9, 20, COLOR_RED);
        enter_state(GAME_OVER);
        return;
    }
    lives--;
    draw_lives();
    global_mode = 1; /* the house now runs on one shared counter */
    global_dots = 0;
    elroy_enabled = 0; /* until Clyde is out again */
    fruit_timer = fruit_score_timer = 0;
    begin_life(0);
}

static void level_done_update(void) {
    int t = ++state_timer;
    if (t < 60) return;
    if (t < 156) {
        /* every 12 frames, white then blue, four times */
        if ((t - 60) % 12 == 0) flash_walls(((t - 60) / 12 & 1) == 0);
        return;
    }
    flash_walls(0);
    level++;
    start_level(0);
}

static void game_over_update(void) {
    int t = ++state_timer;
    if (t < 60) {
        key_pressed = 0; /* keys from the last second of play do not count */
        return;
    }
    if (key_pressed || t >= 300) enter_title();
}

/* The score, the extra life at 10,000 and the high score. */
static void add_score(int points) {
    score += points;
    if (!extra_life_given && score >= 10000) {
        extra_life_given = 1;
        lives++;
        draw_lives();
        play_sound(CHANNEL_1, sound_extra_life);
    }
    if (score > high_score) {
        high_score = score;
        draw_number(high_score, 16, 1, 7, 2);
    }
    draw_number(score, 6, 1, 7, 2);
}

/* A Pac-Man for each spare life, five at most, at the bottom left. */
static void draw_lives(void) {
    restore_rect(0, 272, 112, 16);
    for (int i = 0; i < lives && i < 5; i++) stamp_sprite(16 + 16 * i, 272, sheet_cell(3, 0));
}

/* The fruit of this level and up to six before it, newest on the right. */
static void draw_level_fruits(void) {
    restore_rect(112, 272, 112, 16);
    for (int i = 0; i < 7 && level - i > 0; i++) {
        int number = level - i < LEVEL_TABLE_LAST ? level - i : LEVEL_TABLE_LAST;
        stamp_sprite(192 - 16 * i, 272, sheet_cell(level_table[number - 1].fruit, 7));
    }
}

/* The two score rows at the top and the icons at the bottom. */
static void draw_hud(void) {
    draw_text("1UP", 3, 0, COLOR_WHITE);
    oneup_lit = 1;
    draw_text("HIGH SCORE", 9, 0, COLOR_WHITE);
    draw_number(score, 6, 1, 7, 2);
    draw_number(high_score, 16, 1, 7, high_score ? 2 : 0); /* blank until there is one */
    draw_lives();
    draw_level_fruits();
}

/* 1UP blinks while a game is on and stays lit otherwise. */
static void blink_1up(void) {
    int lit = game_state == TITLE || game_state == GAME_OVER || !((frame_count >> 4) & 1);
    if (lit == oneup_lit) return;
    oneup_lit = lit;
    if (lit) draw_text("1UP", 3, 0, COLOR_WHITE);
    else clear_text(3, 0, 3);
}

/* Which sprites this frame shows, and where. */
static void compose_sprites(void) {
    hide_slots();
    if (game_state == TITLE || game_state == GAME_OVER) return;
    int fruit = 0;
    int pacman = 0; /* 0 none, 1 round, 2 moving, 3 dying */
    int ghosts_shown = 0;
    switch (game_state) {
    case READY:
        pacman = ghosts_shown = show_actors;
        break;
    case PLAY:
        fruit = ghosts_shown = 1;
        pacman = 2;
        break;
    case EAT_GHOST: /* Pac-Man is hidden while the points show */
        fruit = ghosts_shown = 1;
        break;
    case DYING: /* a second still, then Pac-Man alone */
        fruit = ghosts_shown = state_timer < 60;
        pacman = state_timer < 60 ? 2 : 3;
        break;
    case LEVEL_DONE: /* round, the ghosts gone after a second */
        pacman = 1;
        ghosts_shown = state_timer < 60;
        break;
    }
    if (fruit && fruit_timer)
        set_slot(SLOT_FRUIT, sheet_cell(level_info->fruit, 7), FRUIT_X, FRUIT_Y);
    else if (fruit && fruit_score_timer) /* or its points */
        set_slot(SLOT_FRUIT, sheet_cell(4 + level_info->fruit, 8), FRUIT_X, FRUIT_Y);
    const uint32_t *pacman_cell = 0;
    if (pacman == 1) pacman_cell = sheet_cell(0, 0);
    else if (pacman == 2) pacman_cell = pacman_frame();
    else if (pacman == 3 && state_timer < 255) { /* the first, nine of 15 frames, then the pop */
        int cell = state_timer < 90 ? 0 : state_timer < 225 ? 1 + (state_timer - 90) / 15 : 10;
        pacman_cell = sheet_cell(cell, 1);
    }
    if (pacman_cell) set_slot(SLOT_PACMAN, pacman_cell, pac_x, pac_y);
    if (!ghosts_shown) return;
    for (int number = 0; number < 4; number++) {
        const struct Ghost *ghost = &ghosts[number];
        const uint32_t *cell = game_state == EAT_GHOST && ghost == eaten_ghost
                                   ? sheet_cell(ghosts_eaten - 1, 8) /* its points */
                                   : ghost_frame(ghost);
        set_slot(5 - number, cell, ghost->x, ghost->y); /* Blinky last, on top */
    }
}

/* One frame of whichever state the game is in, then the sprites it shows. */
static void update_game(void) {
    if (!paused) frame_count++; /* a paused game stands still, skirts and all */
    if (game_state != PLAY) pause_requested = 0; /* P only means something during play */
    switch (game_state) {
    case TITLE:
        if (key_pressed) {
            key_pressed = 0;
            start_game();
        }
        break;
    case READY:
        ready_update();
        break;
    case PLAY:
        play_update();
        break;
    case EAT_GHOST:
        if (++state_timer >= 60) enter_state(PLAY);
        break;
    case DYING:
        dying_update();
        break;
    case LEVEL_DONE:
        level_done_update();
        break;
    case GAME_OVER:
        game_over_update();
        break;
    }
    blink_1up();
    compose_sprites();
}

/*
 * Every character typed since the last frame, from the keyboard's memory-mapped registers. The
 * last direction key wins: W A S D, Z Q S D, or 8 4 5 6 (and 2) on the number pad. P pauses.
 */
static void read_input(void) {
    while (sim_keyboard_ready()) {
        int key = sim_keyboard_read() & 0xff;
        key_pressed = 1;
        if (key >= 'A' && key <= 'Z') key += 'a' - 'A';
        switch (key) {
        case 'w': case 'z': case '8':
            pac_want = UP;
            break;
        case 'a': case 'q': case '4':
            pac_want = LEFT;
            break;
        case 's': case '2': case '5':
            pac_want = DOWN;
            break;
        case 'd': case '6':
            pac_want = RIGHT;
            break;
        case 'p':
            pause_requested = 1;
            break;
        }
    }
}

/*
 * Sleeps until this frame's 1/60 s is up. The deadline moves on by 16 2/3 ms a frame; a frame that
 * ran late sleeps for no time at all, and one a long way off the deadline, after the program was
 * paused, starts the count again. The sleep is also what puts the frame on the Screen.
 */
static void wait_frame(void) {
    uint32_t now = (uint32_t)sim_time();
    next_deadline += 16;
    if ((deadline_thirds += 2) >= 3) {
        deadline_thirds -= 3;
        next_deadline++;
    }
    int32_t left = (int32_t)(next_deadline - now);
    if (left > 100 || left < -100) {
        next_deadline = now + 16;
        left = 16;
    } else if (left < 0) {
        left = 0;
    }
    sim_sleep(left);
}
