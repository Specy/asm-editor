# The sound: the arcade's own sound program, played on the editor's Synth.
#
# The arcade made its sound with a Namco wavetable chip of three voices, each a frequency, a volume
# from 0 to 15 and one of eight waveforms of 32 four-bit samples. Its program sets the three anew
# every 1/60 s from two kinds of table, and this file is that program, table for table:
#
# An effect is 8 bytes, played on one voice:
#
#   0  bits 4-6: the octave, a shift of the frequency; bits 0-2: the waveform
#   1  the starting frequency
#   2  added to the frequency every frame
#   3  bit 7: turn back at the end of each run, a round trip; bits 0-6: frames a run lasts
#   4  added to the starting frequency after each round, for the next one
#   5  how many runs before the effect ends; 0 never ends
#   6  bits 4-7: how the volume fades; bits 0-3: the volume
#   7  added to the volume after each round
#
# A song is bytes on two voices at once. Most are a note, bits 5-7 its length in frames as a power
# of two and bits 0-3 its pitch in note_frequencies, 0 a rest; bit 4 plays it an octave up. Before
# the notes, F1 sets the waveform, F2 the octave, F3 the volume and F4 how it fades; FF ends it.
#
# The tables are the arcade's bytes, as Frédéric Vecoven's commented listing of its sound code
# gives them (vecoven.com/elec/pacman), the same numbers as in sound.c. The Synth plays a voice the
# way the chip did: a channel set to its wavetable, its frequency and volume written every frame.
# Its wavetable holds 32 samples of 4 bits, the chip's own format. The chip's eight waveforms were
# in a PROM; the ones below are drawn with the overtones measured from it, which set their color
# and their pitch: some hold several cycles in their 32 samples, and sound that many times the
# frequency the program sets.

        .data
# The arcade's eight waveforms, 32 samples of 0 to 15, the first of each pair in the high half.
waveforms:
        # 0: a sine, for the start music's tune, the eyes and the pop
        .byte   0x89, 0xac, 0xde, 0xef, 0xff, 0xee, 0xdc, 0xa9, 0x86, 0x53, 0x21, 0x10, 0x00, 0x11, 0x23, 0x56
        # 1: a sine with its octave and double octave, for the death
        .byte   0x8c, 0xef, 0xec, 0xaa, 0xbc, 0xb9, 0x74, 0x35, 0x7a, 0xcb, 0x86, 0x43, 0x45, 0x53, 0x10, 0x13
        # 2: bright, sounding an octave up, for the start music's bass and the dots
        .byte   0x8f, 0xec, 0xca, 0x98, 0x76, 0x66, 0x66, 0x66, 0x89, 0x99, 0x99, 0x99, 0x87, 0x65, 0x33, 0x10
        # 3: a sine ringing three octaves up, for the extra life
        .byte   0x8d, 0xb8, 0xbd, 0x97, 0xbf, 0xc8, 0x9a, 0x63, 0x7c, 0x95, 0x67, 0x30, 0x48, 0x62, 0x47, 0x42
        # 4: a buzz eight times the frequency, for the frightened ghosts
        .byte   0x8f, 0x82, 0x8b, 0x85, 0x7a, 0x85, 0x7a, 0x86, 0x89, 0x85, 0x7a, 0x85, 0x7a, 0x74, 0x7d, 0x80
        # 5: a whine sixteen times the frequency, for a ghost eaten
        .byte   0xd3, 0xc3, 0xb4, 0xb4, 0xb4, 0xb4, 0xb3, 0xc3, 0xd2, 0xe1, 0xe0, 0xf0, 0xf0, 0xf0, 0xe1, 0xe2
        # 6: nearly a sine, for the siren and the fruit
        .byte   0x8a, 0xcd, 0xee, 0xef, 0xff, 0xee, 0xed, 0xca, 0x85, 0x32, 0x11, 0x10, 0x00, 0x11, 0x12, 0x35
        # 7: a sawtooth at twice the frequency, which Pac-Man does not use
        .byte   0x8f, 0xbc, 0xaa, 0x98, 0x87, 0x65, 0x53, 0x40, 0x7f, 0xbc, 0xaa, 0x98, 0x87, 0x65, 0x53, 0x40

