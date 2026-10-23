# Waveform sound: implementation plan

Written on 2026-10-23 after the design interview. The decisions are in [waveform-sound.md](./waveform-sound.md), which device on which Target in [ADR 0060](../adr/0060-the-z80-gets-a-real-sound-chip-the-others-a-synth.md), the Synth's design in [ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md), its placement in [ADR 0062](../adr/0062-the-synth-sits-beside-each-reference-s-own-devices.md), the vocabulary in [CONTEXT.md](../../CONTEXT.md) (**Sound chip**, **Synth**, **Synth channel**, **Sample memory**). It builds on the Audio Peripheral of [audio-plan.md](./audio-plan.md), implemented and uncommitted. The plan covers one s68k Core change, two chip emulations, their place in Audio and its browser output, three adapters, and the documentation, Lectures and Examples. Nothing is implemented.

## Starting point

Checked on 2026-10-23 in this checkout. Paths under `packages/`.

| Area          | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MARS and RARS | A user program stores to 0xFFFF0100 to 0xFFFF02FF and reads the values back as plain memory, by bytes, halves and words, on both Cores (checked by running programs through the editor's adapters). The editor already observes the Cores' memory: `MarsDevices.ts` uses `addMemoryWriteObserver(start, end, (address) => …)` for the bitmap display and `addMemoryAccessObserver` for the four keyboard and display registers, and reads memory back with `readMemoryBytes` (:70-82, :287-324, :409). So MARS and RARS need no Core change. |
| s68k          | Every store goes through `Memory::write_byte`, `write_word` and `write_long` (`interpreter.rs:399-419`); nothing can observe them. `readMemoryBytes(address, length)` exists in the TypeScript wrapper (`ts-lib/src/index.ts:415`). The unreleased 4.0.0 already carries the sound outcomes.                                                                                                                                                                                                                                                 |
| Z80           | Ports reach `Z80Device.readPort`/`writePort` synchronously from the Core's port hooks; 0xA0 to 0xA2 are free in the editor's map and the TRS-80's decoding. The `NOTE_*` registers already journal through `Audio.record`.                                                                                                                                                                                                                                                                                                                   |
| Audio         | `peripherals/audio/Audio.ts` holds the program-facing state, a batch of commands flushed at the end of a slice or Step, before a wait and before a read, a journal keyed by instruction (`TerminalHistory`), silent mode for Testcases, `reset()` on Build, Stop and dispose, `stopLoops()` at a program's own end. `browserAudioOutput.ts` makes one output per Emulator on the page's one context and master gain.                                                                                                                         |
| Bundling      | Workers are bundled with Vite's `?worker` imports (`projectSearch/searchClient.ts:1`, `pseudocode/pseudocodeClient.ts:2`, the Monaco workers). Nothing bundles an AudioWorklet of our own yet; spessasynth's processor is a prebuilt file imported with `?url`.                                                                                                                                                                                                                                                                              |
| ayumi         | A precise AY-3-8910 and YM2149 emulator in C, under the MIT licence, with a JavaScript port (ayumi-js).                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Decisions taken while planning

Taken by default, for the owner to overturn.

1. **One device model per chip, fed the writes in order.** `Synth` and `SoundChip` live in `peripherals/audio/`, beside `Audio`, each keeping a mirror of its registers: 512 bytes for the Synth, 16 registers and the selected number for the Sound chip. An adapter hands every write over as it happens; the model compares it with the mirror and turns what changed into commands for the batch, a gate's rising edge into an attack and its falling edge into a release. Writes are taken one by one, never as a snapshot at the end of a slice: a snapshot would lose a gate pulsed off and on within a slice, which is how a note is retriggered, and would copy an upload late, after the program had already reused its buffer.
2. **s68k reports a watched write as it happens.** A Core API `watchMemory(start, end)` makes an instruction that stores into the range end the run call after it, with the writes it made (address, size, value) readable, as MARS's `pause()` ends a call. The adapter applies them and runs on. A log drained at the end of a slice was rejected for the reason in decision 1. It goes into 4.0.0, which is still unreleased.
3. **MARS and RARS observe the range in the editor.** A write observer on 0xFFFF0100 to 0xFFFF02FF reads the aligned word around the written address back with `readMemoryBytes` and hands the model the bytes, within the Core's own store. No Core change, no release.
4. **Undo re-reads the Synth's block.** After the Core has rewound, the adapter reads the 512 bytes back and the model applies the difference, a gate turned back on attacking again (the design record's exception to ADR 0059). An upload records the bytes of Sample memory it overwrote in the Audio journal, and its Undo sends them back. The Sound chip's port writes are journaled through `Audio.record`, as the `NOTE_*` registers are.
5. **The chips' sound is pure TypeScript, run in a worklet of our own.** `synthCore.ts` and `soundChipCore.ts` render into a `Float32Array` at the output's sample rate and have no Web Audio in them, so their behaviour is tested under node; a worklet module imports them and is bundled with Vite's `?worker&url`, which the spike checks first. One chip node per Emulator output, made on the first chip write.
6. **No hold for the chips.** A chip is a state, not a recording: writes made before its worklet has loaded are kept as the mirror, and the node starts from the mirror once it runs, so nothing has to wait and nothing is played late. The worklet is tens of kilobytes.
7. **The Synth renders its waveforms at the output rate**, stepping each phase accumulator by frequency × 65,536 ÷ the output rate for every output sample and its envelope by 1,024 ticks a second, with the aliasing a chip of the time had. **The Sound chip is ayumi**, translated to TypeScript with its MIT notice, keeping its own resampling.
8. **Sample memory crosses as bytes.** An upload sends the copied bytes to the worklet with the command; the model keeps its own 64 KB too, for an Undo and for a node made after uploads.
9. **A program's own end releases the chips in the output only**: gate-off commands for the Synth and silent volumes for the Sound chip, while the mirrors keep what the program wrote, so an Undo that takes the end back plays on from its registers.
10. **One model of the Synth's registers**, `languages/synthRegisters.ts`: the offsets, the waveform numbers and the two bases. The device, the Documentation's chapter, the coding agent's prompt and the `<sim.h>` generator read it, as `MarsDevices.ts` already feeds the keyboard registers to the Screen chapter and `<sim.h>`.

