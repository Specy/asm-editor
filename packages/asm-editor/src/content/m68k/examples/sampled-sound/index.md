This program computes a sound, copies it into the **Synth**, the sound chip this editor adds at
`$E00100`, and plays it as a scale. EASy68K does not have the Synth. Choose **Build**, then
**Run**, with your sound on.

A **sample** is the sound's level at one instant. The Synth takes raw signed bytes, from -128 to
127, with 0 at the centre; these have no WAV header. Unlike the unsigned 8-bit WAV samples in the
earlier example, whose centre was 128, positive and negative values here swing around 0.

The fill loop builds a fading square wave, 32 samples per period. `lsr.w #5, d2` divides the
sample number by 32, discarding the remainder, to count completed periods. Subtracting that
count from 125 makes the **amplitude**, the height of the wave's swing, fall by one each period.
Bit 4 of the sample number is clear
for the first 16 samples and set for the next 16; `neg.w d3` changes the amplitude to its negative
for that second half. The first few boundary values are:

| Sample number (`d1`) | Completed periods (`d2`) | Stored sample |
| -------------------- | ------------------------ | ------------- |
| 0                    | 0                        | 125           |
| 15                   | 0                        | 125           |
| 16                   | 0                        | -125          |
| 31                   | 0                        | -125          |
| 32                   | 1                        | 124           |

```m68k|playground|no-flags|allow-open
SYNTH   equ $E00100
COUNT   equ 4000                ; samples: half a second at 8,000 a second

    ; compute a plucked string: a square wave of 32 samples a period, fading away
    lea pluck, a0
    moveq #0, d1                ; the sample's number
fill:
    move.w d1, d2
    lsr.w #5, d2                ; which period it is in: its number / 32
    moveq #125, d3
    sub.w d2, d3                ; the amplitude, falling by 1 a period
    btst #4, d1                 ; the first half of each period is high,
    beq store
    neg.w d3                    ; the second half low
store:
    move.b d3, (a0)+
    addq.w #1, d1
    cmp.w #COUNT, d1
    blt fill

    ; copy the samples into the Synth's Sample memory
    lea SYNTH, a0
    move.l #pluck, $180(a0)     ; from the buffer
    move.w #COUNT, $184(a0)     ; 4,000 bytes
    move.w #0, $186(a0)         ; to the start of Sample memory
    move.b #0, $188(a0)         ; now

    ; channel 0 plays them
    move.w #0, $0A(a0)          ; from sample 0
    move.w #COUNT, $0C(a0)      ; for 4,000 samples, then silence
    move.b #6, $11(a0)          ; waveform 6: sample
    move.b #120, $12(a0)        ; volume
    move.b #127, $13(a0)        ; sustain: the samples fade by themselves

    lea rates, a1
next:
    move.w (a1)+, d2            ; the next rate
    beq done
    move.b #0, $10(a0)          ; gate off, then on: from the first sample again
    move.w d2, (a0)
    move.b #1, $10(a0)
    move.l #30, d1              ; 30 hundredths of a second a note
    move.b #23, d0              ; task 23: wait
    trap #15
    bra next

done:
    move.b #9, d0
    trap #15

rates:                          ; samples a second for each note: 8000 plays the sound as computed
    dc.w 8000, 8980, 10079, 10679, 11986, 13454, 15102, 16000, 0
pluck:
    ds.b COUNT
```

`pluck` reserves a 4,000-byte buffer in the program's memory. `move.b d3, (a0)+` stores the low
byte of the signed value and advances `a0` by one byte. The loop fills the buffer with a wave
whose amplitude falls from 125 towards 0.

The Synth plays from its own **Sample memory**, shared by all its channels. The **upload** sets
the buffer's address, byte count and destination, then writes the start register to copy those
bytes at that moment. Changing `pluck` afterwards does not change that copy.

Channel 0 selects waveform 6 to play those bytes from sample 0, for 4,000 samples. The frequency
register now gives the playback rate in **samples per second**, rather than the tone's pitch.
At 8,000 samples per second, each 32-sample period produces a 250 Hz tone, and the whole fade
lasts half a second. The rate table plays an ascending major scale starting at that pitch;
16,000 plays twice as fast, an octave higher, and finishes in a quarter of a second.

Each note turns the gate off and on to restart from the first sample at its new rate. Task 23
waits 30 hundredths of a second, or 300 ms, before the next note. The lower notes therefore
restart before their full fade has played; the highest note finishes before the wait ends.

## Try it

First change `move.l #30, d1` to `move.l #80, d1`: 80 hundredths is 800 ms, long enough to hear
each sound reach its end and loop before the next note restarts it. Then replace the gate-on
store `move.b #1, $10(a0)` with `move.b #3, $10(a0)`, keeping the gate-off store
`move.b #0, $10(a0)`. The value 3 sets both the gate and loop bits. Bit 1 makes the channel go
back to its **loop start**, the word at offset `$0E`, whenever it reaches the end. Its initial
value is 0, so the whole fade repeats.

To repeat only the last 160 samples as a quiet held tone, insert `move.w #3840, $0E(a0)`
immediately after `move.w #COUNT, $0C(a0)` in the channel setup, before the waveform store.
The first pass still plays all 4,000 samples; later passes start at 3,840.

Then change the sound itself. `btst #4, d1` splits each period of 32 samples in two halves;
`btst #3, d1` makes it 16 samples a period, an octave higher. The
[Synth chapter](/documentation/m68k/synth#samples) has the other registers.
