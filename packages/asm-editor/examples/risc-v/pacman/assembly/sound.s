# The sound: Notes on the editor's synthesizer, played with RARS's MIDI service 31, which starts a
# Note and goes on at once.
#
# The sounds are the arcade's own. The arcade played them on a wavetable chip with three voices,
# setting each voice's frequency anew every 1/60 s: the siren sweeps up and down, a dot is a quick
# fall or rise. Each table below is one of those sounds frame by frame, each frame's frequency
# turned into the nearest Note: a sweep is a Note a frame, and frames that keep one pitch are one
# longer Note.
#
# A table starts with its General MIDI instrument, then has events of four bytes:
#
#   pitch   the MIDI note, 60 middle C, each step a semitone
#   frames  how long the Note lasts, in 1/60 s
#   volume  0 to 127
#   wait    frames until the next event; 0 plays the next one with it, as a chord
#
# and ends with SOUND_END, or SOUND_REPEAT to start again from its first event. Three channels play
# together, as the arcade's three voices did, each one table at a time. Every frame, update_sounds
# plays the events that fall due, so the sound keeps time with the game, not with the computer.

        .data
# The start music on channel 1: the bass, C and G, then a climb to C.
music_bass:
        .byte   INSTRUMENT_PIANO
        .byte   48, 8, 106, 24,   55, 8, 106, 8,   48, 8, 106, 24,   55, 8, 106, 8
        .byte   49, 8, 106, 24,   56, 8, 106, 8,   49, 8, 106, 24,   56, 8, 106, 8
        .byte   48, 8, 106, 24,   55, 8, 106, 8,   48, 8, 106, 24,   55, 8, 106, 8
        .byte   55, 8, 106, 16,   57, 8, 106, 16,   59, 8, 106, 16,   60, 8, 106, 0
        .byte   SOUND_END

# The start music on channel 2: the tune, short Notes with a rest after each.
music_melody:
        .byte   INSTRUMENT_TIMPANI
        .byte   72, 4, 127, 8,   84, 4, 127, 8,   79, 4, 127, 8,   76, 4, 127, 8
        .byte   84, 4, 127, 4,   79, 4, 127, 12,   76, 8, 127, 16,   73, 4, 127, 8
        .byte   85, 4, 127, 8,   80, 4, 127, 8,   77, 4, 127, 8,   85, 4, 127, 4
        .byte   80, 4, 127, 12,   77, 8, 127, 16,   72, 4, 127, 8,   84, 4, 127, 8
        .byte   79, 4, 127, 8,   76, 4, 127, 8,   84, 4, 127, 4,   79, 4, 127, 12
        .byte   76, 8, 127, 16,   75, 4, 127, 4,   76, 4, 127, 4,   77, 4, 127, 8
        .byte   77, 4, 127, 4,   78, 4, 127, 4,   79, 4, 127, 8,   79, 4, 127, 4
        .byte   80, 4, 127, 4,   81, 4, 127, 8,   84, 8, 127, 0
        .byte   SOUND_END

# The siren under the game: up and down more than an octave, faster and higher as the dots go.
sound_siren_1:
        .byte   INSTRUMENT_TIMPANI
        .byte   70, 1, 53, 1,   71, 1, 53, 1,   73, 1, 53, 1,   74, 1, 53, 1
        .byte   75, 1, 53, 1,   77, 1, 53, 1,   78, 1, 53, 1,   79, 1, 53, 1
        .byte   80, 1, 53, 1,   81, 1, 53, 1,   82, 1, 53, 1,   81, 1, 53, 1
        .byte   80, 1, 53, 1,   79, 1, 53, 1,   78, 1, 53, 1,   77, 1, 53, 1
        .byte   75, 1, 53, 1,   74, 1, 53, 1,   73, 1, 53, 1,   71, 1, 53, 1
        .byte   70, 1, 53, 1,   68, 1, 53, 1,   66, 1, 53, 1,   68, 1, 53, 1
        .byte   SOUND_REPEAT

