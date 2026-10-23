This tune uses the **Sound chip**, the MSX's AY-3-8910: channel A plays the melody, B the bass
and C the drums. Choose **Build**, then **Run**, with your sound on.

The chip has three square-wave channels, one shared noise generator and one shared **envelope
generator**, which changes volume over time. A volume value of 16 makes a channel follow the
envelope. Here C follows shape 0: fall from full volume to silence and stay there. Writing 0 to
shape register 13 restarts that fall, striking the drum; even writing the same shape restarts it.

Each `setup` line pairs a register number with its value. The initialization loop selects the
register through port `0xA0`, then writes the value through `0xA1`.

| Pair in `setup` | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `7, 0x9c`       | Mixer: tones on A and B, noise on C                             |
| `8, 11`         | A's fixed volume: 11                                            |
| `9, 14`         | B's fixed volume: 14                                            |
| `10, 0x10`      | C follows the envelope (`0x10` is 16)                           |
| `11, 0x58`      | Low byte of the envelope period                                 |
| `12, 0x02`      | High byte: together `0x0258`, or 600, for a fall of about 86 ms |

A 0 bit in the mixer enables a source. In `0x9C` (`10011100`), bits 0 and 1 enable A's and B's
tones; bit 5 enables C's noise. Bit 7 controls an unconnected I/O port and has no effect here.
The noise period sets the drum's brightness: 24 gives a low thud, 6 a snare-like sound and 1 a
bright hi-hat-like sound.

Each step occupies five bytes. The first row, `.word 214, 854` followed by `.byte 24`, means:

| Offset from `ix` | Value | Meaning                                 |
| ---------------- | ----- | --------------------------------------- |
| 0–1              | 214   | A's tone period, low byte first         |
| 2–3              | 854   | B's tone period, low byte first         |
| 4                | 24    | Noise period; restart the drum envelope |

A zero in either tone field leaves that channel unchanged. A zero drum byte means no new hit: any previous
envelope fall continues. Neither commands immediate silence.

```z80|playground|no-flags|allow-open
        .org 0x8000
        ld hl, setup        ; pairs of a register and its value
        ld b, 6
init:   ld a, (hl)
        out (0xa0), a       ; select the register
        inc hl
        ld a, (hl)
        out (0xa1), a       ; and write it
        inc hl
        djnz init

        ld ix, song
step:   ld l, (ix+0)        ; the lead's period
        ld h, (ix+1)
        ld a, h
        and l
        inc a               ; 0xFFFF ends the song
        jr z, done
        ld a, 0             ; registers 0 and 1: channel A's period
        call tone
        ld l, (ix+2)        ; the bass's period
        ld h, (ix+3)
        ld a, 2             ; registers 2 and 3: channel B's period
        call tone
        ld a, (ix+4)        ; the drum's noise period
        or a
        jr z, wait          ; 0: no drum on this step
        ld c, a
        ld a, 6             ; register 6: the noise period
        out (0xa0), a
        ld a, c
        out (0xa1), a
        ld a, 13            ; register 13: the envelope's shape,
        out (0xa0), a
        xor a               ; 0, falling once to silence: writing it strikes the drum
        out (0xa1), a
wait:   ld bc, 0x0f50       ; b = 15 hundredths of a second, c = the wait port
        in a, (c)
        ld de, 5
        add ix, de          ; the next row
        jr step

done:   ld bc, 0x3c50       ; let the last notes ring for 60 hundredths
        in a, (c)
        halt                ; the program's end silences the chip

; Writes the period in hl to the registers a and a + 1, unless it is 0.
tone:   ld c, a
        ld a, h
        or l
        ret z               ; 0 leaves the channel as it is
        ld a, c
        out (0xa0), a
        ld a, l
        out (0xa1), a       ; the low byte
        ld a, c
        inc a
        out (0xa0), a
        ld a, h
        out (0xa1), a       ; the high four bits
        ret

setup:  .byte 7, 0x9c       ; mixer: tones on A and B, noise on C
        .byte 8, 11         ; channel A's volume
        .byte 9, 14         ; channel B's volume
        .byte 10, 0x10      ; channel C follows the envelope
        .byte 11, 0x58      ; the envelope's period, 600: about 86 ms to fall
        .byte 12, 0x02

; One row a step, an eighth of a bar: the periods of the lead and the bass, then the drum's noise
; period. 0 leaves that channel as it is; a lead of 0xFFFF ends the song.
song:
        .word 214, 854
        .byte 24
        .word 170, 0
        .byte 0
        .word 143, 0
        .byte 1
        .word 170, 0
        .byte 0
        .word 214, 854
        .byte 6
        .word 170, 0
        .byte 0
        .word 143, 0
        .byte 1
        .word 107, 0
        .byte 0
        .word 254, 1017
        .byte 24
        .word 214, 0
        .byte 0
        .word 170, 0
        .byte 1
        .word 214, 0
        .byte 0
        .word 254, 1017
        .byte 6
        .word 214, 0
        .byte 0
        .word 170, 0
        .byte 1
        .word 127, 0
        .byte 0
        .word 321, 1286
        .byte 24
        .word 254, 0
        .byte 0
        .word 214, 0
        .byte 1
        .word 254, 0
        .byte 0
        .word 321, 1286
        .byte 6
        .word 254, 0
        .byte 0
        .word 214, 0
        .byte 1
        .word 160, 0
        .byte 0
        .word 285, 1141
        .byte 24
        .word 226, 0
        .byte 0
        .word 191, 0
        .byte 1
        .word 226, 0
        .byte 0
        .word 285, 1141
        .byte 6
        .word 226, 0
        .byte 0
        .word 191, 0
        .byte 1
        .word 143, 0
        .byte 0
        .word 214, 854
        .byte 24
        .word 0xffff
```

The main 32 steps make four bars of eight, over C, A minor, F and G. Each step waits 15 hundredths
of a second through the wait port. A 33rd step returns to the opening C notes and strikes the
drum. The following `0xFFFF` word ends the table; after another 60 hundredths, `halt` silences the
chip.

The tone period is `1,789,772.5 / (16 × frequency in Hz)`: 214 gives about 523 Hz, the C an octave
above middle C, and the bass's 854 gives about 131 Hz. A larger period gives a lower note.

At `step`, `and l` must produce `0xFF` for `inc a` to wrap to zero. This happens only when both
bytes are `0xFF`, detecting the sentinel before reading the rest of a row. In `tone`, `h OR l` is
zero only when the whole period is zero, so `ret z` skips the write. Adding 5 to `ix` advances to
the next step.

## Try it

Make the drums longer by editing `setup`: change `.byte 11, 0x58` to `.byte 11, 0x00`, and
`.byte 12, 0x02` to `.byte 12, 0x04`. Change the values, keeping the register numbers 11 and 12.
Period `0x0400`, or 1,024, gives a fall of about 146 ms.

Keep those edits, then give the lead the envelope too: change `.byte 8, 11` to `.byte 8, 16` in
`setup`. Each drum hit now restarts the same 146 ms volume fall for both lead and drums. A lead
note alone does not restart it. On steps without a new hit, any unfinished fall continues briefly,
then both channels stay silent until the next hit. The bass keeps its fixed volume. The
[Sound chip ports](/documentation/z80/io#sound-chip) list the other registers.
