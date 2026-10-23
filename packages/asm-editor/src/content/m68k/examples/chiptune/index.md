This program plays a short tune on the **Synth**, the sound chip this editor adds at `$E00100`;
EASy68K does not have it. Three of its eight channels play together, the way a game console's music
did: a pulse wave for the melody, a triangle wave for the bass, and noise for the drums. Choose
**Build**, then **Run**, with your sound on.

Each channel has the same controls in a block of `$20` bytes. With `a0` pointing at channel 0,
channel 1's controls are `$20` bytes farther on and channel 2's are `$40` bytes farther on. For
example, the waveform is at offset `$11` within a channel, so channel 1's waveform is at
`$20 + $11 = $31` from `a0`.

The **envelope** shapes a note's level: **attack** rises to full, **decay** falls to the
**sustain** level, and **release** fades to silence when the gate turns off. Sustain holds while
the gate stays on and ranges from 0 to 127; the separate volume control scales the whole note.
Attack, decay and release use ticks of 1/1024 second. Attack gives the time for a full rise from
silence; decay and release give the time for a full fall to silence, so a smaller change takes
less time. A time of 0 is immediate. The controls start at 0, which supplies the bass's instant
attack and the drum's silent sustain here.

The lead uses a pulse wave. Its **pulse width** sets how much of each cycle is high, in parts of
4096: 1024 is a quarter of the cycle; 2048 gives equal high and low halves, a square wave.

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
    ; channel 2, the drums: noise with a short decay, its sustain left at 0
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
    move.l #15, d1              ; wait 15 hundredths of a second per step
    move.b #23, d0              ; task 23: wait
    trap #15
    bra step

; Plays d2 Hz on the channel at a2; 0 leaves it alone. Leaves a1 unchanged.
strike:
    tst.w d2
    beq held
    move.b #0, $10(a2)          ; gate off, then on: restart the envelope
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

; Three words per step: lead Hz, bass Hz, drum noise Hz. Each long line holds four steps.
; 0 leaves that channel as it is; a lead of $FFFF ends the song.
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

The song is a table in memory, with three words per step: lead, bass and drum frequencies in Hz.
Each long `dc.w` line contains four of these triples. On the first step, the three
`move.w (a1)+, d2` instructions read `523`, `131` and `1200`. Each read advances `a1` by two
bytes, so after all three it points at `659`, the start of the next step. `strike` leaves `a1`
unchanged, letting the loop continue through the table.

The next step reads `659, 0, 0`: the lead changes pitch, while the bass and drum get no register
writes. A table value of 0 leaves all channel controls unchanged. The bass keeps sounding;
the drum gets no new hit.

Task 23 waits 15 hundredths of a second after each step. The eight long lines contain 32 steps,
grouped musically into four **bars** of eight steps over the chords C, A minor, F and G. The
bass gets a frequency on the first and fifth step of each bar. A closing triple adds step 33,
then the single word `$FFFF` ends the loop before it reads another bass or drum word. `done`
lets that closing chord ring for another 60 hundredths of a second before ending the program.

Each channel is set up once. The lead decays to a quieter level; the bass holds at full level;
the drum's sustain is 0, so each hit decays to silence even though its gate stays on. The noise
frequency sets how bright a drum sounds: 1200 gives a low thud, 7000 a snare-like sound and 24000
a hi-hat-like sound.

`strike` plays one frequency on one channel. Storing the new frequency would only change the
pitch of the note already sounding, so it turns the gate off and on around it to restart the
attack from the current level. With the bass's instant attack and full sustain, a repeated pitch
may still sound continuous; restarting the envelope does not necessarily make an audible gap.

## Try it

Change the lead's waveform store to `move.b #2, $11(a0)` for a brighter, brassier sawtooth melody.
Or keep waveform 0 and change its pulse-width store to `move.w #2048, $02(a0)` for a hollower
square wave.

Then make the bass shorter: add `move.w #150, $26(a0)` to its setup and change its sustain store
to `move.b #0, $33(a0)`. Decay is at channel offset `$06`, so `$20 + $06 = $26`; sustain is at
`$13`, so `$20 + $13 = $33`. Leave its volume at 127. Each bass note now falls to silence in
150 ticks, about 0.146 seconds. The [Synth chapter](/documentation/m68k/synth) has the other
registers.
