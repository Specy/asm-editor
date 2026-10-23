# Waveform sound

Decision record for sound a program shapes itself, beyond the **Notes** and **Sounds** of the [Audio design record](./audio.md): waveforms played by a device the program programs, and samples the program computes. Settled one question at a time in a grill session that started on 2026-10-23; anything under "Open decisions" is not settled yet.

## Which device on which Target

Decided on 2026-10-23: [ADR 0060](../adr/0060-the-z80-gets-a-real-sound-chip-the-others-a-synth.md).

| Target             | Device                                                                                                                  | Why                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z80                | The AY-3-8910, emulated: three square-wave tone channels, a noise generator, a mixer, volumes and one hardware envelope | The **Port map** is the Z80's own reference, and the AY is the real Z80 sound chip; preserving a real convention where one exists is the rule of ADRs 0003, 0020 and 0035 |
| MIPS, RISC-V, M68K | The **Synth**, of our own design ([below](#the-synth-channel)), and buffers of samples the program computes             | MARS, RARS and EASy68K offer no waveform sound at all, so whatever these get is invented; it might as well be what teaches best, the same on all three                    |

- The Z80 gets neither the synth nor sample buffers: a program that wants other waveforms on the Z80 has the AY's, and 64 KB leaves little room for samples.
- The synth and the sample buffers are one convention shared by MIPS, RISC-V and the M68K, reached in each Target's own way, so a Lecture or an Example written for one reads the same on the others.
- Lessons and Examples about chip sound differ between the Z80 and the rest, which the Language courses' mirror allows: language peculiarities live inside the mirrored Lectures ([ADR 0012](../adr/0012-language-courses-mirror-the-general-course.md)).

## The Synth channel

Decided on 2026-10-23: [ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md). The owner's constraint: a design of our own, but one a chip maker of the 1980s could plausibly have built, nothing more advanced. Each part follows how real chips of the time did it.

| Part               | In hardware                                                                                                                                           | What a program sets                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Clock              | 65,536 Hz (2¹⁶), as a 4.194304 MHz crystal divided by 64, the Game Boy's crystal                                                                      | nothing                                                                                                                                  |
| Frequency          | A 16-bit phase accumulator per channel, adding the frequency register every clock tick: on a 2¹⁶ Hz clock the register is exactly the frequency in Hz | 1 to 32,767 Hz; 440 is A4                                                                                                                |
| Pulse              | A comparator between the accumulator's top 12 bits and the pulse width, as on the SID                                                                 | waveform pulse, pulse width 0 to 4095; 2048 is a square wave                                                                             |
| Triangle, sawtooth | The accumulator's top bits, folded for the triangle, as on the SID and the NES                                                                        | waveform triangle or sawtooth                                                                                                            |
| Sine               | A 256-entry sine table in ROM, as in Yamaha's FM chips                                                                                                | waveform sine                                                                                                                            |
| Noise              | A linear-feedback shift register stepped as the accumulator wraps, as on the SID, the NES and the AY                                                  | waveform noise                                                                                                                           |
| Wavetable          | 32 programmable 4-bit samples per channel, looped once per period, as Namco's arcade chip and the Game Boy's third channel do                         | waveform wavetable, and the 32 samples                                                                                                   |
| Envelope           | Counters on the clock divided by 64, 1,024 Hz: attack, decay and sustain while the gate is on, release once it is off                                 | attack, decay and release in ticks of 1/1024 s, close to milliseconds; sustain 0 to 127; gate on or off, a gate on restarting the attack |
| Volume             | A small multiplier, as the SID multiplies its envelope into the waveform                                                                              | 0 to 127, the scale of MARS's Notes                                                                                                      |
| Channels           | One oscillator circuit time-shared, as Namco's and Yamaha's chips do                                                                                  | 8 channels                                                                                                                               |

Left out as beyond such a chip: digital filters with arbitrary coefficients (the SID's filter is analog, and varies from chip to chip), reverb and other effects, floating point, and more than a few dozen channels. The pulse width register was the owner's addition to the first proposal; the wavetable was proposed while making the design plausible and accepted. Integer Hz puts no note more than about 11 cents off pitch from C2 (65 Hz) up and less than 3 cents from 220 Hz up, which the Documentation's note table states; below C2 it grows, to 31 cents at the piano's lowest A. (Corrected on 2026-10-23 while writing the Documentation: the first figures here, 13 and 4 cents, were estimates.)

## Samples are a seventh waveform

Decided on 2026-10-23. The audio thread cannot read a program's memory while it plays, since that memory is the Core's, on the page's main thread, so a chip streaming from main memory, the Amiga's way, could not be emulated faithfully: what the program changed in a buffer during playback would never be heard. The SNES's sound chip (1990) worked the other way, and so does the Synth:

- **Sample memory.** The Synth has 64 KB of its own, holding 8-bit signed samples: eight seconds at 8,000 samples a second.
- **Upload.** A program copies a buffer from its memory into sample memory, naming the source address, the length and the offset to copy to. The copy is taken when it is asked for, as a DMA transfer would make it.
- **The sample waveform.** A Synth channel set to it plays from a start and a length in sample memory, once, or looping from a loop point. Its frequency register is the playback rate in samples a second: the accumulator steps one sample a wrap, so a sound computed at 8,000 samples a second plays at its own speed with 8,000 and an octave up with 16,000.
- Gate, volume and envelope work as for every other waveform, as the SNES's eight voices have an envelope each.
- A sound longer than sample memory streams by uploading into one half while the other plays, as SNES games did.

Rejected: Amiga-style sample channels of their own (they need the live memory reads above, so they would be faked with copies anyway) and a one-shot "play this buffer at this rate" service (no chip, no loop, no pitch, no envelope).

## Memory-mapped registers

Decided on 2026-10-23: [ADR 0062](../adr/0062-the-synth-sits-beside-each-reference-s-own-devices.md).

| Target       | Register block    | Beside                                                                                     |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------ |
| MIPS, RISC-V | 0xFFFF0100 and up | MARS's and RARS's keyboard and display registers at 0xFFFF0000 to 0xFFFF000F               |
| M68K         | $E00100 and up    | EASy68K's hardware devices at $E00000 to $E00015 by default (the deferred hardware window) |

- A program writes the registers with ordinary stores of their size, `sw`, `sh` or `sb`, `move.l`, `move.w` or `move.b`, as a driver for a real chip does.
- An upload into **Sample memory** is a few register writes, the source address, the length and the destination offset, then a write to a register that starts it, which copies at that instant as a DMA controller would.
- `<sim.h>` gives C the register addresses and small inline helpers, as it does for the bitmap display and the keyboard registers.
- The registers are memory the Core already rewinds, so after an Undo the Synth re-reads its registers from memory, as the bitmap display re-syncs ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)); only uploads need a journal of their own.
- MARS and RARS already offer memory observers for a range, which `MarsDevices` uses. s68k has none: it needs a memory-observer range, a Core change and a release.

Rejected: a syscall or trap task per register write, slower and nothing like hardware, which teaches the opposite of what the device is for.

## The register map

Decided on 2026-10-23. Offsets from the block's base, 0xFFFF0100 on MIPS and RISC-V and $E00100 on the M68K; registers of more than a byte are in the Target's own byte order, so a plain `sh` or `move.w` writes one. The block spans 0x200 bytes, 0xFFFF0100 to 0xFFFF02FF and $E00100 to $E002FF.

**Synth channels**: eight blocks of 32 bytes, channel _n_ at base + _n_ × 0x20.

| Offset    | Bits | Register                                                                          |
| --------- | ---- | --------------------------------------------------------------------------------- |
| 0x00      | 16   | frequency: Hz, or samples a second for the sample waveform                        |
| 0x02      | 16   | pulse width, 0 to 4095                                                            |
| 0x04      | 16   | attack, in ticks of 1/1024 s                                                      |
| 0x06      | 16   | decay                                                                             |
| 0x08      | 16   | release                                                                           |
| 0x0A      | 16   | sample start, an offset in Sample memory                                          |
| 0x0C      | 16   | sample length; 0 means all 65,536                                                 |
| 0x0E      | 16   | loop start                                                                        |
| 0x10      | 8    | control: bit 0 gate, bit 1 loop                                                   |
| 0x11      | 8    | waveform: 0 pulse, 1 triangle, 2 sawtooth, 3 sine, 4 noise, 5 wavetable, 6 sample |
| 0x12      | 8    | volume, 0 to 127                                                                  |
| 0x13      | 8    | sustain, 0 to 127                                                                 |
| 0x14–0x1F |      | reserved                                                                          |

**Wavetables**: base + 0x100 + _n_ × 0x10, sixteen bytes a channel holding 32 four-bit samples, the first of each pair in the byte's high half, as on the Game Boy.

**Upload into Sample memory**: base + 0x180.

| Offset | Bits | Register                                |
| ------ | ---- | --------------------------------------- |
| 0x180  | 32   | source address in the program's memory  |
| 0x184  | 16   | length in bytes; 0 means 65,536         |
| 0x186  | 16   | destination offset in Sample memory     |
| 0x188  | 8    | start: any write copies at that instant |

- **Write-only.** Reading a register gives back what was written, as any memory does, and there is no status register: many chips of the time were write-only, the SN76489 and much of the Amiga's, and it leaves s68k observing writes alone. A status, such as whether a channel still sounds, can be added if Examples need it.
- **Everything starts at 0 on every Build**: every channel silent with its gate off, as a chip is at power-on. There is no master volume, which at 0 would make every program start silent.
- **The gate is one bit of a control byte**, as on the SID, so a note starts and stops with a single byte store.

## The Sound chip on the Z80

Decided on 2026-10-23: an MSX's AY, exactly, so MSX sound code and MSX music players run unchanged.

| Choice           | Decision                                                                                                                              | Why                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Ports            | 0xA0 writes the register number, 0xA1 writes its value, 0xA2 reads its value                                                          | The MSX's own, free in the **Port map** and in the TRS-80's decoding                                      |
| Clock            | 1.7897725 MHz, the MSX's                                                                                                              | A tone's frequency is the clock ÷ (16 × period), so 440 Hz is period 254, and MSX period tables are right |
| Variant          | The AY-3-8910 and its 16-step envelope                                                                                                | General Instrument's original; the YM2149 of later MSXs and the Atari ST differs in its 32-step envelope  |
| Reads            | Registers 0 to 13 read back what was written, their unused bits cleared (four bits of a period's high register, five of an amplitude) | What the chip does                                                                                        |
| Registers 14, 15 | 14 reads 0xFF; writes to either are ignored                                                                                           | The MSX wires its two I/O ports to the joysticks: nothing pressed, nothing attached, like the empty bus   |
| Emulation        | Our own AudioWorklet code, written from ayumi, a precise AY and YM emulator under the MIT licence, with its notice                    | Precise, small, a licence that fits                                                                       |

- The MIDI `NOTE_*` ports at 0x60 to 0x64 stay: a program can use either or both.
- The Sound chip works in both Screen modes, the drawing ports and the TRS-80 display ([ADR 0020](../adr/0020-mirror-the-trs80-display-in-guest-memory.md)).

## Undo, Pause, the end of a program, Stop and Testcases

Decided on 2026-10-23.

| Moment                                  | The Synth and the Sound chip                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo                                    | The chips follow their registers. The Synth re-reads its block from the Core's memory, which the Core has rewound; the Sound chip's register writes are journaled, as the `NOTE_*` registers are. Whatever the restored registers say plays, a gate turned back on included, which attacks again as hardware does |
| An upload into Sample memory, undone    | Sample memory gets back the bytes the upload overwrote, which the Audio journal keeps                                                                                                                                                                                                                             |
| A **Pause**, a stop at a **Breakpoint** | Nothing changes: a gated channel sounds on, as a real chip does while a debugger holds the CPU                                                                                                                                                                                                                    |
| The program ends on its own             | Every Synth gate is released, so its channels fade through their release, and the Sound chip's volumes go to 0: the deviation that stops loops, for the same reason, nothing left to stop them                                                                                                                    |
| Stop, Build, the start of a Testcase    | Silence at once; the next Build's zeroed registers and empty Sample memory do the rest                                                                                                                                                                                                                            |
| A **Testcase**                          | Silent; Synth registers read back as the memory they are and Sound chip registers as written, so a Testcase answers as an interactive run does                                                                                                                                                                    |
| The cap of 64                           | Does not apply: eight and three fixed channels; everything mixes into the same master volume, mute included                                                                                                                                                                                                       |

Why a gate comes back on after an Undo, where [ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md) never starts a sound: a Note or a Sound is a recording, which cannot be resumed convincingly halfway, but a chip's channel is the state of its registers, and an Undo that left a channel the registers call gated silent would make the program and the chip disagree until the program's next write. ADR 0059 carries an update saying so. Rejected: silencing on every Undo, as ADR 0059 does for Notes and Sounds.

## Documentation, Lectures and Examples

Decided on 2026-10-23.

- **Documentation.** MIPS, RISC-V and the M68K each get a Synth chapter: the register map, the waveforms, the envelope, uploads, a note-frequency table, and that it is an extension MARS, RARS and EASy68K do not have. The Z80's input and output page gets the Sound chip's group: its three ports, its registers, the period formula and a period table. The coding agent's prompt names both.
- **`<sim.h>`.** The Synth's base address and register offsets as constants, and small inline helpers, `sim_synth_play(channel, hz)`, `sim_synth_gate(channel, on)` and `sim_synth_upload(source, length, offset)`, as the header already exposes the bitmap display and the keyboard registers.
- **Lectures.** No new Lecture ([ADR 0012](../adr/0012-language-courses-mirror-the-general-course.md)): the making-sound section of each language's system-call Lecture grows a short part on waveforms with one playground, a pulse wave with an envelope on the Synth, a tone on the Sound chip on the Z80.
- **Examples.** "Chiptune": one short tune on all four Targets, a pulse lead, a triangle bass and noise drums, on the Sound chip's three channels on the Z80, under one topic key so they link across languages. "Sampled sound" on MIPS, RISC-V and the M68K: a waveform computed into memory, uploaded and played at several pitches.

## Open decisions

None. Every question was settled on 2026-10-23, and the [implementation plan](./waveform-sound-plan.md) was written and carried out the same day.

## Deferred

- A status register, such as whether a Synth channel still sounds, if Examples need one.
- Formats beyond 8-bit signed samples, and the YM2149's 32-step envelope.
- Anything a 1980s chip could not have done, by [ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md): digital filters, effects, more channels.