# A note's pitch in a song, before its octave.
note_frequencies:
        .byte   0x00, 0x57, 0x5c, 0x61, 0x67, 0x6d, 0x74, 0x7b, 0x82, 0x8a, 0x92, 0x9a, 0xa3, 0xad, 0xb8, 0xc3

# The start music: the bass on channel 1 and the tune on channel 2, 256 frames each.
music_bass:
        .byte   0xf1, 0x02, 0xf2, 0x03, 0xf3, 0x0f, 0xf4, 0x01, 0x82, 0x70, 0x69, 0x82, 0x70, 0x69, 0x83, 0x70
        .byte   0x6a, 0x83, 0x70, 0x6a, 0x82, 0x70, 0x69, 0x82, 0x70, 0x69, 0x89, 0x8b, 0x8d, 0x8e, 0xff
music_melody:
        .byte   0xf1, 0x00, 0xf2, 0x02, 0xf3, 0x0f, 0xf4, 0x00, 0x42, 0x50, 0x4e, 0x50, 0x49, 0x50, 0x46, 0x50
        .byte   0x4e, 0x49, 0x70, 0x66, 0x70, 0x43, 0x50, 0x4f, 0x50, 0x4a, 0x50, 0x47, 0x50, 0x4f, 0x4a, 0x70
        .byte   0x67, 0x70, 0x42, 0x50, 0x4e, 0x50, 0x49, 0x50, 0x46, 0x50, 0x4e, 0x49, 0x70, 0x66, 0x70, 0x45
        .byte   0x46, 0x47, 0x50, 0x47, 0x48, 0x49, 0x50, 0x49, 0x4a, 0x4b, 0x50, 0x6e, 0xff

# Channel 1's effect: ten beeps for the extra life.
sound_extra_life:
        .byte   0x73, 0x20, 0x00, 0x0c, 0x00, 0x0a, 0x1f, 0x00

# Channel 2's: the five sirens, each higher and faster, then the frightened ghosts and the eyes.
sound_siren_1:
        .byte   0x36, 0x20, 0x04, 0x8c, 0x00, 0x00, 0x06, 0x00
sound_siren_2:
        .byte   0x36, 0x28, 0x05, 0x8b, 0x00, 0x00, 0x06, 0x00
sound_siren_3:
        .byte   0x36, 0x30, 0x06, 0x8a, 0x00, 0x00, 0x06, 0x00
sound_siren_4:
        .byte   0x36, 0x3c, 0x07, 0x89, 0x00, 0x00, 0x06, 0x00
sound_siren_5:
        .byte   0x36, 0x48, 0x08, 0x88, 0x00, 0x00, 0x06, 0x00
sound_frightened:
        .byte   0x24, 0x00, 0x06, 0x08, 0x00, 0x00, 0x0a, 0x00
sound_eyes:
        .byte   0x40, 0x70, 0xfa, 0x10, 0x00, 0x00, 0x0a, 0x00

# Channel 3's: a dot, falling then rising, the fruit, a ghost eaten, the death and the pop.
sound_wa:
        .byte   0x42, 0x18, 0xfd, 0x06, 0x00, 0x01, 0x0c, 0x00
sound_ka:
        .byte   0x42, 0x04, 0x03, 0x06, 0x00, 0x01, 0x0c, 0x00
sound_fruit:
        .byte   0x56, 0x0c, 0xff, 0x8c, 0x00, 0x02, 0x0f, 0x00
sound_ghost:
        .byte   0x05, 0x00, 0x02, 0x20, 0x00, 0x01, 0x0c, 0x00
sound_death:
        .byte   0x41, 0x20, 0xff, 0x86, 0xfe, 0x1c, 0x0f, 0xff
sound_pop:
        .byte   0x70, 0x00, 0x01, 0x0c, 0x00, 0x01, 0x08, 0x00

# For fade_volume: which frames a fade of 1 to 4 steps on, by the low bits of the frame count.
fade_masks:     .byte   0, 0, 1, 3, 7

        .align  2
# The sirens, and how many dots must be eaten for each after the first: the arcade's numbers.
sirens:         .word   sound_siren_1, sound_siren_2, sound_siren_3, sound_siren_4, sound_siren_5
siren_dots:     .word   116, 180, 212, 228

# What each channel plays: CHANNEL_COUNT voice records of V_SIZE bytes.
voices:         .space  72
background_sound:.word  0                       # the effect choose_background last started
chomp_turn:     .word   0                       # wa or ka next
sound_frame:    .word   0                       # frames of sound, which the fades count

        .text
