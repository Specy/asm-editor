## Synth

The Synth is a sound chip with eight channels, each playing a waveform at a frequency, shaped by an envelope. A program drives it the way a program on a 1980s computer drove its sound chip: by storing values into its registers, which sit in memory from `{base}`. Writing a frequency, a waveform and a volume, then turning a channel's **gate** on, plays a note; turning the gate off ends it.

The Synth is an extension of this editor. {reference} has no waveform sound, so a program that uses it plays here and nowhere else; for {reference}'s own sound, see {notes}. It is designed as a chip of the time could have been built, with parts taken from real ones: the SID's pulse width and envelope, the Game Boy's wavetable, the SNES's sample memory.

{toneExample}

The registers read back what was last written, as memory does; there is no register that answers whether a channel is still sounding. Every Build starts with every register at 0: all eight channels silent, gates off, Sample memory empty.{placementNote}

## Registers {#registers}

Channel _n_, from 0 to 7, has 32 bytes at `{base}` + _n_ × `0x20`. A register of two bytes is a halfword in the processor's own byte order, so one `{storeHalf}` writes it, and a register of one byte is written with `{storeByte}`. The bytes from `0x14` to `0x1F` of each channel are reserved.

{channelRegisters}

## Waveforms {#waveforms}

The waveform register picks what a channel plays. Each one comes from the channel's phase, a 16-bit counter the chip's clock of 65,536 ticks a second adds the frequency to; it wraps around once a period, which is why the frequency register is in Hz. Nothing smooths the steps, so high notes alias as they did on real chips.

{waveforms}

A value above 6 plays silence.

## Envelope {#envelope}

The envelope shapes each note's volume over time. Turning the gate on starts the **attack**, which rises to full volume; the **decay** then falls to the **sustain** level, which holds for as long as the gate stays on. Turning the gate off starts the **release**, which fades to silence.

- Times are in ticks of 1/1024 s, close to milliseconds. The attack is how long a rise from silence to full takes; the decay and the release are how long a fall the whole way from full to silence would take, so a release from a sustain of half takes half its ticks. A time of 0 is instant.
- Turning the gate on again restarts the attack from wherever the volume is, without a click. Storing a gate that is already on changes nothing: to strike a note again, turn the gate off and on.
- The volume register scales the whole note, 0 to 127; values above 127 count as 127.

## Wavetables {#wavetables}

Each channel has its own wavetable of 32 samples, four bits each, at `{wavetables}` + _n_ × `0x10`: sixteen bytes, the first sample of each pair in the byte's high four bits. The channel plays the 32 samples once a period, 0 the lowest and 15 the highest, so a wavetable is a waveform of the program's own design.

{wavetableExample}

## Sample memory and uploads {#samples}

The Synth has 64 KB of memory of its own, **Sample memory**, holding 8-bit signed samples, -128 to 127. A program computes a sound in its own memory and copies it in with an **upload**, as a DMA transfer would: it sets where the bytes come from, how many there are and where they go, then writes the start register, which copies them at that instant. Changing the buffer afterwards changes nothing in Sample memory, so the program can reuse it straight away.

{uploadRegisters}

A channel set to the sample waveform plays its **sample length** samples from its **sample start**, once, or, with the loop bit of its control register set, going back to its **loop start** each time it reaches the end. The start and the length are taken when the gate goes on, so set them first: changing them while a sample plays changes the next note, not this one. The loop start is read each time the sample loops. Its frequency register is then the playback rate in samples a second: a sound computed at 8,000 samples a second plays at its own pitch with a frequency of 8,000, and an octave higher with 16,000. A sound longer than Sample memory streams: upload into one half while the other half plays. An upload is the running program's: storing into the start register with a Poke, in the memory view, changes the register and copies nothing.

{uploadExample}

## Notes and their frequencies {#frequencies}

The frequency register is a whole number of Hz, from 1 to 65,535; the highest a channel can sound cleanly is 32,767. The table rounds each note of equal temperament to the nearest Hz. Rounding puts no note more than about 11 cents, a ninth of a semitone, off pitch from C2 up, and less than 3 cents from 220 Hz up.

{frequencies}

{fromC}## While a program runs {#running}

- **Pause and Breakpoints.** A channel whose gate is on keeps sounding while the program is paused, as a real chip does while a debugger holds the processor.
- **The end of the program.** Every gate is released when the program ends, so its notes fade through their release rather than sounding forever.
- **Undo.** The registers are memory, which Undo rewinds, and the Synth plays whatever they hold afterwards: undoing the store that turned a gate off turns it back on, and the note attacks again. Undoing an upload puts back the samples it overwrote.
- **Stop and Build** silence the Synth at once.
- **Testcases** are silent. The registers still read back what was written, so a Testcase answers as an interactive run does.
- The **Sound** button in the execution dock mutes the Synth as it does every other sound, and **Sound volume** in **Preferences** sets its volume.