## Milestones

M0 gates M3. M1 and M2 are independent of each other and of M0. M4 needs M2 and M3, M5 needs M1 and M4, M6 needs M5.

### M0: Spike

In the session scratchpad, not the repository:

- A worklet module of our own bundled with `?worker&url` by the app's Vite config, loaded by `audioWorklet.addModule` in the dev server and in a production build, and served from `_app/immutable/`.
- A sine and a pulse rendered by a first `synthCore` through it, heard through an analyser, with the page's master gain and mute.
- ayumi-js run in a worklet: CPU per render quantum at 48 kHz, and whether translating the C or adopting the port is the smaller job.

### M1: s68k (`@specy/s68k` 4.0.0)

- `watchMemory(start, end)`, `unwatchMemory()`: a store by any instruction or a Poke inside the range is recorded with its address, size and value.
- The run and step calls end after an instruction that stored into the range, with a stop the wrapper reports (a `WatchedWrite` reason), and `takeWatchedWrites()` returns what it stored, in order. Breakpoints and the other stops keep their order.
- Tests in `src/test/`: a byte, a word, a long and a `movem` into the range, a store just outside it, the order of several stores, a Poke, Undo of a watched store (the Core rewinds; nothing else is its business).
- README and the 4.0.0 migration note.

### M2: The chips' sound

Under `peripherals/audio/chips/`, plain TypeScript:

- `synthCore.ts`: eight channels, the phase accumulators, pulse against the 12-bit width, triangle, sawtooth, a 256-entry sine table, noise from a 15-bit shift register stepped on the accumulator's wrap, the 32-sample wavetable, samples from Sample memory once or looping, the envelope in 1/1024 s ticks, volume, the mix.
- `soundChipCore.ts`: ayumi translated, at 1.7897725 MHz, the AY's 16-step envelope.
- Tests under node: a frequency's zero crossings, a pulse's duty cycle, the envelope's times and sustain level, a gate retriggering, a sample played at double rate, a loop point, noise never stuck at zero; the Sound chip's tone at period 254 near 440 Hz, its envelope shapes, its mixer.

