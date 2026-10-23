/*
 * The sound: Notes on the editor's synthesizer, played with RARS's MIDI service 31, which starts a
 * Note and goes on at once.
 *
 * The sounds are the arcade's own. The arcade played them on a wavetable chip with three voices,
 * setting each voice's frequency anew every 1/60 s: the siren sweeps up and down, a dot is a quick
 * fall or rise. Each table below is one of those sounds frame by frame, each frame's frequency
 * turned into the nearest Note: a sweep is a Note a frame, and frames that keep one pitch are one
 * longer Note.
 *
 * A table starts with its General MIDI instrument, then has events of four bytes:
 *
 *   pitch   the MIDI note, 60 middle C, each step a semitone
 *   frames  how long the Note lasts, in 1/60 s
 *   volume  0 to 127
 *   wait    frames until the next event; 0 plays the next one with it, as a chord
 *
 * and ends with SOUND_END, or SOUND_REPEAT to start again from its first event. Three channels play
 * together, as the arcade's three voices did, each one table at a time. Every frame, update_sounds
 * plays the events that fall due, so the sound keeps time with the game, not with the computer.
 */

/* The start music on channel 1: the bass, C and G, then a climb to C. */
static const uint8_t music_bass[] = {
    INSTRUMENT_PIANO,
    48, 8, 106, 24,   55, 8, 106, 8,   48, 8, 106, 24,   55, 8, 106, 8,
    49, 8, 106, 24,   56, 8, 106, 8,   49, 8, 106, 24,   56, 8, 106, 8,
    48, 8, 106, 24,   55, 8, 106, 8,   48, 8, 106, 24,   55, 8, 106, 8,
    55, 8, 106, 16,   57, 8, 106, 16,   59, 8, 106, 16,   60, 8, 106, 0,
    SOUND_END
};

/* The start music on channel 2: the tune, short Notes with a rest after each. */
static const uint8_t music_melody[] = {
    INSTRUMENT_TIMPANI,
    72, 4, 127, 8,   84, 4, 127, 8,   79, 4, 127, 8,   76, 4, 127, 8,
    84, 4, 127, 4,   79, 4, 127, 12,   76, 8, 127, 16,   73, 4, 127, 8,
    85, 4, 127, 8,   80, 4, 127, 8,   77, 4, 127, 8,   85, 4, 127, 4,
    80, 4, 127, 12,   77, 8, 127, 16,   72, 4, 127, 8,   84, 4, 127, 8,
    79, 4, 127, 8,   76, 4, 127, 8,   84, 4, 127, 4,   79, 4, 127, 12,
    76, 8, 127, 16,   75, 4, 127, 4,   76, 4, 127, 4,   77, 4, 127, 8,
    77, 4, 127, 4,   78, 4, 127, 4,   79, 4, 127, 8,   79, 4, 127, 4,
    80, 4, 127, 4,   81, 4, 127, 8,   84, 8, 127, 0,
    SOUND_END
};

/* The siren under the game: up and down more than an octave, faster and higher as the dots go. */
static const uint8_t sound_siren_1[] = {
    INSTRUMENT_TIMPANI,
    70, 1, 53, 1,   71, 1, 53, 1,   73, 1, 53, 1,   74, 1, 53, 1,
    75, 1, 53, 1,   77, 1, 53, 1,   78, 1, 53, 1,   79, 1, 53, 1,
    80, 1, 53, 1,   81, 1, 53, 1,   82, 1, 53, 1,   81, 1, 53, 1,
    80, 1, 53, 1,   79, 1, 53, 1,   78, 1, 53, 1,   77, 1, 53, 1,
    75, 1, 53, 1,   74, 1, 53, 1,   73, 1, 53, 1,   71, 1, 53, 1,
    70, 1, 53, 1,   68, 1, 53, 1,   66, 1, 53, 1,   68, 1, 53, 1,
    SOUND_REPEAT
};

/* Siren 2, from the 116th dot eaten. */
static const uint8_t sound_siren_2[] = {
    INSTRUMENT_TIMPANI,
    73, 1, 55, 1,   75, 1, 55, 1,   77, 1, 55, 1,   78, 1, 55, 1,
    79, 1, 55, 1,   80, 1, 55, 1,   82, 1, 55, 1,   83, 1, 55, 1,
    84, 1, 55, 1,   85, 1, 55, 1,   84, 1, 55, 1,   83, 1, 55, 1,
    82, 1, 55, 1,   80, 1, 55, 1,   79, 1, 55, 1,   78, 1, 55, 1,
    77, 1, 55, 1,   75, 1, 55, 1,   73, 1, 55, 1,   72, 1, 55, 1,
    70, 1, 55, 1,   72, 1, 55, 1,
    SOUND_REPEAT
};

