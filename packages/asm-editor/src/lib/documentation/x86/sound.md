An x86 program plays sound through Linux device interfaces. Choose the interface for the sound you want to produce:

- **The PC speaker** plays one square-wave tone at a time: one write starts it and another stops it.
- **The MIDI port**, `/dev/snd/midiC1D0`, plays notes on a General MIDI synthesizer, with 128 instruments and a drum kit.
- **`/dev/dsp`** plays **samples**, the sound wave itself as a stream of numbers the program computes.

Once a program has made a sound, a **Sound** button in the execution dock turns sound off and on. Turning it off, or the volume in Preferences, changes nothing a program can see. **Testcases** run silently but keep the time the sound takes.

## The PC speaker {#speaker}

The speaker is an input device, `/dev/input/by-path/platform-pcspkr-event-spkr`, that the program writes to. Writing an `EV_SND` event with the code `SND_TONE` and a frequency in Hz as its value starts a tone; writing it again with 0 stops it. The tone sounds only above 20 Hz and below 32767 Hz. `SND_BELL` with any value but 0 sounds 1000 Hz until a 0 stops it.

```c
#include <fcntl.h>
#include <unistd.h>
#include <linux/input.h>

int main(void) {
    int speaker = open("/dev/input/by-path/platform-pcspkr-event-spkr", O_WRONLY);
    if (speaker < 0) return 1;
    struct input_event tone = { .type = EV_SND, .code = SND_TONE, .value = 440 };
    write(speaker, &tone, sizeof tone); /* A above middle C starts */
    usleep(500000);
    tone.value = 0;
    write(speaker, &tone, sizeof tone); /* and stops */
    return 0;
}
```

The same in NASM, with the event written out in the data section:

```x86
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "linux/input.inc"

section .rodata
speaker_path: db "/dev/input/by-path/platform-pcspkr-event-spkr", 0
half_second:  dq 0, 500000000           ; a struct timespec: 0 s and 500,000,000 ns

section .data
tone: istruc input_event
        at input_event.type,  dw EV_SND
        at input_event.code,  dw SND_TONE
        at input_event.value, dd 440    ; Hz
      iend

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [speaker_path]
    mov esi, O_WRONLY
    syscall
    test rax, rax
    js fail
    mov r12, rax

    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [tone]
    mov edx, input_event_size
    syscall                             ; the tone starts
    mov eax, SYS_nanosleep
    lea rdi, [half_second]
    xor esi, esi
    syscall
    mov dword [tone + input_event.value], 0
    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [tone]
    mov edx, input_event_size
    syscall                             ; and stops

    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

The speaker uses a timer running at 1,193,182 ticks a second. For a requested frequency `f`, it truncates the divider to `⌊1193182 ÷ f⌋` ticks per cycle. The resulting frequency is `1193182 ÷ ⌊1193182 ÷ f⌋`: 440 Hz becomes about 440.1 Hz, and 10000 Hz about 10026.7 Hz. Truncating the divider can make the tone slightly higher than requested.

Older programs sound the same speaker through the console, `/dev/tty0`. Its `KIOCSOUND` ioctl takes the timer's count for one cycle, 1193182 divided by the frequency, and 0 for silence. `KDMKTONE` takes that count in its low 16 bits and a time in milliseconds in the high 16, after which the speaker falls silent by itself.

```c
#include <fcntl.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <linux/kd.h>

int main(void) {
    int console = open("/dev/tty0", O_WRONLY);
    if (console < 0) return 1;
    ioctl(console, KIOCSOUND, 1193182 / 440); /* 440 Hz */
    usleep(500000);
    ioctl(console, KIOCSOUND, 0);             /* silence */
    return 0;
}
```

The speaker's event codes and the console's ioctl requests are listed below. `KIOCSOUND` and `KDMKTONE` take immediate integers as their third argument. In a raw `ioctl` syscall, pass the integer itself in `rdx`.

{speakerRequests}

The speaker is silenced when the program ends. Undo puts the tone back as it was, starting it again if it was sounding.

## The MIDI port {#midi}

**MIDI** is how a program tells a synthesizer what to play, in messages of a few bytes. The port `/dev/snd/midiC1D0` takes them as written: open it, write the bytes, and the synthesizer plays.

| Message        | Bytes                                     | What it does                                                                                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Note on        | `0x90 + channel`, note, velocity          | Starts a note. Note 60 is middle C, and one more is a semitone higher. Velocity, 1 to 127, is how hard the key is struck. |
| Note off       | `0x80 + channel`, note, 0                 | Ends the note.                                                                                                            |
| Program change | `0xC0 + channel`, instrument              | Chooses the channel's General MIDI instrument, 0 to 127: 0 is the piano, 40 the violin, 56 the trumpet.                   |
| Controller     | `0xB0 + channel`, controller, value       | Changes a setting: controller 7 is the channel's volume, 0 to 127.                                                        |
| Pitch bend     | `0xE0 + channel`, low 7 bits, high 7 bits | Bends the pitch; 0x2000 (0, 64) is no bend.                                                                               |

There are 16 channels, numbered 0 to 15 in the bytes and 1 to 16 by musicians. Each plays one instrument at a time, as many notes at once as it is given. Channel 10, 9 in the bytes, is the drum kit: there the note chooses the drum, 36 the bass drum, 38 the snare and 42 the closed hi-hat.

```c
#include <fcntl.h>
#include <unistd.h>

