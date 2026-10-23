This program computes a sound, copies it into the **Synth**, the sound chip this editor adds at
`$E00100`, and plays it as a scale. EASy68K does not have the Synth. Choose **Build**, then
**Run**, with your sound on.

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

The Synth's other waveforms come from the chip itself. The **sample** waveform plays numbers the
program computed: each one is the sound's level at one instant, from -128 to 127, and the chip
steps through them at the rate its frequency register gives, in samples a second.

The program first computes the sound: 4,000 samples of a square wave, 32 samples a period, whose
**amplitude**, the height of its swing, falls by one every period from 125 towards 0. Played at
8,000 samples a second that is 250 periods a second, a tone of 250 Hz, fading out over half a
second like a plucked string.

The chip cannot read the program's memory while it plays, so the samples are copied into its own
**Sample memory** first, with an **upload**: the source address, the number of bytes and where they
go, then a write to the start register, which copies them at that moment. Changing the buffer
afterwards changes nothing in Sample memory.

Channel 0 then plays them with the sample waveform: from sample 0, for 4,000 samples, once. Each
note turns the gate off and on, which starts the samples again from the first, at a new rate from
the table. Playing the same samples faster raises the pitch: 16,000 samples a second is twice
8,000, an octave higher. The rates between follow the steps of a major scale, each a power of the
twelfth root of 2 times 8,000. A faster rate also gets through the samples sooner, so the high
notes are shorter: at 16,000 the sound lasts a quarter of a second.

## Try it

Make the sound loop: store 3 instead of 1 in the control register at `$10`, the gate and the loop
bit. Bit 1 makes the channel go back to its **loop start**, the word at offset `$0E`, each time it
reaches the end; with a loop start of 0 the whole fade repeats. Give the loop start 3,840 instead,
the last 160 samples, and the end of the fade repeats as a quiet held tone.

Then change the sound itself. `btst #4, d1` splits each period of 32 samples in two halves;
`btst #3, d1` makes it 16 samples a period, an octave higher. The
[Synth chapter](/documentation/m68k/synth#samples) has the other registers.
