## What the MIDI port and the sampled-audio output are {#overview}

Two devices let a program play sound for as long as it likes, a little at a time:

- The **MIDI port** sends **MIDI** messages, the language electronic instruments use to talk to each other, to a synthesizer that turns them into sound. A program says "start middle C on a piano", then later "stop middle C", and the synthesizer plays the note in between.
- The **sampled-audio output** plays sound the program computes itself, as a list of numbers called **samples**. Each sample is the height of the sound wave at one moment, and the output plays a fixed number of them every second.

Both are devices this editor adds to {simulator}, as it adds the [Synth](/documentation/{route}/synth) and the [Input controller](/documentation/{route}/input-controller). Their registers are memory, the MIDI port's from `{midiBase}` and the sampled-audio output's from `{pcmBase}`, right after the Input controller's. {simulator} itself does not have them: there the same addresses are plain memory that reads 0, so a program can tell the two apart.

There are other ways to make sound, each good for something else:

| To play                                                                         | Use                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A note whose length you know when you start it                                  | [services 31 and 33](/documentation/{route}/syscall#service-31), one call a note |
| Chip sounds you shape yourself, with waveforms and envelopes                    | the [Synth](/documentation/{route}/synth)                                        |
| Music a program plays as it goes, such as a song or a game's soundtrack         | the **MIDI port**                                                                |
| Any sound a program can compute: effects, speech, several sounds mixed together | the **sampled-audio output**                                                     |

Sound starts with the click that starts a Run. The first time a program makes a sound, a speaker button appears beside the run buttons, which turns sound off and on.

## A first MIDI program {#first-midi-program}

This program plays a C major scale on a piano, one note every 300 milliseconds. Build it and press Run.

{midiExample}

Each note takes two **messages**, three bytes each:

1. **Note on** starts a note: the byte `0x90`, then the **key**, which note to play (60 is middle C, and each step up is a semitone), then the **velocity**, how hard the key is struck, from 1 to 127.
2. **Note off** ends it: `0x80`, the same key, and 0.

Before the notes, a **program change**, `0xC0` and an instrument number, picks the instrument. 0 is a piano; try 40 for a violin or 73 for a flute.

The `send` routine at the end does what every program using the MIDI port does before each byte: it reads the **Status** register and waits while bit 6 is set, because the port drops a byte written while it is busy.

## The MIDI port's registers {#midi-registers}

Each register is a word at an offset from `{midiBase}`.

{midiRegisterTable}

Status and Command share one address, as on the **MPU-401**, the PC sound card the port is modelled on: reading it reads Status, writing it gives a Command. The words at `0x08` and `0x0C` are reserved and read 0.

## MIDI messages {#midi-messages}

A MIDI message starts with a **status byte**, which has bit 7 set and says what the message does, followed by one or two **data bytes**, from 0 to 127. Most status bytes carry a **channel** in their low four bits: `0x90` is a note on for channel 1, `0x91` for channel 2, up to `0x9F` for channel 16. Each of the 16 channels has its own instrument, so a program can play a melody on one and chords on another.

{messageTable}

- **Channel 10 is drums.** On channel 10, status bytes ending in 9 such as `0x99`, each key is a different drum instead of a pitch: 36 is a bass drum, 38 a snare, 42 a closed hi-hat, 46 an open hi-hat and 49 a crash cymbal.
- **Instruments** follow **General MIDI**, a standard list of 128. Lists usually number them from 1, and the byte a program change sends is that number minus 1: 0 piano, 19 church organ, 24 nylon guitar, 32 acoustic bass, 40 violin, 56 trumpet, 73 flute, 80 square-wave lead.
- **Running status**: after a message, more messages of the same kind on the same channel may leave out the status byte. `0x90 60 100 64 100 67 100` starts a C major chord with one status byte. A note on with velocity 0 ends a note, which keeps running status going through a melody.
- **System exclusive** messages, or **SysEx**, start with `0xF0` and end with `0xF7`, with any number of data bytes between, up to 256 bytes in all. `0xF0 0x7E 0x7F 0x09 0x01 0xF7`, **GM System On**, puts every channel back to General MIDI's defaults.
- Bytes from `0xF8` to `0xFF`, MIDI's timing and transport messages, are allowed anywhere, even in the middle of a message, and the synthesizer ignores them.

## Waiting for the port {#midi-busy}

A MIDI cable carries 31,250 bits a second, ten bits for each byte, so a byte takes 0.32 milliseconds to leave the port, and a note on, three bytes, about a millisecond. The port keeps the bytes waiting in a **buffer** of {midiBuffer} bytes and sends them in order, at that speed. A note is heard when its last byte has left, so notes sent together are heard a millisecond apart.

While the buffer is full, bit 6 of Status is set, and the port is **busy**. A byte written while it is busy is dropped, just as on the hardware, and the **Log** says so. Status otherwise reads `0x80`: bit 7 is always set, because nothing ever arrives at this port. A melody almost never fills the buffer, but a program that sends thousands of bytes at once, such as one starting a song, does, so wait for bit 6 before every byte as `send` does.

Writing `0xFF` to the **Command** register resets the port: the bytes still waiting are thrown away and every note that is sounding ends. `0x3F`, which switches a real MPU-401 into the simple mode this port is always in, is accepted and does nothing.

## The MIDI port and services 31 and 33 {#midi-and-services}

The MIDI port has its own synthesizer with its own 16 channels. The notes of [services 31 and 33](/documentation/{route}/syscall#service-31) each play on a channel of their own, as they do in {simulator}, where every note gets a synthesizer of its own. So a program change sent through the port never changes the instrument of a service 31 note, and a service 31 note never changes a channel of the port. Both use the same set of instrument sounds, the one {simulator} plays on Java 21, and mix into the same volume.

## A first sampled-audio program {#first-sampled-program}

This program plays a buzzing tone for two seconds. Build it and press Run.

{pcmExample}

It does what every program using the sampled-audio output does:

1. It sets the **rate**, how many samples a second the output plays: 8,000.
2. It turns the output on with bit 0 of **Control**.
3. It reads **Free**, how many more samples the output can take now. When it is 0, it sleeps for 10 milliseconds and looks again.
4. It writes two samples at a time to **Data**, as one word: here both are 8,192 for the high half of the wave, or −8,192 for the low half.

The wave goes up and down every 10 samples: 5 words high, then 5 words low, 20 samples for a whole cycle. At 8,000 samples a second that is 8,000 ÷ 20 = 400 cycles a second, a tone of 400 Hz. A wave that jumps between two levels like this is a **square wave**, which sounds buzzy, like an old video game.

The program writes its last samples and exits while about a second of them is still waiting to play: they play out after it has ended.

## The sampled-audio output's registers {#pcm-registers}

Each register is a word at an offset from `{pcmBase}`. Write them with `sw`.

{pcmRegisterTable}

At every Build the output is off, in mono, at {pcmDefaultRate} samples a second.

## Samples, frames and words {#samples}

A **sample** is a signed 16-bit number, from −32,768 to 32,767: 0 is silence, and the further from 0, the further the speaker moves. A wave that swings between −8,192 and 8,192 is a quarter of the loudest the output can play. A **frame** is what plays at one moment: one sample in mono, or a left and a right sample in **stereo**, bit 1 of Control.

Each word written to Data holds two samples, 16 bits each:

| Bits  | In mono                                         | In stereo                              |
| ----- | ----------------------------------------------- | -------------------------------------- |
| 15–0  | the first sample                                | the left sample                        |
| 31–16 | the second sample, played right after the first | the right sample, played with the left |

In memory a word's low half comes first, so a buffer of 16-bit samples, in the order a WAV file keeps them, can be copied to Data a word at a time. To put two samples from registers into one word:

{packExample}

The rate can be anything from {pcmRateMin} to {pcmRateMax} samples a second; Rate reads back the rate in use, and a value outside the range is clamped to it. A higher rate can play higher pitches, up to half the rate: 8,000 is telephone quality, 22,050 is like an AM radio, 44,100 is a CD's.

## The FIFO and Free {#fifo}

The samples a program writes wait in a **FIFO**, a queue that plays the oldest first, "first in, first out". It holds {pcmFifo} frames: a second at 8,000 samples a second, or about a sixth of a second at 48,000. The output plays them at the rate, whatever the program is doing, and plays silence while the FIFO is empty.

**Free** says how many frames the FIFO can take now. Writing at most that many frames never loses one; a word written when it does not fit is dropped, and the Log says so. In mono a word holds two frames, so Free is always even there.

- **Keeping it fed.** A program writes a batch of samples whenever Free is large, and does something else in between, as the first program sleeps. The FIFO only has to hold enough to last until the program comes back.
- **Delay.** A sample written now plays after everything already in the FIFO. A full FIFO at 8,000 samples a second plays a sample written now a whole second later, so a game that wants a sound the moment something happens keeps less in the FIFO.
- **Settings.** Turning the output off with bit 0 of Control empties the FIFO at once. Changing the rate or stereo while samples are waiting drops them too, so set both before writing samples.

## From C {#from-c}

`<sim.h>` names both devices' registers and bits, and has a few helpers:

- **MIDI port registers**: `SIM_MIDI_DATA`, `SIM_MIDI_STATUS` and `SIM_MIDI_COMMAND`, with Status's bits `SIM_MIDI_BUSY` and `SIM_MIDI_NO_INPUT`, and the commands `SIM_MIDI_RESET` and `SIM_MIDI_UART_MODE`.
- **MIDI port helpers**: `sim_midi_write(byte)` waits until the port is not busy and sends one byte, and `sim_midi_present()` says whether the port is there.
- **Sampled-audio output registers**: `SIM_PCM_CONTROL`, `SIM_PCM_RATE`, `SIM_PCM_FREE` and `SIM_PCM_DATA`, with Control's bits `SIM_PCM_ON` and `SIM_PCM_STEREO`, and `SIM_PCM_RATE_MIN`, `SIM_PCM_RATE_MAX` and `SIM_PCM_FIFO_FRAMES`.
- **Sampled-audio output helpers**: `sim_pcm_start(rate, stereo)` sets the rate and turns the output on, `sim_pcm_free()` reads Free, `sim_pcm_write(first, second)` waits until the FIFO has room and writes two samples, and `sim_pcm_present()` says whether the output is there.

See [Using C and C++](/documentation/{route}/using-c) for compiling. This program plays the scale of the first MIDI program on a violin, then two seconds of the 400 Hz tone:

{cExample}

`sim_midi_write` and `sim_pcm_write` wait by reading Status or Free over and over, as a driver for real hardware does. A program with other work to do checks `sim_pcm_free()` and writes that many frames, and sleeps in between.

## Debugging and Testcases {#debugging}

- **Pause and Breakpoints** change nothing: notes go on sounding, and the FIFO plays what it holds, then runs out into silence.
- **Step** runs one instruction, so stepping over a `sb` or `sw` sends its byte or queues its samples, as in a Run.
- **Undo** takes back what has not been heard yet. Stepping back over a write takes its byte out of the port's buffer, or its samples out of the FIFO, if they are still waiting. A note it started stops, and an instrument, controller or pitch bend it changed goes back to what it was. What has already been heard stays heard, and a note it ended does not start again.
- **At the end of the program**, what is still waiting plays out, then every note still sounding is released.
- **Stop** silences both at once. **Build** puts the synthesizer back to General MIDI's defaults and the sampled-audio output off.
- **In a Testcase** both are silent, but they keep their timing on the Testcase's clock, which moves only when the program waits. A byte still takes 0.32 milliseconds to leave and a sample still plays at the rate. Reading Status while the port is busy, or reading Free while no word fits, moves that clock on to the moment there is room, and so does reading Free again and getting the same answer, so a program waiting for room never spins until the instruction limit.
- **Under the bitmap display.** A display whose base address is `0xffff0000`, {simulator}'s "memory map" base, can cover these addresses. Its words are then pixels, and the two devices are off. Move the display, or make it smaller, to use them.

{riscv64}