/* Siren 3, from the 180th. */
static const uint8_t sound_siren_3[] = {
    INSTRUMENT_TIMPANI,
    77, 1, 59, 1,   78, 1, 59, 1,   80, 1, 59, 1,   81, 1, 59, 1,
    82, 1, 59, 1,   84, 1, 59, 1,   85, 1, 59, 1,   86, 1, 59, 1,
    87, 1, 59, 1,   86, 1, 59, 1,   85, 1, 59, 1,   84, 1, 59, 1,
    82, 1, 59, 1,   81, 1, 59, 1,   80, 1, 59, 1,   78, 1, 59, 1,
    77, 1, 59, 1,   75, 1, 59, 1,   73, 1, 59, 1,   75, 1, 59, 1,
    SOUND_REPEAT
};

/* Siren 4, from the 212th. */
static const uint8_t sound_siren_4[] = {
    INSTRUMENT_TIMPANI,
    80, 1, 61, 1,   82, 1, 61, 1,   83, 1, 61, 1,   85, 1, 61, 1,
    86, 1, 61, 1,   87, 1, 61, 1,   88, 1, 61, 1,   89, 1, 61, 1,
    88, 1, 61, 1,   87, 1, 61, 1,   86, 1, 61, 1,   85, 1, 61, 1,
    83, 1, 61, 1,   82, 1, 61, 1,   80, 1, 61, 1,   79, 1, 61, 1,
    77, 1, 61, 1,   79, 1, 61, 1,
    SOUND_REPEAT
};

/* Siren 5, from the 228th. */
static const uint8_t sound_siren_5[] = {
    INSTRUMENT_TIMPANI,
    83, 1, 64, 1,   85, 1, 64, 1,   86, 1, 64, 1,   87, 1, 64, 1,
    89, 1, 64, 1,   90, 1, 64, 1,   91, 1, 64, 1,   90, 1, 64, 1,
    89, 1, 64, 1,   87, 1, 64, 1,   86, 1, 64, 1,   85, 1, 64, 1,
    83, 1, 64, 1,   82, 1, 64, 1,   80, 1, 64, 1,   82, 1, 64, 1,
    SOUND_REPEAT
};

/* While a ghost is blue: a climb of three octaves, seven and a half times a second. */
static const uint8_t sound_frightened[] = {
    INSTRUMENT_TIMPANI,
    73, 1, 76, 1,   80, 1, 76, 1,   85, 1, 76, 1,   89, 1, 76, 1,
    92, 1, 76, 1,   94, 1, 76, 1,   97, 1, 76, 1,   61, 1, 43, 1,
    SOUND_REPEAT
};

/* While eyes hurry home: a fall from very high, again and again. */
static const uint8_t sound_eyes[] = {
    INSTRUMENT_TIMPANI,
    97, 1, 84, 1,   96, 1, 84, 1,   95, 1, 84, 1,   94, 1, 84, 1,
    93, 1, 84, 1,   91, 1, 84, 1,   90, 1, 84, 1,   88, 1, 84, 1,
    86, 1, 84, 1,   84, 1, 84, 1,   82, 1, 84, 1,   79, 1, 84, 1,
    75, 1, 84, 1,   71, 1, 84, 1,   66, 1, 84, 1,   98, 1, 84, 1,
    SOUND_REPEAT
};

/* A dot eaten: down two octaves in five frames, then up for the next dot, wa and ka in turn. */
static const uint8_t sound_wa[] = {
    INSTRUMENT_TIMPANI,
    82, 1, 116, 1,   80, 1, 116, 1,   77, 1, 116, 1,   73, 1, 116, 1,
    68, 1, 116, 0,
    SOUND_END
};
static const uint8_t sound_ka[] = {
    INSTRUMENT_TIMPANI,
    63, 1, 86, 1,   70, 1, 121, 1,   74, 1, 121, 1,   78, 1, 121, 1,
    81, 1, 121, 0,
    SOUND_END
};

/* The fruit eaten: a dive down to the bottom and back. */
static const uint8_t sound_fruit[] = {
    INSTRUMENT_TIMPANI,
    71, 1, 104, 1,   70, 1, 104, 1,   68, 1, 104, 1,   66, 1, 104, 1,
    63, 1, 74, 1,   61, 1, 58, 1,   58, 1, 41, 1,   54, 1, 26, 1,
    49, 1, 15, 4,   49, 1, 15, 1,   54, 1, 26, 1,   58, 1, 41, 1,
    61, 1, 58, 1,   63, 1, 74, 1,   66, 1, 104, 1,   68, 1, 104, 1,
    70, 1, 104, 1,   71, 1, 104, 1,   73, 1, 104, 1,   74, 1, 104, 0,
    SOUND_END
};