# init_sounds: the three Synth channels as the chip's three voices. Each plays its wavetable, at
# full level while its gate is on, so its volume register alone sets how loud it is, as the chip's
# did.
init_sounds:
        li      t0, SYNTH
        la      t1, voices
        li      t2, CHANNEL_COUNT
        li      t3, 5                           # the wavetable
        li      t4, 127
        li      t5, 1                           # the gate
        li      t6, 255                         # no waveform loaded yet
is_channel:
        sb      t3, SY_WAVEFORM(t0)
        sb      t4, SY_SUSTAIN(t0)
        sb      t5, SY_CONTROL(t0)
        sb      t6, V_LOADED(t1)
        addi    t0, t0, SY_CHANNEL
        addi    t1, t1, V_SIZE
        addi    t2, t2, -1
        bnez    t2, is_channel
        ret

# voice_of(a0 = channel): t0 = its voice record. Leaves the other registers alone.
voice_of:
        slli    t0, a0, 4
        slli    t1, a0, 3
        add     t0, t0, t1                      # channel * 24, V_SIZE
        la      t1, voices
        add     t0, t0, t1
        ret

# play_sound(a0 = channel, a1 = effect): the channel drops what it was playing and plays the
# effect from this frame on.
play_sound:
        mv      t6, ra
        jal     voice_of
        mv      ra, t6
        li      t1, 0
ps_copy:
        add     t2, a1, t1
        lbu     t3, 0(t2)
        add     t2, t0, t1
        sb      t3, V_EFFECT(t2)
        addi    t1, t1, 1
        li      t2, 8
        blt     t1, t2, ps_copy
        li      t1, PLAY_EFFECT
        sb      t1, V_PLAYING(t0)
        lbu     t1, 3(a1)
        andi    t1, t1, 0x7f
        sb      t1, V_DURATION(t0)
        lbu     t1, 1(a1)
        sb      t1, V_FREQUENCY(t0)
        lbu     t1, 6(a1)
        sb      t1, V_VOLUME(t0)
        srli    t1, t1, 4
        sb      t1, V_FADE(t0)
        sb      zero, V_DIRECTION(t0)
        ret

# play_song(a0 = channel, a1 = song): the channel drops what it was playing and plays the song
# from this frame on.
play_song:
        mv      t6, ra
        jal     voice_of
        mv      ra, t6
        li      t1, PLAY_SONG_START
        sb      t1, V_PLAYING(t0)
        sw      a1, V_SONG(t0)
        sb      zero, V_WAVEFORM(t0)
        sb      zero, V_OCTAVE(t0)
        sb      zero, V_SONG_VOLUME(t0)
        sb      zero, V_FADE(t0)
        ret

# stop_sounds: every channel falls silent at once.
stop_sounds:
        la      t0, voices
        li      t1, CHANNEL_COUNT
ss_loop:
        sb      zero, V_PLAYING(t0)
        addi    t0, t0, V_SIZE
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
# new effect.
choose_background:
        la      t0, game_state
        lw      t0, 0(t0)
        li      t1, ST_EAT_GHOST
        beq     t0, t1, cb_done
        li      a1, 0                           # the effect, none yet
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
        la      t0, voices                      # no effect: channel 2 falls silent
        addi    t0, t0, V_SIZE
        sb      zero, V_PLAYING(t0)
cb_done:
        ret

# fade_volume(a0 = voice): a0 = the volume this frame, which fades by one every 1, 2, 4 or 8 frames
# as V_FADE says.
fade_volume:
        lbu     t0, V_FADE(a0)
        lbu     t1, V_VOLUME(a0)
        beqz    t0, fv_done                     # steady
        li      t2, 4
        bgtu    t0, t2, fv_done
        la      t2, fade_masks
        add     t2, t2, t0
        lbu     t2, 0(t2)
        la      t3, sound_frame
        lw      t3, 0(t3)
        and     t2, t2, t3
        bnez    t2, fv_done                     # not on this frame
        andi    t1, t1, 15
        beqz    t1, fv_done                     # already silent
        addi    t1, t1, -1
        sb      t1, V_VOLUME(a0)
fv_done:
        mv      a0, t1
        ret

