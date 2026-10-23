## Synth

The Synth is a sound chip with eight independent **channels**, so up to eight sounds can play together. Each channel plays a **waveform**, the repeating shape of a sound, at a frequency in Hz. An **envelope** changes its volume over the life of a note. A program controls these settings by storing values into the chip's registers, which sit in memory from `{base}`. Turning a channel's **gate** on starts its envelope; turning it off lets the note fade through its release.

The Synth is an extension of this editor and is absent from {reference}; for {reference}'s own sound interface, see {notes}. Its design draws on classic sound chips: the SID's pulse width and envelope, the Game Boy's wavetable and the SNES's sample memory.

This example configures channel 0, plays a pulse note for half a second, then releases it and waits for the fade to finish.

{toneExample}

The registers read back what was last written, as memory does; there is no register that answers whether a channel is still sounding. Build silences all eight channels, resets their gates and empties Sample memory.{placementNote}

## Registers {#registers}

Channel _n_, from 0 to 7, has 32 bytes at `{base}` + _n_ × `0x20`. Two-byte registers use the processor's byte order: write them with one `{storeHalf}` instruction. Write one-byte registers with `{storeByte}`. The bytes from `0x14` to `0x1F` of each channel are reserved.

{channelRegisters}

## Waveforms {#waveforms}

The waveform register picks what a channel plays. At each of 65,536 ticks per second, the chip adds the frequency register to a 16-bit **phase counter**, which records the position within a waveform cycle. Wraparound past 65,535 completes one cycle. A frequency of 440 therefore gives 440 cycles per second, or 440 Hz. Nothing smooths the waveform's steps, so high notes can **alias**: frequencies beyond the sampling limit are heard at other pitches.

A frequency of 0 stops the phase counter, including noise updates and the sample playback cursor. It does not turn the gate off or stop the envelope.

{waveforms}

A value above 6 plays silence.

## Envelope {#envelope}

The envelope shapes each note's volume over time. Turning the gate on starts the **attack**, which rises to full volume; the **decay** then falls to the **sustain** level, which holds for as long as the gate stays on. Turning the gate off starts the **release**, which fades to silence.

- Times are in ticks of 1/1024 s, close to milliseconds. The attack is how long a rise from silence to full takes; the decay and the release are how long a fall the whole way from full to silence would take, so a release from a sustain of half takes half its ticks. A time of 0 is instant.
- Turning the gate on again starts the attack from the current envelope level. Storing a gate that is already on changes nothing: to strike a note again, turn the gate off and on.
- The volume register scales the whole note, 0 to 127. Volume and sustain values above 127 sound as 127; their registers still read back the bytes written.

## Wavetables {#wavetables}

Each channel has its own wavetable of 32 samples, four bits each, at `{wavetables}` + _n_ × `0x10`: sixteen bytes, the first sample of each pair in the byte's high four bits. The channel plays the 32 samples once a period, 0 the lowest and 15 the highest, so a wavetable is a waveform of the program's own design.

This setup fragment writes the first four bytes of channel 0's table and selects it. The remaining twelve bytes keep their previous values, initially 0. To hear it, also set volume and envelope, then use the gate-on, wait and gate-off sequence from the first example.

{wavetableExample}

## Sample memory and uploads {#samples}

The Synth has one shared 64 KB **Sample memory**, holding raw PCM (pulse-code modulation) data: signed 8-bit samples, -128 to 127. These bytes are successive sound levels, without a file header such as a WAV header. A wavetable describes one repeating cycle; a sample buffer can hold a finite recording or a sound computed by the program.

To copy a buffer from the program's memory into Sample memory, set the **upload** source address, length and destination, then write the upload-start register. The copy happens at that instant. Changing the source buffer afterwards does not change Sample memory, so the program can reuse the buffer straight away.

There is one shared upload controller for all eight channels. The following offsets are from the Synth base `{base}`, not from a channel's address: the source register is at `{base}` + `0x180`.

{uploadRegisters}

Uploads wrap from Sample-memory offset 65,535 to 0 if destination + length exceeds 65,536. A length of 0 copies 65,536 bytes, starting at the chosen destination and wrapping if needed. An upload must come from the running program: a **Poke** to the start register in the memory view changes its stored byte but copies nothing.

For playback, select waveform 6 and set the channel's **sample start** and **sample length** before turning its gate on. The cursor starts at that offset and plays that many samples, wrapping at the end of Sample memory; length 0 means 65,536 samples. Start and length are captured for this first pass when the gate rises. At the end of a one-shot sample, the cursor stops and the output becomes silent, but the gate bit stays on. Turn it off and on to play the sample again.

With control bit 1 set, playback instead jumps to **loop start**, an absolute offset in Sample memory. At each jump it reads the current loop start, sample start and sample length registers. It plays from loop start up to the end defined by sample start + length, wrapping through offset 0 if necessary. Even a loop start outside the first pass's region is valid: the loop length is that distance modulo 65,536, with a distance of 0 meaning 65,536 samples.

For this waveform, frequency is the playback rate in samples per second. A sound computed at 8,000 samples per second plays at its original pitch with a frequency of 8,000, and an octave higher with 16,000. Longer sounds can use program-managed buffering: arrange looping and time uploads into the unused part of Sample memory yourself, using the playback rate to calculate each buffer's duration. There is no playback-cursor or completion register.

The following setup fragment assumes a `sound` buffer containing 8,000 signed sample bytes. It uploads the bytes and selects one second of playback at 8,000 samples per second. To hear it, also set volume and envelope, then turn the gate on and wait as in the first example.

{uploadExample}

## Notes and their frequencies {#frequencies}

For repeating waveforms, the frequency register accepts whole Hz from 0 to 65,535; 0 holds the phase still. The audio output's sampling rate also limits audible frequencies. An unsmoothed waveform's higher harmonics can alias even when its fundamental pitch is below that limit.

The table rounds each note of equal temperament to the nearest Hz. Rounding puts no note more than about 11 cents, a ninth of a semitone, off pitch from C2 up, and less than 3 cents from 220 Hz up.

{frequencies}

{fromC}## While a program runs {#running}

- **Pause and Breakpoints.** A channel whose gate is on keeps sounding while the program is paused, as a real chip does while a debugger holds the processor.
- **The end of the program.** Every gate is released when the program ends, so its notes fade through their release rather than sounding forever.
- **Undo.** The registers are memory, which Undo rewinds, and the Synth plays whatever they hold afterwards: undoing the store that turned a gate off turns it back on, and the note attacks again. Undoing an upload puts back the samples it overwrote.
- **Stop and Build** silence the Synth at once.
- **Testcases** are silent. The registers still read back what was written, so a Testcase answers as an interactive run does.
- The **Sound** button in the execution dock mutes the Synth as it does every other sound, and **Sound volume** in **Preferences** sets its volume.
