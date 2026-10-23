This program plays a short tune on the **Synth**, the sound chip this editor adds at `$E00100`;
EASy68K does not have it. Three of its eight channels play together, the way a game console's music
did: a pulse wave for the melody, a triangle wave for the bass, and noise for the drums. Choose
**Build**, then **Run**, with your sound on.

```m68k|playground|no-flags|allow-open
SYNTH   equ $E00100             ; channel 0; channel 1 is at +$20 and channel 2 at +$40

    lea SYNTH, a0
    ; channel 0, the lead: a narrow pulse, struck, then held a little quieter
    move.b #0, $11(a0)          ; waveform 0: pulse
    move.w #1024, $02(a0)       ; pulse width: high a quarter of the time
    move.w #4, $04(a0)          ; attack
    move.w #200, $06(a0)        ; decay
    move.w #60, $08(a0)         ; release
    move.b #80, $12(a0)         ; volume
    move.b #70, $13(a0)         ; sustain
    ; channel 1, the bass: a triangle, held at full level
    move.b #1, $31(a0)          ; waveform 1: triangle
    move.w #40, $28(a0)         ; release
    move.b #127, $32(a0)        ; volume
    move.b #127, $33(a0)        ; sustain
    ; channel 2, the drums: noise that dies away at once, its sustain left at 0
    move.b #4, $51(a0)          ; waveform 4: noise
    move.w #90, $46(a0)         ; decay
    move.b #100, $52(a0)        ; volume

    lea song, a1
step:
    move.w (a1)+, d2            ; the lead
    cmp.w #$FFFF, d2
    beq done
    lea SYNTH, a2
    bsr strike
    move.w (a1)+, d2            ; the bass
    lea SYNTH+$20, a2
    bsr strike
    move.w (a1)+, d2            ; the drum
    lea SYNTH+$40, a2
    bsr strike
    move.l #15, d1              ; an eighth of a bar: 15 hundredths of a second
    move.b #23, d0              ; task 23: wait
    trap #15
    bra step

; Plays the frequency in d2 on the channel whose registers start at a2; 0 leaves it alone.
strike:
    tst.w d2
    beq held
    move.b #0, $10(a2)          ; gate off, then on: the note is struck again
    move.w d2, (a2)
    move.b #1, $10(a2)
held:
    rts

done:
    move.l #60, d1              ; let the last chord ring
    move.b #23, d0
    trap #15
    move.b #9, d0               ; the program's end releases every gate
    trap #15

; One row a step, an eighth of a bar: the frequencies in Hz of the lead, the bass and the drum's
; noise. 0 leaves that channel as it is; a lead of $FFFF ends the song.
song:
    dc.w 523, 131, 1200,   659, 0, 0,   784, 0, 24000,   659, 0, 0
    dc.w 523, 131, 7000,   659, 0, 0,   784, 0, 24000,   1047, 0, 0
    dc.w 440, 110, 1200,   523, 0, 0,   659, 0, 24000,   523, 0, 0
    dc.w 440, 110, 7000,   523, 0, 0,   659, 0, 24000,   880, 0, 0
    dc.w 349, 87, 1200,   440, 0, 0,   523, 0, 24000,   440, 0, 0
    dc.w 349, 87, 7000,   440, 0, 0,   523, 0, 24000,   698, 0, 0
    dc.w 392, 98, 1200,   494, 0, 0,   587, 0, 24000,   494, 0, 0
    dc.w 392, 98, 7000,   494, 0, 0,   587, 0, 24000,   784, 0, 0
    dc.w 523, 131, 1200
    dc.w $FFFF
```

The song is a table in memory, one row of three words per step: the lead's frequency, the bass's
and the drum's, in Hz. A step lasts 15 hundredths of a second, waited out with task 23, so the 32
steps make four bars of eight, over the chords C, A minor, F and G. The lead plays a different
note on every step; the bass only on the first and fifth step of a bar, its other rows holding 0,
which leaves it sounding.

Each channel is set up once, before the song starts: its waveform, its volume and its
**envelope**, the shape its volume takes over a note. The lead is struck and decays to a level it
holds; the bass holds at full volume; the drum's sustain is 0, so each hit decays straight to
silence even though its gate stays on. The noise frequency sets how bright a drum sounds: 1200 is
the low thud of a kick drum, 7000 a snare and 24000 a hi-hat.

`strike` plays one frequency on one channel. Storing the new frequency would only change the
pitch of the note already sounding, so it turns the gate off and on around it, which attacks the
note again: that is what makes the bass's repeated C sound twice rather than once.

## Try it

Change the lead's waveform from 0 to 2, a sawtooth, for a brighter, brassier melody, or change its
pulse width from 1024 to 2048, a square wave, for a hollower one.

Then make the bass shorter: give channel 1 a decay of 150 at offset `$26` and a sustain of 0, so
each bass note dies away like the drums. The [Synth chapter](/documentation/m68k/synth) has the
other registers.
