The **sample** waveform plays a sound from a list of numbers. Each **sample** is the sound's level
at one instant: a signed byte from -128 to 127, with 0 for silence. This program computes those
bytes, copies them into the **Synth**, the sound chip this editor adds at `0xffff0100`, and plays
them as a scale. RARS does not have the Synth.

The buffer holds 4,000 samples. Each cycle has 16 positive samples followed by 16 negative ones,
making a square wave. Its **amplitude**, the size of the swing, falls by one every 32 samples to
make the sound fade. In the `fill` loop, `t1` is the sample index: `srli` divides it by 32 to count
cycles, and `andi` tests bit 4 to choose the positive or negative half. Indices 0, 16 and 32
therefore produce levels 125, -125 and 124. `sb` stores the low byte of each value; the Synth
interprets that byte as signed.

For this waveform, the frequency register sets **samples per second**. At 8,000 samples a second,
the 32-sample cycle repeats `8000 / 32 = 250` times a second: a 250 Hz tone. The 4,000 samples
would last half a second. Playing them twice as fast raises the pitch an octave and halves their
duration. The table selects eight notes of a major scale, from 250 Hz to 500 Hz.

Choose **Build**, then **Run**, with your sound on. Build resets the Synth's registers to zero;
this example leaves attack, decay, release and loop start at that default.

```riscv|playground|allow-open
.data
rates:                      # samples a second for each note: 8000 plays the sound as computed
    .half 8000, 8980, 10079, 10679, 11986, 13454, 15102, 16000, 0
pluck:
    .space 4000             # 4,000 signed samples: half a second at 8,000 a second

.text
.globl main
main:
    # fill the buffer with a fading square wave: 32 samples per cycle
    la t0, pluck
    li t1, 0               # sample index
    li t6, 4000
fill:
    srli t2, t1, 5        # cycle number: sample index / 32
    li t3, 125
    sub t3, t3, t2       # amplitude falls by 1 per cycle
    andi t4, t1, 16       # the first half of each cycle is high,
    beqz t4, store
    sub t3, zero, t3     # the second half low
store:
    add t5, t0, t1
    sb t3, 0(t5)
    addi t1, t1, 1
    blt t1, t6, fill

    # copy the samples into the Synth's Sample memory
    li s0, 0xffff0100
    sw t0, 0x180(s0)      # from the buffer
    sh t6, 0x184(s0)      # 4,000 bytes
    sh zero, 0x186(s0)    # to the start of Sample memory
    sb zero, 0x188(s0)    # trigger the copy; the written value does not matter

    # channel 0 plays them
    sh zero, 0x0a(s0)     # from sample 0
    sh t6, 0x0c(s0)       # for 4,000 samples, then silence
    li t1, 6
    sb t1, 0x11(s0)       # waveform 6: sample
    li t1, 120
    sb t1, 0x12(s0)       # volume
    li t1, 127
    sb t1, 0x13(s0)       # sustain: the samples fade by themselves

    la s1, rates
    li s2, 1               # the gate bit
next:
    lhu t1, 0(s1)         # the next rate
    beqz t1, done
    sb zero, 0x10(s0)     # gate off, then on: from the first sample again
    sh t1, 0(s0)
    sb s2, 0x10(s0)       # write the gate bit to channel 0's control register
    li a7, 32
    li a0, 300             # wait 300 ms before starting the next note
    ecall
    addi s1, s1, 2
    j next

done:
    li a7, 10
    ecall
```

The `pluck` buffer is in the program's memory. Playback reads the Synth's own **Sample memory**,
shared by all its channels. The **upload** copies between them: write the source address, byte
count and destination offset, then write to `0x188(s0)` to copy the bytes at that moment.
Changing `pluck` afterwards has no effect on playback until another upload copies it again.

Channel 0 selects waveform 6 and plays from sample 0 for 4,000 samples, then goes silent. Sustain
127 keeps the chip's envelope at full level while the gate is on, leaving the stored samples to
provide the fade. Each note turns the gate off and on to restart at the first sample with a new
rate. The 300 ms wait means the slower notes restart before their full fade finishes; at 16,000
samples a second, playback finishes after 250 ms, before the next note starts.

## Try it

Make the sound loop: change `li s2, 1` to `li s2, 3`. This loads 3 into the CPU register `s2`;
the existing `sb s2, 0x10(s0)` writes it to the Synth's control register. Value 3 sets both bit 0
(gate) and bit 1 (loop). Also change `li a0, 300` to `li a0, 800` so every note has time to reach
the end and loop before the next note starts.

The loop bit makes the channel return to its **loop start**, the halfword at offset `0x0e`, when
it reaches the end. Its default of 0 repeats the whole fade. To repeat only the last 160 samples,
insert `li t1, 3840` followed by `sh t1, 0x0e(s0)` immediately after `sh t6, 0x0c(s0)`. After the
initial fade, samples 3,840 through 3,999 repeat as a quiet held tone.

Then change the sound itself. `andi t4, t1, 16` splits each cycle of 32 samples in two
halves; `andi t4, t1, 8` makes it 16 samples per cycle, an octave higher. The
[Synth chapter](/documentation/risc-v/synth#samples) has the other registers.