static void send(int port, unsigned char status, unsigned char data1, unsigned char data2) {
    unsigned char message[3] = { status, data1, data2 };
    write(port, message, sizeof message);
}

int main(void) {
    int midi = open("/dev/snd/midiC1D0", O_WRONLY);
    if (midi < 0) return 1;
    unsigned char violin[2] = { 0xC0, 40 }; /* channel 1 plays the violin */
    write(midi, violin, sizeof violin);
    int notes[] = { 60, 64, 67, 72 };       /* C, E, G and the C above */
    for (int i = 0; i < 4; i++) {
        send(midi, 0x90, notes[i], 100);    /* note on */
        send(midi, 0x99, 36, 100);          /* the bass drum on channel 10, which needs no note off */
        usleep(400000);
        send(midi, 0x80, notes[i], 0);      /* note off */
    }
    close(midi);                            /* waits until every byte has gone out */
    return 0;
}
```

In NASM a note is two writes of three bytes, with a wait between them:

```x86
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"

section .rodata
midi_path:   db "/dev/snd/midiC1D0", 0
note_on:     db 0x90, 60, 100           ; channel 1, middle C, velocity 100
note_off:    db 0x80, 60, 0
half_second: dq 0, 500000000            ; a struct timespec

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [midi_path]
    mov esi, O_WRONLY
    syscall
    test rax, rax
    js fail
    mov r12, rax

    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [note_on]
    mov edx, 3
    syscall
    mov eax, SYS_nanosleep
    lea rdi, [half_second]
    xor esi, esi
    syscall
    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [note_off]
    mov edx, 3
    syscall

    mov eax, SYS_close                  ; waits until the bytes have gone out
    mov rdi, r12
    syscall
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

The bytes leave the port at MIDI's speed, 31,250 bits a second, about 3 bytes a millisecond, so a note on reaches the synthesizer about a millisecond after its write. Up to 4,096 bytes wait in the port's buffer; a write that would overflow it waits for room. The synthesizer also takes **System Exclusive** messages, which start with `0xF0` and end with `0xF7`: `F0 7E 7F 09 01 F7`, **GM System On**, puts every channel back to General MIDI's defaults.

A note sounds until its note off. When the program ends, every note still on is released and fades out. Undo stops the notes the undone writes started and puts back the instruments, controllers and pitch bends they changed; a note they ended does not start again.

## `/dev/dsp`: samples {#dsp}

A sound is a wave: the air pressure going up and down hundreds or thousands of times a second. `/dev/dsp` plays a wave given as **samples**, its height measured at regular moments. The **rate** is how many samples a second, the **format** how each is stored, and the **channels** whether there is one wave (mono) or a left and a right one (stereo, written left, right, left, right).

`/dev/dsp` opens at 8000 samples a second, unsigned 8-bit, mono: each sample is one byte, 128 is silence, and 0 and 255 are the lowest and highest. A program that wants anything else asks with three ioctls, in this order: `SNDCTL_DSP_SETFMT`, `SNDCTL_DSP_CHANNELS` and `SNDCTL_DSP_SPEED`. Each takes a pointer to an `int` and **writes back** what it set, which can differ from what was asked: a rate is kept between 1000 and 192000, and a format the device does not take becomes `AFMT_U8`. Check the value after the call.

Then write the samples to the descriptor. A blocking write copies them into the device's buffer and **waits while the buffer is full**. Playback frees space at the selected rate, pacing a program that keeps writing. Check the returned byte count: a successful write can be short, particularly with `O_NONBLOCK` or when a signal interrupts it. Submit the remaining bytes in a later write.

This C program plays roughly one second of a square wave near 440 Hz, using 22,050 samples a second, signed 16-bit samples and one channel:

