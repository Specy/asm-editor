## What the MIDI port and the sampled-audio output are {#overview}

These two devices let a program send sound as it runs:

- The **MIDI port** sends messages to a synthesizer. A program chooses an instrument, starts a note and later stops it. The synthesizer produces the sound in between.
- The **sampled-audio output** plays numbers computed by the program. Each number, a **sample**, gives the sound wave's amplitude at one moment.

This editor adds both devices to {simulator}, alongside the [Synth](/documentation/{route}/synth) and the [Input controller](/documentation/{route}/input-controller). The MIDI registers start at `{midiBase}` and the sampled-audio registers at `{pcmBase}`, after the Input controller. In {simulator} these addresses are plain memory, initially 0.

Before using either device, check that it is present. In assembly, use `lw` to read **MIDI Status** at `{midiBase} + 4` and test bit 7 (`0x80`): it is set when the port is present. Read **sampled-audio Rate** at `{pcmBase} + 4`: a nonzero value means the output is present. Make these checks before any stores to the devices. In C, use `sim_midi_present()` and `sim_pcm_present()`.

Choose the interface for the sound you need:

| To play                                                                         | Use                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A note whose length you know when you start it                                  | [services 31 and 33](/documentation/{route}/syscall#service-31), one call a note |
| Chip sounds you shape yourself, with waveforms and envelopes                    | the [Synth](/documentation/{route}/synth)                                        |
| Music a program plays as it goes, such as a song or a game's soundtrack         | the **MIDI port**                                                                |
| Any sound a program can compute: effects, speech, several sounds mixed together | the **sampled-audio output**                                                     |

Click **Run** to enable sound. Once a program makes sound, a speaker button appears beside the run buttons to mute or unmute it.

## A first MIDI program {#first-midi-program}

This program assumes the MIDI port is present. It plays a C major scale on a piano, one note every 300 milliseconds. Build it and press Run.

{midiExample}

Each note takes two **messages**, three bytes each:

1. **Note on** starts a note: the byte `0x90`, then the **key**, which note to play (60 is middle C, and each step up is a semitone), then the **velocity**, how hard the key is struck, from 1 to 127.
2. **Note off** ends it: `0x80`, the same key, and 0.

Before the notes, a **program change**, `0xC0` and an instrument number, picks the instrument. 0 is a piano. Try 40 for a violin or 73 for a flute.

Before sending each byte, the `send` routine reads **Status** and waits while bit 6 is set. That bit means the port is busy. A byte sent while it is busy is dropped.

## The MIDI port's registers {#midi-registers}

Each register is a word at an offset from `{midiBase}`.

{midiRegisterTable}

Status and Command share one address: loads read Status, stores send a Command. This follows the **MPU-401** MIDI interface used by PC sound cards. The words at `0x08` and `0x0C` are reserved and read 0.

## MIDI messages {#midi-messages}

A MIDI message starts with a **status byte**, whose bit 7 is set, followed by one or two **data bytes** from 0 to 127. Most status bytes carry a **channel** in their low four bits: `0x90` starts a note on channel 1, `0x91` on channel 2, up to `0x9F` on channel 16. Each channel has its own instrument, so a program can play a melody on one and chords on another.

{messageTable}

- **Channel 10 is drums.** Its status bytes end in 9, such as `0x99`. Each key selects a drum: 36 bass drum, 38 snare, 42 closed hi-hat, 46 open hi-hat and 49 crash cymbal.
- **Instruments** follow the 128-entry **General MIDI** list. Lists usually number them from 1. Program change bytes start at 0. Subtract 1 from a listed number: 0 piano, 19 church organ, 24 nylon guitar, 32 acoustic bass, 40 violin, 56 trumpet, 73 flute, 80 square-wave lead.
- **Running status**: after a message, more messages of the same kind on the same channel may leave out the status byte. `0x90 60 100 64 100 67 100` starts a C major chord with one status byte. A note on with velocity 0 ends a note, which keeps running status going through a melody.
- **System exclusive** messages, or **SysEx**, start with `0xF0` and end with `0xF7`, with any number of data bytes between, up to 256 bytes in all. `0xF0 0x7E 0x7F 0x09 0x01 0xF7`, **GM System On**, puts every channel back to General MIDI's defaults.
- Bytes from `0xF8` to `0xFF`, MIDI's timing and transport messages, are allowed anywhere, even in the middle of a message, and the synthesizer ignores them.

## Waiting for the port {#midi-busy}

A MIDI byte takes 0.32 milliseconds to leave the port: the cable rate is 31,250 bits a second, with ten bits per byte. The port queues up to {midiBuffer} bytes and sends them in order at that speed. A three-byte note-on message takes about a millisecond. A note starts after its last byte leaves, so consecutive note-on messages start about a millisecond apart.

When the buffer is full, Status bit 6 is set: the port is **busy**. A byte written then is dropped and reported in the **Log**. Otherwise Status reads `0x80`. Bit 7 is always set because the port has no MIDI input. Check that bit 6 is clear before every byte, as `send` does, even if a short melody rarely fills the buffer.

Writing `0xFF` to the **Command** register resets the port: the bytes still waiting are thrown away and every note that is sounding ends. `0x3F`, which switches a real MPU-401 into the simple mode this port is always in, is accepted and does nothing.

## The MIDI port and services 31 and 33 {#midi-and-services}

The MIDI port has its own synthesizer and 16 channels. Notes played by [services 31 and 33](/documentation/{route}/syscall#service-31) use separate channels, matching {simulator}, where each service note gets its own synthesizer. A program change through the port does not change a service note's instrument, and a service note does not change the port's channels. Both use the instrument sounds that {simulator} uses on Java 21 and share the same volume control.

## A first sampled-audio program {#first-sampled-program}

This program assumes the sampled-audio output is present. Check Rate before running it on another simulator: a missing device leaves Free at 0, so the program would wait forever. Here it plays a buzzing tone for two seconds. Build it and press Run.

{pcmExample}

The program uses mono output, where one sample is one frame:

1. It sets **Rate** to 8,000 frames per second.
2. It turns the output on with bit 0 of **Control**.
3. It reads **Free**, the number of frames the output can accept. When it is 0, it sleeps for 10 milliseconds and checks again.
4. It writes two samples at a time to **Data**, as one word: here both are 8,192 for the high half of the wave, or −8,192 for the low half.

The wave goes up and down every 10 samples: 5 words high, then 5 words low, 20 samples for a whole cycle. At 8,000 samples a second that is 8,000 ÷ 20 = 400 cycles a second, a tone of 400 Hz. A wave that jumps between two levels like this is a **square wave**, which sounds buzzy, like an old video game.

The program exits while about a second of audio is still queued. That audio plays after the program ends.

## The sampled-audio output's registers {#pcm-registers}

Each register is a word at an offset from `{pcmBase}`. Write them with `sw`.

{pcmRegisterTable}

At every Build the output is off, in mono, at {pcmDefaultRate} frames per second.

## Samples, frames and words {#samples}

A **sample** is a signed 16-bit number from −32,768 to 32,767. Zero is silence. Larger magnitudes give larger wave amplitude. A wave from −8,192 to 8,192 has about a quarter of full-scale amplitude.

A **frame** is what plays at one moment: one sample in mono, or simultaneous left and right samples in **stereo**. Control bit 1 selects stereo. **Rate always counts frames per second**, so stereo plays that many samples per second in each channel.

Each word written to Data holds two samples, 16 bits each:

| Bits  | In mono                                         | In stereo                              |
| ----- | ----------------------------------------------- | -------------------------------------- |
| 15–0  | the first sample                                | the left sample                        |
| 31–16 | the second sample, played right after the first | the right sample, played with the left |

In memory a word's low half comes first, so a buffer of 16-bit samples, in the order a WAV file keeps them, can be copied to Data a word at a time. To put two samples from registers into one word:

{packExample}

Rate accepts {pcmRateMin} to {pcmRateMax} frames per second. A value outside that range is clamped to the nearest limit. Reading Rate returns the value in use. A higher rate allows higher pitches, up to half the rate. Common rates include 8,000 for telephone audio, 22,050 for lower-bandwidth audio and 44,100 for CD audio.

## The FIFO and Free {#fifo}

Written samples wait in a **FIFO**, a queue that plays the oldest first: "first in, first out". It holds {pcmFifo} frames, about a second at 8,000 frames per second or a sixth of a second at 48,000. The output plays queued frames at Rate and plays silence when the FIFO is empty.

**Free** reports how many frames the FIFO can accept. A word holds two frames in mono and one frame in stereo. Write no more frames than Free reports. A word that does not fit is dropped and reported in the Log. Free is always even in mono.

- **Keeping it fed.** Write a batch when Free is large, then do other work or sleep. Queue enough frames to last until the program writes again.
- **Delay.** New samples play after the frames already queued. A nearly full FIFO at 8,000 frames per second adds about a second of delay. Keep less queued when a sound must respond quickly to an action.
- **Settings.** Clearing Control bit 0 turns the output off and empties the FIFO. Changing Rate or the stereo setting also discards queued frames. Set both before writing samples.

## From C {#from-c}

`<sim.h>` names both devices' registers and bits, and has a few helpers:

- **MIDI port registers**: `SIM_MIDI_DATA`, `SIM_MIDI_STATUS` and `SIM_MIDI_COMMAND`, with Status's bits `SIM_MIDI_BUSY` and `SIM_MIDI_NO_INPUT`, and the commands `SIM_MIDI_RESET` and `SIM_MIDI_UART_MODE`.
- **MIDI port helpers**: `sim_midi_write(byte)` waits until the port is not busy and sends one byte, and `sim_midi_present()` says whether the port is there.
- **Sampled-audio output registers**: `SIM_PCM_CONTROL`, `SIM_PCM_RATE`, `SIM_PCM_FREE` and `SIM_PCM_DATA`, with Control's bits `SIM_PCM_ON` and `SIM_PCM_STEREO`, and `SIM_PCM_RATE_MIN`, `SIM_PCM_RATE_MAX` and `SIM_PCM_FIFO_FRAMES`.
- **Sampled-audio output helpers**: `sim_pcm_start(rate, stereo)` sets the rate and turns the output on, `sim_pcm_free()` reads Free, `sim_pcm_write(first, second)` waits until the FIFO has room and writes two samples, and `sim_pcm_present()` says whether the output is there.

In mono, `sim_pcm_write(first, second)` plays `first` and then `second`. In stereo, it plays `first` in the left channel and `second` in the right channel at the same moment. The `rate` argument to `sim_pcm_start` is frames per second in either mode.

See [Using C and C++](/documentation/{route}/using-c) for compiling. This program plays the scale of the first MIDI program on a violin, then two seconds of the 400 Hz tone:

{cExample}

`sim_midi_write` and `sim_pcm_write` poll Status or Free until there is room. To do other work between batches, check `sim_pcm_free()` and write no more than that many frames. Each call to `sim_pcm_write` uses two frames in mono or one in stereo.

## Debugging and Testcases {#debugging}

- **Pause and Breakpoints** leave playback running. MIDI notes continue. Queued audio plays, then the empty FIFO produces silence.
- **Step** runs one instruction, so stepping over a `sb` or `sw` sends its byte or queues its samples, as in a Run.
- **Undo** takes back what has not been heard yet. Stepping back over a write takes its byte out of the port's buffer, or its samples out of the FIFO, if they are still waiting. A note it started stops, and an instrument, controller or pitch bend it changed goes back to what it was. What has already been heard stays heard, and a note it ended does not start again.
- **At the end of the program**, what is still waiting plays out, then every note still sounding is released.
- **Stop** silences both at once. **Build** puts the synthesizer back to General MIDI's defaults and the sampled-audio output off.
- **In a Testcase** both devices are silent but keep their normal timing on the virtual clock: 0.32 milliseconds per MIDI byte, and Rate frames per second for audio. Program waits advance that clock immediately. Polling for space also counts as a wait: reading busy MIDI Status advances to the next departing byte, and reading Free when no word fits advances until one fits. Repeated Free reads with the same result and no intervening Data write also advance playback, one word at a time. These polling loops can therefore make progress without reaching the instruction limit.
- **Under the bitmap display.** A display whose base address is `0xffff0000`, {simulator}'s "memory map" base, can cover these addresses. Its words are then pixels, and the two devices are off. Move the display, or make it smaller, to use them.

{riscv64}
