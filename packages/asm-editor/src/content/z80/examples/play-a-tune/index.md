This program plays the first phrase of Beethoven's "Ode to Joy". A loop reads a table of pitches
and durations, playing one note and waiting for it to end before moving to the next. Choose
**Build**, then **Run**, with your sound on.

Each note occupies four bytes in the table: a two-byte pitch word followed by a two-byte duration
word, in milliseconds. `.dw` stores each word low byte first. The pitches used here fit in one
byte, so the loop reads the pitch's low byte and skips its high byte. It reads both bytes of the
duration: 200 fits in a byte, but durations such as 400 and 600 exceed 255.

For this table, a pitch of 0 marks the end. The final `.dw 0` has no duration after it, so the loop
checks for zero before loading a duration.

```z80|playground|no-flags|allow-open
    .org 0x8000
    ld a, 0
    out (0x62), a   ; instrument 0, the acoustic grand piano
    ld a, 100
    out (0x63), a   ; volume, 0 to 127
    ld hl, tune     ; address of the next note

next:
    ld e, (hl)      ; the pitch, the low byte of its word
    inc hl
    inc hl          ; skip the pitch word's unused high byte
    ld a, e
    or a            ; this table uses pitch 0 as its end marker
    jr z, done
    ld a, (hl)      ; the duration's low byte
    inc hl
    ld b, (hl)      ; and its high byte
    inc hl
    ld c, 0x64
    out (c), a      ; store the duration: high byte in b, low byte in a
    ld b, e         ; duration is stored; reuse b for the pitch
    ld c, 0x61
    in a, (c)       ; play the note at pitch b, then wait for it to end
    jr next

done:
    halt

    .org 0x9000
tune:               ; pitch, milliseconds
    .dw 64, 400,  64, 400,  65, 400,  67, 400
    .dw 67, 400,  65, 400,  64, 400,  62, 400
    .dw 60, 400,  60, 400,  62, 400,  64, 400
    .dw 64, 600,  62, 200,  62, 800
    .dw 0
```

The pitch numbers choose the notes: 60 is middle C, 62 is D, 64 is E, 65 is F and 67 is G. Most
notes last 400 milliseconds. The final three notes last 600, 200 and 800 milliseconds.

To set the duration, the loop loads its low byte into `a` and its high byte into `b`, then writes
to port `0x64`. With `out (c), a`, `b` supplies the high byte of the port address; this port uses
that byte as the duration's high byte and `a` as its low byte. The device remembers the duration
after the write, so `ld b, e` can reuse `b` for the pitch.

With `c` set to `0x61`, `in a, (c)` sends that pitch to the simulator's play-and-wait port. It starts
the note, waits for its duration, then returns 0 in `a`. The loop does not need that return value.
The instrument, volume and duration settings remain in effect until changed. Instrument and
volume are the same for every note here, so they are written once before the loop.

The whole phrase takes 6.4 seconds, the sum of the durations. In a testcase, no sound is played:
each wait completes immediately and advances the virtual clock by the note's duration.

## Try it

Change the first `ld a, 0` to `ld a, 73` and run the program again to hear the same tune on a flute.
You can also use 40 for a violin or 56 for a trumpet.

Then replace `ld c, 0x61` followed by `in a, (c)` with `ld a, e` followed by `out (0x60), a`.
Port `0x60` starts each note without waiting for its duration. If the instrument sounds have not
loaded, the program pauses at the first write until the browser finishes loading them. Once they
are ready, all fifteen notes start within a few instructions of each other and overlap. They can
keep sounding after the program reaches `halt`.