# Siren 2, from the 116th dot eaten.
sound_siren_2:
        .byte   INSTRUMENT_TIMPANI
        .byte   73, 1, 55, 1,   75, 1, 55, 1,   77, 1, 55, 1,   78, 1, 55, 1
        .byte   79, 1, 55, 1,   80, 1, 55, 1,   82, 1, 55, 1,   83, 1, 55, 1
        .byte   84, 1, 55, 1,   85, 1, 55, 1,   84, 1, 55, 1,   83, 1, 55, 1
        .byte   82, 1, 55, 1,   80, 1, 55, 1,   79, 1, 55, 1,   78, 1, 55, 1
        .byte   77, 1, 55, 1,   75, 1, 55, 1,   73, 1, 55, 1,   72, 1, 55, 1
        .byte   70, 1, 55, 1,   72, 1, 55, 1
        .byte   SOUND_REPEAT

# Siren 3, from the 180th.
sound_siren_3:
        .byte   INSTRUMENT_TIMPANI
        .byte   77, 1, 59, 1,   78, 1, 59, 1,   80, 1, 59, 1,   81, 1, 59, 1
        .byte   82, 1, 59, 1,   84, 1, 59, 1,   85, 1, 59, 1,   86, 1, 59, 1
        .byte   87, 1, 59, 1,   86, 1, 59, 1,   85, 1, 59, 1,   84, 1, 59, 1
        .byte   82, 1, 59, 1,   81, 1, 59, 1,   80, 1, 59, 1,   78, 1, 59, 1
        .byte   77, 1, 59, 1,   75, 1, 59, 1,   73, 1, 59, 1,   75, 1, 59, 1
        .byte   SOUND_REPEAT

# Siren 4, from the 212th.
sound_siren_4:
        .byte   INSTRUMENT_TIMPANI
        .byte   80, 1, 61, 1,   82, 1, 61, 1,   83, 1, 61, 1,   85, 1, 61, 1
        .byte   86, 1, 61, 1,   87, 1, 61, 1,   88, 1, 61, 1,   89, 1, 61, 1
        .byte   88, 1, 61, 1,   87, 1, 61, 1,   86, 1, 61, 1,   85, 1, 61, 1
        .byte   83, 1, 61, 1,   82, 1, 61, 1,   80, 1, 61, 1,   79, 1, 61, 1
        .byte   77, 1, 61, 1,   79, 1, 61, 1
        .byte   SOUND_REPEAT

# Siren 5, from the 228th.
sound_siren_5:
        .byte   INSTRUMENT_TIMPANI
        .byte   83, 1, 64, 1,   85, 1, 64, 1,   86, 1, 64, 1,   87, 1, 64, 1
        .byte   89, 1, 64, 1,   90, 1, 64, 1,   91, 1, 64, 1,   90, 1, 64, 1
        .byte   89, 1, 64, 1,   87, 1, 64, 1,   86, 1, 64, 1,   85, 1, 64, 1
        .byte   83, 1, 64, 1,   82, 1, 64, 1,   80, 1, 64, 1,   82, 1, 64, 1
        .byte   SOUND_REPEAT

# While a ghost is blue: a climb of three octaves, seven and a half times a second.
sound_frightened:
        .byte   INSTRUMENT_TIMPANI
        .byte   73, 1, 76, 1,   80, 1, 76, 1,   85, 1, 76, 1,   89, 1, 76, 1
        .byte   92, 1, 76, 1,   94, 1, 76, 1,   97, 1, 76, 1,   61, 1, 43, 1
        .byte   SOUND_REPEAT

# While eyes hurry home: a fall from very high, again and again.
sound_eyes:
        .byte   INSTRUMENT_TIMPANI
        .byte   97, 1, 84, 1,   96, 1, 84, 1,   95, 1, 84, 1,   94, 1, 84, 1
        .byte   93, 1, 84, 1,   91, 1, 84, 1,   90, 1, 84, 1,   88, 1, 84, 1
        .byte   86, 1, 84, 1,   84, 1, 84, 1,   82, 1, 84, 1,   79, 1, 84, 1
        .byte   75, 1, 84, 1,   71, 1, 84, 1,   66, 1, 84, 1,   98, 1, 84, 1
        .byte   SOUND_REPEAT

# A dot eaten: down two octaves in five frames, then up for the next dot, wa and ka in turn.
sound_wa:
        .byte   INSTRUMENT_TIMPANI
        .byte   82, 1, 116, 1,   80, 1, 116, 1,   77, 1, 116, 1,   73, 1, 116, 1
        .byte   68, 1, 116, 0
        .byte   SOUND_END
