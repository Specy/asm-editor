---
status: accepted
date: 2026-10-23
---

# The Z80 gets a real sound chip, the others a synth of our own

Waveform sound, beyond the MIDI **Notes** and the **Sounds** of Files the Reference environments already have, comes from a different device on the Z80 than on the other Targets. The Z80 gets an emulated AY-3-8910, the sound chip of the MSX, the ZX Spectrum 128 and the Amstrad CPC: its **Port map** is its own reference, and where a real convention exists this project preserves it rather than inventing one ([ADR 0003](./0003-preserve-simulator-graphics-conventions.md), [ADR 0020](./0020-mirror-the-trs80-display-in-guest-memory.md), [ADR 0035](./0035-environments-match-their-reference.md)), so its registers are the lesson and real chip code and music run. MIPS, RISC-V and the M68K get a synth of our own, sine, square, triangle, sawtooth and noise waveforms, and buffers of samples a program computes: MARS, RARS and EASy68K have no waveform sound to preserve, so these Targets get an invented convention whichever is chosen, and the friendliest one teaches best. It is one convention for the three of them.

## Considered options

- **The AY on every Target**, memory-mapped where there are no ports: one device and one set of documentation, but square waves and noise only, and a real chip's limits taught where no real chip is being emulated.
- **The synth on every Target**, the Z80 included: friendlier, but it would invent a convention where the Z80 has a real one, and nothing learned would carry over to real Z80 machines.
- **Sample buffers only**: any waveform, but the program does all of the work and has no continuous tone without refilling.

## Consequences

- The Z80 has no sine or sawtooth waves and no sample buffers; its waveforms are the AY's.
- Lessons and Examples about chip sound differ between the Z80 and the other Targets, inside the mirrored Lectures of [ADR 0012](./0012-language-courses-mirror-the-general-course.md).
- The synth and the buffers are an extension beyond MARS, RARS and EASy68K, which their Documentation states as such: a program using them runs in no reference simulator.
