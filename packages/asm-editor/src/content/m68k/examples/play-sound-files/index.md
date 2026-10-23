This program creates two files and plays them: `tone.wav`, half a second of a square wave, and
`tune.mid`, four notes on a flute. The playground starts without these files, so the program writes
both with the file tasks first. Choose **Build**, then **Run**, with your sound on.

The WAV file holds samples: numbers describing the sound's level over time. The MIDI file holds
instructions for a synthesizer, which generates the sound. Each MIDI event below starts with a
delay in ticks, followed by an event code and its data. A delay of 0 means act immediately; 96
ticks make a quarter note, the musical duration used as one beat here. At the default tempo of
120 beats a minute, that is half a second. Notes have numbered pitches, meaning how high or low
they sound: 60 is called middle C. A note's velocity says how strongly to play it.

```m68k|playground|no-flags|allow-open
RATE    equ 8000                ; samples a second
LENGTH  equ 4000                ; half a second of samples
HALF    equ 10                  ; samples at each level: 8000 / 20 = 400 Hz

    lea samples, a0             ; fill the samples with a square wave
    move.w #LENGTH/(2*HALF)-1, d1
wave:
    moveq #HALF-1, d2
high:
    move.b #$C0, (a0)+          ; 8-bit samples are unsigned: $80 is silence
    dbra d2, high
    moveq #HALF-1, d2
low:
    move.b #$40, (a0)+
    dbra d2, low
    dbra d1, wave

    lea wavname, a1             ; write both files
    lea wav, a2
    move.l #samples+LENGTH-wav, d2
    bsr write
    lea midname, a1
    lea midi, a2
    move.l #midiend-midi, d2
    bsr write

    lea wavname, a1
    move.b #70, d0              ; the standard player plays the WAV
    trap #15
    move.l #50, d1
    move.b #23, d0              ; wait the half second it lasts
    trap #15
    lea midname, a1
    move.b #73, d0              ; the DirectX player plays the MIDI file
    trap #15
    move.b #9, d0
    trap #15

; write: a1 = filename, a2 = first byte, d2.l = byte count
write:
    move.b #52, d0              ; create the file; its handle is in d1.l
    trap #15
    move.l a2, a1
    move.b #54, d0              ; write the bytes
    trap #15
    move.b #56, d0              ; close the file
    trap #15
    rts

    org $2000
wavname: dc.b 'tone.wav', 0
midname: dc.b 'tune.mid', 0

; This WAV file: a 44-byte header, then samples. Numbers are stored low byte first.
wav:     dc.b 'RIFF', (36+LENGTH)&$FF, (36+LENGTH)>>8, 0, 0, 'WAVE'
         dc.b 'fmt ', 16, 0, 0, 0       ; a format chunk of 16 bytes:
         dc.b 1, 0, 1, 0                ; integer PCM, one channel,
         dc.b RATE&$FF, RATE>>8, 0, 0   ; samples a second,
         dc.b RATE&$FF, RATE>>8, 0, 0   ; bytes a second,
         dc.b 1, 0, 8, 0                ; one byte a sample, of 8 bits
         dc.b 'data', LENGTH&$FF, LENGTH>>8, 0, 0
samples: ds.b LENGTH

; A MIDI file: a header, then one track of events. Its numbers are stored
; high byte first, as the 68000 stores them.
midi:    dc.b 'MThd'
         dc.l 6                         ; six bytes of header data follow
         dc.w 0, 1, 96                  ; format 0, one track, 96 ticks a quarter note
         dc.b 'MTrk'
         dc.l midiend-track             ; the track's length
track:   dc.b 0, $C0, 73                ; at once, channel 1 takes instrument 73, the flute
         dc.b 0, $90, 60, 100           ; at once, middle C starts at velocity 100
         dc.b 96, $80, 60, 0            ; a quarter note later, it stops
         dc.b 0, $90, 64, 100           ; E
         dc.b 96, $80, 64, 0
         dc.b 0, $90, 67, 100           ; G
         dc.b 96, $80, 67, 0
         dc.b 0, $90, 72, 100           ; the C above middle C
         dc.b 96, $80, 72, 0
         dc.b 0, $FF, $2F, 0            ; the end of the track
midiend:
```

