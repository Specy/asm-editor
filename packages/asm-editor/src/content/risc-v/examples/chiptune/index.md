This program plays a short tune on the **Synth**, the sound chip this editor adds at
`0xffff0100`; RARS does not have it. Three of its eight channels play together, the way a game
console's music did: a pulse wave for the melody, a triangle wave for the bass, and noise for the
drums. Choose **Build**, then **Run**, with your sound on.

```riscv|playground|allow-open
.data
# One row a step, an eighth of a bar: the frequencies in Hz of the lead, the bass and the drum's
# noise. 0 leaves that channel as it is; a lead of 0xffff ends the song.
song:
    .half 523, 131, 1200,   659, 0, 0,   784, 0, 24000,   659, 0, 0
    .half 523, 131, 7000,   659, 0, 0,   784, 0, 24000,   1047, 0, 0
    .half 440, 110, 1200,   523, 0, 0,   659, 0, 24000,   523, 0, 0
    .half 440, 110, 7000,   523, 0, 0,   659, 0, 24000,   880, 0, 0
    .half 349, 87, 1200,   440, 0, 0,   523, 0, 24000,   440, 0, 0
    .half 349, 87, 7000,   440, 0, 0,   523, 0, 24000,   698, 0, 0
    .half 392, 98, 1200,   494, 0, 0,   587, 0, 24000,   494, 0, 0
    .half 392, 98, 7000,   494, 0, 0,   587, 0, 24000,   784, 0, 0
    .half 523, 131, 1200
    .half -1                # stored as 0xffff: the end of the song

.text
.globl main
main:
    li s0, 0xffff0100     # the Synth: channel 0 at +0x00, 1 at +0x20, 2 at +0x40

    # channel 0, the lead: a narrow pulse, struck, then held a little quieter
    sb zero, 0x11(s0)     # waveform 0: pulse
    li t0, 1024
    sh t0, 0x02(s0)       # pulse width: high a quarter of the time
    li t0, 4
    sh t0, 0x04(s0)       # attack
    li t0, 200
    sh t0, 0x06(s0)       # decay
    li t0, 60
    sh t0, 0x08(s0)       # release
    li t0, 80
    sb t0, 0x12(s0)       # volume
    li t0, 70
    sb t0, 0x13(s0)       # sustain

    # channel 1, the bass: a triangle, held at full level
    li t0, 1
    sb t0, 0x31(s0)       # waveform 1: triangle
    li t0, 40
    sh t0, 0x28(s0)       # release
    li t0, 127
    sb t0, 0x32(s0)       # volume
    sb t0, 0x33(s0)       # sustain

    # channel 2, the drums: noise that dies away at once, its sustain left at 0
    li t0, 4
    sb t0, 0x51(s0)       # waveform 4: noise
    li t0, 90
    sh t0, 0x46(s0)       # decay
    li t0, 100
    sb t0, 0x52(s0)       # volume

    la s1, song
    li s2, 1               # the gate bit
    li s3, 0xffff          # the end of the song
step:
    lhu t0, 0(s1)         # the lead
    beq t0, s3, done
    mv   a1, s0           # channel 0's registers
    jal strike
    lhu t0, 2(s1)         # the bass
    addi a1, s0, 0x20
    jal strike
    lhu t0, 4(s1)         # the drum
    addi a1, s0, 0x40
    jal strike
    li a7, 32
    li a0, 150             # an eighth of a bar: 150 milliseconds
    ecall
    addi s1, s1, 6        # the next row
    j step

# Plays the frequency in t0 on the channel whose registers start at a1; 0 leaves it alone.
strike:
    beqz t0, held
    sb zero, 0x10(a1)     # gate off, then on: the note is struck again
    sh t0, 0(a1)
    sb s2, 0x10(a1)
held:
    jr ra

done:
    li a7, 32
    li a0, 600             # let the last chord ring
    ecall
    li a7, 10                  # the program's end releases every gate
    ecall
```

The song is a table in memory, one row of three halfwords per step: the lead's frequency, the
bass's and the drum's, in Hz. A step lasts 150 milliseconds, waited out with service 32, so the
32 steps make four bars of eight, over the chords C, A minor, F and G. The lead plays a different
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

Then make the bass shorter: give channel 1 a decay of 150 at offset `0x26` and a sustain of 0, so
each bass note dies away like the drums. The [Synth chapter](/documentation/risc-v/synth) has the
other registers.
