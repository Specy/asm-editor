This program computes a plucked sound, copies it into the editor's **Synth** at `0xffff0100`,
and plays it at eight pitches. MARS does not have the Synth. Choose **Build**, then **Run**, with
your sound on.

A **sample** is a number giving the sound's level at one instant. Here each sample occupies one
signed byte, with values from -128 to 127; 0 is the centre level. The `pluck` buffer reserves
4,000 bytes in the program's memory, one per sample.

The `fill` loop makes a square wave that fades. `$t1` counts sample positions from 0 to 3,999.
Shifting it right by 5 divides it by 32, discarding the remainder, to find the current period.
Subtracting that period number from 125 gives the **amplitude**, the height of the wave's swing:
it starts at 125 and falls by one every 32 samples. The mask `andi $t4, $t1, 16` is zero for the
first 16 positions of each period and nonzero for the next 16. The loop keeps the amplitude
positive for the first half and negates it for the second. `sb` writes the low byte of that signed
result at `pluck + $t1`.

The Synth plays from its own **Sample memory**, shared by all eight channels. The program
**uploads** a copy of `pluck` there, then selects waveform 6 to play those bytes as signed levels.
For this waveform, the frequency register sets the **playback rate in samples per second**.
At a rate of 8,000, the 32-sample wave repeats `8000 / 32 = 250` times a second: 250 Hz.
The whole buffer takes `4000 / 8000 = 0.5` seconds to play, fading like a plucked string.

```mips|playground|allow-open
.data
rates:                      # samples a second for each note: 8000 plays the sound as computed
    .half 8000, 8980, 10079, 10679, 11986, 13454, 15102, 16000, 0
pluck:
    .space 4000             # 4,000 signed samples: half a second at 8,000 a second

.text
.globl main
main:
    # compute a plucked string: a square wave of 32 samples a period, fading away
    la $t0, pluck
    li $t1, 0               # the sample's number
    li $t6, 4000
fill:
    srl $t2, $t1, 5         # which period it is in: its number / 32
    li $t3, 125
    sub $t3, $t3, $t2       # the amplitude, falling by 1 a period
    andi $t4, $t1, 16       # the first half of each period is high,
    beqz $t4, store
    sub $t3, $zero, $t3     # the second half low
store:
    add $t5, $t0, $t1
    sb $t3, 0($t5)
    addi $t1, $t1, 1
    blt $t1, $t6, fill

    # copy the samples into the Synth's Sample memory
    li $s0, 0xffff0100
    sw $t0, 0x180($s0)      # from the buffer
    sh $t6, 0x184($s0)      # 4,000 bytes
    sh $zero, 0x186($s0)    # to the start of Sample memory
    sb $zero, 0x188($s0)    # now

    # channel 0 plays them
    sh $zero, 0x0a($s0)     # from sample 0
    sh $t6, 0x0c($s0)       # for 4,000 samples, then silence
    li $t1, 6
    sb $t1, 0x11($s0)       # waveform 6: sample
    li $t1, 120
    sb $t1, 0x12($s0)       # volume
    li $t1, 127
    sb $t1, 0x13($s0)       # sustain: the samples fade by themselves

    la $s1, rates
    li $s2, 1               # the gate bit
next:
    lhu $t1, 0($s1)         # the next rate
    beqz $t1, done
    sb $zero, 0x10($s0)     # gate off, then on: from the first sample again
    sh $t1, 0($s0)
    sb $s2, 0x10($s0)
    li $v0, 32
    li $a0, 300             # 300 milliseconds a note
    syscall
    addi $s1, $s1, 2
    j next

done:
    li $v0, 10
    syscall
```

The upload uses four device registers, all at offsets from the Synth base in `$s0`:

| Offset  | Write                 | Meaning                                            |
| ------- | --------------------- | -------------------------------------------------- |
| `0x180` | word from `$t0`       | Source address: `pluck` in the program's memory.   |
| `0x184` | halfword from `$t6`   | Length: 4,000 bytes.                               |
| `0x186` | halfword from `$zero` | Destination: offset 0 in Sample memory.            |
| `0x188` | byte from `$zero`     | Start the copy now; any written value triggers it. |

The copy captures the buffer at that moment. Changing `pluck` afterwards leaves the uploaded
sound unchanged until another upload replaces it.

Channel 0 starts at Sample-memory offset 0 and plays 4,000 samples. Sustain 127 holds the
channel's envelope at full level, leaving the shrinking sample values to make the fade. Build
starts the other Synth registers at 0, so attack, decay, and release are immediate and looping
is off. At the buffer's end, playback becomes silent. Switching the gate off and on restarts
from the first sample.

The `rates` table holds eight playback rates followed by a zero end marker. Each halfword takes
two bytes, so `addi $s1, $s1, 2` moves to the next rate. The rates form a major scale starting
from the buffer's 250 Hz tone. Playing the same samples faster raises the pitch and finishes
the buffer sooner: 16,000 is twice the initial rate, giving a tone one octave higher at 500 Hz
and a buffer duration of a quarter of a second.

Service 32 waits 300 milliseconds between gate restarts. At the lower rates, this cuts the
sound short: the first buffer needs 500 milliseconds to finish. At 16,000, the whole buffer
finishes in 250 milliseconds, leaving a short silence before the wait ends.

## Try it

First replace `li $a0, 300` with `li $a0, 800`. This gives every note time to reach the buffer's
end and lets you hear the looping experiments below.

Make the whole fade repeat by replacing `li $s2, 1` with `li $s2, 3`. This loads 3 into the CPU
register `$s2`; the existing `sb $s2, 0x10($s0)` then writes it to the Synth's control register.
The value 3 sets both bit 0, the gate, and bit 1, looping. When playback reaches the end, it
returns to the **loop start**, the halfword at offset `0x0e`. Its default value is 0, so the
whole fade repeats until the next gate restart.

Then loop only the quiet tail. After `li $s0, 0xffff0100`, add `li $t1, 3840` followed by
`sh $t1, 0x0e($s0)`. Keep `$s2` at 3 and the wait at 800 milliseconds. Each note first plays
the whole buffer, then repeats samples 3,840 through 3,999: the last 160 samples, heard as a
quiet held tone.

Finally change the sound itself. `andi $t4, $t1, 16` splits each period of 32 samples into two
halves; changing the mask to `andi $t4, $t1, 8` makes the wave repeat every 16 samples, an octave
higher at the same playback rate. The [Synth chapter](/documentation/mips/synth#samples) lists
the other registers.