/* A ghost eaten: a climb of five octaves while the game stands still. */
static const uint8_t sound_ghost[] = {
    INSTRUMENT_TIMPANI,
    49, 1, 13, 1,   54, 1, 23, 1,   58, 1, 36, 1,   61, 1, 51, 1,
    63, 1, 64, 1,   66, 1, 90, 1,   68, 1, 90, 1,   70, 1, 90, 1,
    71, 1, 90, 1,   73, 1, 90, 1,   74, 1, 90, 1,   75, 1, 90, 1,
    77, 1, 90, 1,   78, 1, 90, 1,   79, 1, 90, 1,   80, 1, 90, 1,
    81, 1, 90, 1,   82, 2, 90, 2,   83, 1, 90, 1,   84, 1, 90, 1,
    85, 2, 90, 2,   86, 1, 90, 1,   87, 2, 90, 2,   88, 1, 90, 1,
    89, 2, 90, 0,
    SOUND_END
};

/* The extra life at 10,000 points: ten beeps. */
static const uint8_t sound_extra_life[] = {
    INSTRUMENT_BASS,
    66, 11, 88, 11,   66, 12, 88, 12,   66, 12, 88, 12,   66, 12, 88, 12,
    66, 12, 88, 12,   66, 12, 88, 12,   66, 12, 88, 12,   66, 12, 88, 12,
    66, 12, 88, 12,   66, 12, 88, 0,
    SOUND_END
};

/* Pac-Man shrivelling: a wobble that sinks and fades, 135 frames. */
static const uint8_t sound_death[] = {
    INSTRUMENT_BASS,
    77, 2, 79, 2,   76, 1, 79, 1,   75, 3, 79, 3,   76, 1, 79, 1,
    77, 2, 79, 2,   78, 2, 79, 2,   76, 1, 76, 1,   75, 2, 76, 2,
    74, 1, 76, 1,   73, 3, 76, 3,   74, 1, 76, 1,   75, 2, 76, 2,
    76, 1, 76, 1,   77, 1, 76, 1,   75, 1, 74, 1,   74, 1, 74, 1,
    73, 2, 74, 2,   72, 1, 74, 1,   71, 1, 74, 1,   72, 1, 74, 1,
    73, 2, 74, 2,   74, 1, 74, 1,   75, 2, 74, 2,   73, 2, 71, 2,
    72, 1, 71, 1,   71, 1, 71, 1,   70, 3, 71, 3,   71, 1, 71, 1,
    72, 1, 71, 1,   73, 2, 71, 2,   74, 1, 71, 1,   72, 1, 68, 1,
    71, 1, 68, 1,   70, 2, 68, 2,   69, 1, 68, 1,   68, 1, 68, 1,
    69, 1, 68, 1,   70, 2, 68, 2,   71, 1, 68, 1,   72, 1, 68, 1,
    73, 1, 68, 1,   70, 2, 65, 2,   69, 1, 65, 1,   68, 1, 65, 1,
    67, 1, 65, 1,   66, 1, 65, 1,   67, 1, 65, 1,   68, 1, 65, 1,
    69, 1, 65, 1,   70, 2, 65, 2,   71, 1, 65, 1,   69, 1, 61, 1,
    68, 1, 61, 1,   67, 1, 61, 1,   66, 1, 61, 1,   65, 1, 61, 1,
    63, 1, 61, 1,   65, 1, 61, 1,   66, 1, 61, 1,   67, 1, 61, 1,
    68, 1, 61, 1,   69, 1, 61, 1,   70, 1, 61, 1,   67, 1, 58, 1,
    66, 1, 58, 1,   65, 1, 58, 1,   63, 1, 58, 1,   62, 1, 58, 1,
    61, 1, 58, 1,   62, 1, 58, 1,   63, 1, 58, 1,   65, 1, 58, 1,
    66, 1, 58, 1,   67, 1, 58, 1,   68, 1, 58, 1,   65, 1, 54, 1,
    63, 1, 54, 1,   62, 1, 54, 1,   61, 1, 54, 1,   59, 1, 54, 1,
    58, 1, 54, 1,   59, 1, 54, 1,   61, 1, 54, 1,   62, 1, 54, 1,
    63, 1, 54, 1,   65, 1, 54, 1,   66, 1, 54, 1,   62, 1, 50, 1,
    61, 1, 50, 1,   59, 1, 50, 1,   58, 1, 50, 1,   56, 1, 50, 1,
    54, 1, 50, 1,   56, 1, 50, 1,   58, 1, 50, 1,   59, 1, 50, 1,
    61, 1, 50, 1,   62, 1, 50, 1,   63, 1, 50, 1,   59, 1, 46, 1,
    58, 1, 46, 1,   56, 1, 46, 1,   54, 1, 46, 1,   51, 1, 46, 1,
    49, 1, 46, 1,   51, 1, 46, 1,   54, 1, 46, 1,   56, 1, 46, 1,
    58, 1, 46, 1,   59, 1, 46, 1,   61, 1, 46, 1,   56, 1, 41, 1,
    54, 1, 41, 1,   51, 1, 41, 1,   49, 1, 41, 0,
    SOUND_END
};