sound_ka:
        .byte   INSTRUMENT_TIMPANI
        .byte   63, 1, 86, 1,   70, 1, 121, 1,   74, 1, 121, 1,   78, 1, 121, 1
        .byte   81, 1, 121, 0
        .byte   SOUND_END

# The fruit eaten: a dive down to the bottom and back.
sound_fruit:
        .byte   INSTRUMENT_TIMPANI
        .byte   71, 1, 104, 1,   70, 1, 104, 1,   68, 1, 104, 1,   66, 1, 104, 1
        .byte   63, 1, 74, 1,   61, 1, 58, 1,   58, 1, 41, 1,   54, 1, 26, 1
        .byte   49, 1, 15, 4,   49, 1, 15, 1,   54, 1, 26, 1,   58, 1, 41, 1
        .byte   61, 1, 58, 1,   63, 1, 74, 1,   66, 1, 104, 1,   68, 1, 104, 1
        .byte   70, 1, 104, 1,   71, 1, 104, 1,   73, 1, 104, 1,   74, 1, 104, 0
        .byte   SOUND_END

# A ghost eaten: a climb of five octaves while the game stands still.
sound_ghost:
        .byte   INSTRUMENT_TIMPANI
        .byte   49, 1, 13, 1,   54, 1, 23, 1,   58, 1, 36, 1,   61, 1, 51, 1
        .byte   63, 1, 64, 1,   66, 1, 90, 1,   68, 1, 90, 1,   70, 1, 90, 1
        .byte   71, 1, 90, 1,   73, 1, 90, 1,   74, 1, 90, 1,   75, 1, 90, 1
        .byte   77, 1, 90, 1,   78, 1, 90, 1,   79, 1, 90, 1,   80, 1, 90, 1
        .byte   81, 1, 90, 1,   82, 2, 90, 2,   83, 1, 90, 1,   84, 1, 90, 1
        .byte   85, 2, 90, 2,   86, 1, 90, 1,   87, 2, 90, 2,   88, 1, 90, 1
        .byte   89, 2, 90, 0
        .byte   SOUND_END

# The extra life at 10,000 points: ten beeps.
sound_extra_life:
        .byte   INSTRUMENT_BASS
        .byte   66, 11, 88, 11,   66, 12, 88, 12,   66, 12, 88, 12,   66, 12, 88, 12
        .byte   66, 12, 88, 12,   66, 12, 88, 12,   66, 12, 88, 12,   66, 12, 88, 12
        .byte   66, 12, 88, 12,   66, 12, 88, 0
        .byte   SOUND_END