# step_effect(a0 = voice): one frame of an effect, the arcade's routine at 0x2e6e. a0 = the
# frequency, 0 once the effect is over.
step_effect:
        lbu     t0, V_DURATION(a0)
        addi    t0, t0, -1
        andi    t0, t0, 0xff
        sb      t0, V_DURATION(a0)
        bnez    t0, se_step                     # the run goes on
        lbu     t1, 5(a0)                       # runs left; 0 never ends
        beqz    t1, se_run
        addi    t1, t1, -1
        sb      t1, 5(a0)
        bnez    t1, se_run
        sb      zero, V_PLAYING(a0)             # that was the last run
        li      a0, 0
        ret
se_run:
        lbu     t1, 3(a0)
        andi    t2, t1, 0x7f
        sb      t2, V_DURATION(a0)
        andi    t1, t1, 0x80
        beqz    t1, se_round                    # no round trip: every run is a round
        lbu     t2, 2(a0)
        neg     t2, t2
        sb      t2, 2(a0)                       # back the other way
        lbu     t2, V_DIRECTION(a0)
        xori    t3, t2, 1
        sb      t3, V_DIRECTION(a0)
        beqz    t2, se_step                     # only half way round
se_round:
        lbu     t1, 1(a0)                       # the next round starts higher or lower
        lbu     t2, 4(a0)
        add     t1, t1, t2
        sb      t1, 1(a0)
        sb      t1, V_FREQUENCY(a0)
        lbu     t1, 6(a0)                       # and louder or softer
        lbu     t2, 7(a0)
        add     t1, t1, t2
        sb      t1, 6(a0)
        sb      t1, V_VOLUME(a0)
se_step:
        lbu     t1, V_FREQUENCY(a0)
        lbu     t2, 2(a0)
        add     t1, t1, t2
        andi    t1, t1, 0xff
        sb      t1, V_FREQUENCY(a0)
        lbu     t2, 0(a0)                       # the octave
        srli    t2, t2, 4
        andi    t2, t2, 7
        sll     a0, t1, t2
        ret

# step_song(a0 = voice): one frame of a song, the arcade's routine at 0x2d44. a0 = the frequency,
# 0 for a rest or once the song is over.
step_song:
        lbu     t0, V_PLAYING(a0)
        li      t1, PLAY_SONG_START
        beq     t0, t1, sg_next                 # the first note, this frame
        lbu     t0, V_DURATION(a0)
        addi    t0, t0, -1
        sb      t0, V_DURATION(a0)
        bnez    t0, sg_frequency                # the note goes on
sg_next:
        li      t1, PLAY_SONG
        sb      t1, V_PLAYING(a0)
        lw      t0, V_SONG(a0)
sg_byte:
        lbu     t1, 0(t0)
        addi    t0, t0, 1
        li      t2, 0xf0
        bltu    t1, t2, sg_note
        li      t2, 0xff
        beq     t1, t2, sg_end
        lbu     t3, 0(t0)                       # a setting, and its value
        addi    t0, t0, 1
        li      t2, 0xf1
        beq     t1, t2, sg_waveform
        li      t2, 0xf2
        beq     t1, t2, sg_octave
        li      t2, 0xf3
        beq     t1, t2, sg_volume
        sb      t3, V_FADE(a0)                  # 0xf4
        j       sg_byte
sg_waveform:
        sb      t3, V_WAVEFORM(a0)
        j       sg_byte
sg_octave:
        sb      t3, V_OCTAVE(a0)
        j       sg_byte
sg_volume:
        sb      t3, V_SONG_VOLUME(a0)
        j       sg_byte
sg_end:
        sb      zero, V_PLAYING(a0)             # the song is over
        li      a0, 0
        ret
sg_note:
        sw      t0, V_SONG(a0)
        andi    t2, t1, 0x1f
        beqz    t2, sg_length                   # no pitch: the last note again
        sb      t1, V_DIRECTION(a0)
        andi    t2, t1, 0x0f
        la      t3, note_frequencies
        add     t3, t3, t2
        lbu     t3, 0(t3)
        sb      t3, V_FREQUENCY(a0)
sg_length:
        lbu     t2, V_SONG_VOLUME(a0)
        sb      t2, V_VOLUME(a0)
        srli    t1, t1, 5                       # 1, 2, 4 ... 128 frames
        li      t2, 1
        sll     t2, t2, t1
        sb      t2, V_DURATION(a0)
