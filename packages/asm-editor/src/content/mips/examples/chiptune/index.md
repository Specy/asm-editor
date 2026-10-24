This program plays a short tune with three sounds at once: a pulse wave carries the melody, a
triangle wave plays the bass, and noise makes the drum hits. It uses the editor's **Synth** at
`0xffff0100`, which is unavailable in MARS. Choose **Build**, then **Run**, with your sound on.

## Set up three voices

Each Synth **channel** is an independent voice with its own settings. The channels start `0x20`
bytes apart. With the Synth's address in `$s0`, channel 0 starts at `$s0`, channel 1 at
`$s0 + 0x20`, and channel 2 at `$s0 + 0x40`. Each uses the same register offsets: waveform is
at `+0x11`, for example, so the bass's waveform is at `0x20 + 0x11 = 0x31` from `$s0`. The
program selects pulse with 0, triangle with 1, and noise with 4.

A note's **envelope** controls how its loudness changes over time. The channel's volume scales
the whole envelope; its sustain sets the level held while the gate stays on. Both use 0 to 127.

| Setting | What it controls                                             |
| ------- | ------------------------------------------------------------ |
| Attack  | The rise toward full level when the gate switches on.        |
| Decay   | The fall from full level to the sustain level.               |
| Sustain | The level held after decay; 0 is silence, 127 is full level. |
| Release | The fall to silence when the gate switches off.              |

Attack, decay, and release use ticks of **1/1024 second**, about 0.98 milliseconds each. The
lead's values 4, 200, and 60 describe about 4, 195, and 59 milliseconds for a full rise or fall.
Decay and release give the time it would take to fall from full level to silence; falling only
partway takes less time. A time of 0 makes that change immediate.

**Build** starts all Synth registers at 0. The bass leaves its attack and decay at 0 and sets
sustain to 127, so it reaches full level immediately and holds there. The drum leaves sustain
at 0, so each hit fades to silence even while its gate remains on.

## Read the song table

Each step is a group of **three halfwords**: lead, bass, and drum frequencies in Hz. In the first
group, `523, 131, 1200`, the values are at byte offsets 0, 2, and 4 from `song`. Three halfwords
occupy six bytes, so advancing the pointer by 6 reaches the next step. A table value of 0 tells
the player to leave that channel alone, letting its current note continue.

The first eight `.half` source lines each contain four groups: **32 steps** in all. Every eight
steps form one bar of music. A final group, `523, 131, 1200`, adds a closing chord as step 33.
The single `.half -1` after it stores `0xffff`; the player recognizes this in the lead position
as the end marker and stops reading before it needs another bass or drum value.

The loop calls `strike` for each channel, then uses service 32 to wait 150 milliseconds. This
helper takes the frequency in `$t0` and the channel's starting address in `$a1`. Its `beqz`
means **branch if zero**, skipping the gate and frequency writes for a held note. For a nonzero
frequency, it switches the gate off, stores the frequency, and switches the gate on to start
the envelope again. Each `jal strike` returns to the loop through `jr $ra`.

