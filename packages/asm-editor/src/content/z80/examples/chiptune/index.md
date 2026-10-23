This program plays a short tune on the **Sound chip**, the AY-3-8910 of the MSX, at the MSX's own
ports. The chip has three square-wave channels and one noise generator: channel A plays the
melody, B the bass and C the drums. Choose **Build**, then **Run**, with your sound on.

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

The song is a table in memory, five bytes a step: the lead's period, the bass's period and the
drum's noise period. A step lasts 15 hundredths of a second, waited out with the wait port, so the
32 steps make four bars of eight, over the chords C, A minor, F and G. A period is the chip's clock
divided by 16 times the frequency, so the lead's middle C an octave up, 523 Hz, is period 214, and
a bigger period is a lower note: the bass's C is 855.

The drums use the chip's one **envelope**, a volume that changes by itself. Channel C's volume
register holds 16, which means "follow the envelope", and envelope shape 0 falls once from full
volume to silence and stays there. Writing the shape register restarts it, even with the same
shape, so each write is a drum hit. The noise period sets how bright the drum sounds: 24 is the
low thud of a kick drum, 6 a snare and 1 a hi-hat.

The mixer, register 7, switches each channel's tone and noise on with a 0 bit. `0x9C` is
`10011100` in binary: bits 0 and 1 are 0, the tones of A and B; bit 5 is 0, the noise of C. Bit 7,
set, is what an MSX's own software leaves there.

## Try it

Make the drums longer: change register 11 to `0x00` and 12 to `0x04`, an envelope period of 1,024,
about a seventh of a second.

Then give the lead the envelope too: change register 8's value from 11 to 16. The lead's notes now
die away with every drum hit and stay silent on the steps without one, since the chip has only one
envelope for all three channels. The [Sound chip ports](/documentation/z80/io#sound-chip) list the
other registers.