/* And the pop as he vanishes. */
static const uint8_t sound_pop[] = {
    INSTRUMENT_TIMPANI,
    54, 1, 24, 1,   66, 1, 96, 1,   73, 1, 96, 1,   78, 1, 96, 1,
    82, 1, 96, 1,   85, 1, 96, 1,   87, 1, 96, 1,   90, 1, 96, 1,
    92, 1, 96, 1,   94, 1, 96, 1,   95, 1, 96, 0,
    SOUND_END
};

/* What each channel is playing. */
struct Channel {
    const uint8_t *next;  /* the next event, 0 when the channel is silent */
    const uint8_t *start; /* the table's first event, where SOUND_REPEAT goes back to */
    int wait;             /* frames before the next event */
    int instrument;
};
static struct Channel channels[CHANNEL_COUNT];
static const uint8_t *background_sound; /* the table choose_background last started on channel 2 */
static int chomp_turn;            /* wa or ka next */

/* The sirens, and how many dots must be eaten for each after the first: the arcade's numbers. */
static const uint8_t *const sirens[5] = {
    sound_siren_1, sound_siren_2, sound_siren_3, sound_siren_4, sound_siren_5
};
static const int siren_dots[4] = { 116, 180, 212, 228 };

/* The channel drops what it was playing and plays `table` from its first event, this frame. */
static void play_sound(int channel, const uint8_t *table) {
    channels[channel] = (struct Channel){
        .next = table + 1,
        .start = table + 1,
        .instrument = table[0],
    };
}

/* Every channel falls silent. A Note already playing plays to its end, a few frames at most. */
static void stop_sounds(void) {
    for (int i = 0; i < CHANNEL_COUNT; i++) channels[i] = (struct Channel){ 0 };
    background_sound = 0;
}

/* A dot or an energizer eaten. */
static void play_chomp(void) {
    chomp_turn = !chomp_turn;
    play_sound(CHANNEL_3, chomp_turn ? sound_wa : sound_ka);
}

/*
 * What plays on channel 2 under the game: the eyes while a ghost goes home, or the frightened sound
 * while one is blue, or the siren of the dots eaten. Nothing outside play, and what was playing
 * plays on while the game stands still after a ghost is eaten. A change starts the new table from
 * its beginning.
 */
static void choose_background(void) {
    if (game_state == EAT_GHOST) return;
    const uint8_t *table = 0;
    if (game_state == PLAY) {
        int siren = 0;
        while (siren < 4 && dots_eaten >= siren_dots[siren]) siren++;
        table = sirens[siren];
        for (int i = 0; i < 4; i++) {
            if (ghosts[i].state >= EYES) {
                table = sound_eyes;
                break;
            }
            if (ghosts[i].fright) table = sound_frightened;
        }
    }
    if (table == background_sound) return;
    background_sound = table;
    if (table) play_sound(CHANNEL_2, table);
    else channels[CHANNEL_2].next = 0;
}

/* One frame of sound: every event that falls due, on every channel. A paused game is silent. */
static void update_sounds(void) {
    if (paused) return;
    choose_background();
    for (int i = 0; i < CHANNEL_COUNT; i++) {
        struct Channel *channel = &channels[i];
        while (channel->next) {
            if (channel->wait) {
                channel->wait--;
                break;
            }
            const uint8_t *event = channel->next;
            if (event[0] == SOUND_END) {
                channel->next = 0;
                break;
            }
            if (event[0] == SOUND_REPEAT) {
                channel->next = channel->start;
                continue;
            }
            /* 17 ms a frame, near enough to 16 2/3 */
            sim_midi_out(event[0], event[1] * 17, channel->instrument, event[2]);
            channel->wait = event[3];
            channel->next = event + 4;
        }
    }
}