# Pac-Man shrivelling: a wobble that sinks and fades, 135 frames.
sound_death:
        .byte   INSTRUMENT_BASS
        .byte   77, 2, 79, 2,   76, 1, 79, 1,   75, 3, 79, 3,   76, 1, 79, 1
        .byte   77, 2, 79, 2,   78, 2, 79, 2,   76, 1, 76, 1,   75, 2, 76, 2
        .byte   74, 1, 76, 1,   73, 3, 76, 3,   74, 1, 76, 1,   75, 2, 76, 2
        .byte   76, 1, 76, 1,   77, 1, 76, 1,   75, 1, 74, 1,   74, 1, 74, 1
        .byte   73, 2, 74, 2,   72, 1, 74, 1,   71, 1, 74, 1,   72, 1, 74, 1
        .byte   73, 2, 74, 2,   74, 1, 74, 1,   75, 2, 74, 2,   73, 2, 71, 2
        .byte   72, 1, 71, 1,   71, 1, 71, 1,   70, 3, 71, 3,   71, 1, 71, 1
        .byte   72, 1, 71, 1,   73, 2, 71, 2,   74, 1, 71, 1,   72, 1, 68, 1
        .byte   71, 1, 68, 1,   70, 2, 68, 2,   69, 1, 68, 1,   68, 1, 68, 1
        .byte   69, 1, 68, 1,   70, 2, 68, 2,   71, 1, 68, 1,   72, 1, 68, 1
        .byte   73, 1, 68, 1,   70, 2, 65, 2,   69, 1, 65, 1,   68, 1, 65, 1
        .byte   67, 1, 65, 1,   66, 1, 65, 1,   67, 1, 65, 1,   68, 1, 65, 1
        .byte   69, 1, 65, 1,   70, 2, 65, 2,   71, 1, 65, 1,   69, 1, 61, 1
        .byte   68, 1, 61, 1,   67, 1, 61, 1,   66, 1, 61, 1,   65, 1, 61, 1
        .byte   63, 1, 61, 1,   65, 1, 61, 1,   66, 1, 61, 1,   67, 1, 61, 1
        .byte   68, 1, 61, 1,   69, 1, 61, 1,   70, 1, 61, 1,   67, 1, 58, 1
        .byte   66, 1, 58, 1,   65, 1, 58, 1,   63, 1, 58, 1,   62, 1, 58, 1
        .byte   61, 1, 58, 1,   62, 1, 58, 1,   63, 1, 58, 1,   65, 1, 58, 1
        .byte   66, 1, 58, 1,   67, 1, 58, 1,   68, 1, 58, 1,   65, 1, 54, 1
        .byte   63, 1, 54, 1,   62, 1, 54, 1,   61, 1, 54, 1,   59, 1, 54, 1
        .byte   58, 1, 54, 1,   59, 1, 54, 1,   61, 1, 54, 1,   62, 1, 54, 1
        .byte   63, 1, 54, 1,   65, 1, 54, 1,   66, 1, 54, 1,   62, 1, 50, 1
        .byte   61, 1, 50, 1,   59, 1, 50, 1,   58, 1, 50, 1,   56, 1, 50, 1
        .byte   54, 1, 50, 1,   56, 1, 50, 1,   58, 1, 50, 1,   59, 1, 50, 1
        .byte   61, 1, 50, 1,   62, 1, 50, 1,   63, 1, 50, 1,   59, 1, 46, 1
        .byte   58, 1, 46, 1,   56, 1, 46, 1,   54, 1, 46, 1,   51, 1, 46, 1
        .byte   49, 1, 46, 1,   51, 1, 46, 1,   54, 1, 46, 1,   56, 1, 46, 1
        .byte   58, 1, 46, 1,   59, 1, 46, 1,   61, 1, 46, 1,   56, 1, 41, 1
        .byte   54, 1, 41, 1,   51, 1, 41, 1,   49, 1, 41, 0
        .byte   SOUND_END

# And the pop as he vanishes.
sound_pop:
        .byte   INSTRUMENT_TIMPANI
        .byte   54, 1, 24, 1,   66, 1, 96, 1,   73, 1, 96, 1,   78, 1, 96, 1
        .byte   82, 1, 96, 1,   85, 1, 96, 1,   87, 1, 96, 1,   90, 1, 96, 1
        .byte   92, 1, 96, 1,   94, 1, 96, 1,   95, 1, 96, 0
        .byte   SOUND_END

        .align  2
# The sirens, and how many dots must be eaten for each after the first: the arcade's numbers.
sirens:         .word   sound_siren_1, sound_siren_2, sound_siren_3, sound_siren_4, sound_siren_5
siren_dots:     .word   116, 180, 212, 228

# What each channel is playing: CHANNEL_COUNT records of CH_SIZE bytes.
channels:       .space  48
background_sound:.word  0                       # the table choose_background last started
chomp_turn:     .word   0                       # wa or ka next

        .text
# play_sound(a0 = channel, a1 = table): the channel drops what it was playing and plays the table
# from its first event, this frame.
play_sound:
        slli    a0, a0, 4                       # CH_SIZE
        la      t0, channels
        add     t0, t0, a0
        lbu     t1, 0(a1)                       # the table's instrument
        sw      t1, CH_INSTRUMENT(t0)
        addi    a1, a1, 1                       # and its first event
        sw      a1, CH_NEXT(t0)
        sw      a1, CH_START(t0)
        sw      zero, CH_WAIT(t0)
        ret

# stop_sounds: every channel falls silent. A Note already playing plays to its end, a few frames
# at most.
stop_sounds:
        la      t0, channels
        li      t1, CHANNEL_COUNT
ss_loop:
        sw      zero, CH_NEXT(t0)
        addi    t0, t0, CH_SIZE
        addi    t1, t1, -1
        bnez    t1, ss_loop
        la      t0, background_sound
        sw      zero, 0(t0)
        ret