Both calls to `write` pass three arguments: `a1` points to a zero-terminated filename, `a2` points
to the first byte to write, and `d2.l` holds the byte count. Subtracting the start address from the
end address gives that count. Task 52 creates the file and returns its handle in `d1.l`; tasks 54 and 56
reuse that handle to write the bytes and close the file.

The two players behave differently. The standard player, tasks 70 to 72 and 76, plays WAV files
one at a time: while its current sound is playing, task 70 starts nothing and returns 0 in `d0.w`. The
program waits for the WAV to finish with task 23: 50 hundredths of a second is 500 ms. The DirectX
player, tasks 73 to 75 and 77, mixes sounds and also plays MIDI files, so task 73 would have played
the MIDI file even if the WAV were still sounding. Task 9 then ends the program, while the MIDI
file continues playing to its end.

## The WAV file

This WAV file uses a 44-byte header followed by the samples. It begins with `RIFF` and a four-byte
size field. That size, `36+LENGTH`, counts the bytes following the size field: the whole file except
its first eight bytes. Next come `WAVE`, a `fmt ` chunk describing the samples, and the `data`
chunk's size field. The samples themselves begin at `samples`. Other WAV files can have additional
chunks and longer headers.

The header describes integer PCM samples: each number gives a sound level directly. Here, each
sample is 8 bits, there is one audio channel, and the rate is 8000 samples a second. Multibyte
numbers in this header are stored low byte first, the opposite of the 68000. The header therefore
splits them into bytes with `&$FF` and `>>8` instead of using `dc.w` or `dc.l`.

An 8-bit sample is unsigned: `$80` is silence, and `$C0` and `$40` sit equally far above and below
it. The loop at the top writes 10 samples at one level, then 10 at the other, 200 times: 20 samples
make one cycle, and 8000 samples a second make 400 cycles a second, a tone of 400 Hz.

## The MIDI file

The MIDI header, `MThd`, says the file has one track and divides each quarter note into 96 ticks.
The track, `MTrk`, lists events, each preceded by a delay measured from the previous event. MIDI
stores multibyte numbers high byte first, as the 68000 does, so `dc.l` and `dc.w` write them
directly. The length `midiend-track` counts the bytes following the track's size field.

The first event, `dc.b 0, $C0, 73`, has no delay and selects instrument 73, the flute. The event
code, also called a status byte, says what to do: `$C0` changes the instrument, `$90` starts a note,
and `$80` stops a note. The final hexadecimal digit, 0 in each of these codes, selects MIDI channel

1. A MIDI channel groups events for an instrument; it is separate from the WAV's audio channel.

For example, `dc.b 0, $90, 60, 100` starts middle C immediately, at velocity 100. The next event,
`dc.b 96, $80, 60, 0`, waits 96 ticks and stops that same pitch. The next note starts with a delay
of 0, so it begins as soon as the previous note stops. The four pitches are 60, 64, 67 and 72,
named C, E, G and C. The last C is an octave above the first: its frequency is twice as high.

This file sets no tempo, so the player uses the default 120 beats a minute. Each note lasts half
a second, making the four-note tune two seconds long. The track ends with the event `$FF $2F 0`.
MIDI files sound different here from EASy68K, which plays them on the Windows synthesizer.

## Try it

Change `HALF equ 10` to `HALF equ 5` for a tone an octave higher: doubling the frequency gives
800 Hz. Then remove the three instructions for the task 23 delay, from `move.l #50, d1` through
its `trap #15`, and run the program again. The MIDI file starts at once, mixed with the WAV,
since the two players are separate. Finally, change `dc.b 0, $C0, 73` to `dc.b 0, $C0, 0` to hear
the MIDI file on a piano.
