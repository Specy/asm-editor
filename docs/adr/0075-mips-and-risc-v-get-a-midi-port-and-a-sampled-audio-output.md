---
status: accepted
date: 2026-11-04
---

# MIPS and RISC-V get a MIDI port and a sampled-audio output

MIPS and RISC-V programs can play MARS's and RARS's MIDI notes (syscalls 31 and 33) and the **Synth**'s waveforms, but they cannot stream. Syscall 31 needs a note's length before it starts, and the Synth plays from its own sample memory, with no way to read where it is. asmOS's Music player, Pac-Man's mixer and the Video Player's sound all need streams, as they have on x86 through Linux's raw MIDI port and `/dev/dsp`.

Two small devices, both of our own design held to what a chip of the time could have done ([ADR 0061](./0061-the-synth-is-a-chip-that-could-have-been-built.md)), sit right after the Input controller ([asmos-stage2.md](../design/asmos-stage2.md), decisions 8 and 9):

- **A MIDI port at 0xFFFF0340**, in the style of the MPU-401's UART mode. A data register takes MIDI bytes, and a status register at +0x04 has bit 6 set while the port is busy and bit 7 always set (no MIDI in), at the MPU-401's own bit positions. Writing 0xFF to that same address resets it. Bytes reach the General MIDI synthesizer at MIDI's 31,250 baud in Program time, behind a 4 KiB buffer; a byte written while the port is busy is dropped, as on the hardware.
- **A sampled-audio output at 0xFFFF0350**, a DAC with a FIFO. It has a control register (on, stereo), a rate register (4,000 to 48,000 Hz), a register counting the frames the FIFO can take, and a data register taking two signed 16-bit samples, or one stereo frame, per word. The FIFO holds 8,192 frames and drains at its rate in Program time.

Both follow the rules x86's raw MIDI port and `/dev/dsp` already follow ([x86-devices.md](../design/x86-devices.md)): silent in a Testcase but keeping their timing on the virtual clock, Undo taking back what has not been heard yet ([ADR 0059](./0059-undo-takes-back-the-sounds-an-instruction-made.md)), unchanged by Pause and Breakpoints, silenced by Stop, and a synthesizer reset at every Build and Run. They play through the synthesizer and the sampled-audio output the editor already has.

## Considered options

- **Syscall 31 for MIDI, with each note's length found by looking ahead, and the Synth's sample memory for short effects:** no new device, but the Video Player would stay silent, Pac-Man's mixer would need rewriting, and nothing could stream.
- **MIDI only:** half of what asmOS plays.
- **An MPU-401 copied exactly**, with its intelligent mode and command acknowledgements: more to emulate for no lesson a program needs. The port is always in UART mode, and 0x3F, the command that enters it, is accepted and does nothing.

## Consequences

- **Programs that use them run in no reference simulator**, as for the Synth ([ADR 0062](./0062-the-synth-sits-beside-each-reference-s-own-devices.md)). The Documentation and `<sim.h>` say so.
- **The MIDI port plays on a synthesizer of its own**, 16 channels with drums on 10, so it never shares a channel with syscall 31 and 33's notes.
- **In a Testcase neither spins:** reading the busy bit, or Free while it has not changed since the last read, moves the virtual clock to the next drain.
- **They are polled.** A FIFO-low interrupt is a natural later addition, beside the timers' interrupts ([ADR 0074](./0074-mips-and-risc-v-timers-count-what-their-references-count.md)).
- **They live in the adapter**, as the Synth and the Input controller do.
- **A bitmap display based at 0xFFFF0000 that covers either one switches it off**, as it does the Synth.
- **Their register layouts are now a contract.**
