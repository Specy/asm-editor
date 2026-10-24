---
status: accepted
date: 2026-10-23
---

# The Synth sits beside each reference's own devices

The **Synth** ([ADR 0061](./0061-the-synth-is-a-chip-that-could-have-been-built.md)) is reached through memory-mapped registers that programs write with ordinary stores, as real sound chips are, placed beside the devices each Reference environment already maps: from 0xFFFF0100 on MIPS and RISC-V, after MARS's and RARS's keyboard and display registers at 0xFFFF0000, and from $E00100 on the M68K, after EASy68K's hardware devices at $E00000 to $E00015. A program that pokes the Synth reads like a driver for real hardware on that machine, and the addresses sit where that environment already keeps its devices rather than somewhere a reader could not guess. An upload into **Sample memory** is a few register writes and one that starts it, copying at that instant as a DMA controller would.

## Considered options

- **A syscall or a trap #15 task per register write**: the same shape as MARS's MIDI services, and no Core change on the M68K, but a call per write is slow for a device a program updates many times a frame, and it teaches the opposite of what the device is for.
- **One address for every Target**: simpler documentation, but the M68K's 24-bit bus ignores an address's top byte, so 0xFFFF0100 there is $FF0100, about 64 KB under the initial stack pointer at $01000000, inside the stack; and any shared address would sit apart from at least one environment's own devices.

## Consequences

- The registers are memory the Core already rewinds, so the Synth re-reads them after an Undo, as the bitmap display does ([ADR 0005](./0005-restore-screen-state-on-undo.md)); uploads, which change Sample memory rather than the program's memory, keep a journal of their own.
- s68k gains a memory-observer range, as MARS and RARS already have, which is a Core change and a release.
- A program using the Synth runs in no reference simulator: MARS, RARS and EASy68K would see plain stores to memory there.