### M3: The chip worklet and the output

- `chips/chipProcessor.ts`, the worklet module, rendering both cores from commands posted to it; bundled with `?worker&url`.
- `browserAudioOutput.ts` routes the chip commands to the Emulator's own chip node, made on the first one, and starts it from the mirror (decision 6). Stop, Build and dispose silence it as they do every other sound.

### M4: Audio integration

- `Synth` and `SoundChip` models (decision 1) with the command types they add to `AudioOutput`, silent in a Testcase, reset with Audio, released at a program's own end (decision 9), journaled for Undo (decision 4).
- `synthRegisters.ts` (decision 10).
- Tests: a write turned into the right commands, a gate's two edges, an off-and-on pulse within one flush kept, an upload copied at its write and its Undo, a re-sync after Undo with a gate coming back on, silence in a Testcase, the end of a program.

### M5: Adapters

- **MIPS and RISC-V:** the write observer of decision 3 beside `MarsDevices`' own; `_undo` re-reads the block (decision 4).
- **M68K:** `watchMemory` on $E00100 to $E002FF at Build; a `WatchedWrite` stop hands its writes to the Synth and the run goes on; `_undo` re-reads the block.
- **Z80:** `SOUND_CHIP_SELECT` 0xA0, `SOUND_CHIP_WRITE` 0xA1 and `SOUND_CHIP_READ` 0xA2 in `Z80_PORTS` with a `'soundChip'` group and port docs with examples; reads answered from the model's registers with the chip's masks, register 14 as 0xFF.
- Tests through the real Cores: a program setting a channel and gating it, a gate pulse, an upload, Undo, a Testcase; on the Z80, an MSX-style register write sequence and its reads.

### M6: Documentation, `<sim.h>`, Lectures and Examples

As decided in the design record: the Synth chapter for MIPS, RISC-V and the M68K, generated from `synthRegisters.ts` with a note-frequency table and the statement that it is an extension; the Sound chip group on the Z80's input and output page with a period table; `<sim.h>` constants and helpers (`sim_synth_play`, `sim_synth_gate`, `sim_synth_upload`) and `pnpm source:help:generate`; the coding agent's prompt; a waveform part in each making-sound section; the "Chiptune" Example on all four Targets under one topic key and "Sampled sound" on MIPS, RISC-V and the M68K.

### M7: Verification

- The editor suite, the s68k suite, `source:help:check`, type-check, lint, format.
- Measure: a Synth register write per instruction in a loop on each Core, against the same loop storing elsewhere; the M68K's stop per watched write is the cost to watch.
- Chrome on both hosts: each waveform heard, the pulse width swept, an envelope, a sample at two pitches, an upload streamed in halves, Undo bringing a gate back, a Breakpoint and a Pause leaving a tone sounding, the end of a program releasing it, mute. Firefox and Safari remain the owner's checks, as for the Audio Peripheral.

### Releases

`@specy/s68k` 4.0.0, now with `watchMemory`. MARS, RARS and the Z80 need nothing of their own.

## Implementation risks

- **The worklet bundling.** `?worker&url` output loaded by `addModule` is unproven here (M0); the fallback is a hand-written worklet file in `static/`, which loses the shared TypeScript.
- **The M68K's stop per watched write.** A program writing the Synth on every iteration of a tight loop stops the Core that often. A stop is cheap beside a trap, which the adapter already handles all the time, but M7 measures it.
- **Writes observed inside MARS's store.** The observer runs in the Java store's call stack; reading memory back from inside it is what `MarsDevices` already does for the bitmap display, and the same must hold for a byte store into a word the observer reads.
- **CPU.** Eight Synth channels and the Sound chip per Emulator, rendered in JavaScript on the audio thread; several playgrounds on one lecture page each have their own node. M0 measures one; M7 measures a page with three.
