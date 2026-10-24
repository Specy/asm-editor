# Waveform sound: implementation plan

Written on 2026-10-23 after the design interview. The decisions are in [waveform-sound.md](./waveform-sound.md), which device on which Target in [ADR 0060](../adr/0060-the-z80-gets-a-real-sound-chip-the-others-a-synth.md), the Synth's design in [ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md), its placement in [ADR 0062](../adr/0062-the-synth-sits-beside-each-reference-s-own-devices.md), the vocabulary in [CONTEXT.md](../../CONTEXT.md) (**Sound chip**, **Synth**, **Synth channel**, **Sample memory**). It builds on the Audio Peripheral of [audio-plan.md](./audio-plan.md), implemented and uncommitted. The plan covers one s68k Core change, two chip emulations, their place in Audio and its browser output, three adapters, and the documentation, Lectures and Examples. It was implemented on 2026-10-23; see [the implementation record](#implementation-record) at the end.

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

## Implementation record

Implemented on 2026-10-23, uncommitted. Everything the milestones list was built; what differs from the plan, and what was found on the way, is below.

### M0: the spike

- Vite's `?worker&url` bundles a worklet module that `audioWorklet.addModule` loads, in the dev server (served as `/@fs/…/chipProcessor.ts?worker_file&type=module`, its imports resolved by the server) and in a production build (one self-contained ES module of about 12 KB). Checked in a scratch Vite project with the app's `worker.format: 'es'`, through an `OfflineAudioContext` in headless Chrome: a sine at 440 Hz rendered 439 rising zero crossings a second, the Sound chip at period 254 rendered 440.
- CPU: ten seconds of all eight Synth channels plus the Sound chip rendered in 247 to 271 ms, under 3 % of one core.
- ayumi-js was not needed: ayumi's C is 338 lines, and translating it was the smaller job, mono only (the MSX's AY is one channel of sound) and the AY's table only.

### What was built

| Part                  | Where                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Register model        | `languages/synthRegisters.ts`: bases, offsets, sizes and descriptions, waveforms, wavetables, upload registers. The device, the Documentation, the agent's prompt and `<sim.h>` read it                                                                |
| Chip sound            | `peripherals/audio/chips/synthCore.ts` and `soundChipCore.ts` (ayumi translated, its MIT notice in the file), `chipProcessor.ts` the worklet, `chipMessages.ts` what it and the page say, `chipNode.ts` loading it once per context                    |
| Program-facing models | `peripherals/audio/Synth.ts` (mirror, gate edges counted as sounds started, uploads copied and journaled) and `SoundChip.ts` (registers, select, masks, journal), both owned by `Audio` as `audio.synth` and `audio.soundChip`                         |
| Commands              | `ChipCommand` in `AudioOutput.ts`: `synth` and `soundChip` register writes, `synthUpload`, `soundChipLoad` after an Undo, `releaseChips` at a program's own end. Consecutive writes of one chip merge into one message                                 |
| Output                | `browserAudioOutput.ts`: a `ChipVoice` per output, made on its first chip command, keeping what is sent before the node runs, disposed by `stopAll`; the worklet reports whether it is audible, which keeps the page's context awake                   |
| MIPS, RISC-V          | `MarsDevices` observes 0xFFFF0100 to 0xFFFF02FF and hands each store to the Synth inside the storing instruction; `rewind` silences the observer while the Core undoes, since MARS replays restored memory as ordinary stores; a "Synth" memory region |
| M68K                  | The block zeroed and watched at every Build; the watched writes taken after every run call, step, trap answer and Poke                                                                                                                                 |
| Z80                   | `SOUND_CHIP_SELECT`, `SOUND_CHIP_WRITE`, `SOUND_CHIP_READ` at 0xA0 to 0xA2, the `sound-chip` group (its page anchor), with a period table and three runnable examples                                                                                  |
| Documentation         | A Synth chapter for MIPS, RISC-V and the M68K from one template (`documentation/synth.md`, `synth.ts`), with pages at `/documentation/{mips,risc-v,m68k}/synth`; "From C" on MIPS and RISC-V; links from each Sound section                            |
| `<sim.h>`             | The Synth's constants, `SIM_SYNTH8`, `SIM_SYNTH16`, `SIM_SYNTH_TABLE` and the upload macros, `sim_synth_play`, `sim_synth_gate`, `sim_synth_upload`; the help catalogs list the three functions                                                        |
| Lectures, Examples    | A waveform part in each language's making-sound section; "Chiptune" on all four Targets (topic `chiptune`) and "Sampled sound" on MIPS, RISC-V and the M68K (topic `sampled-sound`)                                                                    |

### Decisions taken while implementing

1. **The worklet gets register writes, not decoded events.** Each chip core is the chip: it takes a register and its value, already in a fixed byte order, and detects a gate's edges itself, writing a gate it already has changing nothing, as on the SID. An Undo's re-sync is then just every register written again, which changes only what differs.
2. **The Synth's model takes a store as (offset, size, value)**, the shape both MARS's observer and s68k's watched writes report, with the Target's byte order and memory reader passed in a `SynthBus` with each store. It decodes from its mirror, so a byte stored into half of a halfword register is decoded with the other half.
3. **The upload registers never reach the worklet.** The model copies on the start register's write; the chip only sees `synthUpload` with the bytes.
4. **Undo of a Poke re-syncs the Synth too** (`Audio.resyncSynth`), since a Poke into the block is played like the program's own store.
5. **Envelope times are full-scale rates**, as on the SID: decay and release are how long a fall the whole way from full to silence takes, so a release from half takes half its ticks. The envelope runs smoothly rather than in 1,024 steps a second.
6. **A channel's mix is a quarter of full scale**, the Synth's and the Sound chip's alike, so a few channels sum before clipping; each chip has a DC blocker, the Synth's a 10 Hz pole, the Sound chip ayumi's own average.
7. **Registers 14 and 15, and a selection of 16 or more, read 0xFF**: the I/O ports have nothing attached, and the AY ignores a register number whose high bits are not its own.
8. **`<sim.h>`'s wavetable macro is `SIM_SYNTH_TABLE(channel)`**, since `SIM_SYNTH_WAVETABLE` is the waveform's value.
9. **A Synth channel counts as sounding when its gate is on and its volume above 0**, for the dock's Sound button and its light. Added on 2026-10-23 with the Pac-Man example, which keeps its three gates on and plays each voice by its volume, as the arcade's chip did: counting the gate alone lit the button on the silent title screen.