```c
#include <fcntl.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <sys/soundcard.h>

int main(void) {
    int dsp = open("/dev/dsp", O_WRONLY);
    if (dsp < 0) return 1;
    int fragments = 0x0004000a;          /* ask for 4 fragments of 2 to the 10th bytes */
    ioctl(dsp, SNDCTL_DSP_SETFRAGMENT, &fragments);
    int format = AFMT_S16_LE, channels = 1, rate = 22050;
    ioctl(dsp, SNDCTL_DSP_SETFMT, &format);
    ioctl(dsp, SNDCTL_DSP_CHANNELS, &channels);
    ioctl(dsp, SNDCTL_DSP_SPEED, &rate);
    if (format != AFMT_S16_LE || channels != 1) return 1;

    int period = rate / 440;             /* samples in one cycle */
    short samples[256];
    for (int written = 0; written < rate; ) {
        for (int i = 0; i < 256; i++, written++)
            samples[i] = written % period < period / 2 ? 6000 : -6000;
        write(dsp, samples, sizeof samples); /* waits while the buffer is full */
    }
    ioctl(dsp, SNDCTL_DSP_SYNC, 0);      /* wait until it has all played */
    return 0;
}
```

At the requested rate, integer division makes the period 50 samples, so the actual pitch is 441 Hz. The loop writes 87 complete blocks of 256 samples, about 1.01 seconds of sound. Both the pitch and duration are approximate.

The NASM version below uses the default 8000 samples a second, unsigned 8-bit, mono. A 500 Hz wave has 16 samples per cycle: 8 high and 8 low. Its 1024-sample buffer holds 64 whole cycles, so repeated writes join at cycle boundaries. Four writes play 4096 samples, or 0.512 seconds.

```x86
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "linux/soundcard.inc"

section .rodata
dsp_path:  db "/dev/dsp", 0

section .data
fragments: dd 0x0004000a                ; ask for 4 fragments of 1024 bytes

section .bss
wave:      resb 1024                    ; 64 cycles, 0.128 s at 8000 samples a second

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [dsp_path]
    mov esi, O_WRONLY
    syscall
    test rax, rax
    js fail
    mov r12, rax
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, SNDCTL_DSP_SETFRAGMENT
    lea rdx, [fragments]
    syscall

    lea rdi, [wave]
    xor ecx, ecx
fill:
    mov al, 192                         ; high
    test cl, 8                          ; samples 8 to 15 of every 16
    jz store
    mov al, 64                          ; low
store:
    mov [rdi + rcx], al
    inc ecx
    cmp ecx, 1024
    jb fill

    mov r13d, 4                         ; four times, about half a second
play:
    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [wave]
    mov edx, 1024
    syscall                             ; waits while the buffer is full
    dec r13d
    jnz play
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, SNDCTL_DSP_SYNC
    xor edx, edx
    syscall                             ; wait until it has all played

    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

The sample formats a program uses most:

{dspFormats}

`AFMT_S32_LE` is a name from OSS 4, the later version of the interface. Linux's `/dev/dsp` takes it, but Linux's own `<sys/soundcard.h>` does not define it, so a C program built on Linux defines it itself, as `0x00001000`.

## Fragments and latency {#fragments}

The playback buffer is divided into **fragments**. A write stages samples until a complete fragment can be submitted for playback. This affects both playback delay and short sounds:

- **Queued samples delay new sounds.** A write can return while its samples are still waiting to be heard. If the program keeps the buffer full, a newly appended sound waits behind that queued audio. The default buffer has 32 fragments: about 8 seconds at the default format and several seconds at CD quality. Reducing the buffer reduces this queued playback delay, though writes may then wait for free space more often.
- **An incomplete fragment may stay silent.** A write shorter than one fragment is staged until more samples fill it. Call `SNDCTL_DSP_SYNC`, or close the device, to submit the final partial fragment and wait for playback to finish.

`SNDCTL_DSP_SETFRAGMENT` requests a buffer configuration through a pointer to an `int`. Its value is `0xMMMMSSSS`: a requested count of MMMM fragments, each `2^SSSS` bytes. For example, `0x0004000A` requests four fragments of 1024 bytes.

Call it immediately after `open`, before writing samples. Only one `SETFRAGMENT` request can succeed per playback open; a second fails with `EINVAL`, even if no samples have been written. Close and reopen the device to choose another configuration. This request is also incompatible with a previously selected `SNDCTL_DSP_SUBDIVIDE` configuration.

The actual fragment size depends on the request, format and rate. Read it back with `SNDCTL_DSP_GETBLKSIZE` after setting the format, channels and rate. Here the request `0x0004000A` gives four fragments of 512 bytes at the default format, or four of 2048 bytes after the C example sets signed 16-bit mono at 22,050 samples a second. Either configuration holds a fraction of a second of sound.

`SNDCTL_DSP_GETOSPACE` fills an `audio_buf_info` with the available space. Total capacity in bytes is `fragstotal × fragsize`; `fragments` and `bytes` describe free space. Use a positive free-byte count to limit a write, and treat a count of zero or less as no available space. `SNDCTL_DSP_GETODELAY` returns the bytes submitted for playback but not yet heard; it does not include an incomplete fragment still being staged.

With `O_NONBLOCK`, writes accept what fits and fail with `EAGAIN` when nothing can be accepted. `poll` reports `POLLOUT` when at least one fragment is free. These calls let a program wait for space while also handling input or drawing.

The buffer-space structure has the following layout. In NASM, include `linux/soundcard.inc`, reserve `audio_buf_info_size` bytes, and access a field as `[address + audio_buf_info.bytes]`, for example.

{bufferFields}

For a raw `ioctl` syscall, put the request number in `rsi` and the third argument in `rdx`. A pointer argument names storage in the program; an immediate argument is the value itself. `/dev/dsp` uses these requests:

{dspRequests}

`SNDCTL_DSP_RESET` drops everything not played yet. Closing `/dev/dsp` waits until the buffer has played; at the end of the program, the rest of the buffer plays out. **Stop** silences it at once. Pause and Breakpoints do not stop it: the buffer keeps playing and then falls silent. Undo takes back the samples the undone writes put in the buffer that have not been heard yet, and the settings the undone ioctls changed.

## `/dev/mixer`: the volume {#mixer}

`/dev/mixer` sets the volume of `/dev/dsp`'s sound. Its **channels** each have a left and a right level from 0 to 100, in one `int`: left in the low byte, right in the next, so `75 | 75 << 8` is 75 on both sides. `SOUND_MIXER_WRITE_VOLUME` sets the master volume and writes back what it set, and `SOUND_MIXER_READ_VOLUME` reads it. The mixer's requests also work on the `/dev/dsp` descriptor.

```c
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sys/soundcard.h>