sg_frequency:
        lbu     t1, V_DIRECTION(a0)             # bit 4: an octave up
        srli    t1, t1, 4
        andi    t1, t1, 1
        lbu     t2, V_OCTAVE(a0)
        add     t1, t1, t2
        lbu     t2, V_FREQUENCY(a0)
        sll     a0, t2, t1
        ret

# update_sounds: one frame of sound on every channel. A paused game is silent, and picks up where
# it was.
update_sounds:
        la      t0, paused
        lw      t0, 0(t0)
        beqz    t0, us_playing
        li      t0, SYNTH
        li      t1, CHANNEL_COUNT
us_quiet:
        sb      zero, SY_VOLUME(t0)
        addi    t0, t0, SY_CHANNEL
        addi    t1, t1, -1
        bnez    t1, us_quiet
        ret
us_playing:
        addi    sp, sp, -32
        sw      ra, 28(sp)
        sw      s0, 24(sp)
        sw      s1, 20(sp)
        sw      s2, 16(sp)
        sw      s3, 12(sp)
        sw      s4, 8(sp)
        la      t0, sound_frame
        lw      t1, 0(t0)
        addi    t1, t1, 1
        sw      t1, 0(t0)
        jal     choose_background
        la      s0, voices
        li      s1, 0                           # the channel
        li      s2, SYNTH                       # its registers
us_voice:
        lbu     s3, V_LOADED(s0)                # the waveform, the one loaded unless one plays
        li      a0, 0                           # the frequency: 0 when silent
        lbu     t0, V_PLAYING(s0)
        beqz    t0, us_volume
        li      t1, PLAY_EFFECT
        bne     t0, t1, us_song
        lbu     s3, V_EFFECT(s0)
        andi    s3, s3, 7
        mv      a0, s0
        jal     step_effect
        j       us_volume
us_song:
        mv      a0, s0
        jal     step_song
        lbu     s3, V_WAVEFORM(s0)              # after the step: a song sets it in its first bytes
        andi    s3, s3, 7
us_volume:
        mv      s4, a0
        li      a0, 0
        lbu     t0, V_PLAYING(s0)
        beqz    t0, us_write                    # silent, or it has just ended
        mv      a0, s0
        jal     fade_volume
us_write:
        andi    a0, a0, 15
        slli    a0, a0, 3                       # the chip's 0 to 15, as the Synth's 0 to 120
        sb      a0, SY_VOLUME(s2)
        # The chip ran at 96,000 samples a second with a 20-bit phase counter, so a frequency f
        # sounds at f * 96000 / 2^20 Hz on voice 1. Voices 2 and 3 hold theirs 4 bits higher up
        # the counter, 16 times f. 96000 / 2^20 is 375 / 4096.
        li      t0, 375
        mul     t0, s4, t0
        bnez    s1, us_high
        li      t1, 2048                        # rounded to the nearest Hz
        add     t0, t0, t1
        srli    t0, t0, 12
        j       us_hz
us_high:
        addi    t0, t0, 128
        srli    t0, t0, 8
us_hz:
        sh      t0, SY_FREQUENCY(s2)
        lbu     t0, V_LOADED(s0)
        beq     s3, t0, us_next                 # the wavetable holds it already
        sb      s3, V_LOADED(s0)
        la      t0, waveforms
        slli    t1, s3, 4
        add     t0, t0, t1                      # the waveform's 16 bytes
        li      t1, SYNTH_TABLES
        slli    t2, s1, 4
        add     t1, t1, t2                      # the channel's wavetable
        li      t2, 16
us_copy:
        lbu     t3, 0(t0)
        sb      t3, 0(t1)
        addi    t0, t0, 1
        addi    t1, t1, 1
        addi    t2, t2, -1
        bnez    t2, us_copy
us_next:
        addi    s0, s0, V_SIZE
        addi    s2, s2, SY_CHANNEL
        addi    s1, s1, 1
        li      t0, CHANNEL_COUNT
        blt     s1, t0, us_voice
        lw      ra, 28(sp)
        lw      s0, 24(sp)
        lw      s1, 20(sp)
        lw      s2, 16(sp)
        lw      s3, 12(sp)
        lw      s4, 8(sp)
        addi    sp, sp, 32
        ret