```mips|playground|allow-open
.data
# Each group of three halfwords is one step: lead, bass and drum frequencies in Hz.
# The first eight source lines each hold four steps. 0 leaves a channel unchanged.
# A lead value of 0xffff ends the song.
song:
    .half 523, 131, 1200,   659, 0, 0,   784, 0, 24000,   659, 0, 0
    .half 523, 131, 7000,   659, 0, 0,   784, 0, 24000,   1047, 0, 0
    .half 440, 110, 1200,   523, 0, 0,   659, 0, 24000,   523, 0, 0
    .half 440, 110, 7000,   523, 0, 0,   659, 0, 24000,   880, 0, 0
    .half 349, 87, 1200,   440, 0, 0,   523, 0, 24000,   440, 0, 0
    .half 349, 87, 7000,   440, 0, 0,   523, 0, 24000,   698, 0, 0
    .half 392, 98, 1200,   494, 0, 0,   587, 0, 24000,   494, 0, 0
    .half 392, 98, 7000,   494, 0, 0,   587, 0, 24000,   784, 0, 0
    .half 523, 131, 1200     # closing chord: step 33
    .half -1                # stored as 0xffff: the end of the song

.text
.globl main
main:
    li $s0, 0xffff0100     # the Synth: channel 0 at +0x00, 1 at +0x20, 2 at +0x40

    # channel 0, the lead: a narrow pulse, struck, then held a little quieter
    sb $zero, 0x11($s0)     # waveform 0: pulse
    li $t0, 1024
    sh $t0, 0x02($s0)       # pulse width: high a quarter of the time
    li $t0, 4
    sh $t0, 0x04($s0)       # attack, in ticks of 1/1024 second
    li $t0, 200
    sh $t0, 0x06($s0)       # decay, in the same ticks
    li $t0, 60
    sh $t0, 0x08($s0)       # release, in the same ticks
    li $t0, 80
    sb $t0, 0x12($s0)       # volume
    li $t0, 70
    sb $t0, 0x13($s0)       # sustain

    # channel 1, the bass: a triangle, held at full level
    li $t0, 1
    sb $t0, 0x31($s0)       # waveform 1: triangle
    li $t0, 40
    sh $t0, 0x28($s0)       # release
    li $t0, 127
    sb $t0, 0x32($s0)       # volume
    sb $t0, 0x33($s0)       # sustain

    # channel 2, the drums: noise that fades to silence, its sustain left at 0
    li $t0, 4
    sb $t0, 0x51($s0)       # waveform 4: noise
    li $t0, 90
    sh $t0, 0x46($s0)       # decay
    li $t0, 100
    sb $t0, 0x52($s0)       # volume

    la $s1, song
    li $s2, 1               # the gate bit
    li $s3, 0xffff          # the end of the song
step:
    lhu $t0, 0($s1)         # the lead
    beq $t0, $s3, done
    move $a1, $s0           # channel 0's registers
    jal strike
    lhu $t0, 2($s1)         # the bass
    addi $a1, $s0, 0x20
    jal strike
    lhu $t0, 4($s1)         # the drum
    addi $a1, $s0, 0x40
    jal strike
    li $v0, 32
    li $a0, 150             # each step lasts 150 milliseconds
    syscall
    addi $s1, $s1, 6        # the next group of three halfwords
    j step

# Plays the frequency in $t0 on the channel whose registers start at $a1; 0 leaves it alone.
strike:
    beqz $t0, held
    sb $zero, 0x10($a1)     # gate off, then on: the note is struck again
    sh $t0, 0($a1)
    sb $s2, 0x10($a1)
held:
    jr $ra

done:
    li $v0, 32
    li $a0, 600             # let the last chord ring
    syscall
    li $v0, 10                  # the program's end releases every gate
    syscall
```

Follow the bass values on steps 1 and 5 of each eight-step bar. The zeros between those values
leave it sounding. At step 5, the frequency repeats and the gate switches off and on. This
restarts the envelope from its current level; with immediate attack and full sustain, the bass
continues at full level. The melody changes on every step. For the drums, the noise
frequency changes the character of each hit: 1200 gives a low thud, 7000 a snare-like sound,
and 24000 a high hiss.

After the closing chord's usual 150-millisecond wait, the next loop reaches the end marker.
At `done`, service 32 waits another 600 milliseconds, giving that chord 750 milliseconds in
total before service 10 ends the program and releases the gates.

## Try it

Change the lead's waveform to 2, a sawtooth. In channel 0's setup, replace the
`sb $zero, 0x11($s0)` instruction with a `li` that puts 2 in `$t0`, followed by an `sb` that
stores `$t0` at the same offset. Build and run to hear the change.

You can also keep waveform 0 and change its pulse width from 1024 to 2048, making a square
wave. The original pulse stays high for a quarter of each cycle; a square wave stays high for
half. Build and run each version to compare their sounds.

Then make the bass shorter. In channel 1's setup, before the existing `li $t0, 127`, load 150
into `$t0` and store it with `sh` at `0x26($s0)`: channel offset `0x20` plus decay offset
`0x06`. Change the sustain store at `0x33($s0)` to use `$zero`. Keep the volume store at
`0x32($s0)` at 127. Each bass note will
now fade to silence in about 146 milliseconds, leaving a gap before its next note. The
[Synth chapter](/documentation/mips/synth) lists the other registers.