# play_chomp: a dot or an energizer eaten.
play_chomp:
        la      t0, chomp_turn
        lw      t1, 0(t0)
        xori    t1, t1, 1
        sw      t1, 0(t0)
        li      a0, CHANNEL_3
        la      a1, sound_wa
        bnez    t1, play_sound
        la      a1, sound_ka
        j       play_sound

# choose_background: what plays on channel 2 under the game: the eyes while a ghost goes home, or
# the frightened sound while one is blue, or the siren of the dots eaten. Nothing outside play, and
# what was playing plays on while the game stands still after a ghost is eaten. A change starts the
# new table from its beginning.
choose_background:
        la      t0, game_state
        lw      t0, 0(t0)
        li      t1, ST_EAT_GHOST
        beq     t0, t1, cb_done
        li      a1, 0                           # the table, none yet
        li      t1, ST_PLAY
        bne     t0, t1, cb_chosen
        la      t0, dots_eaten
        lw      t0, 0(t0)
        la      t1, siren_dots
        la      a1, sirens
        li      t2, 4
cb_siren:
        lw      t3, 0(t1)
        blt     t0, t3, cb_siren_found
        addi    t1, t1, 4
        addi    a1, a1, 4
        addi    t2, t2, -1
        bnez    t2, cb_siren
cb_siren_found:
        lw      a1, 0(a1)
        la      t0, ghosts
        li      t1, GHOST_COUNT
cb_ghost:
        lw      t2, G_STATE(t0)
        li      t3, GS_EYES
        bge     t2, t3, cb_eyes                 # eyes, or eyes entering the house
        lw      t2, G_FRIGHT(t0)
        beqz    t2, cb_next
        la      a1, sound_frightened
cb_next:
        addi    t0, t0, G_SIZE
        addi    t1, t1, -1
        bnez    t1, cb_ghost
        j       cb_chosen
cb_eyes:
        la      a1, sound_eyes
cb_chosen:
        la      t0, background_sound
        lw      t1, 0(t0)
        beq     a1, t1, cb_done
        sw      a1, 0(t0)
        li      a0, CHANNEL_2
        bnez    a1, play_sound
        la      t0, channels                    # no table: channel 2 falls silent
        addi    t0, t0, CH_SIZE
        sw      zero, CH_NEXT(t0)
cb_done:
        ret

# update_sounds: one frame of sound, every event that falls due, on every channel. A paused game
# is silent.
update_sounds:
        la      t0, paused
        lw      t0, 0(t0)
        bnez    t0, us_return
        addi    sp, sp, -16
        sw      ra, 12(sp)
        sw      s0, 8(sp)
        sw      s1, 4(sp)
        jal     choose_background
        la      s0, channels
        li      s1, CHANNEL_COUNT
us_channel:
        lw      t0, CH_NEXT(s0)
        beqz    t0, us_next_channel             # silent
        lw      t1, CH_WAIT(s0)
        beqz    t1, us_event
        addi    t1, t1, -1                      # not yet
        sw      t1, CH_WAIT(s0)
        j       us_next_channel
us_event:
        lbu     a0, 0(t0)                       # the pitch
        bnez    a0, us_not_end                  # SOUND_END is 0
        sw      zero, CH_NEXT(s0)
        j       us_next_channel
us_not_end:
        li      t1, SOUND_REPEAT
        bne     a0, t1, us_play
        lw      t0, CH_START(s0)
        sw      t0, CH_NEXT(s0)
        j       us_event
us_play:
        lbu     a1, 1(t0)                       # frames, to milliseconds: 17 ms a frame, near
        slli    t1, a1, 4                       # enough to 16 2/3
        add     a1, a1, t1
        lw      a2, CH_INSTRUMENT(s0)
        lbu     a3, 2(t0)                       # the volume
        lbu     t1, 3(t0)                       # frames until the next event
        sw      t1, CH_WAIT(s0)
        addi    t0, t0, 4
        sw      t0, CH_NEXT(s0)
        li      a7, SYS_MIDI_OUT
        ecall
        j       us_channel                      # the next event, if it plays now too
us_next_channel:
        addi    s0, s0, CH_SIZE
        addi    s1, s1, -1
        bnez    s1, us_channel
        lw      ra, 12(sp)
        lw      s0, 8(sp)
        lw      s1, 4(sp)
        addi    sp, sp, 16
us_return:
        ret