### The s68k Core

`watchMemory(start, end)` (end excluded), `unwatchMemory()`, `takeWatchedWrites()` and the status `InterpreterStatus.WatchedWrite`, which works like `Paused`: the storing instruction has finished and is in the history, and the next run or step goes on. A watched write inside a Poke or a trap's answer is recorded too. While building it the agent found an older bug, fixed in the same unreleased 4.0.0: when the last instruction a `runWithLimit` or `runWithBreakpoints` limit allowed ended in a trap, `simhalt` or the program's end, the Core threw `ExecutionLimit` and the stop was lost; it now returns that status. Memory starts filled with $FF in s68k, which is why the adapter zeroes the block.

### Verification

- Under node: 25 tests of the chip cores (frequencies by zero crossings, duty cycle, envelope times and levels, retrigger, samples at two rates, a loop point, noise, the AY's tone at period 254, volume curve, mixer, envelope shapes 0, 13 and 14, a load that keeps an envelope), 23 of the models in Audio, 5 of the output's chip node, and through the real Cores 7 Synth tests on MIPS, 7 on RISC-V, 9 on the M68K (a long and a `movem`, a Breakpoint after a watched store, a Poke and its Undo) and 4 Sound chip tests on the Z80, the documented examples of each chapter included. Every new Example and Lecture playground runs in the content suite; a scratch run counted what each plays (the chiptune's 33 lead, 9 bass and 17 drum strikes, the sampled sound's upload and its eight rates).
- The editor suite: 6,108 passed, 7 timeouts under load that pass alone. `svelte-check` 0 errors, lint and format clean, `sim.h` and help catalogs regenerated. s68k: 646 Rust tests and the ts-lib smoke test.
- Measured with the suite running alongside: 200,000 back-to-back Synth stores cost about 1 µs each on MARS, 0.3 µs on RARS and 2 µs on s68k, where each one stops the Core (446 ms against 27 ms for the same stores to RAM). A program writing a few hundred registers a second, which is what music does, does not notice.
- Chrome, the real app on the dev server, an analyser on the master gain: a MIPS sine at 440 Hz measured 441 Hz at an RMS of 0.0442, which is a full-volume channel through the default volume, and silence after the program's end; a RISC-V pulse at 660 Hz measured 662 Hz and kept sounding through a Pause, then silence on Stop; the Z80's Sound chip at period 254 measured 441 Hz and fell silent at `halt`; the M68K sampled sound and the MIPS chiptune were heard, the chiptune muted to 0 and back. No page errors.
- Not checked here: Firefox and Safari, a production build served with its service worker, a phone. A Lecture page with three playgrounds sounding at once was not measured; one node renders all its chips in under 3 % of a core.

### After the review

A code review of the work on 2026-10-24 found eleven things, all fixed the same day:

- **The M68K's instruction limit.** Each stop at a watched store counted as one instruction, as each trap always had, so a loop storing into the Synth never reached a run's limit, and a Testcase restarted its limit at every stop and never ended, holding the page. s68k 4.0.0 now counts the instructions it runs (`getExecutedInstructions()`), and the adapter takes a slice's progress and a Testcase's one limit from it. M68K limits now count real instructions, as the other Cores' do; the editor's own runs have none, and the M68K example tests, which leaned on the old count, run on the virtual clock with limits in real instructions.
- **Batches of a tight loop.** Every register write went to the worklet; a batch past 8,192 writes is now folded to what one instant needs (`compactSynthWrites`, `compactSoundChipWrites`): the last value of each register, and of a gate its first write, its last and one strike between when it went off and on.
- **The bitmap display at MARS's "memory map" base**, 0xffff0000, covers the Synth's block: its words are pixels then, and the Synth is off and out of the memory view's regions.
- **Heard and running.** The worklet reports a channel heard only with a volume and a level above 0, so a program that keeps its gates on at volume 0 lets the page's context sleep, and renders while an envelope moves; a program's end releases every gate, heard or not.
- **Pokes.** A Poke plays the Synth's registers and is heard at once, flushed by the Emulator after every Poke, but starts no upload: an upload is the running program's, and a Poke's Undo only re-reads the registers.
- **Undo** re-sends only the registers that changed, and every one only after a program's end released the chips; the Sound chip is told only when an Undo put a register back.
- **Low sample rates.** The Sound chip oversamples below the rate ayumi's resampler needs instead of throwing, and the worklet plays the rest of a batch past a command it cannot take.
- **The M68K's block** is zeroed at a Build only where the program put nothing of its own, and the Log says when it did.
- **The Documentation** says that a sample's start and length are taken at the gate, that a Poke starts no upload, and where each block meets the Target's other devices.
- **The worklet** has tests of its own under node, with the AudioWorklet's globals stood in.

### Releases

`@specy/s68k` 4.0.0 now also carries `watchMemory`, `getExecutedInstructions` and the limit fix. MARS, RARS and the Z80 need nothing of their own for this.
