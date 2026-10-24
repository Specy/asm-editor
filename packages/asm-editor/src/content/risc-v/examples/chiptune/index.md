This program plays a short tune on the **Synth**, this editor's sound chip at `0xffff0100`;
RARS does not have it. Three channels play together: a pulse wave for the melody, a triangle
wave for the bass, and noise for the drums. Choose **Build**, then **Run**, with your sound on.

Each channel repeats the same register layout every `0x20` bytes. Channels 0, 1 and 2 start at
`s0`, `s0 + 0x20` and `s0 + 0x40`. Add a setting's offset: decay is at `0x06`, so bass decay is
at `0x26(s0)`. `sh` writes two-byte settings; `sb` writes one-byte settings. Pulse **width**
counts the high part of a cycle out of 4096: 1024 gives a quarter; 2048 gives half, a square wave.

An **envelope** shapes a note's volume. Gate-on starts the **attack**, which rises to full
volume; **decay** falls to the **sustain** level and holds there while the gate stays on.
Gate-off starts the **release**, which fades to silence. Sustain ranges from 0 (silence) to 127
(the channel's full volume). Attack, decay and release use ticks of `1/1024` second, about one
millisecond. Decay and release values describe a fall across the whole volume range; smaller
drops take proportionally less time. A zero time makes that phase immediate. Registers start at
zero, so the bass's unset attack and decay are immediate, and the drum's unset sustain is silent.

```riscv|playground|allow-open
.data
# Each triple is a step, an eighth of a bar: the frequencies in Hz of the lead, bass and drum's
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

    # channel 2, the drums: noise that decays to silence, its sustain left at 0
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
    addi s1, s1, 6        # the next three-halfword step
    j step

# Plays the frequency in t0 on the channel whose registers start at a1; 0 leaves it alone.
strike:
    beqz t0, held
    sb zero, 0x10(a1)     # gate off, then on: restart the attack from its current level
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

Each table step is three halfwords: lead, bass and drum frequencies in Hz. `523, 131, 1200` is
the first step; the first eight data lines pack four steps each. `lhu` reads their two-byte
values at offsets 0, 2 and 4; adding 6 to `s1` reaches the next triple. A zero tells `strike` to
leave that channel alone.

Service 32 waits 150 milliseconds per step. The first 32 steps make four bars of eight; the
separate 33rd triple plays the closing chord. The following `.half -1` stores `0xffff`, the end
marker checked in the lead position. `done` lets that chord ring for another 600 milliseconds
before exiting. Noise frequency controls the drum's brightness: 1200 gives a low thud, 7000 a
snare-like sound and 24000 a hi-hat-like hiss.

`strike` has a local register contract: its caller supplies the frequency in `t0` and the
channel's starting address in `a1`. It reads both and uses `s2` for gate-on, 1. `jal strike`
saves the return address in `ra`; `jr ra` jumps back to it, just like `ret`. For a nonzero
frequency, the routine turns the gate off, stores the frequency, then turns the gate on. This
restarts attack from the current envelope level. The bass's immediate attack and full sustain
may therefore make repeated notes sound continuous.

## Try it

For a brighter, brassier lead, replace `sb zero, 0x11(s0)` with `li t0, 2` followed by
`sb t0, 0x11(s0)` to select a sawtooth. Run and listen. Restore the original waveform store,
then change `li t0, 1024` before the pulse-width store to `li t0, 2048`. Predict how the
half-width pulse will sound, then run it to compare the hollower square wave with the original.

Then make the bass shorter. After its waveform store, add `li t0, 150` followed by
`sh t0, 0x26(s0)` for decay, and replace `sb t0, 0x33(s0)` with `sb zero, 0x33(s0)` for zero
sustain. Predict which bass notes will now have silence between them, then run and listen:
each dies away in about 146 milliseconds, before the next 150-millisecond step. The
[Synth chapter](/documentation/risc-v/synth) has the other registers.