int main(void) {
    int mixer = open("/dev/mixer", O_RDWR);
    if (mixer < 0) return 1;
    int level = 50 | 50 << 8; /* half volume, both sides */
    ioctl(mixer, SOUND_MIXER_WRITE_VOLUME, &level);
    return 0;
}
```

{mixerRequests}

The card has only two channels with an effect: `VOLUME`, which starts at 73, and `IGAIN`, for recording. The others, `PCM` among them, keep the level written to them and change nothing. The mixer changes neither the MIDI synthesizer, whose volume is controller 7 of each channel, nor the PC speaker. The **Sound** button and the volume in Preferences act after the mixer, and the program never sees them. Undo puts the levels back.

## What is different from a real Linux machine {#differences}

The devices behave as they do on a QEMU virtual machine running Linux, the reference this emulator follows. These are the places where they do not:

- **The instruments sound different.** The synthesizer plays the same sound bank as the MIPS and RISC-V Notes, not the reference machine's.
- **The MIDI port sends at MIDI's speed.** The reference's port is a virtual one with no cable, which sends at once; here each byte takes the 320 µs it takes on a MIDI cable.
- **Every open of the MIDI port shares one buffer.** On Linux each open gets one of its own, unless it uses `O_APPEND`.
- **Notes still on when the program ends are released**, and the synthesizer starts every **Build** and **Run** from General MIDI's defaults. The reference machine's synthesizer would ring on and remember the last program's instruments.
- **At the end of the program the editor reports its end at once**, while the rest of `/dev/dsp`'s buffer plays out. On Linux the exit waits for the buffer.

## Not covered {#not-covered}

- **ALSA PCM, control and sequencer devices**, including `/dev/snd/pcmC0D0p`, `/dev/snd/controlC0` and `/dev/snd/seq`, are unavailable. Opening one fails with `ENODEV`, and the **Log** names the supported alternative. Use `/dev/dsp` for samples, `/dev/mixer` for volume or `/dev/snd/midiC1D0` for MIDI messages.
- **The second sound card's devices**, `/dev/dsp2`, `/dev/audio2` and `/dev/mixer2`: the reference machine's synthesizer plays on that card. Use `/dev/dsp`.
- **`/dev/audio`**, μ-law samples: use `/dev/dsp`.
- **Recording** is unavailable. Reading `/dev/dsp` fails with `EINVAL` on a descriptor opened for reading.
- **`mmap` of `/dev/dsp`**, and turning playback off with `SNDCTL_DSP_SETTRIGGER`, which goes with it: write the samples instead. `SNDCTL_DSP_GETCAPS` leaves out `DSP_CAP_MMAP`, so a careful program sees this.
- **`/dev/sequencer` and `/dev/music`** do not exist, as on the reference machine: use the MIDI port.
- **`epoll`** answers `ENOSYS`: use `poll` or `select`.
