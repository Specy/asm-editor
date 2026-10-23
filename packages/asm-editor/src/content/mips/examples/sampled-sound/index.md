This program computes a sound, copies it into the **Synth**, the sound chip this editor adds at
`0xffff0100`, and plays it as a scale. MARS does not have the Synth. Choose **Build**, then
**Run**, with your sound on.

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

Make the sound loop: set the loop bit as well as the gate, by storing 3 instead of 1 in `$s2`.
The control register's bit 1 makes the channel go back to its **loop start**, the halfword at
offset `0x0e`, each time it reaches the end; with a loop start of 0 the whole fade repeats. Give
the loop start 3,840 instead, the last 160 samples, and the end of the fade repeats as a quiet
held tone.

Then change the sound itself. `andi $t4, $t1, 16` splits each period of 32 samples in two
halves; `andi $t4, $t1, 8` makes it 16 samples a period, an octave higher. The
[Synth chapter](/documentation/mips/synth#samples) has the other registers.
