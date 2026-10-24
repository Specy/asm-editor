---
status: accepted
date: 2026-10-23
---

# The Synth is a chip that could have been built

The **Synth** of MIPS, RISC-V and the M68K ([ADR 0060](./0060-the-z80-gets-a-real-sound-chip-the-others-a-synth.md)) is a design of our own, but every part of it is something a chip maker of the 1980s could have built, and its registers mean what that hardware would make them mean. Eight **Synth channels** share one oscillator circuit, as Namco's and Yamaha's chips did, on a 65,536 Hz clock, the 4.194304 MHz crystal of the Game Boy divided by 64. Each channel's frequency drives a 16-bit phase accumulator, so on a 2¹⁶ Hz clock the register is exactly the frequency in Hz, which keeps "write 440, hear A4" true without pretending a chip takes Hz. Pulse with a 12-bit width, triangle and sawtooth come from the accumulator as on the SID and the NES, sine from a ROM table as in Yamaha's FM chips, noise from a shift register, and a 32-sample 4-bit wavetable per channel as on Namco's arcade chip and the Game Boy. The envelope counts on the clock divided by 64, so its times are in 1/1024 s, and volume is a small multiplier. Samples are a seventh waveform, played from the Synth's own 64 KB **Sample memory** that a program uploads into, as the SNES's sound chip plays from its own memory, at a rate the same frequency register gives in samples a second; a chip reading the program's memory as it plays, the Amiga's way, could not be emulated faithfully, since the audio thread cannot see the Core's memory.

The owner asked for this constraint: a convention we invent should still read as hardware, so that what a student learns about registers, clocks and envelopes is true of real chips, and should not grow into what no chip of the time could do.

## Considered options

- **A friendly API with no hardware behind it**, frequencies in Hz, times in milliseconds, any feature: easiest to read, but it teaches nothing about how sound hardware works, and nothing stops it growing filters and effects.
- **Eight SID voices, register for register**: every SID tutorial would apply, but frequencies in clock units (440 Hz is 7,493), no sine, and the SID's analog filter either left out, which half-copies a chip, or emulated, which no digital chip of the time could have done.

## Consequences

- Left out as beyond such a chip: digital filters with arbitrary coefficients, reverb and effects, floating point, many dozens of channels. A later feature is weighed against the same constraint.
- Envelope times are in ticks of 1/1024 s, close to milliseconds but not exactly, which the Documentation says.
- Integer Hz is coarse at low pitches, at most about 13 cents off at the lowest piano C notes; the Documentation's note table gives the nearest values.
